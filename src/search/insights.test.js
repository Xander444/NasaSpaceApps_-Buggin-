import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEngine} from './engine.js';
import {preferredConditionsForContext} from './missionContexts.js';
import {buildScientificInsight,evidenceFieldValue,uniqueObservationFields} from './insights.js';

const index=JSON.parse(fs.readFileSync(new URL('../../public/search/index.json',import.meta.url)));
const engine=createEngine(index);
const makeGroup=(doc,checks=[])=>({
  id:doc.accession,
  investigation:index.investigations.find(item=>item.id===doc.accession)||{program:'Synthetic fixture'},
  evidence:[{doc,checks,rank:1}],
  tests:doc.kind==='test'?[{doc,checks,rank:1}]:[],
});

test('specific test insight reports row values and links its NASA source',()=>{
  const result=engine.search({q:'PSI-25:B1'});
  const insight=buildScientificInsight({query:'PSI-25:B1',result});
  assert.ok(insight);
  assert.match(insight.summary,/BASS-II/);
  assert.equal(insight.evidenceRows[0].doc.id,'PSI-25:B1');
  assert.equal(evidenceFieldValue(insight.evidenceRows[0].doc,'oxygen_initial_percent'),'22.2 % vol');
  assert.equal(evidenceFieldValue(insight.evidenceRows[0].doc,'pressure'),'Unknown');
  assert.ok(insight.sourceIds.length>0);
  for(const sourceId of [...insight.sourceIds,...insight.evidenceRows[0].doc.source_ids])assert.ok(index.sources[sourceId]);
  assert.ok(insight.gaps.some(gap=>gap.kind==='warning'&&/below 21%/.test(gap.text)));
  assert.match(insight.observations[0].row.doc.kind,/test/);
});

test('observation field labels are returned as unique display-ready values',()=>{
  assert.deepEqual(uniqueObservationFields([
    {fields:['oxygen_initial_percent','pressure']},
    {fields:['oxygen_initial_percent','outcome']},
  ]),['Initial oxygen','Pressure','Reported outcome']);
});

test('mission comparability requires all preferred fields on the same returned test row',()=>{
  const conditions=preferredConditionsForContext('lunar-habitat');
  const syntheticDocument={id:'SYNTHETIC:TEST-1',accession:'SYNTHETIC',kind:'test',title:'Synthetic fixture row',source_ids:[],conditions:{
    oxygen_initial_percent:{value:30,unit:'% vol',method:'test fixture'},pressure:{value:70.3,unit:'kPa',method:'test fixture'},
  }};
  const comparable=makeGroup(syntheticDocument,[
    {field:'oxygen_initial_percent',status:'matched',mode:'preferred',source_ids:[]},
    {field:'pressure',status:'matched',mode:'preferred',source_ids:[]},
  ]);
  const partialDocument={...syntheticDocument,id:'SYNTHETIC:TEST-2',conditions:{
    oxygen_initial_percent:{value:30,unit:'% vol',method:'test fixture'},pressure:{value:null,unit:'kPa',method:'unreported'},
  }};
  const partial=makeGroup(partialDocument,[
    {field:'oxygen_initial_percent',status:'matched',mode:'preferred',source_ids:[]},
    {field:'pressure',status:'unknown',mode:'preferred',source_ids:[]},
  ]);
  const insight=buildScientificInsight({query:'PMMA in lunar habitats',result:{verified:[comparable],related:[partial]},conditions});
  assert.ok(insight.gaps.some(gap=>gap.kind==='matched'));
  assert.equal(insight.gaps[0].kind,'matched');

  const partialInsight=buildScientificInsight({query:'PMMA in lunar habitats',result:{verified:[],related:[partial]},conditions});
  assert.equal(partialInsight.gaps[0].kind,'gap');
  assert.match(partialInsight.gaps[0].text,/No test row.*matches all requested conditions together/);
  assert.match(partialInsight.gaps[0].text,/Pressure/);
  assert.match(partialInsight.gaps[0].text,/conditions from different rows are never combined/);
});

test('missing values stay unknown and catalog hypotheses never become observations',()=>{
  const hypothesis=index.documents.find(doc=>doc.accession==='PSI-10'&&doc.section==='hypothesis');
  const result={verified:[makeGroup(hypothesis)],related:[],browse:false};
  const insight=buildScientificInsight({query:'spherical flame extinction',result});
  assert.equal(insight.observations.length,0);
  assert.match(insight.summary,/ACME\/Flame Design/);
  assert.ok(insight.sourceIds.includes(hypothesis.source_ids[0]));
    assert.match(insight.interpretation,/establish a causal effect/);

  const row=makeGroup(index.documents.find(doc=>doc.id==='PSI-25:B1'));
  const rowInsight=buildScientificInsight({query:'PMMA',result:{verified:[row],related:[],browse:false}});
  assert.equal(evidenceFieldValue(row.tests[0].doc,'gravity'),'Unknown');
  assert.equal(evidenceFieldValue(row.tests[0].doc,'sensor'),'Unknown');
  assert.ok(rowInsight.gaps.some(gap=>/metadata only/.test(gap.text)));
});

test('irrelevant searches and neutral browse do not generate generic conclusions',()=>{
  assert.equal(buildScientificInsight({query:'',conditions:[],result:engine.search({})}),null);
  const irrelevant=engine.search({q:'quantum banana investment'});
  const insight=buildScientificInsight({query:'quantum banana investment',result:irrelevant});
  assert.ok(insight.noMatches);
  assert.match(insight.summary,/not evidence that NASA has never studied the topic/);
  assert.equal(insight.evidenceRows.length,0);
  assert.equal(insight.observations.length,0);
});

test('insight refresh is computed from each changed query and conditions input',()=>{
  const first=buildScientificInsight({query:'Design a smoke detector',result:engine.search({q:'Design a smoke detector'})});
  const changed=buildScientificInsight({query:'PMMA',result:engine.search({q:'PMMA'})});
  assert.notEqual(first.summary,changed.summary);
  const missionConditions=preferredConditionsForContext('spacesuit');
  const mission=buildScientificInsight({query:'PMMA',conditions:missionConditions,result:engine.search({q:'PMMA',conditions:missionConditions})});
  assert.notDeepEqual(first.gaps.map(gap=>gap.kind),mission.gaps.map(gap=>gap.kind));
});

test('panel renders after query controls and mission presets but before result cards',()=>{
  const main=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
  const controls=main.indexOf('className="mission-context"');
  const panel=main.indexOf('<InsightPanel insight={scientificInsight}');
  const resultCards=main.indexOf('{displayed.verified.map');
  assert.ok(controls>=0&&controls<panel&&panel<resultCards);
  assert.match(main,/\[fullQuery,result,conditions\]/);
});
