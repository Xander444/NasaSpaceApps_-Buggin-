import React,{useState} from 'react';
import {FIELDS} from './conditions.js';
import {compareEvidence,exportEvidence,toCSV} from './compare.js';
export function Citations({ids=[],index}){
 return <div className="citations">{[...new Set(ids)].map(id=>{const s=index.sources[id];return s?<details key={id}><summary>{s.accession} · {s.locator}</summary><blockquote>{s.excerpt}</blockquote><p>{s.extraction_status} · {s.path} · version {s.table_version??s.file_version??s.source_version}</p><a href={s.url} target="_blank" rel="noreferrer">NASA source ↗</a>{s.doi&&<small> DOI {s.doi}</small>}<small className="hash">SHA-256 {s.sha256}</small></details>:<p key={id}>Unresolved citation: {id}</p>})}</div>
}
export function CheckList({checks,index}){return checks.length?<ul className="checks">{checks.map((c,i)=><li key={i} className={c.status}><b>{c.status} · {c.mode}</b> {c.reason}<Citations ids={c.source_ids} index={index}/></li>)}</ul>:<p className="muted">No experimental conditions requested.</p>}
export function CompareToggle({doc,selected,toggle}){
 const checked=selected.includes(doc.id);return <label className="check"><input type="checkbox" checked={checked} disabled={!checked&&selected.length>=3} onChange={()=>toggle(doc.id)}/> Compare {doc.kind==='test'?'test':'investigation'}</label>
}
export function EvidenceDetail({doc,index,selected,toggle,onSimilar}){
 if(!doc)return <div className="panel"><h2>Inspect the evidence</h2><p className="muted">Open a result or select up to three investigations or test rows to compare.</p></div>;
 const inv=index.investigations.find(i=>i.id===doc.accession);
 const sources=doc.kind==='investigation'?Object.entries(inv.section_sources):[];
 return <div className="panel"><div className="paneltop"><span>{doc.id} · {doc.evidence_level}</span></div><h2>{doc.title}</h2>
 {['test','investigation'].includes(doc.kind)&&<CompareToggle doc={doc} selected={selected} toggle={toggle}/>}
 <p className="muted">{doc.evidence_scope||'Catalog scope; not a measured test condition'}</p><p className="muted">{doc.content_indexed?'Text/cells indexed':'File metadata only; file contents were not read'}</p>
 {doc.kind==='investigation'?sources.map(([section,id])=><section className="excerpt" key={id}><h3>{section.replaceAll('_',' ')}</h3><p>{index.sources[id].excerpt}</p><Citations ids={[id]} index={index}/></section>):<><p className="evidence-text">{doc.text}</p><Citations ids={doc.source_ids} index={index}/></>}
 {Object.keys(doc.conditions).length>0&&<dl>{Object.entries(doc.conditions).map(([field,f])=><div key={field}><dt>{FIELDS[field]?.label||field.replaceAll('_',' ')}</dt><dd>{f.value??'Unknown'} {f.unit}<small className="muted">{f.method}</small></dd></div>)}</dl>}
 {[...new Set([...inv.warnings,...doc.warnings])].map(w=><p className="warning" key={w}>{w}</p>)}
 <div className="similar"><h3>Find similar data</h3>{[['topic','Topic'],['conditions','Experimental conditions'],['measurements','Measurements / sensors']].map(([mode,label])=><button key={mode} onClick={()=>onSimilar({id:doc.id,mode})}>{label}</button>)}<small>Preserves required filters. Topic and shared hardware links do not establish comparable conditions.</small></div>
 </div>
}
export function ResultCard({group,verified,index,selected,toggle,onInspect}){
 const [limit,setLimit]=useState(5);const strongest=group.strongest,inv=group.investigation;
 const summarySource=strongest.doc.kind==='investigation'?index.sources[inv.section_sources.objective]:null;
 const summaryText=summarySource?.excerpt||strongest.doc.text;
 const summaryIds=summarySource?[summarySource.id]:strongest.doc.source_ids;
 return <article className="evidence-card"><div className="top"><div><span className="recordid">{inv.id}</span><h3><button className="textbutton" onClick={()=>onInspect(inv.id)}>{inv.program}</button></h3></div><CompareToggle doc={{id:inv.id,kind:'investigation'}} selected={selected} toggle={toggle}/></div>
 <p>{inv.title}</p><div className="badges"><span className={'badge '+(verified?'verified':'gap')}>{verified?'Verified at the requested scope':'Related evidence with gaps'}</span><span className="badge">{strongest.doc.evidence_level}</span></div>
 <p className="matchreason">{strongest.matched.length?`Matched terms: ${strongest.matched.slice(0,8).join(', ')}`:strongest.sem?'Semantic topic match; inspect the cited evidence.':'Browse / structured condition match'}</p>
 <div className="extract"><b>{summarySource?'Objective · catalog excerpt':strongest.doc.section?.replaceAll('_',' ')||strongest.doc.evidence_level}</b><p>{summaryText.length>380?summaryText.slice(0,380)+'…':summaryText}</p><Citations ids={summaryIds} index={index}/></div>
 <CheckList checks={strongest.checks} index={index}/>
 <p className="muted">{verified?group.matchingTestCount+' matching test rows':'No rows in this group are exact matches'} · {strongest.doc.content_indexed?'source text/cells indexed':'file metadata only'}</p>
 {inv.warnings.map(w=><p className="warning" key={w}>{w}</p>)}
 <details className="test-list"><summary>Inspect {group.evidence.length} supporting records ({group.tests.length} test rows)</summary>{group.evidence.slice(0,limit).map(e=><div className="test-item" key={e.id}><button className="textbutton" onClick={()=>onInspect(e.id)}>{e.doc.title}</button><small>{e.doc.evidence_level}</small>{e.doc.kind==='test'&&<CompareToggle doc={e.doc} selected={selected} toggle={toggle}/>}{e.contextSourceIds&&<div className="muted">Topic relevance comes from investigation context; conditions below belong to this row.<Citations ids={e.contextSourceIds} index={index}/></div>}<CheckList checks={e.checks} index={index}/></div>)}{limit<group.evidence.length&&<button onClick={()=>setLimit(l=>l+20)}>Show 20 more</button>}</details>
 </article>
}
export function Comparison({docs,index,result,onInspect}){
 const comparison=compareEvidence(docs,index);const payload=exportEvidence(docs,result,index);
 function download(format){const blob=new Blob([format==='json'?JSON.stringify(payload,null,2):toCSV(payload)],{type:format==='json'?'application/json':'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`flame-evidence.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const matched=comparison.rows.filter(r=>r.status==='matched'),different=comparison.rows.filter(r=>r.status==='different'),missing=comparison.rows.filter(r=>r.status==='missing');
 return <div className="panel comparison"><h2>Compare selected evidence</h2><p className="muted">{docs.length}/3 selected · compare exact scopes below</p>
 {!docs.length?<p>Select investigations or actual test rows using their checkboxes.</p>:<>
 <div className="comparegrid">{docs.map(d=><section key={d.id}><h3><button className="textbutton" onClick={()=>onInspect(d.id)}>{d.id}</button></h3><p>{d.kind} · {d.title}</p><Citations ids={d.source_ids} index={index}/>{d.kind==='investigation'&&<><p>Investigation coverage only; no simultaneous test conditions inferred.</p>{['objective','approach','hardware'].map(s=>{const id=index.investigations.find(i=>i.id===d.id).section_sources[s];return id?<div key={s}><b>{s}</b><p>{index.sources[id].excerpt}</p><Citations ids={[id]} index={index}/></div>:null;})}</>}{d.warnings.map(w=><p className="warning" key={w}>{w}</p>)}</section>)}</div>
 {docs.length>1&&[['Conditions that match',matched],['Conditions that differ',different],['Missing or unresolved conditions',missing]].map(([title,rows])=><section key={title}><h3>{title}</h3>{!rows.length?<p className="muted">None established.</p>:rows.map(r=><div className="comparison-row" key={r.field}><b>{r.label}</b><ul>{r.values.map((v,i)=><li key={i}>{docs[i].id}: {v.value??'Unknown'} {v.unit}</li>)}</ul><p>{r.conclusion}</p><Citations ids={r.source_ids} index={index}/></div>)}</section>)}
 <h3>Limitations</h3><ul>{comparison.limitations.map(s=><li key={s}>{s}</li>)}</ul><p>{comparison.conversions.rule} <a href={comparison.conversions.source} target="_blank" rel="noreferrer">Conversion reference ↗</a></p>
 <h3>Export verified tests</h3><p>{payload.records.length} selected test rows qualify under the current search. Investigation selections and related rows are excluded. JSON includes comparison evidence; CSV includes units and row citations.</p><div className="button-row"><button disabled={!payload.records.length} onClick={()=>download('json')}>Download JSON</button><button disabled={!payload.records.length} onClick={()=>download('csv')}>Download CSV</button></div>
 </>}
 </div>
}
