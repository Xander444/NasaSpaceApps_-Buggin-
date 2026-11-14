import {family} from '../data.js';
import {parseQuery,tokenize,matchConditions,validateCondition} from './conditions.js';
export const RANKING = {version:1,k1:1.2,b:0.75,rrfK:60,preferredWeight:0.003,boosts:{title:3,text:1,tags:2},semanticAdmission:0.42};
const docIsContent=d=>d.kind!=='file';
const stable=(a,b)=>a.id.localeCompare(b.id);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const cacheKey=(index,options,ranking=RANKING)=>JSON.stringify(canonical({index:index.index_version,ranking,...options,q:options.q?.trim().toLowerCase().replace(/\s+/g,' ')}));
export function fuseRanks(keyword,semantic,k=60){
  const scores=new Map();
  for(const list of [keyword,semantic])list.forEach((x,i)=>scores.set(x.id,(scores.get(x.id)||0)+1/(k+i+1)));
  return scores;
}
export function createEngine(index,ranking=RANKING){
  const docs=index.documents,byId=new Map(docs.map(d=>[d.id,d])),parents=new Map(index.investigations.map(d=>[d.id,d]));
  const df={},average={},lengths=new Map(),cache=new Map();
  const corpusCount=index.investigations.length;
  for(const field of Object.keys(ranking.boosts)){
    df[field]=new Map();const seen=new Map();const parentLengths=new Map();
    for(const d of docs){const tf=d.tokens[field]||{},len=Object.values(tf).reduce((a,b)=>a+b,0);
      if(!lengths.has(d.id))lengths.set(d.id,{});lengths.get(d.id)[field]=len;
      if(docIsContent(d)){parentLengths.set(d.accession,Math.max(parentLengths.get(d.accession)||0,len));for(const token of Object.keys(tf)){if(!seen.has(token))seen.set(token,new Set());seen.get(token).add(d.accession);}}
    }for(const [t,ids] of seen)df[field].set(t,ids.size);average[field]=[...parentLengths.values()].reduce((a,b)=>a+b,0)/corpusCount||1;
  }
  const parentTags=new Map();for(const d of docs)if(d.kind!=='file')parentTags.set(d.accession,new Set([...(parentTags.get(d.accession)||[]),...d.tags]));
  function search(options={}){
    const key=cacheKey(index,options,ranking);if(cache.has(key))return cache.get(key);
    const {q='',conditions=[],program='',familyName='',problem='',outcome='',needed='',sort='relevance',similar=null,semantic=null}=options;
    const errors=conditions.map(validateCondition).filter(Boolean);
    if(errors.length)return {verified:[],related:[],errors,notices:[],browse:false,mode:'Keyword'};
    const parsed=parseQuery(q,index.config); let terms=parsed.tokens;
    const seed=similar&&byId.get(similar.id);
    let effectiveConditions=[...conditions];
    if(seed){
      if(similar.mode==='conditions'){
        const fields=Object.entries(seed.conditions||{}).filter(([k,f])=>f.value!==null&&['material','gravity','oxygen_initial_percent','pressure','airflow','direction','geometry'].includes(k));
        effectiveConditions.push(...fields.map(([field,f])=>({field,value:f.value,unit:f.unit,operator:'eq',tolerance:0,mode:'preferred'})));
        terms=[];
        if(!fields.length)return {verified:[],related:[],errors:[],notices:['This seed has no normalized experimental conditions. Select a test row.'],browse:false,mode:'Keyword'};
      } else if(similar.mode==='measurements'){
        const seedText=seed.kind==='investigation'?docs.filter(d=>d.accession===seed.accession&&d.kind==='passage').map(d=>d.text).join(' '):seed.text;
        const sensorWords=seedText.match(/\b(?:detectors?|cameras?|video|radiometers?|thermocouples?|anemometers?|temperature|soot|particle|radiation|pressure)\b/gi)||[];
        terms=[...new Set(tokenize(sensorWords.join(' '),index.config))];
        if(!terms.length)return {verified:[],related:[],errors:[],notices:['No indexed measurement or sensor terms are available for this seed.'],browse:false,mode:'Keyword'};
      } else terms=[...new Set(tokenize(seed.kind==='investigation'?index.sources[parents.get(seed.accession).section_sources.objective]?.excerpt||seed.text:seed.text,index.config))];
    }
    const browse=!q.trim()&&!conditions.length&&!program&&!familyName&&!problem&&!outcome&&!needed&&!seed;
    const semanticValid=semantic?.index_version===index.index_version&&typeof semantic?.model_version==='string';
    const semanticScores=new Map(semanticValid?semantic.scores.filter(x=>byId.has(x.id)&&Number.isFinite(x.score)).map(x=>[x.id,x.score]):[]);
    const candidates=[];
    for(const doc of docs){
      const parent=parents.get(doc.accession);
      if(program&&parent.program!==program)continue;
      if(familyName&&family(parent)!==familyName)continue;
      if(!seed&&/^PSI-\d+(?::.+)?$/i.test(q.trim()) && (q.includes(':')?doc.id.toLowerCase()!==q.trim().toLowerCase():doc.accession.toLowerCase()!==q.trim().toLowerCase()))continue;
      if(seed&&(doc.id===seed.id||(seed.kind==='investigation'&&doc.accession===seed.accession)))continue;
      if(problem&&!parentTags.get(doc.accession)?.has(problem))continue;
      if(outcome&&!parentTags.get(doc.accession)?.has(outcome))continue;
      if(needed==='findings'&&!['findings','abstract'].includes(doc.section)&&!doc.conditions?.outcome?.value)continue;
      if(needed==='methods'&&doc.section!=='approach')continue;
      if(needed==='measurements'&&doc.kind!=='test')continue;
      if(needed==='images/video'&&!doc.tags.includes('images/video')&&!(doc.kind==='file'&&/\.(avi|mp4|jpg|png|mov|tif)/i.test(doc.title)))continue;
      let score=0;const matched=new Set();
      for(const [field,boost] of Object.entries(ranking.boosts)){
        const tf=doc.tokens[field]||{},len=lengths.get(doc.id)[field];
        for(const t of terms){const count=tf[t]||0;if(!count)continue;matched.add(t);
          const n=df[field].get(t)||0,idf=Math.log(1+(corpusCount-n+0.5)/(n+0.5));
          score+=boost*idf*(count*(ranking.k1+1))/(count+ranking.k1*(1-ranking.b+ranking.b*len/average[field]));
        }
      }
      if(!seed&&(q.trim().toLowerCase()===doc.id.toLowerCase()||q.trim().toLowerCase()===parent.program.toLowerCase()))score+=100;
      const allTokens=new Set(Object.values(doc.tokens).flatMap(t=>Object.keys(t)));
      for(const neg of parsed.negative)if(neg.length&&neg.every(t=>allTokens.has(t)))score*=0.1;
      const checks=matchConditions(doc,effectiveConditions,index.config);
      const sem=semanticScores.get(doc.id)||0;
      const admitted=!terms.length||score>0||sem>=ranking.semanticAdmission;
      if(!admitted&&doc.kind!=='test')continue;
      if(seed&&similar.mode==='conditions'&&(doc.kind!=='test'||checks.preferred===0))continue;
      // Required experimental conditions can only be established jointly by a test row.
      const verified=checks.verified&&(!effectiveConditions.some(c=>c.mode==='required')||doc.kind==='test');
      candidates.push({id:doc.id,doc,score,sem,admitted,matched:[...matched],...checks,verified});
    }
    // Topic context may admit a test, but never supplies its experimental conditions.
    const context=new Map();
    for(const c of candidates)if(c.doc.kind==='passage'&&c.doc.section&&c.admitted){
      const old=context.get(c.doc.accession);if(!old||c.score>old.score)context.set(c.doc.accession,c);
    }
    for(let i=candidates.length-1;i>=0;i--){const c=candidates[i];if(c.admitted)continue;
      const support=context.get(c.doc.accession);
      if(c.doc.kind==='test'&&support&&!seed){c.score=support.score*0.35;c.sem=support.sem*0.7;c.contextSourceIds=support.doc.source_ids;c.matched=support.matched;}
      else candidates.splice(i,1);
    }
    // Rank each investigation once within each condition group. Extra chunks/files cannot
    // occupy extra RRF positions or accumulate scores. Evidence order remains document-specific.
    for(const verified of [true,false]){
      const pool=candidates.filter(c=>c.verified===verified);
      const best=(key,admit)=>{const m=new Map();for(const c of pool.filter(admit)){const id=c.doc.accession;if(!m.has(id)||m.get(id).score<c[key])m.set(id,{id,score:c[key]});}return [...m.values()].sort((a,b)=>b.score-a.score||stable(a,b));};
      const fused=fuseRanks(best('score',c=>c.score>0),best('sem',c=>c.sem>=ranking.semanticAdmission&&c.doc.kind!=='file'),ranking.rrfK);
      for(const c of pool)c.rank=(fused.get(c.doc.accession)||0)+c.preferred*ranking.preferredWeight;
    }
    const aggregate=verified=>{
      const groups=new Map();
      for(const c of candidates.filter(c=>c.verified===verified)){
        if(!groups.has(c.doc.accession))groups.set(c.doc.accession,[]);groups.get(c.doc.accession).push(c);
      }
      return [...groups].map(([id,evidence])=>{
        evidence.sort((a,b)=>b.rank-a.rank||b.score-a.score||b.sem-a.sem||stable(a,b));
        const strongest=evidence[0];
        return {id,investigation:parents.get(id),rank:strongest.rank,evidence,strongest,
          tests:evidence.filter(e=>e.doc.kind==='test'),matchingTestCount:evidence.filter(e=>e.doc.kind==='test').length};
      }).sort((a,b)=>sort==='name'||browse?a.investigation.program.localeCompare(b.investigation.program)||stable(a,b):sort==='publication_date'?dateOrder(a.investigation.publication_date,b.investigation.publication_date)||stable(a,b):b.rank-a.rank||stable(a,b));
    };
    const result={verified:aggregate(true),related:aggregate(false),errors:[],notices:parsed.notices,browse,
      mode:semanticValid?'Hybrid · keyword + semantic':'Keyword',scope:needed||'all indexed evidence'};
    cache.set(key,result);if(cache.size>40)cache.delete(cache.keys().next().value);
    return result;
  }
  return {search,byId,parents,cache};
}
export function dateOrder(a,b){return !a&&!b?0:!a?1:!b?-1:b.localeCompare(a);}
