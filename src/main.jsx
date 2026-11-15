import React,{lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,Database} from 'lucide-react';
import {portfolio,family} from './data';
import {loadIndex} from './search/loadIndex';
import {createEngine} from './search/engine';
import {parseQuery} from './search/conditions';
import ResearchPanel from './search/ResearchPanel';
import {applyRanking} from './search/research';
import {fetchSemantic} from './search/semantic';
import {parseExplorerHandoff} from './search/handoff';
import ConditionEditor from './search/ConditionEditor';
import {EvidenceDetail,ResultCard,Comparison} from './search/Evidence';
import './styles.css';
import DemoPath from './DemoPath';
import {appHref,stripBasePath} from './routes';
const Simulator=lazy(()=>import('./Simulator'));
const siteHref=path=>appHref(path,import.meta.env.BASE_URL);

// Handle GitHub Pages SPA routing redirects from 404.html
(function() {
  var qa = window.location.search;
  if (qa && qa.indexOf('?p=') === 0) {
    var redirectPath = qa.slice(3).split('&q=')[0].replace(/~and~/g, '&');
    window.history.replaceState(null, null,
      window.location.pathname.slice(0, -1) + redirectPath
    );
  }
})();

const links=[
 {href:siteHref('/'),label:'Project',key:'project'},
 {href:siteHref('/evidence'),label:'Evidence Explorer',key:'evidence'},
 {href:siteHref('/simulator'),label:'Cabin Screening',key:'simulator'},
 {href:siteHref('/sources'),label:'Sources',key:'sources'},
 {href:siteHref('/about'),label:'Who We Are',key:'about'},
];

function SiteHeader({active}){
 return <header className="site-header"><div className="header-line"><a className="wordmark" href={siteHref('/')} aria-label="Flame in Freefall home"><strong>Flame in Freefall</strong><span>Fire safety evidence for exploration</span></a><span className="event-name">NASA SPACE APPS · 2026</span></div><nav aria-label="Primary navigation">{links.map(link=><a className={active===link.key?'active':''} href={link.href} key={link.key}>{link.label}</a>)}</nav></header>;
}

function SiteFooter(){
 return <footer className="site-footer"><span>Flame in Freefall · NASA Space Apps 2026</span></footer>;
}

function PageShell({active,children}){
 return <div className="site-shell"><SiteHeader active={active}/>{children}<SiteFooter/></div>;
}

function HomePage(){
 return <PageShell active="project"><main id="project" className="project-page">
  <section className="project-hero"><div className="hero-copy"><p className="eyebrow centered">MICROGRAVITY FIRE SAFETY</p><h1>Find the fire safety evidence that fits the mission.</h1><p className="lede">A clear, source-grounded workspace for exploring combustion research and screening spacecraft interiors, without presenting assumptions as measured fact.</p><div className="hero-actions"><a className="primary-action" href={siteHref('/evidence')}>Explore the evidence <span aria-hidden="true">→</span></a><a className="secondary-action" href={siteHref('/simulator')}>View cabin screening</a></div></div></section>
  <section className="challenge-solution" aria-labelledby="challenge-title"><div><p className="section-label">THE CHALLENGE</p><h2 id="challenge-title">Turn decades of microgravity combustion research into usable fire safety insight.</h2><p>Create an interactive, SI-powered dashboard that summarizes, ranks, and interprets microgravity combustion findings for human space exploration.</p></div><div><p className="section-label">HOW WE SOLVE IT</p><h2>Connect published evidence to an explainable cabin screen.</h2><p>Users search sourced studies, compare test conditions, confirm objects in a 3D cabin, rank candidate hotspots, and carry a selected spot and its conditions back into evidence search.</p></div></section>
  <section className="project-flow" aria-labelledby="flow-title"><p className="section-label">GUIDED DEMO</p><h2 id="flow-title">Follow one question to an explainable hotspot.</h2><p className="demo-intro">Move from project context to sourced evidence, then inspect a reproducible cabin-screening example and its modeled contributors.</p><DemoPath currentStep="project"/></section>
  <section className="project-facts" aria-label="Project facts"><div><strong>24</strong><p>combustion investigations in the current curated explorer</p></div><div><strong>100k</strong><p>default candidate locations in the precomputed cabin screen</p></div><div><strong>1 rule</strong><p>If a value is missing, show unknown. Never invent it.</p></div></section>
  <section className="trust-section"><p className="section-label">DESIGNED FOR TRUST</p><h2>Useful because the limits stay visible.</h2><p>The interface keeps reported measurements, user-entered cabin conditions, illustrative coefficients, and missing data distinct. Every research result should be easy to trace back to its source.</p><div className="text-links"><a href={siteHref('/sources')}>Review project sources →</a><a href={siteHref('/about')}>Meet the team →</a></div></section>
 </main></PageShell>;
}

function SourcesPage(){
 const sources=[
  ['NASA Space Apps challenge resources','Official challenge brief and supplied resources.','https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources'],
  ['NASA Physical Sciences Informatics','Searchable combustion investigation records and linked files.','https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation'],
  ['BASS-II · PSI-25','Burning and Suppression of Solids II investigation record.','https://psi.nasa.gov/physci/repo/data/investigations/PSI-25'],
  ['Saffire-I · PSI-98','Spacecraft Fire Experiment investigation record.','https://psi.nasa.gov/physci/repo/data/investigations/PSI-98'],
  ['SAME-R · PSI-101','Smoke Aerosol Measurement Experiment Reflight investigation record.','https://psi.nasa.gov/physci/repo/data/investigations/PSI-101'],
  [portfolio.title,'NASA combustion program context.',portfolio.url],
 ];
 return <PageShell active="sources"><main className="simple-page"><p className="section-label">SOURCE REGISTER</p><h1>Start with the original record.</h1><p className="page-intro">The explorer points back to public source material. A source supports only the claim and scope shown with it; relevance is not proof of safety.</p><div className="source-list">{sources.map(([title,description,url],index)=><a href={url} target="_blank" rel="noreferrer" key={url}><span>{String(index+1).padStart(2,'0')}</span><div><h2>{title}</h2><p>{description}</p></div><strong aria-hidden="true">↗</strong></a>)}</div></main></PageShell>;
}

function AboutPage(){
 const members=[
  {name:'Gabriel Ramos Rodriguez',bio:'Gabriel developed his passion for software engineering by teaching Python and participating in cybersecurity competitions throughout high school. Away from code, he is an avid guitarist who brings the same creativity and persistence to music and technical problem-solving.'},
  {name:'Alexander Vatch',bio:'17 year old programmer from Montreal, Canada. Student at Marianopolis College. Specializes in backend development and data visualization.'},
  {name:'Elisabeth Wei',bio:'Among Us!!'},
  {name:'Lily Ma',bio:'Lily is a first-year student at Marianopolis College who brings curiosity, humour, and persistence to collaborative problem-solving, even when an especially stubborn bug tests all three.'},
 ];
 return <PageShell active="about"><main className="simple-page about-page"><p className="section-label">WHO WE ARE</p><h1>We are building a clearer path from fire research to mission questions.</h1><p className="page-intro">Meet the four members of our team.</p><div className="team-grid">{members.map(({name,bio},index)=><article key={name}><span>{String(index+1).padStart(2,'0')}</span><h2>{name}</h2><p>{bio}</p></article>)}</div></main></PageShell>;
}

function EvidencePage(){
 const [index,setIndex]=useState(null),[loadError,setLoadError]=useState(''),[loadAttempt,setLoadAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();setIndex(null);setLoadError('');loadIndex(import.meta.env.BASE_URL,controller.signal).then(d=>{if(d.schema_version!==1)throw Error('Unsupported search schema');setIndex(d);}).catch(e=>{if(e.name!=='AbortError')setLoadError(e.message);});return ()=>controller.abort();},[loadAttempt]);
 return <PageShell active="evidence"><div className="app">
 <main className="evidence-main">{loadError?<div role="alert" className="load-state error"><h1>Unable to load evidence</h1><p>{loadError}</p><button onClick={()=>setLoadAttempt(attempt=>attempt+1)}>Retry loading evidence</button></div>:!index?<p role="status" className="load-state">Loading the local evidence index…</p>:<Explorer index={index}/>}</main>
 </div></PageShell>
}
function Explorer({index}){
 const engine=useMemo(()=>createEngine(index),[index]);
 const initialHandoff=useMemo(()=>parseExplorerHandoff(window.location.search),[]);
 const [handoff,setHandoff]=useState(initialHandoff);
 const [q,setQ]=useState(initialHandoff?.query||''),[conditions,setConditions]=useState(initialHandoff?.conditions||[]),[program,setProgram]=useState(''),[familyName,setFamilyName]=useState(''),[problem,setProblem]=useState(''),[outcome,setOutcome]=useState(''),[otherOutcome,setOtherOutcome]=useState(''),[needed,setNeeded]=useState(''),[sort,setSort]=useState('relevance');
 const [selected,setSelected]=useState([]),[detail,setDetail]=useState(null),[showCompare,setShowCompare]=useState(false),[similar,setSimilar]=useState(null);
 const [enhance,setEnhance]=useState(false),[semanticState,setSemanticState]=useState({key:'',data:null,message:''});
 const [aiMode,setAiMode]=useState(false),[recommendation,setRecommendation]=useState(null);
 const keyword=()=>{setAiMode(false);setRecommendation(null);setEnhance(false);};
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
 const researchControls={conditions,program,familyName,problem,outcome:outcome==='other'?'':outcome,needed,sort};
 const researchKey=JSON.stringify([fullQuery,researchControls,handoff,index.index_version,similar,enhance]);
 const result=useMemo(()=>engine.search({q:aiMode&&recommendation?.key===researchKey?recommendation.retrieval_query:fullQuery,conditions,program,familyName,problem,outcome:outcome==='other'?'':outcome,needed,sort,similar,semantic}),[engine,aiMode,recommendation,researchKey,fullQuery,conditions,program,familyName,problem,outcome,needed,sort,similar,semantic]);
 const displayed=applyRanking(result,aiMode&&recommendation?.key===researchKey&&sort==='relevance'&&!similar?recommendation:null);
 const visibleIds=new Set([...result.verified,...result.related].flatMap(g=>[g.id,...g.evidence.map(e=>e.id)]));
 const outside=selected.filter(id=>!visibleIds.has(id));
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length<3?[...s,id]:s);
 const revealReview=()=>requestAnimationFrame(()=>{if(window.matchMedia('(max-width: 960px)').matches)document.getElementById('evidence-review')?.scrollIntoView({block:'start'});});
 const inspect=id=>{setDetail(id);setShowCompare(false);revealReview();};
 const openComparison=()=>{setShowCompare(true);revealReview();};
 const clearHandoff=()=>{setHandoff(null);window.history.replaceState({},'',window.location.pathname);};
 const reset=()=>{keyword();setQ('');setConditions([]);setProgram('');setFamilyName('');setProblem('');setOutcome('');setOtherOutcome('');setNeeded('');setSort('relevance');setSimilar(null);setEnhance(false);clearHandoff();};
 const filterCount=[problem,outcome,needed,familyName,program,sort!=='relevance'&&sort].filter(Boolean).length;
 return <>
 <section className="hero"><div><div className="eyebrow">MICROGRAVITY FIRE SAFETY EVIDENCE</div><h1>Find the evidence.<br/><em>Understand its limits.</em></h1><p>Ask a research question, inspect cited tests, and compare the conditions that matter to your work.</p></div><div className="signal"><span>Indexed evidence</span><b>{index.counts.investigation}</b><small>investigations · {index.counts.test} test rows</small><div className="mini"><span><Database/> NASA PSI</span><span>local index</span></div></div></section>
 <section className="insight"><div className="spark">✦</div><div><span>EVIDENCE BEFORE INTERPRETATION</span><p>Search surfaces reported evidence, objectives, and hypotheses with their original scope. A relevant study does not establish a safe operating condition.</p><details><summary>What is searchable?</summary><p>{index.coverage}</p><p>{index.counts.passage} passages · {index.counts.file} file-metadata records · {index.restricted_files_excluded} restricted files excluded. Index {index.index_version}.</p></details></div></section>
 {handoff&&<SimulatorHandoff handoff={handoff} onClear={clearHandoff}/>}
 <section aria-label="Search data" className="search-area"><div className="search-area-head"><div><span className="step-label">01 · SEARCH</span><h2>What are you investigating?</h2></div><p>Keyword results update locally as you type. AI guidance runs only after you explicitly select Analyze.</p></div><label className="question"><Search size={19}/><span className="sr-only">Research question</span><input maxLength={600} value={q} onKeyDown={e=>{if(e.key==='Enter')keyword();}} onChange={e=>{setQ(e.target.value);setSimilar(null);}} placeholder="e.g. Design a smoke detector"/></label>
 <div className="search-mode" role="group" aria-label="Search method"><button className={!aiMode?'active':''} aria-pressed={!aiMode} onClick={keyword}><b>Keyword search</b><span>Local, immediate, no AI</span></button><button className={aiMode?'active':''} aria-pressed={aiMode} onClick={()=>{setEnhance(false);setSimilar(null);setAiMode(true);}}><b>AI-guided search</b><span>Optional, source-bounded guidance</span></button></div>
 <div className="quick-queries"><span>Example questions</span>{['Design a smoke detector','Extinguish liquid-fuel flames','PMMA'].map(text=><button key={text} onClick={()=>{keyword();setQ(text);setSimilar(null);}}>{text}</button>)}</div>
 <details className="filter-disclosure"><summary><span>Refine by study details</span><small>{filterCount?`${filterCount} filter${filterCount===1?'':'s'} applied`:'Optional filters'}</small></summary><div className="filters">
 <label>Problem<select value={problem} onChange={e=>setProblem(e.target.value)}><option value="">Any</option>{['prevention','detection','suppression'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Desired outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">Any</option>{['flame spread','ignition','extinction','detector response','other'].map(x=><option key={x}>{x}</option>)}</select></label>{outcome==='other'&&<label>Other desired outcome<input value={otherOutcome} onChange={e=>setOtherOutcome(e.target.value)} maxLength={150}/></label>}
 <label>Data needed<select value={needed} onChange={e=>setNeeded(e.target.value)}><option value="">Any</option>{['measurements','images/video','methods','findings'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Study family<select value={familyName} onChange={e=>setFamilyName(e.target.value)}><option value="">All families</option>{[...new Set(index.investigations.map(family))].sort().map(f=><option key={f}>{f}</option>)}</select></label>
 <label>Program<select value={program} onChange={e=>setProgram(e.target.value)}><option value="">All programs</option>{index.investigations.map(i=><option key={i.id}>{i.program}</option>)}</select></label>
 <label>Sort<select value={sort} onChange={e=>setSort(e.target.value)}><option value="relevance">Relevance</option><option value="name">Program name</option>{index.investigations.some(i=>i.publication_date)&&<option value="publication_date">Publication date · newest</option>}</select></label>
 </div><div className="search-toolbar"><label><input type="checkbox" checked={enhance} disabled={!address} onChange={e=>{keyword();setEnhance(e.target.checked);}}/> Optional semantic reranking</label><span>{!address?'Not configured. Keyword search is ready.':result.mode}</span></div></details><ConditionEditor conditions={conditions} setConditions={setConditions}/>
 <div className="reset-row"><span>{q||filterCount||conditions.length?'Search settings are active.':'Showing the complete evidence index.'}</span><button disabled={!q&&!filterCount&&!conditions.length&&!handoff} onClick={reset}>Reset search</button></div>
 </section>
 {aiMode&&<ResearchPanel index={index} prompt={fullQuery} controls={researchControls} context={handoff?.context} contextKey={researchKey} onRanking={setRecommendation} onKeyword={keyword} onApprove={c=>setConditions(cs=>[...cs,{...c,mode:'preferred',id:crypto.randomUUID()}])}/>}
 <div aria-live="polite" className="search-status">{aiMode&&recommendation?.key===researchKey&&<p>Gemini-ranked within existing evidence groups {sort!=='relevance'&&'· selected sort takes precedence'}</p>}<b>{result.browse?'Browse · neutral program ordering':result.mode}</b>{enhance&&semanticState.key===semanticKey&&semanticState.message&&<p>{semanticState.message}</p>}{semantic&&<p className="model-version">Model: {semantic.model_version}</p>}{result.notices.map(n=><p key={n}>{n}</p>)}{result.errors.map(e=><p role="alert" key={e}>{e}</p>)}{similar&&<p>Related-data mode: {similar.mode} · seed {similar.id} <button onClick={()=>setSimilar(null)}>Exit related search</button></p>}</div>
 {outside.length>0&&<p className="warning">Selected outside current results: {outside.join(', ')}. Comparison selection is preserved; only currently verified test rows can be exported.</p>}
 <div className="workspace"><section className="results"><div className="sectionhead"><div><span className="step-label">02 · REVIEW</span><h2>{result.browse?'Browse investigations':'Verified matches'}</h2><span>{result.verified.length} investigations · {result.verified.reduce((n,g)=>n+g.matchingTestCount,0)} {result.browse?'indexed':'matching'} test rows</span></div><button className="comparebtn" disabled={!selected.length} onClick={openComparison}>Compare selected · {selected.length}/3</button></div>
 {!result.verified.length&&<div className="empty-state"><h3>{result.errors.length?'Complete the condition controls':'No strong verified match'}</h3><p>Try another question or inspect the related evidence below. Unknown coverage does not establish that no matching data exists elsewhere.</p><button onClick={reset}>Reset search</button></div>}
 {displayed.verified.map(g=><ResultCard key={g.id} group={g} verified browse={result.browse} index={index} selected={selected} toggle={toggle} onInspect={inspect}/>)}
 {result.related.length>0&&<details className="related" open={!result.verified.length}><summary>Related evidence with gaps · {result.related.length} investigations</summary><p>Required conditions have not been relaxed. These records are excluded from exact-match counts and exports.</p>{displayed.related.map(g=><ResultCard key={g.id} group={g} verified={false} index={index} selected={selected} toggle={toggle} onInspect={inspect}/>)}</details>}
 </section><aside id="evidence-review" tabIndex="-1">{selected.length>0&&<div className="selection"><span>{selected.length}/3 selected</span>{selected.map(id=><button key={id} onClick={()=>toggle(id)} aria-label={`Remove ${id} from comparison`}>{id} ×</button>)}<button onClick={()=>setSelected([])}>Clear selection</button></div>}{showCompare?<Comparison docs={selected.map(id=>engine.byId.get(id)).filter(Boolean)} index={index} result={result} onInspect={inspect} onClose={()=>setShowCompare(false)}/>:<EvidenceDetail doc={engine.byId.get(detail)} index={index} selected={selected} toggle={toggle} onSimilar={setSimilar}/>}</aside></div>
 </>
}

function SimulatorHandoff({handoff,onClear}){
 const c=handoff.context;
 const vector=value=>value?.map(number=>number.toFixed(2)).join(', ');
 const conditions=[c.oxygen_percent!==null&&`O₂ ${c.oxygen_percent}%`,c.pressure_kpa!==null&&`${c.pressure_kpa} kPa`,c.gravity_g!==null&&`${c.gravity_g} g`,c.ambient_temperature_c!==null&&`${c.ambient_temperature_c} °C`].filter(Boolean);
 return <section className="handoff-banner" aria-label="Simulator search handoff"><div><span>SIMULATOR HANDOFF{c.area?` · ${c.area.toUpperCase()}`:''}</span><h2>Evidence context for selected spot {vector(c.spot_m)}{c.spot_m?' m':''}</h2><p>{conditions.join(' · ')||'No cabin conditions supplied'}</p>{c.objects?.length>0&&<div className="handoff-objects"><b>Relevant confirmed objects</b><ul>{c.objects.map(object=><li key={`${object.type}-${object.id}`}><strong>{object.id.replace(/^object-\d+-/,'')}</strong> · {object.type}{object.position_m?` at ${vector(object.position_m)} m`:''}{object.distance_m!==null?` · ${object.distance_m.toFixed(2)} m from spot`:''}</li>)}</ul></div>}{c.vent_id&&<p><b>{c.vent_id.replace(/^object-\d+-/,'')}</b>{c.vent_position_m?` at ${vector(c.vent_position_m)} m`:''} is recorded. Physical airflow speed: <strong>{c.airflow_speed_status}</strong>. {c.airflow_speed_status==='unknown'?'No airflow condition was applied.':''}</p>}<small>Oxygen and pressure are preferred search context. Object locations, gravity, and temperature remain recorded scenario context; they are not treated as measured study conditions.</small></div><button onClick={onClear}>Dismiss context</button></section>;
}
const path=stripBasePath(window.location.pathname,import.meta.env.BASE_URL).replace(/\/+$/,'')||'/';
let page;
if(path==='/simulator'||path==='/screening')page=<Suspense fallback={<div className="sim-error">Loading 3D viewer…</div>}><Simulator/></Suspense>;
else if(path==='/evidence')page=<EvidencePage/>;
else if(path==='/sources')page=<SourcesPage/>;
else if(path==='/about')page=<AboutPage/>;
else page=<HomePage/>;
createRoot(document.getElementById('root')).render(page);