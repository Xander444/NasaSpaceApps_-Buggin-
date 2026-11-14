import React from 'react';
import {FIELDS,CONVERSIONS,validateCondition} from './conditions.js';
export default function ConditionEditor({conditions,setConditions}){
 const change=(i,patch)=>setConditions(cs=>cs.map((c,j)=>j===i?{...c,...patch}:c));
 return <details className="advanced"><summary>Advanced conditions <span>{conditions.length?`· ${conditions.length} applied`: '· optional'}</span></summary><p>Required conditions must be supported in the same test. Preferred conditions add relevance only when known. Numeric equality defaults to an explicit zero tolerance.</p>
 {conditions.map((c,i)=>{const field=FIELDS[c.field];return <div className="condition" key={i}>
 <label>Condition<select value={c.field} onChange={e=>{const f=FIELDS[e.target.value];change(i,{field:e.target.value,value:'',max:'',unit:f.unit,operator:f.numeric?'eq':'contains',tolerance:0});}}>{Object.entries(FIELDS).map(([key,f])=><option key={key} value={key}>{f.label}</option>)}</select></label>
 <label>Priority<select value={c.mode} onChange={e=>change(i,{mode:e.target.value})}><option value="required">Required</option><option value="preferred">Preferred</option></select></label>
 <label>Operator<select value={c.operator} onChange={e=>change(i,{operator:e.target.value})}>{(field.numeric?[['eq','='],['lt','<'],['lte','≤'],['gt','>'],['gte','≥'],['range','Inclusive range']]:[['contains','Contains'],['neq','Does not contain']]).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label>Value<input type={field.numeric?'number':'text'} step="any" value={c.value} onChange={e=>change(i,{value:e.target.value})}/></label>
 {field.numeric&&<><label>Unit<select value={c.unit} onChange={e=>change(i,{unit:e.target.value})}>{Object.keys(CONVERSIONS[field.unit]).map(u=><option key={u}>{u}</option>)}</select></label>{c.operator==='range'&&<label>Maximum<input type="number" step="any" value={c.max??''} onChange={e=>change(i,{max:e.target.value})}/></label>}{c.operator==='eq'&&<label>± tolerance ({c.unit})<input type="number" min="0" step="any" value={c.tolerance} onChange={e=>change(i,{tolerance:e.target.value})}/></label>}</>}
 <button aria-label={`Remove condition ${i+1}`} onClick={()=>setConditions(cs=>cs.filter((_,j)=>j!==i))}>Remove</button>{validateCondition(c)&&<p className="warning">{validateCondition(c)}</p>}
 </div>})}<button onClick={()=>setConditions(cs=>[...cs,{field:'material',value:'',operator:'contains',mode:'required'}])}>+ Add condition</button></details>
}
