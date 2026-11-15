import * as THREE from 'three';
import {suggestClassification} from './suggestions.js';

export const roundVector=vector=>vector.toArray().map(value=>Number(value.toFixed(4)));
export const slug=value=>(value||'object').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42)||'object';

/**
 * Normalize an imported model to a compartment whose world-space minimum is
 * [0, 0, 0]. Every annotation uses the same world-axis-aligned bounds that are
 * sent to the scoring service, including nested rotations and scales.
 */
export function prepareModel(group){
  group.traverse(object=>{
    if(!object.isMesh)return;
    if(Array.isArray(object.material))object.material=object.material.map(item=>item.clone());
    else if(object.material)object.material=object.material.clone();
  });
  group.updateMatrixWorld(true);
  const initial=new THREE.Box3().setFromObject(group);
  if(initial.isEmpty())throw new Error('The file contains no visible mesh geometry.');
  group.position.add(initial.min.clone().multiplyScalar(-1));
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group);
  const dimensions=roundVector(bounds.getSize(new THREE.Vector3()));
  const annotations=[];let index=0;
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

export function voxelOverlayTransform(dimensions,grid,voxel){
  if(![dimensions,grid,voxel].every(value=>Array.isArray(value)&&value.length===3))throw new Error('Overlay dimensions, grid, and voxel must be three-element arrays.');
  const size=dimensions.map((value,index)=>value/grid[index]);
  const center=voxel.map((value,index)=>(value+.5)*size[index]);
  return {size,center};
}

