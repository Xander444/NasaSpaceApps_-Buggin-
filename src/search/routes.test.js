import test from 'node:test';
import assert from 'node:assert/strict';
import {appHref,stripBasePath} from '../routes.js';

test('internal hrefs stay inside the configured GitHub Pages repository path',()=>{
  const base='/NasaSpaceApps_-Buggin-/';
  assert.equal(appHref('/',base),base);
  assert.equal(appHref('/evidence',base),`${base}evidence`);
  assert.equal(appHref('/simulator?demo=1#hotspot-explanation',base),`${base}simulator?demo=1#hotspot-explanation`);
});

test('route matching strips only the configured base path',()=>{
  const base='/NasaSpaceApps_-Buggin-/';
  assert.equal(stripBasePath('/NasaSpaceApps_-Buggin-',base),'/');
  assert.equal(stripBasePath('/NasaSpaceApps_-Buggin-/evidence',base),'/evidence');
  assert.equal(stripBasePath('/NasaSpaceApps_-Buggin-/simulator/',base),'/simulator/');
  assert.equal(stripBasePath('/another-repo/evidence',base),'/another-repo/evidence');
  assert.equal(stripBasePath('/evidence'),'/evidence');
});