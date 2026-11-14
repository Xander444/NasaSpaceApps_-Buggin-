import React,{lazy,Suspense,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,SlidersHorizontal,ExternalLink,X,GitCompare,Flame,ShieldCheck,Database,Info,RotateCcw} from 'lucide-react';
import {records,value} from './data';
import './styles.css';
import './frontend-upgrade.css';

const Simulator=lazy(()=>import('./Simulator'));
const family=record=>record.program.split('-')[0];

function Badge({children}){return <span className="badge">{children}</span>}

function App(){
 const [q,setQ]=useState('');
 const [program,setProgram]=useState('All');
 const [sort,setSort]=useState('rank');
 const [selectedId,setSelectedId]=useState(records[0]?.id ?? null);
 const [compare,setCompare]=useState([]);
 const [showCompare,setShowCompare]=useState(false);

 const programs=['All',...new Set(records.map(family))];
 const evidenceCount=records.filter(record=>record.id.startsWith('PSI-')).length;
 const shown=useMemo(()=>records
   .filter(record=>{
     const hay=JSON.stringify(record).toLowerCase();
     return hay.includes(q.toLowerCase())&&(program==='All'||family(record)===program);
   })
   .sort((a,b)=>sort==='complete'
     ? b.completeness-a.completeness
     : sort==='name'
       ? a.program.localeCompare(b.program)
       : b.rank-a.rank
   ),[q,program,sort]);

 const selected=shown.find(record=>record.id===selectedId) || shown[0] || null;
 const toggle=record=>setCompare(current=>
   current.some(item=>item.id===record.id)
     ? current.filter(item=>item.id!==record.id)
     : current.length<3 ? [...current,record] : current
 );

 const resetFilters=()=>{
   setQ('');
   setProgram('All');
   setSort('rank');
 };

 const selectRecord=record=>{
   setSelectedId(record.id);
   setShowCompare(false);
 };

 return <div className="app">
  <header>
   <div className="brand"><div className="mark"><Flame size={20}/></div><div><strong>Flame in Freefall</strong><span>NASA Space Apps 2026 · evidence explorer</span></div></div>
   <a className="simlink" href="/simulator">3D risk prototype</a>
   <div className="status"><i/> Source-grounded prototype</div>
  </header>
  <main>
   <section className="hero">
    <div><div className="eyebrow">MICROGRAVITY FIRE SAFETY INTELLIGENCE</div><h1>Find the evidence.<br/><em>See the risk.</em></h1><p>Search and compare NASA combustion investigations across fuels, oxygen, airflow, and sensing—without filling gaps with guesses.</p></div>
    <div className="signal"><span>Evidence coverage</span><b>{evidenceCount}</b><small>indexed investigations</small><div className="mini"><span><Database/> NASA PSI</span><span><ShieldCheck/> cited</span></div></div>
   </section>
   <section className="insight"><div className="spark">✦</div><div><span>GROUNDED SYNTHESIS</span><p><b>Ventilation is both a control and a hazard variable.</b> BASS-II shows solid flames depend on forced flow, while Saffire tests scale that question toward spacecraft conditions. Compare matched conditions before transferring a conclusion.</p></div></section>
   <section className="controls" aria-label="Investigation filters">
    <label aria-label="Search investigations"><Search/><input type="search" value={q} onChange={event=>setQ(event.target.value)} placeholder="Search fuels, sensors, findings…" /></label>
    <div className="select"><SlidersHorizontal/><select aria-label="Filter by program" value={program} onChange={event=>setProgram(event.target.value)}>{programs.map(item=><option key={item}>{item}</option>)}</select></div>
    <select aria-label="Sort investigations" value={sort} onChange={event=>setSort(event.target.value)}><option value="rank">Mission relevance</option><option value="complete">Data completeness</option><option value="name">Program name</option></select>
   </section>
   <div className="workspace">
    <section className="results">
     <div className="sectionhead">
      <div><h2>Investigation records</h2><span>{shown.length} results · sorted by {sort==='rank'?'mission relevance':sort==='complete'?'data completeness':'program name'}</span></div>
      <div className="result-actions">
       {(q || program!=='All' || sort!=='rank')&&<button className="resetbtn" onClick={resetFilters}><RotateCcw/> Clear filters</button>}
       <button className="comparebtn" disabled={!compare.length} onClick={()=>setShowCompare(true)}><GitCompare/> Compare {compare.length||''}</button>
      </div>
     </div>
     <div className="cards">
      {shown.length ? shown.map((record,index)=><article
        className={'card '+(selected?.id===record.id&&!showCompare?'active':'')}
        key={record.id}
        role="button"
        tabIndex={0}
        aria-pressed={selected?.id===record.id&&!showCompare}
        onClick={()=>selectRecord(record)}
        onKeyDown={event=>{
          if(event.target!==event.currentTarget)return;
          if(event.key==='Enter'||event.key===' '){event.preventDefault();selectRecord(record);}
        }}
      >
       <div className="rank">{String(index+1).padStart(2,'0')}</div>
       <div className="cardbody">
        <div className="top">
         <div><span className="recordid">{record.id}</span><h3>{record.program}</h3></div>
         <label className="check" onClick={event=>event.stopPropagation()}><input type="checkbox" aria-label={`Compare ${record.program}`} checked={compare.some(item=>item.id===record.id)} onChange={()=>toggle(record)}/> compare</label>
        </div>
        <p>{record.title}</p>
        <div className="badges"><Badge>{record.fuel}</Badge><Badge>{record.platform}</Badge></div>
        <div className="meter"><span style={{width:record.completeness+'%'}}/><small>{record.completeness}% metadata coverage</small></div>
       </div>
      </article>) : <div className="no-results"><Search/><h3>No investigations match those filters</h3><p>Try another keyword or clear the filters to see all records.</p><button className="resetbtn" onClick={resetFilters}><RotateCcw/> Clear filters</button></div>}
     </div>
    </section>
    <aside>
     {showCompare
       ? <Compare items={compare} close={()=>setShowCompare(false)}/>
       : selected
         ? <Detail r={selected} toggle={toggle} checked={compare.some(item=>item.id===selected.id)}/>
         : <div className="panel empty-detail"><h2>No record selected</h2><p>There are no investigations in the current result set.</p></div>}
    </aside>
   </div>
  </main>
  <footer><span>Prototype dataset · investigation-level metadata</span><span>Missing means unknown—not zero.</span></footer>
 </div>;
}

function Detail({r,toggle,checked}){
 return <div className="panel">
  <div className="paneltop"><span>{r.id}</span><button onClick={()=>toggle(r)}>{checked?'Remove comparison':'Add to compare'}</button></div>
  <h2>{r.program}</h2><p className="subtitle">{r.title}</p>
  <div className="callout"><span>SOURCE-GROUNDED INTERPRETATION</span><p>{r.insight}</p><small><Info/> Derived from indexed NASA description; no measurement values generated.</small></div>
  <dl><Row k="Fuel / material" v={r.materials||r.fuel}/><Row k="Oxygen condition" v={value(r.oxygen)} missing={!r.oxygen}/><Row k="Flow condition" v={value(r.flow)} missing={!r.flow}/><Row k="Sensors" v={r.sensors.length?r.sensors.join(' · '):value(null)} missing={!r.sensors.length}/><Row k="Flight platform" v={r.platform}/><Row k="Period" v={r.years}/></dl>
  <div className="finding"><span>SOURCE SUMMARY</span><p>{r.finding}</p></div>
  <a className="source" href={r.source} target="_blank" rel="noopener noreferrer">Open NASA source <ExternalLink/></a>
  {r.doi&&<small className="doi">DOI {r.doi}</small>}
 </div>;
}

function Row({k,v,missing}){return <div><dt>{k}</dt><dd className={missing?'missing':''}>{v}</dd></div>}

function Compare({items,close}){
 return <div className="panel compare">
  <div className="paneltop"><span>COMPARISON</span><button onClick={close} aria-label="Close comparison"><X/></button></div>
  <h2>{items.length?`${items.length} records side by side`:'Select records'}</h2>
  {!items.length
    ? <p className="empty">Choose up to three records using the compare checkboxes. Your selections will appear here.</p>
    : <><p className="compare-hint">Compare the recorded conditions side by side. “Not reported” means the source record did not provide that field.</p><div className="comparegrid">{items.map(record=><div key={record.id}><h3>{record.program}</h3><Row k="Fuel" v={record.fuel}/><Row k="O₂" v={value(record.oxygen)} missing={!record.oxygen}/><Row k="Flow" v={value(record.flow)} missing={!record.flow}/><Row k="Sensors" v={record.sensors.join(', ')||value(null)} missing={!record.sensors.length}/></div>)}</div></>}
 </div>;
}

createRoot(document.getElementById('root')).render(window.location.pathname.startsWith('/simulator')
 ? <Suspense fallback={<div className="sim-error">Loading 3D viewer…</div>}><Simulator/></Suspense>
 : <App/>);
