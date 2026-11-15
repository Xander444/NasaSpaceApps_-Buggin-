import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEngine,cacheKey,dateOrder,fuseRanks} from './engine.js';
import {matchCondition,matchConditions,parseQuery,tokenize,validateCondition} from './conditions.js';
import {compareEvidence,exportEvidence,toCSV,csvCell} from './compare.js';
import {fetchSemantic} from './semantic.js';
const index=JSON.parse(fs.readFileSync(new URL('../../public/search/index.json',import.meta.url)));
const engine=createEngine(index),config=index.config;
const condition=(field,value,extra={})=>({field,value,mode:'required',operator:'contains',...extra});
const oxygen=value=>condition('oxygen_initial_percent',value,{operator:'eq',unit:'% vol',tolerance:0});
const ids=r=>r.verified.map(g=>g.id);
test('source-based retrieval acceptance queries',()=>{
 const smoke=ids(engine.search({q:'Design a smoke detector'})).slice(0,3);assert(smoke.includes('PSI-101'));assert(smoke.includes('PSI-102'));
 assert.equal(ids(engine.search({q:'Extinguish liquid-fuel flames'}))[0],'PSI-69');
 assert(!ids(engine.search({q:'Extinguish liquid-fuel flames',conditions:[condition('fuel_class','solid')]})).includes('PSI-69'));
});
test('B1 PMMA + 22.2 initial oxygen with row citation',()=>{
 const r=engine.search({q:'PMMA',conditions:[condition('material','PMMA'),oxygen(22.2)]});
 const b1=r.verified.flatMap(g=>g.tests).find(d=>d.id==='PSI-25:B1');assert(b1);assert.equal(index.sources[b1.doc.source_ids[0]].locator,'CSV row 2');
 assert(b1.doc.warnings.some(w=>w.includes('below 21%')));
});
test('synthetic fixture: joint constraints never cross test rows',()=>{
 const fixture=[{conditions:{material:{value:'PMMA'},oxygen_initial_percent:{value:20,unit:'% vol'}}},{conditions:{material:{value:'wax'},oxygen_initial_percent:{value:22.2,unit:'% vol'}}}];
 assert(fixture.every(d=>!matchConditions(d,[condition('material','PMMA'),oxygen(22.2)],config).verified));
});
test('initial/final separation, observed zero, missing values, fan display',()=>{
 const b2=engine.byId.get('PSI-25:B2');assert.equal(matchCondition(b2,oxygen(1.6),config).status,'different');
 assert.equal(matchCondition({conditions:{oxygen_initial_percent:{value:0,unit:'% vol'}}},oxygen(0),config).status,'matched');
 assert.equal(matchCondition({conditions:{oxygen_initial_percent:{value:null,unit:'% vol'}}},oxygen(0),config).status,'unknown');
 assert.equal(matchCondition(engine.byId.get('PSI-25:B1'),condition('airflow',62,{operator:'eq',unit:'cm/s'}),config).status,'unknown');
});
test('operators, conversions, explicit tolerances and input validation',()=>{
 const d={conditions:{airflow:{value:20,unit:'cm/s'}}};
 assert.equal(matchCondition(d,condition('airflow',.2,{operator:'eq',unit:'m/s'}),config).status,'matched');
 assert.equal(matchCondition(d,condition('airflow',19,{operator:'eq',unit:'cm/s',tolerance:0}),config).status,'different');
 assert.equal(matchCondition(d,condition('airflow',19,{operator:'eq',unit:'cm/s',tolerance:1}),config).status,'matched');
 for(const [operator,value,max] of [['lt',21],['lte',20],['gt',19],['gte',20],['range',19,21]])assert.equal(matchCondition(d,condition('airflow',value,{operator,max,unit:'cm/s'}),config).status,'matched');
 assert(validateCondition(oxygen('NaN')));assert(validateCondition({...oxygen(3),unit:'bananas'}));assert(validateCondition({...oxygen(3),tolerance:-1}));
});
test('unresolved gravity is a gap; no lunar evidence invented',()=>{
 const r=engine.search({q:'flame',conditions:[condition('gravity','lunar')]});assert.equal(r.verified.length,0);assert(r.related.length);
 assert(engine.search({q:'Moon flame'}).notices.some(n=>n.includes('Intended application')));
 assert.equal(matchCondition(engine.byId.get('PSI-69:1'),oxygen(21),config).status,'unknown');
});
test('aliases, punctuation, acronym and exact IDs; negation deliberately handled',()=>{
 assert.deepEqual(tokenize('acrylic, CO₂!',config),['pmma','co2']);
 assert.equal(ids(engine.search({q:'FLEX'}))[0],'PSI-69');
 assert.deepEqual(ids(engine.search({q:'PSI-25'})),['PSI-25']);
 assert.deepEqual(ids(engine.search({q:'PSI-25:B1'})),['PSI-25']);
 assert(!parseQuery('extinction not liquid fuel',config).tokens.includes('liquid'));
 assert(parseQuery('oxygen below 22.2%',config).notices.length);
});
test('unrelated query has no results; blank is neutral browse; dates unknown last',()=>{
 assert.equal(engine.search({q:'quantum banana investment'}).verified.length,0);
 assert(engine.search({}).browse);assert.equal(dateOrder(null,'2024-01-01'),1);
 assert(index.investigations.every(i=>i.publication_date===null));
});
test('duplicate passages do not inflate investigation ranking',()=>{
 const original=engine.search({q:'Design a smoke detector'});
 const clone=structuredClone(index);const doc=clone.documents.find(d=>d.accession==='PSI-25'&&d.section==='objective');
 for(let n=0;n<100;n++)clone.documents.push({...doc,id:doc.id+':duplicate'+n});
 assert.deepEqual(ids(createEngine(clone).search({q:'Design a smoke detector'})),ids(original));
});
test('citations resolve, hypotheses retain section, nulls never invent observations',()=>{
 for(const d of index.documents){for(const sid of d.source_ids)assert(index.sources[sid]);for(const f of Object.values(d.conditions))for(const sid of f.source_ids)assert(index.sources[sid]);}
 assert(index.documents.some(d=>d.section==='hypothesis'&&d.evidence_level==='catalog hypothesis'));
 assert.equal(compareEvidence([engine.byId.get('PSI-25:B1'),engine.byId.get('PSI-25:B2')],index).rows.find(r=>r.field==='gravity').status,'missing');
});
test('similar data excludes seed and keeps required filters',()=>{
 const r=engine.search({similar:{id:'PSI-25:B1',mode:'conditions'},conditions:[oxygen(22.2)]});
 assert(!r.verified.flatMap(g=>g.evidence).some(e=>e.id==='PSI-25:B1'));
 assert(r.verified.flatMap(g=>g.tests).every(e=>e.doc.conditions.oxygen_initial_percent.value===22.2));
 assert.equal(engine.search({similar:{id:'PSI-25',mode:'conditions'}}).verified.length,0);
});
test('cache includes all inputs and is bounded; RRF fuses ranks not raw scores',()=>{
 const base=cacheKey(index,{q:'smoke'});
 for(const options of [{conditions:[oxygen(22.2)]},{semantic:{model_version:'x'}},{similar:{id:'x',mode:'topic'}},{sort:'name'}])assert.notEqual(base,cacheKey(index,{q:'smoke',...options}));
 assert.notEqual(base,cacheKey({...index,index_version:'changed'},{q:'smoke'}));
 assert.equal(fuseRanks([{id:'a',score:100}],[{id:'a',score:.1}]).get('a'),2/61);
 for(let i=0;i<45;i++)engine.search({q:'unique'+i});assert(engine.cache.size<=40);
});
test('scoped export excludes related, inventory and investigations; CSV injection',()=>{
 const r=engine.search({conditions:[oxygen(22.2)]});const payload=exportEvidence([engine.byId.get('PSI-25:B1'),engine.byId.get('PSI-25'),engine.byId.get('PSI-25:B2')],r,index);
 assert.equal(payload.records.length,2);assert.equal(payload.records[0].conditions.gravity.value,null);assert(toCSV(payload).includes('CSV row 2'));
 assert(csvCell('=SUM(A1)').startsWith('"\''));assert(csvCell('a,"b').includes('""'));assert(csvCell('\t@evil').startsWith('"\''));
 const gaps=engine.search({conditions:[oxygen(1)]});assert.equal(exportEvidence([engine.byId.get('PSI-25:B1')],gaps,index).records.length,0);
});
test('semantic mismatch/unavailable/timeout reject and engine remains usable',async()=>{
 const saved=global.fetch;
 try{
  global.fetch=async()=>({ok:true,json:async()=>({index_version:'wrong',model_version:'m',scores:[]})});
  await assert.rejects(fetchSemantic('http://local','smoke',index.index_version),/version mismatch/);
  global.fetch=async()=>({ok:false,status:503});await assert.rejects(fetchSemantic('http://local','smoke',index.index_version),/503/);
  global.fetch=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
  await assert.rejects(fetchSemantic('http://local','smoke',index.index_version,{timeout:5}),/aborted/);
  assert(engine.search({q:'smoke',semantic:{index_version:'wrong',model_version:'m',scores:[]}}).verified.length);
 }finally{global.fetch=saved;}
});

test('expanded catalog and family filters remain integrated',()=>{
 assert.equal(index.investigations.length,24);
 const r=engine.search({familyName:'ACME'});
 assert(r.verified.length>0);
 assert(r.verified.every(g=>g.investigation.program.toLowerCase().includes('acme')));
 for(const acc of ['PSI-10','PSI-159']) {
  const paths=new Set(index.documents.filter(d=>d.accession===acc&&d.raw).flatMap(d=>d.source_ids.map(id=>index.sources[id].path)));
  assert.equal(paths.size,2);
 }
 assert.equal(index.row_counts.empty_excluded,861);
});

test('compressed index loads and plain JSON fallback works',async()=>{
 const {loadIndex}=await import('./loadIndex.js');
 const {gzipSync}=await import('node:zlib');
 const saved=global.fetch;
 try {
  const sample={schema_version:1,index_version:'fixture'};
  global.fetch=async()=>new Response(gzipSync(JSON.stringify(sample)));
  assert.deepEqual(await loadIndex('/'),sample);
  const paths=[];
  global.fetch=async path=>{paths.push(path);return path.endsWith('.gz')?new Response('',{status:404}):Response.json(sample);};
  assert.deepEqual(await loadIndex('/'),sample);
  assert.deepEqual(paths,['/search/index.json.gz','/search/index.json']);
 }finally{global.fetch=saved;}
});
