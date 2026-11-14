import React,{lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Flame,Search,Database} from 'lucide-react';
import {portfolio,family} from './data';
import {loadIndex} from './search/loadIndex';
import {createEngine} from './search/engine';
import {parseQuery} from './search/conditions';
import {fetchSemantic} from './search/semantic';
import {parseExplorerHandoff} from './search/handoff';
import ConditionEditor from './search/ConditionEditor';
import {EvidenceDetail,ResultCard,Comparison} from './search/Evidence';
import './styles.css';
const Simulator=lazy(()=>import('./Simulator'));
function App(){
 const [index,setIndex]=useState(null),[loadError,setLoadError]=useState('');
 useEffect(()=>{const controller=new AbortController();loadIndex(import.meta.env.BASE_URL,controller.signal).then(d=>{if(d.schema_version!==1)throw Error('Unsupported search schema');setIndex(d);}).catch(e=>{if(e.name!=='AbortError')setLoadError(e.message);});return ()=>controller.abort();},[]);
 return <div className="app"><header><div className="brand"><div className="mark"><Flame size={20}/></div><div><strong>Flame in Freefall</strong><span>NASA Space Apps 2026 · evidence explorer</span></div></div><a className="simlink" href="/simulator">3D risk prototype ↗</a><div className="status"><i/> Source-grounded prototype</div></header>
 <main>{loadError?<div role="alert" className="panel"><h1>Unable to load evidence</h1><p>{loadError}</p><button onClick={()=>location.reload()}>Retry</button></div>:!index?<p role="status">Loading the local evidence index…</p>:<Explorer index={index}/>}</main>
 <footer><a href={portfolio.url} target="_blank" rel="noreferrer">{portfolio.title} ↗</a><span>Missing means unknown—not zero.</span></footer></div>
}
function Explorer({index}){
 const engine=useMemo(()=>createEngine(index),[index]);
 const initialHandoff=useMemo(()=>parseExplorerHandoff(window.location.search),[]);
 const [handoff,setHandoff]=useState(initialHandoff);
 const [q,setQ]=useState(initialHandoff?.query||''),[conditions,setConditions]=useState(initialHandoff?.conditions||[]),[program,setProgram]=useState(''),[familyName,setFamilyName]=useState(''),[problem,setProblem]=useState(''),[outcome,setOutcome]=useState(''),[otherOutcome,setOtherOutcome]=useState(''),[needed,setNeeded]=useState(''),[sort,setSort]=useState('relevance');
 const [selected,setSelected]=useState([]),[detail,setDetail]=useState(null),[showCompare,setShowCompare]=useState(false),[similar,setSimilar]=useState(null);
 const [enhance,setEnhance]=useState(false),[semanticState,setSemanticState]=useState({key:'',data:null,message:''});
 const address=import.meta.env.VITE_SEMANTIC_URL;
 const fullQuery=[q,outcome==='other'?otherOutcome:''].filter(Boolean).join(' ');
 const semanticKey=JSON.stringify([fullQuery,index.index_version,enhance,similar]);
 useEffect(()=>{
  const controller=new AbortController();let live=true;
  if(!enhance||!fullQuery.trim()||similar){setSemanticState({key:semanticKey,data:null,message:enhance&&similar?'Keyword mode for related-data discovery.':''});return ()=>controller.abort();}
  setSemanticState({key:semanticKey,data:null,message:'Loading semantic scores · keyword results remain available…'});
  const timer=setTimeout(()=>{
   const positive=parseQuery(fullQuery,index.config).positive.trim();
   if(!positive){setSemanticState({key:semanticKey,data:null,message:'Keyword mode · no positive semantic query terms.'});return;}
   fetchSemantic(address,positive,index.index_version,{signal:controller.signal}).then(data=>{if(live)setSemanticState({key:semanticKey,data,message:''});}).catch(e=>{if(live)setSemanticState({key:semanticKey,data:null,message:`Keyword fallback · ${e.name==='AbortError'?'semantic request timed out':e.message}`});});
  },300);
  return ()=>{live=false;clearTimeout(timer);controller.abort();};
 },[semanticKey,address]);
 const semantic=semanticState.key===semanticKey?semanticState.data:null;
 const result=useMemo(()=>engine.search({q:fullQuery,conditions,program,familyName,problem,outcome:outcome==='other'?'':outcome,needed,sort,similar,semantic}),[engine,fullQuery,conditions,program,familyName,problem,outcome,needed,sort,similar,semantic]);
 const visibleIds=new Set([...result.verified,...result.related].flatMap(g=>[g.id,...g.evidence.map(e=>e.id)]));
 const outside=selected.filter(id=>!visibleIds.has(id));
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length<3?[...s,id]:s);
 const inspect=id=>{setDetail(id);setShowCompare(false);};
 const clearHandoff=()=>{setHandoff(null);window.history.replaceState({},'',window.location.pathname);};
 const reset=()=>{setQ('');setConditions([]);setProgram('');setFamilyName('');setProblem('');setOutcome('');setOtherOutcome('');setNeeded('');setSort('relevance');setSimilar(null);setEnhance(false);clearHandoff();};
 return <>
 <section className="hero"><div><div className="eyebrow">MICROGRAVITY FIRE SAFETY EVIDENCE</div><h1>Find the evidence.<br/><em>Understand its limits.</em></h1><p>Ask a research question, inspect cited tests, and compare the conditions that matter to your work.</p></div><div className="signal"><span>Indexed evidence</span><b>{index.counts.investigation}</b><small>investigations · {index.counts.test} test rows</small><div className="mini"><span><Database/> NASA PSI</span><span>local index</span></div></div></section>
 <section className="insight"><div className="spark">✦</div><div><span>EVIDENCE BEFORE INTERPRETATION</span><p>Search surfaces reported evidence, objectives, and hypotheses with their original scope. A relevant study does not establish a safe operating condition.</p><details><summary>What is searchable?</summary><p>{index.coverage}</p><p>{index.counts.passage} passages · {index.counts.file} file-metadata records · {index.restricted_files_excluded} restricted files excluded. Index {index.index_version}.</p></details></div></section>
 {handoff&&<SimulatorHandoff handoff={handoff} onClear={clearHandoff}/>}
 <section aria-label="Search data" className="search-area"><label className="question"><Search size={19}/><span className="sr-only">Research question</span><input maxLength={600} value={q} onChange={e=>{setQ(e.target.value);setSimilar(null);}} placeholder="e.g. Design a smoke detector"/></label>
 <div className="quick-queries">Try: {['Design a smoke detector','Extinguish liquid-fuel flames','PMMA'].map(text=><button key={text} onClick={()=>{setQ(text);setSimilar(null);}}>{text}</button>)}</div>
 <div className="filters">
 <label>Problem<select value={problem} onChange={e=>setProblem(e.target.value)}><option value="">Any</option>{['prevention','detection','suppression'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Desired outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">Any</option>{['flame spread','ignition','extinction','detector response','other'].map(x=><option key={x}>{x}</option>)}</select></label>{outcome==='other'&&<label>Other desired outcome<input value={otherOutcome} onChange={e=>setOtherOutcome(e.target.value)} maxLength={150}/></label>}
 <label>Data needed<select value={needed} onChange={e=>setNeeded(e.target.value)}><option value="">Any</option>{['measurements','images/video','methods','findings'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Study family<select value={familyName} onChange={e=>setFamilyName(e.target.value)}><option value="">All families</option>{[...new Set(index.investigations.map(family))].sort().map(f=><option key={f}>{f}</option>)}</select></label>
 <label>Program<select value={program} onChange={e=>setProgram(e.target.value)}><option value="">All programs</option>{index.investigations.map(i=><option key={i.id}>{i.program}</option>)}</select></label>
 <label>Sort<select value={sort} onChange={e=>setSort(e.target.value)}><option value="relevance">Relevance</option><option value="name">Program name</option>{index.investigations.some(i=>i.publication_date)&&<option value="publication_date">Publication date · newest</option>}</select></label>
 </div><ConditionEditor conditions={conditions} setConditions={setConditions}/>
 <div className="search-toolbar"><label><input type="checkbox" checked={enhance} disabled={!address} onChange={e=>setEnhance(e.target.checked)}/> Optional semantic search</label><span>{!address?'Not configured · static search is ready':result.mode}</span><button onClick={reset}>Reset search</button></div>
 </section>
 <div aria-live="polite" className="search-status"><b>{result.browse?'Browse · neutral program ordering':result.mode}</b>{enhance&&semanticState.key===semanticKey&&semanticState.message&&<p>{semanticState.message}</p>}{semantic&&<p className="model-version">Model: {semantic.model_version}</p>}{result.notices.map(n=><p key={n}>{n}</p>)}{result.errors.map(e=><p role="alert" key={e}>{e}</p>)}{similar&&<p>Related-data mode: {similar.mode} · seed {similar.id} <button onClick={()=>setSimilar(null)}>Exit related search</button></p>}</div>
 {outside.length>0&&<p className="warning">Selected outside current results: {outside.join(', ')}. Comparison selection is preserved; only currently verified test rows can be exported.</p>}
 <div className="workspace"><section className="results"><div className="sectionhead"><div><h2>{result.browse?'Browse investigations':'Verified matches'}</h2><span>{result.verified.length} investigations · {result.verified.reduce((n,g)=>n+g.matchingTestCount,0)} matching test rows</span></div><button className="comparebtn" onClick={()=>setShowCompare(true)}>Compare {selected.length}/3</button></div>
 {!result.verified.length&&<div className="empty-state"><h3>{result.errors.length?'Complete the condition controls':'No strong verified match'}</h3><p>Try another question or inspect the related evidence below. Unknown coverage does not establish that no matching data exists elsewhere.</p></div>}
 {result.verified.map(g=><ResultCard key={g.id} group={g} verified index={index} selected={selected} toggle={toggle} onInspect={inspect}/>)}
 {result.related.length>0&&<details className="related" open={!result.verified.length}><summary>Related evidence with gaps · {result.related.length} investigations</summary><p>Required conditions have not been relaxed. These records are excluded from exact-match counts and exports.</p>{result.related.map(g=><ResultCard key={g.id} group={g} verified={false} index={index} selected={selected} toggle={toggle} onInspect={inspect}/>)}</details>}
 </section><aside>{selected.length>0&&<div className="selection"><span>{selected.length}/3 selected</span>{selected.map(id=><button key={id} onClick={()=>toggle(id)} aria-label={`Remove ${id} from comparison`}>{id} ×</button>)}<button onClick={()=>setSelected([])}>Clear selection</button></div>}{showCompare?<Comparison docs={selected.map(id=>engine.byId.get(id)).filter(Boolean)} index={index} result={result} onInspect={inspect}/>:<EvidenceDetail doc={engine.byId.get(detail)} index={index} selected={selected} toggle={toggle} onSimilar={setSimilar}/>}</aside></div>
 </>
}

function SimulatorHandoff({handoff,onClear}){
 const c=handoff.context;
 const vector=value=>value?.map(number=>number.toFixed(2)).join(', ');
 const conditions=[c.oxygen_percent!==null&&`O₂ ${c.oxygen_percent}%`,c.pressure_kpa!==null&&`${c.pressure_kpa} kPa`,c.gravity_g!==null&&`${c.gravity_g} g`,c.ambient_temperature_c!==null&&`${c.ambient_temperature_c} °C`].filter(Boolean);
 return <section className="handoff-banner" aria-label="Simulator search handoff"><div><span>SIMULATOR HANDOFF</span><h2>Evidence context for selected spot {vector(c.spot_m)}{c.spot_m?' m':''}</h2><p>{conditions.join(' · ')||'No cabin conditions supplied'}</p>{c.vent_id&&<p><b>{c.vent_id.replace(/^object-\d+-/,'')}</b>{c.vent_position_m?` at ${vector(c.vent_position_m)} m`:''} is recorded. Physical airflow speed: <strong>{c.airflow_speed_status}</strong>. {c.airflow_speed_status==='unknown'?'No airflow condition was applied.':''}</p>}<small>Oxygen and pressure are preferred search context. Gravity and temperature remain recorded scenario inputs; they are not treated as measured study conditions.</small></div><button onClick={onClear}>Dismiss context</button></section>;
}
createRoot(document.getElementById('root')).render(window.location.pathname.startsWith('/simulator')?<Suspense fallback={<div className="sim-error">Loading 3D viewer…</div>}><Simulator/></Suspense>:<App/>);
