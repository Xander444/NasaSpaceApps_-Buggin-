import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareModel,roundVector,voxelOverlayTransform} from './modelPreparation.js';

const material=()=>new THREE.MeshBasicMaterial({color:0x8899aa});
const box=(name,size)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material());
  mesh.name=name;
  return mesh;
};
const closeArray=(actual,expected,tolerance=1e-4)=>{
  assert.equal(actual.length,expected.length);
  actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<=tolerance,`${value} differs from ${expected[index]} at ${index}`));
};

test('nested rotations and non-uniform scales use world-space bounds',()=>{
  const root=new THREE.Group();
  const nested=new THREE.Group();
  nested.position.set(4,-2,3);
  nested.rotation.set(.25,0,Math.PI/2);
  nested.scale.set(2,.5,1.5);
  const panel=box('rotated-wall-panel',[2,1,.2]);
  panel.position.set(1,.5,-.25);
  nested.add(panel);root.add(nested);

  const prepared=prepareModel(root);
  const worldBounds=new THREE.Box3().setFromObject(panel);
  const overallBounds=new THREE.Box3().setFromObject(prepared.group);
  closeArray(roundVector(overallBounds.min),[0,0,0]);
  closeArray(prepared.annotations[0].position_m,roundVector(worldBounds.getCenter(new THREE.Vector3())));
  closeArray(prepared.annotations[0].size_m,roundVector(worldBounds.getSize(new THREE.Vector3())));
  closeArray(prepared.dimensions,roundVector(overallBounds.getSize(new THREE.Vector3())));
});

test('model scale is honored without silently converting units',()=>{
  const make=scale=>{
    const root=new THREE.Group();
    root.scale.setScalar(scale);
    root.add(box('scaled-cabin',[1000,2000,3000]));
    return prepareModel(root);
  };
  const millimetreGeometry=make(1);
  const metreTransform=make(.001);
  closeArray(millimetreGeometry.dimensions,[1000,2000,3000]);
  closeArray(metreTransform.dimensions,[1,2,3]);
  assert.equal(metreTransform.annotations[0].reviewStatus,'unreviewed');
});

test('large rotated wall mesh uses the same AABB sent to scoring',()=>{
  const root=new THREE.Group();
  const wall=box('large-wall-liner',[12,.12,3]);
  wall.rotation.y=Math.PI/4;
  wall.position.set(-2,1,5);
  root.add(wall);
  const prepared=prepareModel(root);
  const bounds=new THREE.Box3().setFromObject(wall);
  closeArray(prepared.annotations[0].position_m,roundVector(bounds.getCenter(new THREE.Vector3())));
  closeArray(prepared.annotations[0].size_m,roundVector(bounds.getSize(new THREE.Vector3())));
  assert.ok(prepared.annotations[0].size_m[0]>10);
  assert.ok(prepared.annotations[0].size_m[2]>10);
});

test('voxel overlay and confirmed object share one normalized coordinate system',()=>{
  const root=new THREE.Group();
  const nested=new THREE.Group();nested.position.set(3,2,-4);nested.rotation.z=.4;
  const rack=box('equipment-rack-panel',[2,1,1]);rack.position.set(2,1,.5);nested.add(rack);root.add(nested);
  const prepared=prepareModel(root);
  const annotation=prepared.annotations[0];
  const grid=[16,8,8];
  const voxel=annotation.position_m.map((value,index)=>Math.min(grid[index]-1,Math.floor(value/prepared.dimensions[index]*grid[index])));
  const overlay=voxelOverlayTransform(prepared.dimensions,grid,voxel);
  overlay.center.forEach((value,index)=>{
    assert.ok(Math.abs(value-annotation.position_m[index])<=overlay.size[index]/2+1e-4);
  });
  closeArray(voxelOverlayTransform([6,3,3],[30,15,15],[28,1,0]).center,[5.7,.3,.1]);
});

