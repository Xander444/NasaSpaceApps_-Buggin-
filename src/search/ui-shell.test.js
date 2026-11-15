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
  assert.match(main,/else page=<HomePage\/>/);
  assert.match(main,/Who we are/);
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

