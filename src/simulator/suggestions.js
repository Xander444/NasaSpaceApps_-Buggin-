export const CATEGORIES=[
  {id:'material',label:'Combustible material',help:'A solid fuel region included in ignition/spread screening.'},
  {id:'ignition_source',label:'Ignition source',help:'Electrical, thermal, or battery equipment that could initiate a fire.'},
  {id:'oxygen_source',label:'Oxygen source',help:'A possible local oxygen enrichment or leak location.'},
  {id:'vent',label:'Vent / forced flow',help:'A supply, return, or fan that can influence flame behavior.'},
  {id:'detector',label:'Detector',help:'A smoke or fire detection location.'},
  {id:'suppressor',label:'Suppressor',help:'A fixed or portable suppression location.'},
  {id:'consequence_zone',label:'Critical / occupied zone',help:'Crew, egress, or mission-critical area where consequences are higher.'},
  {id:'structural_noncombustible',label:'Noncombustible structure',help:'Reviewed geometry excluded from the fuel model.'},
  {id:'ignore',label:'Ignore / reference geometry',help:'Reviewed geometry intentionally excluded from screening.'},
];

export const MATERIAL_PRESETS={
  unknown_combustible:{label:'Unknown combustible',ignition_susceptibility:.65,spread_potential:.65,smoke_yield:.65},
  plastic_pmma:{label:'Plastic / PMMA-like',ignition_susceptibility:.72,spread_potential:.64,smoke_yield:.55},
  fabric:{label:'Fabric',ignition_susceptibility:.68,spread_potential:.78,smoke_yield:.68},
  foam:{label:'Foam',ignition_susceptibility:.82,spread_potential:.76,smoke_yield:.86},
  wire_insulation:{label:'Wire insulation',ignition_susceptibility:.70,spread_potential:.60,smoke_yield:.82},
  paper:{label:'Paper',ignition_susceptibility:.75,spread_potential:.82,smoke_yield:.65},
  wood:{label:'Wood',ignition_susceptibility:.62,spread_potential:.70,smoke_yield:.55},
  battery_enclosure:{label:'Battery enclosure assumption',ignition_susceptibility:.82,spread_potential:.66,smoke_yield:.78},
};

export function defaultsFor(category,materialType='unknown_combustible'){
  if(category==='material')return {...MATERIAL_PRESETS[materialType],material_type:materialType,influence_radius_m:.35};
  if(category==='ignition_source')return {weight:.8,influence_radius_m:.75};
  if(category==='oxygen_source')return {oxygen_percent_boost:8,influence_radius_m:.75};
  if(category==='vent')return {strength:.65,influence_radius_m:2.5,direction:[1,0,0]};
  if(category==='detector')return {effectiveness:.8,influence_radius_m:2};
  if(category==='suppressor')return {effectiveness:.65,influence_radius_m:1.5};
  if(category==='consequence_zone')return {weight:1.2,influence_radius_m:1.25};
  return {};
}

export function suggestClassification(name=''){
  const value=name.toLowerCase().replace(/[_-]+/g,' ');
  const result=(category,confidence,reason,materialType)=>({
    category,confidence,reason,materialType:materialType||'unknown_combustible',
    params:defaultsFor(category,materialType),
  });
  if(/oxygen|o2|tank|manifold/.test(value))return result('oxygen_source',.86,'Name contains an oxygen-system term.');
  if(/detector|smoke sensor|alarm/.test(value))return result('detector',.88,'Name contains a detection term.');
  if(/suppress|extinguisher|extinguish/.test(value))return result('suppressor',.9,'Name contains a suppression term.');
  if(/vent|fan|supply|return|airflow/.test(value))return result('vent',.82,'Name contains a ventilation or forced-flow term.');
  if(/crew|egress|sleep|escape|critical/.test(value))return result('consequence_zone',.76,'Name describes an occupied, egress, or critical area.');
  if(/battery|power|electric|heater|galley|wire bundle/.test(value))return result('ignition_source',.78,'Name suggests electrical, battery, or heated equipment.');
  if(/foam/.test(value))return result('material',.83,'Name contains a foam material term.','foam');
  if(/fabric|curtain|textile/.test(value))return result('material',.83,'Name contains a fabric material term.','fabric');
  if(/wire|cable|insulation/.test(value))return result('material',.78,'Name contains a wiring or insulation term.','wire_insulation');
  if(/paper|cardboard/.test(value))return result('material',.86,'Name contains a paper material term.','paper');
  if(/wood|timber/.test(value))return result('material',.86,'Name contains a wood material term.','wood');
  if(/plastic|pmma|acrylic|liner/.test(value))return result('material',.72,'Name contains a plastic or liner term.','plastic_pmma');
  if(/floor|frame|structure|metal|aluminum|window|hull/.test(value))return result('structural_noncombustible',.67,'Name suggests structural or noncombustible geometry.');
  return result('material',.3,'No reliable name match; combustible material is a conservative review starting point.');
}
