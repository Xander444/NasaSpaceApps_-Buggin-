import React,{useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {AlertTriangle,ArrowLeft,Check,ChevronRight,ExternalLink,FileUp,Flame,Info,Play,RotateCcw,Search} from 'lucide-react';
import {CATEGORIES,MATERIAL_PRESETS,defaultsFor,suggestClassification} from './simulator/suggestions';
import {buildExplorerHandoff} from './search/handoff';
import './simulator.css';

const COLOR={unreviewed:0xf2a65a,confirmed:0x75d39b,ignored:0x687376,selected:0xffe08a};
const DEFAULT_SAMPLES=100_000;
const CABIN_DEMO={name:'cabin-demo.glb',format:'glb',bytes:24044,sha256:'335206796c175bf3791b8ca0b76a3208462cb2268b5af32d601ccab43a29ac1a'};
const roundVector=vector=>vector.toArray().map(value=>Number(value.toFixed(4)));
const slug=value=>(value||'object').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42)||'object';

function boxMesh(name,position,size,color){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.05,transparent:true,opacity:.88}));
  mesh.name=name; mesh.position.fromArray(position); return mesh;
}

function createDemoModel(){
  const group=new THREE.Group(); group.name='Built-in compartment demo';
  [
    ['aluminum-floor',[4,.08,2],[8,.16,4],0x344247],
    ['plastic-wall-liner',[4,1.5,.08],[7.6,2.8,.12],0x5968a8],
    ['fabric-curtain',[5.55,1.45,.2],[1.15,2.1,.08],0x9a6286],
    ['equipment-rack-panel',[1.3,1.05,.45],[1.15,1.9,.62],0x6371a6],
    ['battery-pack',[6.45,.62,3.25],[1,.85,.75],0xa65b4b],
    ['power-distribution',[1.45,.65,3.35],[.85,.85,.55],0xa6764b],
    ['oxygen-manifold',[6.9,1.15,.75],[.45,1.25,.45],0x5081a8],
    ['supply-vent',[.3,2.45,2],[.35,.35,.8],0x4f8994],
    ['smoke-detector',[4,2.75,2],[.38,.14,.38],0x68a978],
    ['portable-suppressor',[7.45,.55,2],[.28,1,.28],0x5d98a4],
    ['crew-critical-zone',[4.7,.8,2.7],[1.25,1.45,1.35],0x8d61a5],
  ].forEach(args=>group.add(boxMesh(...args)));
  return group;
}

function prepareModel(group){
  group.traverse(object=>{
    if(!object.isMesh)return;
    object.material=Array.isArray(object.material)?object.material.map(item=>item.clone()):object.material.clone();
  });
  group.updateMatrixWorld(true);
  const initial=new THREE.Box3().setFromObject(group);
  if(initial.isEmpty())throw new Error('The file contains no visible mesh geometry.');
  group.position.add(initial.min.clone().multiplyScalar(-1));
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group);
  const dimensions=roundVector(bounds.getSize(new THREE.Vector3()));
  const annotations=[]; let index=0;
  group.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry)return;
    const objectBounds=new THREE.Box3().setFromObject(mesh);
    const position=roundVector(objectBounds.getCenter(new THREE.Vector3()));
    const size=roundVector(objectBounds.getSize(new THREE.Vector3()).max(new THREE.Vector3(.01,.01,.01)));
    const name=mesh.name?.trim()||`unnamed-mesh-${index+1}`;
    const id=`object-${String(index+1).padStart(3,'0')}-${slug(name)}`;
    const suggestion=suggestClassification(name);
    mesh.userData.annotationId=id;
    const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    mesh.userData.originalColor=material?.color?.getHex?.()??0x758184;
    annotations.push({id,name,position_m:position,size_m:size,category:suggestion.category,materialType:suggestion.materialType,params:suggestion.params,suggestion:{category:suggestion.category,confidence:suggestion.confidence,reason:suggestion.reason},reviewStatus:'unreviewed'});
    index+=1;
  });
  return {group,annotations,dimensions:dimensions.map(value=>Math.max(value,.01))};
}

function disposeGroup(group){
  group?.traverse(object=>{if(object.geometry)object.geometry.dispose();if(object.material){(Array.isArray(object.material)?object.material:[object.material]).forEach(item=>item.dispose());}});
}

function NumericInput({label,value,onChange,min=0,max,step=.05,note}){
  return <label className="number-field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={event=>onChange(Number(event.target.value))}/>{note&&<small>{note}</small>}</label>;
}

function annotationToScenario(annotations,environment,dimensions,source,unitsConfirmed){
  const active=annotations.filter(item=>item.reviewStatus==='confirmed');
  const base=item=>({id:item.id,position_m:item.position_m,influence_radius_m:Number(item.params.influence_radius_m),basis:'human-confirmed object label; coefficient remains an uncalibrated screening assumption'});
  const by=category=>active.filter(item=>item.category===category);
  const materials=by('material').map(item=>({...base(item),size_m:item.size_m,ignition_susceptibility:Number(item.params.ignition_susceptibility),spread_potential:Number(item.params.spread_potential),smoke_yield:Number(item.params.smoke_yield),material_type:item.materialType}));
  if(!materials.length)throw new Error('Confirm at least one object as a combustible material.');
  const reviewed=annotations.filter(item=>item.reviewStatus!=='unreviewed').length;
  return {
    schema_version:'0.2.0',name:`Confirmed screening: ${source.name}`,description:'Browser-authored first-release scenario. Labels were reviewed by a person; coefficients are illustrative.',
    source_model:source,compartment:{dimensions_m:dimensions,grid:[32,16,16]},
    environment:{oxygen_percent:Number(environment.oxygen_percent),pressure_kpa:Number(environment.pressure_kpa),gravity_g:Number(environment.gravity_g),ambient_temperature_c:Number(environment.ambient_temperature_c)},
    materials,
    ignition_sources:by('ignition_source').map(item=>({...base(item),weight:Number(item.params.weight)})),
    oxygen_sources:by('oxygen_source').map(item=>({...base(item),oxygen_percent_boost:Number(item.params.oxygen_percent_boost)})),
    vents:by('vent').map(item=>({...base(item),strength:Number(item.params.strength),direction:item.params.direction||[1,0,0]})),
    detectors:by('detector').map(item=>({...base(item),effectiveness:Number(item.params.effectiveness)})),
    suppressors:by('suppressor').map(item=>({...base(item),effectiveness:Number(item.params.effectiveness)})),
    consequence_zones:by('consequence_zone').map(item=>({...base(item),weight:Number(item.params.weight)})),
    confirmation:{model_units_m_confirmed:unitsConfirmed,total_object_count:annotations.length,reviewed_object_count:reviewed,manifest:annotations.map(item=>({object_id:item.id,object_name:item.name,review_status:item.reviewStatus,category:item.category,suggested_category:item.suggestion.category,suggestion_confidence:item.suggestion.confidence}))},
    evidence_bindings:[
      {accession:'PSI-25',use:'BASS-II material, oxygen, and forced-flow variable context',claim:'context only; no coefficient fitted'},
      {accession:'PSI-98',use:'Saffire large-scale spacecraft-fire context',claim:'context only; no vehicle geometry inferred'},
      {accession:'PSI-101',use:'SAME-R smoke-detection context',claim:'context only; coverage remains assumed'},
    ],
  };
}

export default function Simulator(){
  const host=useRef(null),fileInput=useRef(null),sceneRef=useRef(null),modelRef=useRef(null),resultRef=useRef(null),installRef=useRef(null);
  const [annotations,setAnnotations]=useState([]),[selectedId,setSelectedId]=useState(null),[dimensions,setDimensions]=useState([8,3,4]);
  const [source,setSource]=useState({name:'Built-in compartment demo',format:'generated',bytes:0,sha256:'built-in-demo-v1'});
  const [environment,setEnvironment]=useState({oxygen_percent:21,pressure_kpa:101.325,gravity_g:0,ambient_temperature_c:22});
  const [unitsConfirmed,setUnitsConfirmed]=useState(false),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=annotations.find(item=>item.id===selectedId);
  const reviewed=annotations.filter(item=>item.reviewStatus!=='unreviewed').length;
  const complete=annotations.length>0&&reviewed===annotations.length;

  useEffect(()=>{
    if(!host.current)return undefined;
    const root=host.current,scene=new THREE.Scene(); scene.background=new THREE.Color(0x080d0f); scene.fog=new THREE.Fog(0x080d0f,13,28);
    const camera=new THREE.PerspectiveCamera(45,root.clientWidth/Math.max(root.clientHeight,500),.03,100); camera.position.set(10,7,9);
    const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.setSize(root.clientWidth,Math.max(root.clientHeight,500)); renderer.outputColorSpace=THREE.SRGBColorSpace; root.appendChild(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.target.set(4,1.2,2);
    scene.add(new THREE.HemisphereLight(0xc7e8ef,0x17191a,2.1)); const key=new THREE.DirectionalLight(0xffffff,2.5);key.position.set(5,8,6);scene.add(key);
    const grid=new THREE.GridHelper(12,24,0x314247,0x172326); grid.position.set(4,-.01,2); scene.add(grid);
    const resultGroup=new THREE.Group(); scene.add(resultGroup); resultRef.current=resultGroup; sceneRef.current=scene;
    const install=(raw,metadata)=>{
      try{
        if(modelRef.current){scene.remove(modelRef.current);disposeGroup(modelRef.current);}
        while(resultGroup.children.length){const child=resultGroup.children.pop();disposeGroup(child);}
        const prepared=prepareModel(raw); scene.add(prepared.group); modelRef.current=prepared.group;
        controls.target.fromArray(prepared.dimensions.map(value=>value/2)); camera.position.set(prepared.dimensions[0]*1.25,Math.max(4,prepared.dimensions[1]*2),prepared.dimensions[2]*1.6);
        setAnnotations(prepared.annotations);setDimensions(prepared.dimensions);setSource(metadata);setSelectedId(prepared.annotations[0]?.id||null);setUnitsConfirmed(false);setResult(null);setError('');
      }catch(caught){disposeGroup(raw);setError(caught.message);}
    };
    installRef.current=install;
    install(createDemoModel(),{name:'Loading exact cabin demo…',format:'generated',bytes:0,sha256:'built-in-demo-v1'});
    fetch('/models/cabin-demo.glb').then(response=>{
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(buffer=>new GLTFLoader().parse(buffer,'',gltf=>install(gltf.scene,CABIN_DEMO),()=>{})).catch(()=>{
      setError('The exact cabin demo could not be loaded; showing the generated fallback.');
    });
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
    const pointerDown=event=>{down=[event.clientX,event.clientY];};
    const pointerUp=event=>{
      if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>5||!modelRef.current)return;
      const rect=renderer.domElement.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
      const hit=raycaster.intersectObject(modelRef.current,true).find(item=>item.object.userData.annotationId);if(hit)setSelectedId(hit.object.userData.annotationId);
    };
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
    let frame;const draw=()=>{controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(draw);};draw();
    const resize=()=>{const width=root.clientWidth,height=Math.max(root.clientHeight,500);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);};window.addEventListener('resize',resize);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);controls.dispose();disposeGroup(modelRef.current);renderer.dispose();root.replaceChildren();};
  },[]);

  useEffect(()=>{
    if(!modelRef.current)return;
    const statuses=new Map(annotations.map(item=>[item.id,item.reviewStatus]));
    modelRef.current.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.userData.annotationId)return;
      const status=statuses.get(mesh.userData.annotationId)||'unreviewed';const color=result?mesh.userData.originalColor:mesh.userData.annotationId===selectedId?COLOR.selected:COLOR[status];
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];materials.forEach(material=>{material.color?.setHex(color);if(material.emissive)material.emissive.setHex(mesh.userData.annotationId===selectedId?0x44320d:0x000000);});
    });
  },[annotations,selectedId,result]);

  useEffect(()=>{
    const group=resultRef.current;if(!group)return;while(group.children.length){const child=group.children.pop();disposeGroup(child);}if(!result)return;
    const voxelSize=result.dimensions_m.map((value,index)=>value/result.grid[index]);const geometry=new THREE.BoxGeometry(...voxelSize.map(value=>value*.48));const material=new THREE.MeshBasicMaterial({transparent:true,opacity:.38,vertexColors:true,depthWrite:false});const voxels=result.risk_voxels_p75;const mesh=new THREE.InstancedMesh(geometry,material,voxels.length);const matrix=new THREE.Matrix4(),color=new THREE.Color();const low=result.summary.hotspot_threshold_p75||0;const high=result.summary.maximum_voxel_relative_screening_index||result.summary.maximum_voxel_risk_index||100;voxels.forEach((voxel,index)=>{matrix.makeTranslation((voxel[0]+.5)*voxelSize[0],(voxel[1]+.5)*voxelSize[1],(voxel[2]+.5)*voxelSize[2]);mesh.setMatrixAt(index,matrix);const normalized=Math.max(0,Math.min(1,(voxel[3]-low)/Math.max(high-low,.001)));color.setHSL(.14*(1-normalized),.92,.5);mesh.setColorAt(index,color);});group.add(mesh);
  },[result]);

  const editSelected=(patch,invalidate=true)=>setAnnotations(items=>items.map(item=>item.id===selectedId?{...item,...patch,reviewStatus:invalidate?'unreviewed':item.reviewStatus}:item));
  const editParams=patch=>editSelected({params:{...selected.params,...patch}});
  const changeCategory=category=>editSelected({category,materialType:category==='material'?'unknown_combustible':selected.materialType,params:defaultsFor(category)});
  const confirmSelected=()=>editSelected({reviewStatus:selected.category==='ignore'?'ignored':'confirmed'},false);
  const ignoreSelected=()=>editSelected({category:'ignore',params:{},reviewStatus:'ignored'},false);
  const nextUnreviewed=()=>{const next=annotations.find(item=>item.reviewStatus==='unreviewed');if(next)setSelectedId(next.id);};
  const loadExactDemo=async(precomputed=false)=>{
    setBusy(true);setError('');
    try{
      const [modelResponse,resultResponse]=await Promise.all([
        fetch('/models/cabin-demo.glb'),
        precomputed?fetch('/simulation/cabin-demo.json'):Promise.resolve(null),
      ]);
      if(!modelResponse.ok)throw new Error(`Could not load cabin-demo.glb (HTTP ${modelResponse.status}).`);
      if(resultResponse&&!resultResponse.ok)throw new Error(`Could not load the precomputed result (HTTP ${resultResponse.status}).`);
      const buffer=await modelResponse.arrayBuffer();
      const group=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',gltf=>resolve(gltf.scene),reject));
      installRef.current?.(group,CABIN_DEMO);
      if(resultResponse)setResult(await resultResponse.json());
    }catch(caught){setError(caught.message);}finally{setBusy(false);}
  };
  const importModel=async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;setError('');
    const extension=file.name.split('.').pop().toLowerCase();if(!['glb','gltf'].includes(extension)){setError('First release accepts .glb or a self-contained .gltf file.');return;}
    try{
      const buffer=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',buffer);const sha256=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');const payload=extension==='glb'?buffer:new TextDecoder().decode(buffer);
      new GLTFLoader().parse(payload,'',gltf=>installRef.current?.(gltf.scene,{name:file.name,format:extension,bytes:file.size,sha256}),caught=>setError(`Could not read model: ${caught.message}. Use a GLB or a self-contained glTF.`));
    }catch(caught){setError(`Could not import model: ${caught.message}`);}
  };
  const runSimulation=async()=>{
    setBusy(true);setError('');
    try{
      const scenario=annotationToScenario(annotations,environment,dimensions,source,unitsConfirmed);
      const response=await fetch('/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario,samples:DEFAULT_SAMPLES,seed:2026})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.detail||'Simulation service rejected the scenario.');setResult(payload);
    }catch(caught){setError(caught.message.includes('fetch')?'Local PyTorch service is not running. Start it with “npm run api”, then try again.':caught.message);}finally{setBusy(false);}
  };
  const blockingReason=useMemo(()=>!complete?'Review every object before running.':!unitsConfirmed?'Confirm the imported model uses metres.':!annotations.some(item=>item.reviewStatus==='confirmed'&&item.category==='material')?'Confirm at least one combustible material.':'',[complete,unitsConfirmed,annotations]);

  return <div className="simulator-page">
    <header><a href="/"><ArrowLeft/> Project</a><div><strong>Cabin screening</strong><span>human-confirmed 3D map</span></div><a className="sim-evidence-link" href="/evidence">Evidence explorer</a></header>
    <main>
      <section className="sim-visual"><div ref={host}/><div className="sim-toolbar"><button onClick={()=>fileInput.current?.click()}><FileUp/> Import GLB / glTF</button><input ref={fileInput} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={importModel}/><button onClick={()=>loadExactDemo(false)} disabled={busy}><RotateCcw/> Load cabin demo</button><button className="precomputed-button" onClick={()=>loadExactDemo(true)} disabled={busy}><Play/> View precomputed result</button></div><div className="sim-canvas-note">Click a mesh to review it · drag to orbit · scroll to zoom</div><div className="sim-legend"><span><i className="unreviewed-dot"/> unreviewed</span><span><i className="confirmed-dot"/> confirmed</span><span><i className="ignored-dot"/> ignored</span>{result&&<span><i className="risk-dot"/> upper-quartile relative index</span>}</div></section>
      <aside className="sim-sidebar">
        <div className="sim-warning"><AlertTriangle/><div><b>Relative screening, not CFD or fire probability</b><span>Do not use this prototype for mission-safety decisions.</span></div></div>
        <div className="model-summary"><div><span>MODEL</span><b>{source.name}</b><small>{dimensions.map(value=>value.toFixed(2)).join(' × ')} m · {annotations.length} meshes</small></div><button onClick={nextUnreviewed} disabled={complete||Boolean(result)}>Review next <ChevronRight/></button></div>
        <div className="review-progress"><div><span style={{width:`${result?.precomputed_fixture?100:annotations.length?reviewed/annotations.length*100:0}%`}}/></div><b>{result?.precomputed_fixture?`${result.assumption_context.mesh_confirmation.reviewed_object_count} / ${result.assumption_context.mesh_confirmation.total_object_count} fixture labels`: `${reviewed} / ${annotations.length} reviewed`}</b></div>
        {error&&<div className="sim-error">{error}</div>}
        {result?<ResultPanel result={result} onEdit={()=>setResult(null)}/>:<>
          <EnvironmentForm value={environment} onChange={setEnvironment}/>
          {selected?<AnnotationPanel item={selected} onCategory={changeCategory} onParams={editParams} onMaterial={materialType=>editSelected({materialType,params:defaultsFor('material',materialType)})} onConfirm={confirmSelected} onIgnore={ignoreSelected}/>:<div className="empty-selection">Click an object in the 3D view to classify it.</div>}
          <div className="run-card"><label className="units-check"><input type="checkbox" checked={unitsConfirmed} onChange={event=>setUnitsConfirmed(event.target.checked)}/><span><b>I confirm model units are metres</b><small>Imported geometry is not automatically scaled.</small></span></label><button className="run-button" onClick={runSimulation} disabled={Boolean(blockingReason)||busy}><Play/>{busy?`Sampling ${DEFAULT_SAMPLES.toLocaleString()} locations…`:'Run confirmed scenario'}</button>{blockingReason&&<small className="blocking-reason">{blockingReason}</small>}</div>
        </>}
        <EvidenceNote/>
      </aside>
    </main>
  </div>;
}

function EnvironmentForm({value,onChange}){
  const update=(key,next)=>onChange({...value,[key]:next});
  return <details className="environment" open><summary>Cabin environment</summary><div className="field-grid"><NumericInput label="Oxygen (%)" value={value.oxygen_percent} onChange={next=>update('oxygen_percent',next)} min={1} max={100} step={.1}/><NumericInput label="Pressure (kPa)" value={value.pressure_kpa} onChange={next=>update('pressure_kpa',next)} min={1} max={200} step={.1}/><NumericInput label="Effective gravity (g)" value={value.gravity_g} onChange={next=>update('gravity_g',next)} min={0} max={3} step={.01} note="Recorded only; not yet used in score."/><NumericInput label="Temperature (°C)" value={value.ambient_temperature_c} onChange={next=>update('ambient_temperature_c',next)} min={-100} max={100} step={1} note="Recorded only; not yet used in score."/></div></details>;
}

function AnnotationPanel({item,onCategory,onParams,onMaterial,onConfirm,onIgnore}){
  const category=CATEGORIES.find(option=>option.id===item.category);
  return <section className="annotation-panel"><div className="object-title"><div><span>SELECTED OBJECT</span><h1>{item.name}</h1><small>{item.position_m.map(value=>value.toFixed(2)).join(', ')} m</small></div><em className={item.reviewStatus}>{item.reviewStatus}</em></div>
    <div className="suggestion"><div><Flame/><span>Recognition suggestion</span><b>{Math.round(item.suggestion.confidence*100)}% name match</b></div><p>{CATEGORIES.find(option=>option.id===item.suggestion.category)?.label}. {item.suggestion.reason}</p><small><Info/> Deterministic naming heuristic, not a trained vision model. Never accepted automatically.</small></div>
    <label className="select-field"><span>Confirmed role</span><select value={item.category} onChange={event=>onCategory(event.target.value)}>{CATEGORIES.map(option=><option value={option.id} key={option.id}>{option.label}</option>)}</select><small>{category?.help}</small></label>
    {item.category==='material'&&<><label className="select-field"><span>Material assumption</span><select value={item.materialType} onChange={event=>onMaterial(event.target.value)}>{Object.entries(MATERIAL_PRESETS).map(([id,preset])=><option value={id} key={id}>{preset.label}</option>)}</select><small>Illustrative defaults only; not calibrated measurements.</small></label><div className="field-grid"><NumericInput label="Ignition susceptibility" value={item.params.ignition_susceptibility} onChange={value=>onParams({ignition_susceptibility:value})} min={0} max={1}/><NumericInput label="Spread potential" value={item.params.spread_potential} onChange={value=>onParams({spread_potential:value})} min={0} max={1}/><NumericInput label="Smoke yield" value={item.params.smoke_yield} onChange={value=>onParams({smoke_yield:value})} min={0} max={1}/><NumericInput label="Influence radius (m)" value={item.params.influence_radius_m} onChange={value=>onParams({influence_radius_m:value})} min={.01}/></div></>}
    {item.category==='ignition_source'&&<div className="field-grid"><NumericInput label="Source weight" value={item.params.weight} onChange={value=>onParams({weight:value})} min={0} max={2}/><NumericInput label="Influence radius (m)" value={item.params.influence_radius_m} onChange={value=>onParams({influence_radius_m:value})} min={.01}/></div>}
    {item.category==='oxygen_source'&&<div className="field-grid"><NumericInput label="Local O₂ boost (points)" value={item.params.oxygen_percent_boost} onChange={value=>onParams({oxygen_percent_boost:value})} min={0} max={79} step={1}/><NumericInput label="Influence radius (m)" value={item.params.influence_radius_m} onChange={value=>onParams({influence_radius_m:value})} min={.01}/></div>}
    {item.category==='vent'&&<div className="field-grid"><NumericInput label="Flow influence" value={item.params.strength} onChange={value=>onParams({strength:value})} min={0} max={2}/><NumericInput label="Influence radius (m)" value={item.params.influence_radius_m} onChange={value=>onParams({influence_radius_m:value})} min={.01}/></div>}
    {['detector','suppressor'].includes(item.category)&&<div className="field-grid"><NumericInput label="Assumed effectiveness" value={item.params.effectiveness} onChange={value=>onParams({effectiveness:value})} min={0} max={1}/><NumericInput label="Coverage radius (m)" value={item.params.influence_radius_m} onChange={value=>onParams({influence_radius_m:value})} min={.01}/></div>}
    {item.category==='consequence_zone'&&<div className="field-grid"><NumericInput label="Consequence weight" value={item.params.weight} onChange={value=>onParams({weight:value})} min={0} max={3}/><NumericInput label="Influence radius (m)" value={item.params.influence_radius_m} onChange={value=>onParams({influence_radius_m:value})} min={.01}/></div>}
    <div className="review-actions"><button onClick={onIgnore}>Ignore object</button><button className="confirm-button" onClick={onConfirm}><Check/> Confirm this label</button></div>
  </section>;
}

function ResultPanel({result,onEdit}){
  const [selectedKey,setSelectedKey]=useState(`rank-${result.hotspots[0]?.rank||1}`);
  const researchSpot=result.research_spots?.[0];
  const ranked=result.hotspots.slice(0,8);
  const selected=selectedKey==='research'&&researchSpot?researchSpot:ranked.find(item=>`rank-${item.rank}`===selectedKey)||ranked[0];
  const comparison=selected?.controlled_comparison||(
    result.controlled_comparison&&selected?.voxel?.join(',')===result.controlled_comparison.target_voxel?.join(',')
      ?result.controlled_comparison:null
  );
  const context=result.assumption_context;
  const metric=(modern,legacy)=>result.summary[modern]??result.summary[legacy];
  const nearbyVent=selected?.nearby_objects?.find(item=>item.type==='vent'&&item.within_modeled_influence);
  const vent=nearbyVent?result.scene?.vents?.find(item=>item.id===nearbyVent.id):null;
  const explorerPath=`${import.meta.env.BASE_URL.replace(/\/?$/,'/')}evidence`;
  const explorerHref=selected?.evidence_search?buildExplorerHandoff({query:selected.evidence_search.query,environment:result.environment,spot_m:selected.center_m,vent},explorerPath):null;
  return <section className="result-panel">
    <div className="result-heading"><div><span>COMPLETED SCREENING</span><h1>{result.samples.toLocaleString()} locations sampled</h1><small>{result.metric_name||'relative screening index'} · seed {result.seed} · {result.device}</small></div><button onClick={onEdit}>Edit map</button></div>
    <div className="sim-metrics"><div><span>Mean relative index</span><b>{metric('mean_relative_screening_index','mean_risk_index')}</b></div><div><span>P95 relative index</span><b>{metric('p95_relative_screening_index','p95_risk_index')}</b></div><div><span>Peak voxel relative index</span><b>{metric('maximum_voxel_relative_screening_index','maximum_voxel_risk_index')}</b></div></div>
    <h2>Ranked candidate hotspots</h2>
    <ol className="hotspots">{ranked.map(hotspot=><li key={hotspot.rank}><button className={selected===hotspot?'active':''} onClick={()=>setSelectedKey(`rank-${hotspot.rank}`)}><b>#{hotspot.rank}</b><span>{hotspot.center_m.map(value=>value.toFixed(2)).join(', ')} m</span><strong>{hotspot.relative_screening_index??hotspot.risk_index}</strong></button></li>)}</ol>
    {researchSpot&&<button className={`research-spot-button ${selected===researchSpot?'active':''}`} onClick={()=>setSelectedKey('research')}><Search/><span><b>{researchSpot.title}</b><small>Controlled overlap probe · relative index {researchSpot.relative_screening_index}</small></span></button>}
    {selected&&<article className="hotspot-detail">
      <div className="detail-title"><div><span>{selected.rank?`HOTSPOT #${selected.rank}`:'RESEARCH SPOT'}</span><h2>{selected.center_m.map(value=>value.toFixed(2)).join(', ')} metres</h2></div><div><small>RELATIVE SCREENING INDEX</small><strong>{selected.relative_screening_index??selected.risk_index}</strong></div></div>
      {selected.selection_note&&<p className="selection-note">{selected.selection_note}</p>}
      <div className="coverage-row"><span>Modeled detector coverage <b>{selected.detection_coverage}</b></span><span>Modeled suppression coverage <b>{selected.suppression_coverage}</b></span></div>
      <section className="detail-section"><h3>Why it appeared</h3><p>These are same-sample counterfactual changes from the actual score. They do not add up because the formula multiplies interacting terms.</p><ol className="contributors">{selected.score_breakdown?.strongest_contributors.map(item=><li key={item.term}><span>{item.label}</span><b className={item.counterfactual_delta>=0?'raises':'lowers'}>{item.counterfactual_delta>=0?'+':''}{item.counterfactual_delta}</b></li>)}</ol></section>
      <section className="detail-section"><h3>Nearby reviewed objects</h3><ul className="nearby-objects">{selected.nearby_objects?.map(item=><li key={`${item.type}-${item.id}`}><span><b>{item.id.replace(/^object-\d+-/,'')}</b><small>{item.type}</small></span><em>{item.distance_m.toFixed(2)} m {item.within_modeled_influence?'· in modeled influence':''}</em></li>)}</ul></section>
      {comparison&&<section className="comparison-card"><span>CONTROLLED BEFORE / AFTER</span><h3>Same spot, detector moved</h3><p>Detector: {comparison.detector_position_before_m.join(', ')} m → {comparison.detector_position_after_m.join(', ')} m</p><div><span><small>Modeled coverage</small><b>{comparison.baseline.detection_coverage} → {comparison.after_move.detection_coverage}</b><em>+{comparison.change.detection_coverage}</em></span><span><small>Relative index</small><b>{comparison.baseline.relative_screening_index} → {comparison.after_move.relative_screening_index}</b><em>{comparison.change.relative_screening_index}</em></span></div><ul><li className={comparison.verification.same_sample_locations?'pass':''}><Check/> Same sampled locations: {String(comparison.verification.same_sample_locations)}</li><li className={comparison.verification.ignition_inputs_unchanged?'pass':''}><Check/> Ignition inputs unchanged: {String(comparison.verification.ignition_inputs_unchanged)}</li>{comparison.verification.only_detector_position_changed!==undefined&&<li className={comparison.verification.only_detector_position_changed?'pass':''}><Check/> Only detector position changed: {String(comparison.verification.only_detector_position_changed)}</li>}</ul><small>{comparison.interpretation}</small></section>}
      {selected.evidence_search&&<section className="search-handoff"><Search/><div><span>RESEARCH HANDOFF</span><h3>{selected.evidence_search.query}</h3><p>{selected.evidence_search.reason} Airflow speed: <b>{selected.evidence_search.airflow_speed_status?.startsWith('unknown')?'unknown':selected.evidence_search.airflow_speed}</b>; a vent location and illustrative influence do not establish physical velocity.</p><div className="search-links"><a href={explorerHref} target="_blank" rel="noreferrer">Open shareable explorer <ExternalLink/></a><a href={selected.evidence_search.url} target="_blank" rel="noreferrer">NASA PSI directly <ExternalLink/></a></div></div></section>}
    </article>}
    {result.benchmark_summary&&<details className="result-details"><summary>Stability and speed basis</summary><p>{result.benchmark_summary.recommendation}</p><p>Region stability means the same voxel or an immediate neighbor remained among the top 10 across five seeds. Exact rankings can still change.</p></details>}
    {context&&<details className="result-details" open><summary>Inputs, assumptions, and confirmations</summary><h3>User-entered cabin conditions</h3><ul>{context.user_entered_cabin_conditions.map(item=><li key={item.field}><b>{item.field}</b>: {item.value} · {item.used_in_score?'used in score':'recorded only, no score effect'}{item.note?`: ${item.note}`:''}</li>)}</ul><h3>Illustrative coefficients</h3><p>{context.coefficient_status}:</p><ul>{context.illustrative_coefficients.map(item=><li key={item}>{item}</li>)}</ul><h3>Geometry checks</h3><p>Metre units confirmed: <b>{String(context.mesh_confirmation.model_units_m_confirmed)}</b> · meshes reviewed: <b>{context.mesh_confirmation.reviewed_object_count} / {context.mesh_confirmation.total_object_count}</b></p><small>{context.mesh_confirmation.review_basis}</small></details>}
    <details className="result-details"><summary>Validity limits and repeatability record</summary><ul>{result.assumptions.map(item=><li key={item}>{item}</li>)}</ul>{result.precomputed_fixture&&<p>Exact GLB fixture SHA-256 verified: <b>{String(result.precomputed_fixture.model_sha256_verified)}</b><code>{result.precomputed_fixture.model_sha256}</code></p>}{result.reproducibility&&<div className="fingerprints"><span>Scenario SHA-256 <code>{result.reproducibility.scenario_sha256}</code></span><span>Ignition-input SHA-256 <code>{result.reproducibility.ignition_inputs_sha256}</code></span><span>Sample-location SHA-256 <code>{result.reproducibility.sample_locations_sha256}</code></span></div>}</details>
  </section>;
}

function EvidenceNote(){
  return <details className="evidence-note"><summary>Evidence and validity boundary</summary><p>BASS-II, Saffire, and SAME-R inform which variables and systems are represented. They do not calibrate the demo coefficients.</p><div><a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-25" target="_blank">BASS-II · PSI-25</a><a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-98" target="_blank">Saffire-I · PSI-98</a><a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-101" target="_blank">SAME-R · PSI-101</a><a href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources" target="_blank">Challenge resources</a></div></details>;
}
