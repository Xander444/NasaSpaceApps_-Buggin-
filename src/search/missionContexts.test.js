import test from 'node:test';
import assert from 'node:assert/strict';
import {countComparableTestRows,MISSION_CONTEXTS,preferredConditionsForContext} from './missionContexts.js';

test('mission scenarios become preferred context, never required evidence claims',()=>{
  const spacesuit=preferredConditionsForContext('spacesuit');
  const lunar=preferredConditionsForContext('lunar-habitat');
  assert.deepEqual(spacesuit.map(({field,value,unit,operator,mode})=>({field,value,unit,operator,mode})),[
    {field:'oxygen_initial_percent',value:'100',unit:'% vol',operator:'eq',mode:'preferred'},
    {field:'pressure',value:'29.6',unit:'kPa',operator:'eq',mode:'preferred'},
  ]);
  assert.equal(lunar[0].operator,'gte');
  assert.equal(lunar[1].operator,'lte');
  assert.ok([...spacesuit,...lunar].every(condition=>condition.mode==='preferred'));
  assert.throws(()=>preferredConditionsForContext('unknown'),RangeError);
  assert.equal(MISSION_CONTEXTS.length,2);
});

test('comparable count requires every preferred condition on one test row',()=>{
  const groups=[{tests:[
    {checks:[{mode:'preferred',status:'matched'},{mode:'preferred',status:'matched'}]},
    {checks:[{mode:'preferred',status:'matched'},{mode:'preferred',status:'unknown'}]},
    {checks:[{mode:'preferred',status:'matched'}]},
  ]}];
  assert.equal(countComparableTestRows(groups,[{mode:'preferred'},{mode:'preferred'}]),1);
  assert.equal(countComparableTestRows(groups,[{mode:'required'}]),0);
});