export const FIELDS = {
  material: {label:'Material / fuel'}, fuel_class:{label:'Fuel class'}, gravity:{label:'Measured gravity'},
  oxygen_initial_percent:{label:'Initial oxygen',unit:'% vol',numeric:true},
  pressure:{label:'Pressure',unit:'mmHg',numeric:true}, airflow:{label:'Airflow',unit:'cm/s',numeric:true},
  direction:{label:'Flow direction'}, geometry:{label:'Geometry / scale'}, sensor:{label:'Sensor / measurement'},
};
export const CONVERSIONS = {
  '% vol': {'% vol':1}, mmHg:{mmHg:1,kPa:760/101.325,atm:760}, 'cm/s':{'cm/s':1,'m/s':100},
};
export const CONVERSION_SOURCE = 'https://physics.nist.gov/Pubs/SP811/appenB.html';
export function normalize(text, config) {
  let out=String(text ?? '').toLowerCase();
  for(const [alias,canonical] of Object.entries(config.aliases).sort((a,b)=>b[0].length-a[0].length)) {
    const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    out=out.replace(new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`,'g'),canonical);
  }
  return out;
}
export function tokenize(text, config) {
  return (normalize(text,config).match(/[a-z0-9]+(?:\.[0-9]+)?/g)||[]).filter(x=>!config.stopwords.includes(x));
}
export function parseQuery(query,config) {
  const negative=[];
  const positive=query.replace(/\b(?:not|without|exclude|excluding|no)\s+([^,;.]+?)(?=\s+(?:but|and)\b|[,;.]|$)/gi,(_,phrase)=>{negative.push(tokenize(phrase,config));return ' ';});
  const notices=[];
  if(/\d|\b(?:above|below|less|more|greater|at least|at most)\b/i.test(query)) notices.push('Numbers and comparisons in the question are search terms only. Apply them explicitly in Advanced conditions.');
  if(/\b(?:moon|mars|lunar|martian|partial.gravity)\b/i.test(query)) notices.push('Intended application is not measured gravity. No per-test lunar or Martian gravity is verified in this index; use a required gravity condition to expose the gap.');
  if(negative.length) notices.push('Negated phrases are excluded from positive keyword and semantic text; matching phrases reduce relevance. Use a required condition for an exact exclusion.');
  return {tokens:[...new Set(tokenize(positive,config))],negative,positive,notices};
}
export function validateCondition(c) {
  const f=FIELDS[c.field]; if(!f)return 'Unsupported condition field';
  if(!['required','preferred'].includes(c.mode)) return 'Choose required or preferred';
  if(!String(c.value??'').trim())return `${f.label}: enter a value`;
  if(f.numeric){
    if(!['eq','lt','lte','gt','gte','range'].includes(c.operator))return 'Invalid numeric operator';
    if(!CONVERSIONS[f.unit]?.[c.unit])return `${f.label}: unsupported unit`;
    if(!Number.isFinite(Number(c.value)))return `${f.label}: enter a finite number`;
    if(c.operator==='range'&&(!String(c.max??'').trim()||!Number.isFinite(Number(c.max))||Number(c.max)<Number(c.value)))return 'Range maximum must be at least the minimum';
    if(c.operator==='eq'&&c.tolerance==='')return 'Enter an explicit tolerance (0 for exact equality)';
    if(c.field==='oxygen_initial_percent'&&c.operator==='range'&&Number(c.max)>100)return 'Oxygen range maximum must be at most 100%';
    if(c.tolerance!==undefined&&c.tolerance!==''&&(!Number.isFinite(Number(c.tolerance))||Number(c.tolerance)<0))return 'Tolerance must be a nonnegative number';
    if(Number(c.value)<0 || (c.field==='oxygen_initial_percent'&&Number(c.value)>100)) return `${f.label}: value is outside the valid input range`;
  }
  if(!f.numeric&&!['contains','eq','neq'].includes(c.operator))return 'Invalid text operator';
  return null;
}
export function matchCondition(doc,c,config) {
  const error=validateCondition(c); if(error) return {field:c.field,status:'invalid',reason:error,source_ids:[]};
  const f=doc.conditions?.[c.field]; const base={field:c.field,requested:c,source_ids:f?.source_ids||[]};
  if(f?.value===null||f?.value===undefined||f?.value==='')return {...base,status:'unknown',reason:`${FIELDS[c.field].label}: not normalized at this record's scope`};
  let match;
  if(FIELDS[c.field].numeric){
    const target=FIELDS[c.field].unit;
    const factor=CONVERSIONS[target]?.[c.unit], observedFactor=CONVERSIONS[target]?.[f.unit];
    if(!observedFactor||typeof f.value!=='number')return {...base,status:'unknown',reason:'Reported value cannot be compared in these units'};
    const x=f.value*observedFactor,y=Number(c.value)*factor,t=Number(c.tolerance||0)*factor;
    match=({eq:()=>Math.abs(x-y)<=t,lt:()=>x<y,lte:()=>x<=y,gt:()=>x>y,gte:()=>x>=y,range:()=>x>=y&&x<=Number(c.max)*factor})[c.operator]();
  } else {
    const wanted=tokenize(c.value,config), actual=tokenize(f.value,config);
    match=wanted.length>0&&wanted.every(t=>actual.includes(t));
    if(c.operator==='neq')match=!match;
  }
  return {...base,status:match?'matched':'different',reason:`${FIELDS[c.field].label}: ${f.value}${f.unit?' '+f.unit:''}`,observed:f};
}
export function matchConditions(doc,conditions,config) {
  const checks=conditions.map(c=>({...matchCondition(doc,c,config),mode:c.mode}));
  return {checks,verified:checks.filter(c=>c.mode==='required').every(c=>c.status==='matched'),
    preferred:checks.filter(c=>c.mode==='preferred'&&c.status==='matched').length};
}
