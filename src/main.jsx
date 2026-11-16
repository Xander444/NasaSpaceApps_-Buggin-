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
import {MISSION_CONTEXTS,countComparableTestRows,preferredConditionsForContext} from './search/missionContexts';
import {buildScientificInsight} from './search/insights';
import InsightPanel from './search/InsightPanel';
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
 return <header className="site-header"><div className="header-line"><a className="wordmark" href={siteHref('/')} aria-label="Flame in Freefall home"><strong>Flame in Freefall</strong><span>Fire safety evidence for exploration</span></a><span className="event-name">NASA SPACE APPS   2026</span></div><nav aria-label="Primary navigation">{links.map(link=><a className={active===link.key?'active':''} href={link.href} key={link.key}>{link.label}</a>)}</nav></header>;
}

function SiteFooter(){
 return <footer className="site-footer"><span>Flame in Freefall · NASA Space Apps 2026</span></footer>;
}

function PageShell({active,children}){
 return <div className="site-shell"><SiteHeader active={active}/>{children}<SiteFooter/></div>;
}

const psiRecordUrl=accession=>`https://psi.nasa.gov/physci/repo/data/investigations/${accession}`;
const controlEvidence=[
 {title:'Materials and airflow',text:'BASS and BASS-II study solid-fuel burning with oxygen and flow variables. SPICE and SLICE investigate gaseous flames, smoke points, and flame behavior. These records help frame material and ventilation questions; they do not provide a universal material-safety rating.',records:[['BASS · PSI-26','PSI-26'],['BASS-II · PSI-25','PSI-25'],['SPICE · PSI-107','PSI-107'],['SLICE · PSI-106','PSI-106']]},
 {title:'Smoke detection and aerosols',text:'SAME and SAME-R study smoke/aerosol measurements and detector response. DAFT/DAFT-2 examines aerosol-measurement instrumentation with dust, a related instrument-use case, not a spacecraft-fire detector performance test.',records:[['SAME · PSI-102','PSI-102'],['SAME-R · PSI-101','PSI-101'],['DAFT / DAFT-2 · PSI-47','PSI-47']]},
 {title:'Suppression and spacecraft fires',text:'FLEX and FLEX-2 investigate liquid-droplet combustion, extinction, and suppressant questions. Saffire investigations study larger-scale spacecraft-fire behavior. Their relevance helps identify research questions; it does not calibrate this prototype’s control coefficients.',records:[['FLEX · PSI-69','PSI-69'],['FLEX-2 · PSI-68','PSI-68'],['SAFFIRE-I · PSI-98','PSI-98'],['SAFFIRE-II · PSI-99','PSI-99'],['SAFFIRE-III · PSI-100','PSI-100']]},
];
const hardwareFamilies=[
 {title:'ACME · Combustion Integrated Rack',text:'Six gaseous-flame investigations use the ACME hardware family in the CIR.',records:[['Flame Design · PSI-10','PSI-10'],['Burning Rate Emulator · PSI-20','PSI-20'],['Coflow Laminar Diffusion Flame · PSI-21','PSI-21'],['E-FIELD Flames · PSI-22','PSI-22'],['s-Flame · PSI-23','PSI-23'],['CFI-G · PSI-159','PSI-159']]},
 {title:'Droplet combustion · MDCA / CIR',text:'FLEX, FLEX-2, and CFI study liquid-fuel droplets with the Multi-user Droplet Combustion Apparatus in the CIR.',records:[['FLEX · PSI-69','PSI-69'],['FLEX-2 · PSI-68','PSI-68'],['CFI · PSI-39','PSI-39']]},
 {title:'Fan-driven flow duct · Microgravity Science Glovebox',text:'BASS, BASS-II, SPICE, and SLICE cover solid and gaseous fuels in the MSG; the challenge brief identifies the modular fan-driven duct built for SPICE.',records:[['BASS · PSI-26','PSI-26'],['BASS-II · PSI-25','PSI-25'],['SPICE · PSI-107','PSI-107'],['SLICE · PSI-106','PSI-106']]},
 {title:'Large-scale spacecraft-fire experiments · Cygnus',text:'SAFFIRE investigations study fire behavior in an uncrewed Cygnus cargo vehicle after it departs the ISS.',records:[['SAFFIRE-I · PSI-98','PSI-98'],['SAFFIRE-II · PSI-99','PSI-99'],['SAFFIRE-III · PSI-100','PSI-100']]},
];

function StudyLinks({records}){
 return <div className="study-links">{records.map(([label,accession])=><a href={psiRecordUrl(accession)} target="_blank" rel="noreferrer" key={accession}>{label} ↗</a>)}</div>;
}

function HomePage(){
 return <PageShell active="project"><main id="project" className="project-page">
  <section className="project-hero"><div className="hero-copy"><p className="eyebrow centered">MICROGRAVITY FIRE SAFETY</p><h1>Find the fire safety evidence that fits the mission.</h1><p className="lede">A clear, source-grounded workspace for exploring combustion research and screening spacecraft interiors, without presenting assumptions as measured fact.</p><div className="hero-actions"><a className="primary-action" href={siteHref('/evidence')}>Explore the evidence <span aria-hidden="true">→</span></a><a className="secondary-action" href={siteHref('/simulator')}>View cabin screening</a></div></div></section>
  <section className="challenge-solution" aria-labelledby="challenge-title"><div><p className="section-label">THE CHALLENGE</p><h2 id="challenge-title">Turn decades of microgravity combustion research into usable fire safety insight.</h2><p>Create an interactive, SI-powered dashboard that summarizes, ranks, and interprets microgravity combustion findings for human space exploration.</p></div><div><p className="section-label">HOW WE SOLVE IT</p><h2>Connect published evidence to an explainable cabin screen.</h2><p>Users search sourced studies, compare test conditions, confirm objects in a 3D cabin, rank candidate hotspots, and carry a selected spot and its conditions back into evidence search.</p></div></section>
  <section className="study-context" aria-labelledby="controls-evidence-title"><p className="section-label">FROM STUDIES TO FIRE-SAFETY QUESTIONS</p><h2 id="controls-evidence-title">What the investigations can inform</h2><p className="study-context-intro">These cited records help users find evidence about materials, airflow, smoke sensing, and suppression. They are research context, not proof that a control is effective or a calibration source for the cabin screener.</p><div className="study-context-grid">{controlEvidence.map(group=><article key={group.title}><h3>{group.title}</h3><p>{group.text}</p><StudyLinks records={group.records}/></article>)}</div><div className="earth-transfer" aria-labelledby="earth-transfer-title"><h3 id="earth-transfer-title">Earth technology-transfer examples</h3><p className="study-context-intro">The challenge connects space research with fire-safety technologies used on Earth. These examples show the relationship to the research indexed here, and where this dashboard’s evidence stops.</p><div className="study-context-grid"><article><h3>Fine-water-mist suppression</h3><p>The challenge names fine-water-mist extinguishers as a potential Earth application. FLEX and FLEX-2 investigate flame extinction and suppressant questions, offering combustion context rather than product-performance testing.</p><div className="study-links"><a href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources" target="_blank" rel="noreferrer">Challenge brief ↗</a><StudyLinks records={[["FLEX · PSI-69","PSI-69"],["FLEX-2 · PSI-68","PSI-68"]]}/></div></article><article><h3>Smoke detection</h3><p>A NASA Spinoff example describes a shuttle-developed detector designed to distinguish smoke from dust. SAME and SAME-R provide related smoke/aerosol measurement and detector-response research context, not product benchmarking.</p><div className="study-links"><a href="https://spinoff.nasa.gov/node/9407" target="_blank" rel="noreferrer">NASA Spinoff · Fire Detector ↗</a><StudyLinks records={[["SAME · PSI-102","PSI-102"],["SAME-R · PSI-101","PSI-101"]]}/></div></article><article><h3>Firefighter equipment</h3><p>NASA Spinoff resources describe spacesuit technology adapted for firefighters’ breathing gear and protective clothing. These are technology-transfer examples; this index does not contain firefighter-equipment or field-performance tests.</p><div className="study-links"><a href="https://spinoff.nasa.gov/node/9582" target="_blank" rel="noreferrer">NASA Spinoff · Fireman’s Air Tanks ↗</a><a href="https://spinoff.nasa.gov/node/9918" target="_blank" rel="noreferrer">NASA Spinoff · Fire Attire ↗</a></div></article></div></div></section>
  <section className="hardware-map" aria-labelledby="hardware-map-title"><p className="section-label">INVESTIGATIONS &amp; TEST HARDWARE</p><h2 id="hardware-map-title">See which experiments share a platform</h2><p className="study-context-intro">Hardware links organize related records; they do not make results interchangeable. Compare test-level conditions before drawing conclusions.</p><div className="hardware-map-grid">{hardwareFamilies.map(group=><article key={group.title}><h3>{group.title}</h3><p>{group.text}</p><StudyLinks records={group.records}/></article>)}</div><p className="hardware-map-source">Hardware groupings follow the challenge brief and the linked NASA PSI investigation records. <a href={siteHref('/sources')}>Browse the complete source register →</a></p></section>
  <aside className="scope-note" aria-labelledby="scope-note-title"><div><p className="section-label">SCOPE &amp; VALIDITY</p><h2 id="scope-note-title">Useful evidence, with clear limits.</h2></div><ul><li>No verified partial-gravity combustion tests are currently indexed. Gravity in the cabin screener is recorded only; it does not affect the score.</li><li>Rocket-engine and propellant fires are outside the scope of the available PSI research for this challenge.</li><li>The cabin screener is an illustrative relative screening index, not a fire prediction, CFD, probability, safety certification, or mission approval.</li></ul><a href={siteHref('/sources')}>Challenge scope and sources →</a></aside>
  <section className="project-flow" aria-labelledby="flow-title"><p className="section-label">GUIDED DEMO</p><h2 id="flow-title">Follow one question to an explainable hotspot.</h2><p className="demo-intro">Move from project context to sourced evidence, then inspect a reproducible cabin-screening example and its modeled contributors.</p><DemoPath currentStep="project"/></section>
  <section className="project-facts" aria-label="Project facts"><div><strong>24</strong><p>combustion investigations in the current curated explorer</p></div><div><strong>100k</strong><p>default candidate locations in the precomputed cabin screen</p></div><div><strong>1 rule</strong><p>If a value is missing, show unknown. Never invent it.</p></div></section>
  <section className="trust-section"><p className="section-label">DESIGNED FOR TRUST</p><h2>Useful because the limits stay visible.</h2><p>The interface keeps reported measurements, user-entered cabin conditions, illustrative coefficients, and missing data distinct. Every research result should be easy to trace back to its source.</p><div className="text-links"><a href={siteHref('/sources')}>Review project sources →</a><a href={siteHref('/about')}>Meet the team →</a></div></section>
 </main></PageShell>;
}

function SourcesPage(){
 const coreSources=[
  ['NASA Space Apps challenge resources','Challenge brief and supplied resources.','https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources'],
  ['NASA Spinoff · Fire Detector','NASA-developed shuttle fire-detector technology and its Earth applications.','https://spinoff.nasa.gov/node/9407'],
  ['NASA Spinoff · Fireman’s Air Tanks','Spacesuit technology adapted for firefighters’ breathing equipment.','https://spinoff.nasa.gov/node/9582'],
  ['NASA Spinoff · New Technology for the Fire Attire','NASA spacesuit technology adapted for firefighter clothing.','https://spinoff.nasa.gov/node/9918'],
  ['NASA Physical Sciences Informatics · combustion search','Search used to identify relevant public investigation records.','https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation'],
  ['Canadian Space Agency open-data catalog','Catalog reviewed for related datasets; no eligible dataset was included in the spacecraft-fire index.','https://donnees-data.asc-csa.gc.ca/en/dataset?science_admin=True'],
  [portfolio.title,'NASA program context. This is background, not a calibration source.',portfolio.url],
  ['NIST SP 811 · Appendix B','SI conversion reference used for supported unit conversions.','https://physics.nist.gov/Pubs/SP811/appenB.html'],
 ];
 const investigations=[
  ['PSI-10','ACME / Flame Design','Advanced Combustion via Microgravity Experiments / Flame Design','10.60555/w4zy-bt45'],
  ['PSI-20','ACME BRE','Advanced Combustion via Microgravity Experiments - Burning Rate Emulator','10.60555/vb93-3y72'],
  ['PSI-21','ACME CLD Flame','Advanced Combustion via Microgravity Experiments / Coflow Laminar Diffusion Flame','10.60555/23e1-9950'],
  ['PSI-22','ACME E-FIELD Flames','Advanced Combustion via Microgravity Experiments: Electric-Field Effects on Laminar Diffusion Flames','10.60555/se5a-8c73'],
  ['PSI-23','ACME s-Flame','Advanced Combustion via Microgravity Experiments: Structure and Response of Spherical Diffusion Flames','10.60555/k57n-p030'],
  ['PSI-25','BASS-II','Burning and Suppression of Solids II','10.60555/4qc4-de67'],
  ['PSI-26','BASS','Burning and Suppression of Solids','10.60555/58h4-dy80'],
  ['PSI-39','CFI','Cool Flames Investigation','10.60555/m6pj-a914'],
  ['PSI-47','DAFT / DAFT-2','Dust and Aerosol Measurement Feasibility Test','10.60555/ztgj-d202'],
  ['PSI-60','SPICE data analysis','Computational and Experimental Analysis of SPICE Data Sets','10.60555/mzjm-yv57'],
  ['PSI-62','BASS modeling','Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity with Comparison to BASS Experiments using Two-Color Tomography','10.60555/e9xp-ex83'],
  ['PSI-68','FLEX-2','Flame Extinguishment Experiment II','10.60555/byp8-h018'],
  ['PSI-69','FLEX','Flame Extinguishment Experiment','10.60555/mbq8-0451'],
  ['PSI-98','SAFFIRE-I','Spacecraft Fire Safety Experiment I','10.60555/0t15-1z43'],
  ['PSI-99','SAFFIRE-II','Spacecraft Fire Experiment II','10.60555/2chp-m469'],
  ['PSI-100','SAFFIRE-III','Spacecraft Fire Experiment III','10.60555/040q-4h36'],
  ['PSI-101','SAME-R','Smoke Aerosol Measurement Experiment Reflight','10.60555/2np7-jv14'],
  ['PSI-102','SAME','Smoke and Aerosol Measurement Experiment','10.60555/gd4k-8h62'],
  ['PSI-106','SLICE','Structure and Liftoff in Combustion Experiment','10.60555/pm12-rg61'],
  ['PSI-107','SPICE','Smoke Point in Co-flow Experiment','10.60555/9kbh-e962'],
  ['PSI-115','Smoke modeling','Utilization of SAME Data for Modeling Smoke Generation in Microgravity','10.60555/q0v5-1v28'],
  ['PSI-117','Cool-flame CFD analysis','External Thermo-Convective Perturbation on Cool Flame Dynamics','10.60555/gz0q-b577'],
  ['PSI-142','Cool-flame extinction modeling','Cool Flame Transitions at Radiation / Stretch Extinction Using Counterflow Flames','10.60555/80qf-vj95'],
  ['PSI-159','ACME CFI-G','Advanced Combustion via Microgravity Experiments / Cool Flames Investigation with Gases','10.60555/cyt1-kh64'],
 ].map(([accession,acronym,title,doi])=>[
  `${acronym} · ${accession}`,
  `${title}. NASA PSI investigation record; DOI ${doi}.`,
  `https://psi.nasa.gov/physci/repo/data/investigations/${accession}`,
 ]);
 const citedPapers=[
  ['Dynamics of cool flames · PSI-142 catalog citation','Peer-reviewed publication cited in the PSI-142 record.','https://doi.org/10.1016/j.pecs.2019.100787'],
  ['Understanding Cool Flames and Warm Flames · PSI-142 catalog citation','Peer-reviewed publication cited in the PSI-142 record.','https://doi.org/10.1016/j.proci.2020.09.019'],
  ['Low-temperature reactivity of large n-alkanes · PSI-142 catalog citation','Publication cited in the PSI-142 record.','https://doi.org/10.1016/j.combustflame.2017.01.028'],
  ['Sooting co-flow ethylene diffusion flames · PSI-21 catalog citation','Publication cited in the PSI-21 record.','https://doi.org/10.1088/1364-7830/8/3/009'],
  ['CH(A-X) and OH(A-X) optical emission · PSI-21 catalog citation','Publication cited in the PSI-21 record.','https://doi.org/10.1016/S0010-2180(00)00112-7'],
  ['Temperature, species, and soot in coflow diffusion flames · PSI-21 catalog citation','Publication cited in the PSI-21 record.','https://doi.org/10.1016/S0082-0784(00)80603-7'],
  ['CH, CH*, and OH* in an axisymmetric diffusion flame · PSI-21 catalog citation','Publication cited in the PSI-21 record.','https://doi.org/10.1016/S0082-0784(98)80453-0'],
 ];
 const sourceList=(sources,offset=0)=><div className="source-list">{sources.map(([title,description,url],index)=><a href={url} target="_blank" rel="noreferrer" key={url}><span>{String(index+offset+1).padStart(2,'0')}</span><div><h2>{title}</h2><p>{description}</p></div><strong aria-hidden="true">↗</strong></a>)}</div>;
 return <PageShell active="sources"><main className="simple-page"><p className="section-label">SOURCE REGISTER</p><h1>Source records behind the explorer.</h1><p className="page-intro">This register includes the challenge and methods references, all 24 NASA PSI investigation records in the curated index, and publications explicitly cited inside PSI catalog descriptions. Each result in the explorer links to its specific NASA record, cited field or test-row source. Investigation-level context does not imply that every record contains a directly comparable test.</p><h2>Project and methods</h2>{sourceList(coreSources)}<h2>All indexed NASA PSI investigations · 24</h2>{sourceList(investigations,coreSources.length)}<h2>Publications cited in PSI catalog records</h2><p className="page-intro">These publications are references listed in the NASA PSI catalog text; the app indexes the catalog excerpts and does not claim to have imported or reviewed each full paper.</p>{sourceList(citedPapers,coreSources.length+investigations.length)}<h2>Scope and limitations</h2><p className="page-intro">The source review assessed 26 NASA PSI combustion-search results and selected 24; excluded matches and the Canadian Space Agency catalog review are documented in the repository’s source-review record. NASA file inventories are indexed as metadata only, not as full-text sources. Reported study values and the simulator’s illustrative assumptions remain separate.</p><p className="page-intro">Optional SI guidance is powered by Google Gemini and is invoked only when a user selects Analyze. It can rank eligible, cited excerpts but does not replace source review or add scientific findings.</p></main></PageShell>;
}

function AboutPage(){
 const members=[
  {name:'Gabriel Ramos Rodriguez',bio:'Gabriel developed his passion for software engineering by teaching Python and participating in cybersecurity competitions throughout high school. Away from code, he is an avid guitarist and robotics enthusiast who brings creativity and persistence to music, building, and technical problem-solving.'},
  {name:'Alexander Vatch',bio:'Alexander discovered programming during the COVID-19 pandemic and developed his skills in JavaScript and Python. At Marianopolis College in Montreal, he focuses on backend development and data visualization; outside programming, he enjoys chemistry and building robots with his teammates.'},
  {name:'Elisabeth Wei',bio:'Elisabeth is a Pure and Applied Science student at Marianopolis College in Montreal who began learning Python in fifth grade and has kept developing her programming skills through this challenge. She also shares the team’s interest in robotics, bringing a scientific perspective to the group’s hands-on work.'},
  {name:'Lily Ma',bio:'Lily is a first-year student at Marianopolis College who brings curiosity, humour, and persistence to collaborative problem-solving—even when a stubborn bug tests all three. She also enjoys robotics with her teammates, where those same qualities help turn ideas into things the group can build and improve.'},
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
 const [siMode,setSiMode]=useState(false),[recommendation,setRecommendation]=useState(null);
 const keyword=()=>{setSiMode(false);setRecommendation(null);setEnhance(false);};
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
 const result=useMemo(()=>engine.search({q:siMode&&recommendation?.key===researchKey?recommendation.retrieval_query:fullQuery,conditions,program,familyName,problem,outcome:outcome==='other'?'':outcome,needed,sort,similar,semantic}),[engine,siMode,recommendation,researchKey,fullQuery,conditions,program,familyName,problem,outcome,needed,sort,similar,semantic]);
 const displayed=applyRanking(result,siMode&&recommendation?.key===researchKey&&sort==='relevance'&&!similar?recommendation:null);
 const scientificInsight=useMemo(()=>buildScientificInsight({query:fullQuery,result,conditions}),[fullQuery,result,conditions]);
 const visibleIds=new Set([...result.verified,...result.related].flatMap(g=>[g.id,...g.evidence.map(e=>e.id)]));
 const outside=selected.filter(id=>!visibleIds.has(id));
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length<3?[...s,id]:s);
 const revealReview=()=>requestAnimationFrame(()=>{if(window.matchMedia('(max-width: 960px)').matches)document.getElementById('evidence-review')?.scrollIntoView({block:'start'});});
 const inspect=id=>{setDetail(id);setShowCompare(false);revealReview();};
 const openComparison=()=>{setShowCompare(true);revealReview();};
 const clearHandoff=()=>{setHandoff(null);window.history.replaceState({},'',window.location.pathname);};
 const reset=()=>{keyword();setQ('');setConditions([]);setProgram('');setFamilyName('');setProblem('');setOutcome('');setOtherOutcome('');setNeeded('');setSort('relevance');setSimilar(null);setEnhance(false);clearHandoff();};
 const applyMissionContext=contextId=>setConditions(current=>[
  ...current.filter(condition=>condition.mode==='required'),
  ...preferredConditionsForContext(contextId),
 ]);
 const comparableContextRows=countComparableTestRows(result.verified,conditions);
 const filterCount=[problem,outcome,needed,familyName,program,sort!=='relevance'&&sort].filter(Boolean).length;
 return <>
 <section className="hero"><div><div className="eyebrow">MICROGRAVITY FIRE SAFETY EVIDENCE</div><h1>Find the evidence.<br/><em>Understand its limits.</em></h1><p>Ask a research question, inspect cited tests, and compare the conditions that matter to your work.</p></div><div className="signal"><span>Indexed evidence</span><b>{index.counts.investigation}</b><small>investigations · {index.counts.test} test rows</small><div className="mini"><span><Database/> NASA PSI</span><span>local index</span></div></div></section>
 <section className="insight"><div className="spark">✦</div><div><span>EVIDENCE BEFORE INTERPRETATION</span><p>Search surfaces reported evidence, objectives, and hypotheses with their original scope. A relevant study does not establish a safe operating condition.</p><details><summary>What is searchable?</summary><p>{index.coverage}</p><p>{index.counts.passage} passages · {index.counts.file} file-metadata records · {index.restricted_files_excluded} restricted files excluded. Index {index.index_version}.</p></details></div></section>
 {handoff&&<SimulatorHandoff handoff={handoff} onClear={clearHandoff}/>}
 <section aria-label="Search data" className="search-area"><div className="search-area-head"><div><span className="step-label">01 · SEARCH</span><h2>What are you investigating?</h2></div><p>Keyword results update locally as you type. SI guidance runs only after you explicitly select Analyze.</p></div><label className="question"><Search size={19}/><span className="sr-only">Research question</span><input maxLength={600} value={q} onKeyDown={e=>{if(e.key==='Enter')keyword();}} onChange={e=>{setQ(e.target.value);setSimilar(null);}} placeholder="e.g. Design a smoke detector"/></label>
 <div className="search-mode" role="group" aria-label="Search method"><button className={!siMode?'active':''} aria-pressed={!siMode} onClick={keyword}><b>Keyword search</b><span>Local, immediate, no model calls</span></button><button className={siMode?'active':''} aria-pressed={siMode} onClick={()=>{setEnhance(false);setSimilar(null);setSiMode(true);}}><b>SI-guided search</b><span>Optional, source-bounded guidance</span></button></div>
 <div className="quick-queries"><span>Example questions</span>{['Design a smoke detector','Extinguish liquid-fuel flames','PMMA'].map(text=><button key={text} onClick={()=>{keyword();setQ(text);setSimilar(null);}}>{text}</button>)}</div>
 <details className="filter-disclosure"><summary><span>Refine by study details</span><small>{filterCount?`${filterCount} filter${filterCount===1?'':'s'} applied`:'Optional filters'}</small></summary><div className="filters">
 <label>Problem<select value={problem} onChange={e=>setProblem(e.target.value)}><option value="">Any</option>{['prevention','detection','suppression'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Desired outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">Any</option>{['flame spread','ignition','extinction','detector response','other'].map(x=><option key={x}>{x}</option>)}</select></label>{outcome==='other'&&<label>Other desired outcome<input value={otherOutcome} onChange={e=>setOtherOutcome(e.target.value)} maxLength={150}/></label>}
 <label>Data needed<select value={needed} onChange={e=>setNeeded(e.target.value)}><option value="">Any</option>{['measurements','images/video','methods','findings'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Study family<select value={familyName} onChange={e=>setFamilyName(e.target.value)}><option value="">All families</option>{[...new Set(index.investigations.map(family))].sort().map(f=><option key={f}>{f}</option>)}</select></label>
 <label>Program<select value={program} onChange={e=>setProgram(e.target.value)}><option value="">All programs</option>{index.investigations.map(i=><option key={i.id}>{i.program}</option>)}</select></label>
 <label>Sort<select value={sort} onChange={e=>setSort(e.target.value)}><option value="relevance">Relevance</option><option value="name">Program name</option>{index.investigations.some(i=>i.publication_date)&&<option value="publication_date">Publication date · newest</option>}</select></label>
 </div><div className="search-toolbar"><label><input type="checkbox" checked={enhance} disabled={!address} onChange={e=>{keyword();setEnhance(e.target.checked);}}/> Optional SI semantic reranking</label><span>{!address?'Not configured. Keyword search is ready.':result.mode}</span></div></details><ConditionEditor conditions={conditions} setConditions={setConditions}/>
 <section className="mission-context" aria-labelledby="mission-context-title"><p className="step-label">MISSION DESIGN CONTEXT</p><h3 id="mission-context-title">Try an oxygen and pressure scenario</h3><p>These examples come from the challenge brief, not from a PSI test. Applying one adds <b>preferred</b> conditions: they can boost ranking only where a test reports comparable values and do not filter out other evidence or establish safety. Applying a preset replaces existing preferred conditions and preserves required ones.</p><div className="mission-context-options">{MISSION_CONTEXTS.map(context=><button type="button" key={context.id} onClick={()=>applyMissionContext(context.id)}><b>{context.label}</b><span>{context.summary}</span></button>)}</div><a href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources" target="_blank" rel="noreferrer">Challenge brief ↗</a></section>
 <div className="reset-row"><span>{q||filterCount||conditions.length?'Search settings are active.':'Showing the complete evidence index.'}</span><button disabled={!q&&!filterCount&&!conditions.length&&!handoff} onClick={reset}>Reset search</button></div>
 </section>
 {siMode&&<ResearchPanel index={index} prompt={fullQuery} controls={researchControls} context={handoff?.context} contextKey={researchKey} onRanking={setRecommendation} onKeyword={keyword} onApprove={c=>setConditions(cs=>[...cs,{...c,mode:'preferred',id:crypto.randomUUID()}])}/>}
 <InsightPanel insight={scientificInsight} index={index}/>
 <div aria-live="polite" className="search-status">{siMode&&recommendation?.key===researchKey&&<p>SI-ranked with Gemini within existing evidence groups {sort!=='relevance'&&'· selected sort takes precedence'}</p>}<b>{result.browse?'Browse · neutral program ordering':result.mode}</b>{conditions.some(condition=>condition.mode==='preferred')&&<p className={comparableContextRows?'mission-context-match':'mission-context-gap'} role="status">{comparableContextRows?`${comparableContextRows} indexed test row(s) match all preferred conditions. This indicates condition comparability only, not safety or equivalence.`:'No indexed test row matches all preferred conditions. Results may be topically relevant, but are not condition-comparable; unknown values do not count as matches.'}</p>}{enhance&&semanticState.key===semanticKey&&semanticState.message&&<p>{semanticState.message}</p>}{semantic&&<p className="model-version">Model: {semantic.model_version}</p>}{result.notices.map(n=><p key={n}>{n}</p>)}{result.errors.map(e=><p role="alert" key={e}>{e}</p>)}{similar&&<p>Related-data mode: {similar.mode} · seed {similar.id} <button onClick={()=>setSimilar(null)}>Exit related search</button></p>}</div>
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