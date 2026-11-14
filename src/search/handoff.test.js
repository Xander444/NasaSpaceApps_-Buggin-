import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildExplorerHandoff,parseExplorerHandoff} from './handoff.js';

const demo=JSON.parse(fs.readFileSync(new URL('../../public/simulation/cabin-demo.json',import.meta.url)));
const probe=demo.research_spots[0];
const demoVent=demo.scene.vents.find(vent=>vent.id==='object-007-supply-vent');

test('simulator probe round-trips query, cabin conditions, and selected spot',()=>{
  const href=buildExplorerHandoff({
    query:probe.evidence_search.query,
    environment:demo.environment,
    spot_m:probe.center_m,
  });
  const parsed=parseExplorerHandoff(new URL(href,'https://example.test').search);
  assert.equal(parsed.query,'solid material flammability forced airflow microgravity fabric');
  assert.deepEqual(parsed.context.spot_m,[1.7,2.1,2.3]);
  assert.equal(parsed.context.gravity_g,0);
  assert.equal(parsed.context.ambient_temperature_c,22);
  assert.deepEqual(parsed.conditions.map(({field,value,unit,mode})=>({field,value,unit,mode})),[
    {field:'oxygen_initial_percent',value:'21',unit:'% vol',mode:'preferred'},
    {field:'pressure',value:'101.325',unit:'kPa',mode:'preferred'},
  ]);
});

test('vent location is preserved while unknown airflow speed creates no airflow condition',()=>{
  const href=buildExplorerHandoff({
    query:probe.evidence_search.query,
    environment:demo.environment,
    spot_m:probe.center_m,
    vent:demoVent,
  });
  const url=new URL(href,'https://example.test');
  const parsed=parseExplorerHandoff(url.search);
  assert.equal(url.searchParams.get('airflow_speed_m_s'),'unknown');
  assert.equal(parsed.context.vent_id,'object-007-supply-vent');
  assert.deepEqual(parsed.context.vent_position_m,[1.5,2.3,.16]);
  assert.equal(parsed.context.airflow_speed_m_s,null);
  assert.equal(parsed.context.airflow_speed_status,'unknown');
  assert.equal(parsed.conditions.some(condition=>condition.field==='airflow'),false);
});

test('a finite physical airflow speed is the only way to create an airflow condition',()=>{
  const href=buildExplorerHandoff({query:'forced airflow',vent:{id:'vent-1',position_m:[0,1,2],airflow_speed_m_s:.2}});
  const parsed=parseExplorerHandoff(new URL(href,'https://example.test').search);
  assert.equal(parsed.context.airflow_speed_status,'known');
  assert.deepEqual(parsed.conditions.find(condition=>condition.field==='airflow'),{field:'airflow',value:'0.2',unit:'m/s',operator:'eq',tolerance:0,mode:'preferred'});
});
