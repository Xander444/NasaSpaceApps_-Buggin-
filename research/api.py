"""Session-isolated bounded research API; deterministic engine remains authoritative."""
import asyncio
from collections import OrderedDict, deque
import hashlib
import importlib.util
import json
import logging
import os
import secrets
import shutil
import time
from urllib.parse import urlparse
import httpx
from fastapi import APIRouter, HTTPException, Request as HTTPRequest, Response
from research.config import load_settings
from research.models import Request, RecommendRequest, Analysis, Ranking
from research.provider import generate, MODEL_DEFAULT, PROMPT_VERSION
from research.summaries import ROOT, ARTIFACT, digest, fingerprint

load_settings()
router = APIRouter(prefix='/api/research')
cache = OrderedDict()
inflight = {}
sessions = OrderedDict()
semaphore = asyncio.Semaphore(2)
ip_history = OrderedDict()
metrics = {'calls':0,'cache_hits':0,'coalesced':0}
logger = logging.getLogger('flame.research.retrieval')
_index = None
_artifact = None
_stamp = None

def retrieval_timeout():
    try: value=float(os.getenv('RESEARCH_RETRIEVAL_TIMEOUT_SECONDS','30'))
    except ValueError: value=30
    return min(60,max(5,value))

def retrieval_url():
    value=os.getenv('RESEARCH_RETRIEVAL_URL','').rstrip('/')
    if not value: return ''
    parsed=urlparse(value)
    if parsed.scheme!='http' or parsed.hostname not in {'127.0.0.1','localhost'}:
        logger.warning('retrieval_configuration_rejected category=non_loopback_url')
        return ''
    return value

def corpus():
    global _index, _artifact, _stamp
    paths = [ROOT/'public/search/index.json',ARTIFACT,ROOT/'data/source_review.json',ROOT/'data/search/config.json',ROOT/'research/summaries.py']
    try:
        stamp = tuple(p.stat().st_mtime_ns for p in paths)
        if stamp != _stamp:
            index=json.loads(paths[0].read_text()); artifact=json.loads(ARTIFACT.read_text())
            if artifact['summary_version'] != fingerprint(index) or artifact['index_version'] != index['index_version'] or artifact['content_hash'] != digest(artifact['cards']):
                raise ValueError('stale')
            if {c['id'] for c in artifact['cards']} != {i['id'] for i in index['investigations']}:
                raise ValueError('incomplete')
            _index,_artifact,_stamp=index,artifact,stamp
        return _index,_artifact
    except (OSError,ValueError,KeyError):
        raise HTTPException(409,'stale: run npm run research:summaries') from None

def configuration():
    load_settings()
    index,artifact=corpus()
    configured=bool(os.getenv('GEMINI_API_KEY'))
    eligible=os.getenv('GEMINI_ELIGIBILITY_CONFIRMED')=='true'
    try: sdk=importlib.util.find_spec('google.genai') is not None
    except ModuleNotFoundError: sdk=False
    return {'status':'ready' if configured and eligible and sdk else 'unconfigured',
            'index_version':index['index_version'],'summary_version':artifact['summary_version'],
            'model':os.getenv('GEMINI_MODEL',MODEL_DEFAULT),'configured':configured,'eligibility_confirmed':eligible,'sdk':sdk}

def session(request,response):
    sid=request.cookies.get('research_session')
    if sid not in sessions:
        sid=secrets.token_urlsafe(24)
        sessions[sid]=deque()
        response.set_cookie('research_session',sid,httponly=True,samesite='strict',max_age=3600)
        while len(sessions)>128: sessions.popitem(last=False)
    return sid

async def retrieval_health():
    url=retrieval_url()
    if not url:
        ready=bool(shutil.which('node')) and (ROOT/'research/retrieve.mjs').is_file()
        return {'status':'ready' if ready else 'unavailable','mode':'one-shot-process',
                'timeout_seconds':retrieval_timeout()}
    try:
        async with httpx.AsyncClient(timeout=min(5,retrieval_timeout()),trust_env=False) as client:
            reply=await client.get(url+'/health')
        if reply.status_code!=200 or len(reply.content)>4096:
            logger.warning('retrieval_health_failed category=http status=%s bytes=%s',reply.status_code,len(reply.content))
            return {'status':'unavailable','mode':'warm-local-service'}
        data=reply.json()
        if data.get('status')!='ready': raise ValueError('not ready')
        return {key:data[key] for key in ('status','mode','index_version','node_version','requests','uptime_seconds') if key in data}
    except (httpx.HTTPError,ValueError,json.JSONDecodeError) as exc:
        logger.warning('retrieval_health_failed category=%s',type(exc).__name__)
        return {'status':'unavailable','mode':'warm-local-service'}

@router.get('/status')
async def status(request: HTTPRequest,response: Response):
    session(request,response)
    result=configuration()
    result['retrieval']=await retrieval_health()
    if result['status']=='ready' and result['retrieval']['status']!='ready': result['status']='unavailable'
    return result

@router.delete('/session')
def reset(request: HTTPRequest,response: Response):
    sid=request.cookies.get('research_session')
    sessions.pop(sid,None)
    for key in list(cache):
        if key[0]==sid: cache.pop(key,None)
    response.delete_cookie('research_session')
    return {'status':'cleared'}

async def cached(kind,payload,request,response,work):
    sid=request.cookies.get('research_session')
    if sid not in sessions: raise HTTPException(409,'session_expired: reopen AI-guided search')
    config=configuration()
    config['implementation_version']=digest([(ROOT/p).read_text() for p in ('research/models.py','research/provider.py','research/retrieve.mjs','research/retrieve_service.mjs','research/build_retrieval_index.mjs','src/search/engine.js','src/search/conditions.js')])
    if config['status']!='ready': raise HTTPException(503,'unconfigured: configure an eligible key privately with scripts/research_key.py')
    if payload.index_version!=config['index_version'] or payload.summary_version!=config['summary_version']:
        raise HTTPException(409,'stale: reload the index or rebuild research summaries')
    key=(sid,hashlib.sha256(json.dumps([kind,payload.model_dump(),config,PROMPT_VERSION,{'temperature':0,'max_output_tokens':4096}],sort_keys=True).encode()).hexdigest())
    now=time.monotonic()
    for k,(expiry,_) in list(cache.items()):
        if expiry<now: cache.pop(k,None)
    if key in cache:
        metrics['cache_hits']+=1
        return {**cache[key][1],'cache_hit':True,'request_usage':{'calls':0}}
    if key in inflight:
        metrics['coalesced']+=1
        return {**await asyncio.shield(inflight[key]),'coalesced':True,'request_usage':{'calls':0}}
    history=sessions[sid]
    while history and history[0]<now-60: history.popleft()
    if len(history)>=8 or len(inflight)>=4: raise HTTPException(429,'rate_limit: wait before another AI request')
    ip=request.client.host if getattr(request,'client',None) else 'local'
    arrivals=ip_history.setdefault(ip,deque())
    while arrivals and arrivals[0]<now-60: arrivals.popleft()
    if len(arrivals)>=20: raise HTTPException(429,'rate_limit: local request budget reached')
    arrivals.append(now)
    while len(ip_history)>128: ip_history.popitem(last=False)
    history.append(now)
    async def execute():
        async with semaphore:
            result=await work()
            metrics['calls']+=result.get('request_usage',{}).get('calls',0)
            result.update(model=config['model'],index_version=config['index_version'],summary_version=config['summary_version'],cache_hit=False)
            if sid in sessions:
                cache[key]=(time.monotonic()+900,result)
                while len(cache)>128: cache.popitem(last=False)
            return result
    task=asyncio.create_task(execute()); inflight[key]=task
    task.add_done_callback(lambda _: inflight.pop(key,None))
    return await asyncio.shield(task)

@router.post('/analyze')
async def analyze(payload: Request,request: HTTPRequest,response: Response):
    async def work():
        result,usage=await asyncio.to_thread(generate,
            'Interpret the request. Ask 1 or 2 focused questions ONLY if a missing distinction materially changes retrieval; explain why and give short options. Do not demand empty physical variables. Complete requests are ready. Latest answers/corrections supersede earlier ones. search_now, Not sure, or two rounds means ready with no questions. Conditions are proposals only and require an exact supporting span from user text.',payload.model_dump(),Analysis)
        text=payload.prompt+'\n'+'\n'.join(a.answer for a in payload.answers)
        result['proposed_conditions']=[p for p in result['proposed_conditions'] if p['user_span'] and p['user_span'] in text]
        if payload.search_now or payload.rounds>=2 or any(a.answer.lower()=='not sure' for a in payload.answers):
            result.update(status='ready',questions=[])
        if not result['questions']: result['status']='ready'
        if result['status']=='ready': result['questions']=[]
        return {**result,'request_usage':usage}
    return await cached('analyze',payload,request,response,work)

def validate_retrieval(data):
    if not isinstance(data,dict) or not isinstance(data.get('verified'),list) or not isinstance(data.get('related'),list) or not isinstance(data.get('index_version'),str):
        raise ValueError('invalid retrieval response')
    return data

async def retrieve_service(options,url):
    try:
        async with httpx.AsyncClient(timeout=retrieval_timeout(),trust_env=False) as client:
            reply=await client.post(url+'/search',json=options)
        if reply.status_code==422:
            raise HTTPException(422,'retrieval_invalid_conditions: check explicit conditions')
        if reply.status_code!=200:
            logger.warning('retrieval_failed mode=service category=http status=%s bytes=%s',reply.status_code,len(reply.content))
            raise HTTPException(503,'retrieval_unavailable: keyword search remains ready')
        if len(reply.content)>250000: raise ValueError('response budget')
        return validate_retrieval(reply.json())
    except HTTPException: raise
    except (httpx.TimeoutException,httpx.NetworkError,httpx.RemoteProtocolError) as exc:
        logger.warning('retrieval_failed mode=service category=%s',type(exc).__name__)
        raise HTTPException(503,'retrieval_unavailable: keyword search remains ready') from None
    except (ValueError,json.JSONDecodeError) as exc:
        logger.warning('retrieval_failed mode=service category=%s',type(exc).__name__)
        raise HTTPException(503,'retrieval_unavailable: keyword search remains ready') from None

async def retrieve_process(options):
    try:
        proc=await asyncio.create_subprocess_exec('node',str(ROOT/'research/retrieve.mjs'),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,cwd=ROOT)
    except (FileNotFoundError,OSError) as exc:
        logger.warning('retrieval_failed mode=process category=%s',type(exc).__name__)
        raise HTTPException(503,'retrieval_unavailable: keyword search remains ready') from None
    try:
        out,err=await asyncio.wait_for(proc.communicate(json.dumps(options).encode()),timeout=retrieval_timeout())
    except asyncio.TimeoutError:
        if proc.returncode is None: proc.kill(); await proc.wait()
        logger.warning('retrieval_failed mode=process category=timeout timeout_seconds=%s',retrieval_timeout())
        raise HTTPException(503,'retrieval_unavailable: keyword search remains ready') from None
    if proc.returncode==2:
        logger.info('retrieval_rejected mode=process category=invalid_conditions')
        raise HTTPException(422,'retrieval_invalid_conditions: check explicit conditions')
    if proc.returncode or len(out)>250000:
        logger.warning('retrieval_failed mode=process category=exit returncode=%s stdout_bytes=%s stderr_bytes=%s',proc.returncode,len(out),len(err))
        raise HTTPException(503,'retrieval_unavailable: keyword search remains ready')
    try: return validate_retrieval(json.loads(out))
    except (ValueError,json.JSONDecodeError) as exc:
        logger.warning('retrieval_failed mode=process category=%s stdout_bytes=%s',type(exc).__name__,len(out))
        raise HTTPException(503,'retrieval_unavailable: keyword search remains ready') from None

async def retrieve(options):
    url=retrieval_url()
    return await retrieve_service(options,url) if url else await retrieve_process(options)

@router.post('/recommend')
async def recommend(payload: RecommendRequest,request: HTTPRequest,response: Response):
    async def work():
        index,artifact=corpus()
        # Preserve original negation and exact controls; interpretation is never a hard filter.
        options=payload.controls.model_dump(exclude_none=True)
        options['q']=' '.join(filter(None,[payload.prompt,payload.intent.goal,payload.intent.desired_data]))
        candidates=await retrieve(options)
        if candidates['index_version']!=index['index_version']: raise HTTPException(409,'stale: retrieval index does not match research summaries')
        groups=candidates['verified']+candidates['related']
        if not groups:
            return {'ranked':[],'gap':'no_indexed_match','message':'No matching evidence was found in the indexed collection.','request_usage':{'calls':0},'retrieval_query':options['q']}
        allowed={g['id']:g for g in groups}
        cards=[c for c in artifact['cards'] if c['id'] in allowed]
        data={'request':payload.model_dump(),'cards':cards,'support':groups}
        if len(json.dumps(data))>180000: raise HTTPException(422,'budget: narrow the requested scope')
        result,usage=await asyncio.to_thread(generate,
            'Rank useful eligible investigation IDs for this request. Omit irrelevant candidates. For each give one exact nonempty excerpt (up to 400 characters) and its source_id from the supplied card sections or supporting records. Never rewrite an excerpt. No other claims. Related candidates remain related; required conditions are authoritative.',data,Ranking)
        seen=set()
        for rank in result['ranked']:
            if rank['id'] not in allowed or rank['id'] in seen: raise HTTPException(503,'invalid_output: unknown or duplicate recommendation')
            seen.add(rank['id'])
            card=next(c for c in cards if c['id']==rank['id'])
            excerpts={s['source_id']:s['excerpt'] for s in card['sections'].values()}
            for support in allowed[rank['id']]['support']:
                for sid in support['source_ids']: excerpts[sid]=support['text']
            source=index['sources'].get(rank['source_id'])
            if not source or source['accession']!=rank['id'] or rank['source_id'] not in excerpts or rank['excerpt'] not in excerpts[rank['source_id']] or rank['excerpt'] not in source['excerpt']:
                raise HTTPException(503,'invalid_output: unsupported citation; original search preserved')
            rank['scope']=source['locator']
            rank['caveats']=card['limitations']
        gap='related_conditions' if not candidates['verified'] else 'measurement_not_established' if payload.controls.needed else 'inspect_evidence'
        return {**result,'retrieval_query':options['q'],'gap':gap,'message':{'related_conditions':'Related evidence exists, but required conditions are not verified together.','measurement_not_established':'Inspect cited rows: relevance does not establish that the requested measurement is indexed.','inspect_evidence':'Recommendations are retrieval aids. Inspect source scope and test conditions.'}[gap], 'request_usage':usage}
    return await cached('recommend',payload,request,response,work)
