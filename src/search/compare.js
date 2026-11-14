import {FIELDS,CONVERSIONS,CONVERSION_SOURCE,normalize} from './conditions.js';
export function compareEvidence(docs,index){
  const rows=Object.entries({...FIELDS,oxygen_final_percent:{label:'Final oxygen'},outcome:{label:'Outcome'},fan_display:{label:'Fan display'}}).map(([field,meta])=>{
    const values=docs.map(d=>d.conditions?.[field]||{value:null,source_ids:[]});
    const known=values.every(v=>v.value!==null&&v.value!==undefined);
    const canonical=values.map(v=>typeof v.value==='number'&&CONVERSIONS[meta.unit]?.[v.unit]?v.value*CONVERSIONS[meta.unit][v.unit]:normalize(v.value,index.config));
    const status=!known?'missing':canonical.every(v=>v===canonical[0])?'matched':'different';
    return {field,label:meta.label,status,values,conclusion:!known?'At least one selected record lacks a normalized value.':status==='matched'?'Reported values match at the selected scope.':'Reported values differ; this does not establish a causal effect.',source_ids:[...new Set(values.flatMap(v=>v.source_ids))]};
  });
  return {schema_version:1,scope:docs.map(d=>({id:d.id,kind:d.kind,accession:d.accession})),rows,
    limitations:['Unknown versus unknown is not a match.','Investigation coverage does not establish simultaneous conditions in a test.','Differences do not isolate causal effects; do not average incompatible tests or infer a safe operating condition.','No indexed per-test measured lunar/Martian gravity is verified.'],
    conversions:{rule:'1 atm = 101.325 kPa = 760 mmHg; 1 m/s = 100 cm/s. No oxygen mole/volume or fan-display conversion.',source:CONVERSION_SOURCE}};
}
export function exportEvidence(docs,result,index){
  const verified=new Set(result.verified.flatMap(g=>g.tests.map(t=>t.id)));
  const tests=docs.filter(d=>d.kind==='test'&&verified.has(d.id));
  return {schema_version:1,index_version:index.index_version,selection_scope:'Selected test rows verified against the current required conditions; source values are not safety certification.',
    records:tests.map(d=>({id:d.id,accession:d.accession,conditions:d.conditions,raw:d.raw,source_ids:d.source_ids,warnings:d.warnings})),
    comparison:compareEvidence(tests,index),sources:Object.fromEntries([...new Set(tests.flatMap(d=>[...d.source_ids,...Object.values(d.conditions).flatMap(f=>f.source_ids)]))].map(id=>[id,index.sources[id]]))};
}
export function csvCell(value){
  let text=value===null||value===undefined?'null':typeof value==='object'?JSON.stringify(value):String(value);
  if(/^[\s]*[=+@-]/.test(text)||/^[\t\r]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function toCSV(payload){
  const rows=[['index_version','scope','id','accession','field','value','unit','raw','method','source_ids','source_locators','source_urls','warnings']];
  for(const r of payload.records)for(const [field,f] of Object.entries(r.conditions))rows.push([payload.index_version,payload.selection_scope,r.id,r.accession,field,f.value,f.unit,f.raw,f.method,f.source_ids,f.source_ids.map(id=>payload.sources[id]?.locator),f.source_ids.map(id=>payload.sources[id]?.url),r.warnings]);
  return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
