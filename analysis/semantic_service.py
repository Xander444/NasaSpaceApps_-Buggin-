"""Optional local retrieval service. Fixed index/model; never accepts paths or URLs."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
REVISION = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
MODEL_VERSION = MODEL + '@' + REVISION + ':symmetric-encode-v2'
MAX_QUERY = 750

class RequestError(Exception):
    def __init__(self, status, message): self.status=status; super().__init__(message)

def validate(payload, version):
    if not isinstance(payload,dict) or set(payload) != {'query','index_version'}:
        raise RequestError(400,'Only query and index_version are accepted')
    query=payload['query']
    if not isinstance(query,str) or not 1 <= len(query.strip()) <= MAX_QUERY or any(ord(c)<32 and c not in '\n\t' for c in query):
        raise RequestError(400,'Query must contain 1–750 printable characters')
    if payload['index_version'] != version: raise RequestError(409,'Index version mismatch')
    return query.strip()

class Retriever:
    def __init__(self,index,cache_dir,offline=False):
        from sentence_transformers import SentenceTransformer
        import numpy as np
        self.np=np; self.version=index['index_version']; self.lock=threading.Lock()
        self.model=SentenceTransformer(MODEL,revision=REVISION,device='cpu',trust_remote_code=False,
            cache_folder=str(cache_dir/'model'),local_files_only=offline)
        # Split using the actual tokenizer, then map every piece to its original document ID.
        # Max pooling across pieces prevents a long record from accumulating similarity.
        self.ids=[]; texts=[]; seen={}
        for doc in index['documents']:
            if doc['kind'] not in ('passage','test','investigation'): continue
            text=doc['text']
            if doc['kind']=='test':
                text='; '.join(f'{key}: {value}' for key,value in doc['raw'].items() if value is not None and not re.search(r'test #|test date|^date$|gmt|^pi$|identifier|sample #|sample number|camera [0-9]', key, re.I))
            encoded=self.model.tokenizer.encode(text,add_special_tokens=False)
            for start in range(0,len(encoded),220):
                part=self.model.tokenizer.decode(encoded[start:start+220],skip_special_tokens=True)
                key=(doc['accession'],part)
                if key in seen: self.ids[seen[key]].append(doc['id']); continue
                seen[key]=len(texts);texts.append(part);self.ids.append([doc['id']])
        signature=hashlib.sha256((self.version+MODEL_VERSION+json.dumps(self.ids)+json.dumps(texts)).encode()).hexdigest()
        cache_dir.mkdir(parents=True,exist_ok=True);file=cache_dir/(signature+'.npz')
        if file.exists():
            with np.load(file,allow_pickle=False) as saved: self.embeddings=saved['embeddings']
        else:
            self.embeddings=self.model.encode(texts,batch_size=32,normalize_embeddings=True,convert_to_numpy=True,show_progress_bar=True)
            np.savez_compressed(file,embeddings=self.embeddings)
        if len(self.embeddings)!=len(self.ids): raise ValueError('Embedding cache shape mismatch')
    def search(self,query):
        with self.lock:
            vector=self.model.encode([query],normalize_embeddings=True,convert_to_numpy=True)[0]
        values=self.embeddings@vector; scores={}
        for ids,score in zip(self.ids,values):
            for doc_id in ids:scores[doc_id]=max(scores.get(doc_id,-1),float(score))
        return {'index_version':self.version,'model_version':MODEL_VERSION,
                'scores':[{'id':k,'score':v} for k,v in sorted(scores.items(),key=lambda x:(-x[1],x[0]))]}

def make_handler(index,retriever,error,origins):
    class Handler(BaseHTTPRequestHandler):
        def allowed(self): return self.headers.get('Origin') in origins or not self.headers.get('Origin')
        def reply(self,status,payload):
            body=json.dumps(payload).encode();self.send_response(status)
            if self.headers.get('Origin') in origins:
                self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Vary','Origin')
            self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
        def do_OPTIONS(self):
            if not self.allowed(): return self.reply(403,{'error':'Origin not allowed'})
            self.send_response(204)
            if self.headers.get('Origin'): self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
            self.send_header('Access-Control-Allow-Methods','POST, GET, OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type')
            self.end_headers()
        def do_GET(self):
            if not self.allowed():return self.reply(403,{'error':'Origin not allowed'})
            if self.path!='/health':return self.reply(404,{'error':'Not found'})
            self.reply(200 if retriever else 503,{'ready':bool(retriever),'index_version':index['index_version'],'model_version':MODEL_VERSION,'error':error})
        def do_POST(self):
            if not self.allowed():return self.reply(403,{'error':'Origin not allowed'})
            if self.path!='/search':return self.reply(404,{'error':'Not found'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:raise RequestError(413,'Request body must be 1–8192 bytes')
                self.connection.settimeout(5)
                query=validate(json.loads(self.rfile.read(length)),index['index_version'])
                if retriever is None: raise RequestError(503,'Model unavailable; use keyword search')
                self.reply(200,retriever.search(query))
            except RequestError as exc:self.reply(exc.status,{'error':str(exc)})
            except (ValueError,UnicodeError,TimeoutError):self.reply(400,{'error':'Invalid JSON request'})
            except Exception:self.reply(503,{'error':'Semantic retrieval failed; use keyword search'})
    return Handler

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--offline',action='store_true');parser.add_argument('--check',action='store_true')
    args=parser.parse_args();index=json.loads((ROOT/'public/search/index.json').read_text())
    cache=ROOT/'.cache/search';cache.mkdir(parents=True,exist_ok=True)
    os.environ.setdefault('HF_HOME',str(cache/'hf'));os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
    retriever=None;error=None
    try: retriever=Retriever(index,cache,args.offline)
    except Exception as exc:error=f'{type(exc).__name__}: {exc}'; print('Model unavailable:',error,flush=True)
    if args.check:
        if not retriever:raise SystemExit(1)
        result=retriever.search('Design a smoke detector');print(json.dumps({**result,'scores':result['scores'][:5]},indent=2));return
    origins=set(os.environ.get('SEMANTIC_ALLOWED_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(','))
    if any(origin=='*' or not origin.startswith(('http://localhost:','http://127.0.0.1:')) for origin in origins):
        raise SystemExit('CORS origins must be explicit local-development origins')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(index,retriever,error,origins))
    print(f'Semantic service http://127.0.0.1:{args.port}; ready={bool(retriever)}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
