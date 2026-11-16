import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const main=read('../main.jsx');
const styles=read('../styles.css');
const simulatorStyles=read('../simulator.css');
const themeGuide=read('../../docs/THEME_GUIDE.md');

test('project overview is the default route and explains the challenge and approach',()=>{
  assert.match(main,/MICROGRAVITY FIRE SAFETY/);
  assert.match(main,/THE CHALLENGE/);
  assert.match(main,/HOW WE SOLVE IT/);
  assert.match(main,/SCOPE &amp; VALIDITY/);
  assert.match(main,/No verified partial-gravity combustion tests are currently indexed/);
  assert.match(main,/Rocket-engine and propellant fires are outside the scope/);
  assert.match(main,/illustrative relative screening index, not a fire prediction, CFD, probability, safety certification, or mission approval/);
  assert.match(main,/else page=<HomePage\/>/);
  assert.match(main,/Who We Are/);
});

test('guided demo connects project, evidence, cabin screening, and hotspot details',()=>{
  const simulator=read('../Simulator.jsx');
  const demoPath=read('../DemoPath.jsx');
  assert.match(demoPath,/href:'\/evidence'/);
  assert.match(demoPath,/href:'\/simulator\?demo=1'/);
  assert.match(demoPath,/href:'\/simulator\?demo=1#hotspot-explanation'/);
  assert.match(main,/DemoPath currentStep="project"/);
  assert.doesNotMatch(main,/DemoPath currentStep="evidence"/);
  assert.match(simulator,/DemoPath currentStep=\{result\?\.precomputed_fixture\?'hotspot':'cabin'\}/);
  assert.match(simulator,/loadExactDemo\(true\)/);
});

test('loading, empty, and API-offline states offer recovery actions',()=>{
  const simulator=read('../Simulator.jsx');
  assert.match(main,/Retry loading evidence/);
  assert.match(main,/Reset search/);
  assert.match(simulator,/role="alert"/);
  assert.match(simulator,/Retry simulation/);
  assert.match(simulator,/View precomputed result/);
  assert.match(simulator,/Retry precomputed result/);
});

test('evidence explorer exposes a guided, controllable, low-density workflow',()=>{
  const evidence=read('./Evidence.jsx');
  assert.match(main,/01 · SEARCH/);
  assert.match(main,/02 · REVIEW/);
  assert.match(main,/Try an oxygen and pressure scenario/);
  assert.match(main,/These examples come from the challenge brief, not from a PSI test/);
  assert.match(main,/No indexed test row matches all preferred conditions/);
  assert.match(main,/aria-pressed=\{!siMode\}/);
  assert.match(main,/filter-disclosure/);
  assert.match(main,/Compare selected/);
  assert.match(evidence,/Why this result matched · source excerpt/);
  assert.match(evidence,/Close comparison/);
});

test('approved annotation removals remain removed from the shared shell',()=>{
  assert.doesNotMatch(main,/Missing means unknown(?:—|-)not zero/);
  assert.doesNotMatch(main,/RESEARCH PROTOTYPE/i);
  assert.doesNotMatch(main,/<Flame[^>]*\/>/);
  assert.match(main,/show unknown\. Never invent it\./);
  assert.match(main,/screening spacecraft interiors, without presenting assumptions/);
});

test('theme remains flat and the team guide is repository documentation',()=>{
  for(const css of [styles,simulatorStyles]){
    assert.doesNotMatch(css,/background-clip\s*:\s*text/i);
    assert.doesNotMatch(css,/box-shadow\s*:/i);
    assert.doesNotMatch(css,/animation\s*:/i);
  }
  assert.match(themeGuide,/Do not:/);
  assert.match(themeGuide,/gradient text/i);
  assert.match(themeGuide,/relative screening index/i);
  assert.match(themeGuide,/\/about/);
});

test('team page includes the approved professional biographies',()=>{
  assert.match(main,/Gabriel developed his passion for software engineering/);
  assert.match(main,/Alexander discovered programming during the COVID-19 pandemic/);
  assert.match(main,/chemistry and building robots with his teammates/);
  assert.match(main,/Elisabeth Wei',bio:'Elisabeth is a Pure and Applied Science student/);
  assert.match(main,/Lily is a first-year student at Marianopolis College/);
  assert.match(main,/She also enjoys robotics with her teammates/);
  assert.doesNotMatch(main,/Professional Larper|I chose the bio for everyone/);
});

test('source register includes the curated NASA PSI set and cited references',()=>{
  const sourcePage=main.slice(main.indexOf('function SourcesPage()'),main.indexOf('function AboutPage()'));
  assert.equal((sourcePage.match(/\['PSI-\d+'/g)||[]).length,24);
  assert.match(sourcePage,/NASA Space Apps challenge resources/);
  assert.match(sourcePage,/Canadian Space Agency open-data catalog/);
  assert.match(sourcePage,/NIST SP 811/);
  assert.match(sourcePage,/Publications cited in PSI catalog records/);
  assert.match(sourcePage,/https:\/\/doi\.org\/10\.1016\/j\.pecs\.2019\.100787/);
  assert.match(sourcePage,/file inventories are indexed as metadata only/i);
});

test('homepage connects control evidence and shared hardware with source links',()=>{
  assert.match(main,/FROM STUDIES TO FIRE-SAFETY QUESTIONS/);
  assert.match(main,/SAME and SAME-R study smoke\/aerosol measurements and detector response/);
  assert.match(main,/DAFT\/DAFT-2 examines aerosol-measurement instrumentation with dust/);
  assert.match(main,/Earth technology-transfer examples/);
  assert.match(main,/Fine-water-mist suppression/);
  assert.match(main,/NASA Spinoff · Fire Detector/);
  assert.match(main,/Firefighter equipment/);
  assert.doesNotMatch(main,/This dashboard does not evaluate those products/);
  assert.match(main,/NASA Spinoff · Fireman’s Air Tanks/);
  assert.match(main,/NASA Spinoff · New Technology for the Fire Attire/);
  assert.match(main,/INVESTIGATIONS &amp; TEST HARDWARE/);
  assert.match(main,/Six gaseous-flame investigations use the ACME hardware family in the CIR/);
  assert.match(main,/Multi-user Droplet Combustion Apparatus in the CIR/);
  assert.match(main,/fan-driven duct built for SPICE/);
  for(const accession of ['PSI-10','PSI-20','PSI-21','PSI-22','PSI-23','PSI-159','PSI-39','PSI-68','PSI-69','PSI-25','PSI-26','PSI-106','PSI-107','PSI-47','PSI-98','PSI-99','PSI-100']){
    assert.ok(main.includes(`'${accession}'`),`missing cited investigation ${accession}`);
  }
});

