import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createEngine} from '../src/search/engine.js';
import {fetchSemantic} from '../src/search/semantic.js';
const index=JSON.parse(fs.readFileSync(new URL('../public/search/index.json',import.meta.url)));
const evaluation=JSON.parse(fs.readFileSync(new URL('../data/search/evaluation.json',import.meta.url)));
const start=performance.now(),engine=createEngine(index),init=performance.now()-start;
const service=process.env.SEMANTIC_URL;
const rows=[];
for(const q of evaluation.queries){
 let t=performance.now();const keyword=engine.search({q:q.query});const keywordMs=performance.now()-t;
 t=performance.now();engine.search({q:q.query});const cacheMs=performance.now()-t;
 let hybrid=null,semanticError=null;
 if(service){try{const semantic=await fetchSemantic(service,q.query,index.index_version,{timeout:30000});const r=engine.search({q:q.query,semantic});const top3=r.verified.slice(0,3).map(x=>x.id);hybrid={top3,model_version:semantic.model_version,expected_recall:q.expected.length?q.expected.filter(id=>top3.includes(id)).length/q.expected.length:top3.length===0?1:0};}catch(e){semanticError=e.message;}}
 const top3=keyword.verified.slice(0,3).map(x=>x.id);
 rows.push({...q,keyword:{top3,milliseconds:+keywordMs.toFixed(3),cache_milliseconds:+cacheMs.toFixed(3),expected_recall:q.expected.length?q.expected.filter(id=>top3.includes(id)).length/q.expected.length:top3.length===0?1:0},hybrid,semantic_error:semanticError});
}
const report={schema_version:1,index_version:index.index_version,runtime:process.version,platform:process.platform,initialization_ms:+init.toFixed(3),document_count:index.documents.length,queries:rows,
 limitations:['Small manually reviewed retrieval set; labels do not validate scientific claims.','Timing is a single local run, not a latency guarantee.','Per-row gravity and many sensor fields remain unknown.','Semantic-only admission threshold is heuristic; inspect cited evidence.']};
fs.writeFileSync(new URL('../docs/search-evaluation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
