import assert from 'node:assert/strict';
import fs from 'node:fs';
import {after, before, test} from 'node:test';
import zlib from 'node:zlib';
import {startRetrievalService} from './retrieve_service.mjs';

let service;
let baseUrl;

test('committed compact index matches the public evidence version and excludes generic inventory', () => {
  const full = JSON.parse(fs.readFileSync(new URL('../public/search/index.json', import.meta.url)));
  const compact = JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/search/research-retrieval-index.json.gz', import.meta.url))));
  assert.equal(compact.index_version, full.index_version);
  assert.equal(compact.investigations.length, full.investigations.length);
  assert.ok(compact.documents.length < full.documents.length / 2);
  assert.ok(compact.documents.every(document => document.kind !== 'file'
    || document.tags.includes('images/video')
    || /\.(avi|mp4|jpe?g|png|mov|tiff?)$/i.test(document.title)));
});

before(async () => {
  service = startRetrievalService({port: 0});
  if (!service.server.listening) {
    await new Promise((resolve, reject) => {
      service.server.once('listening', resolve);
      service.server.once('error', reject);
    });
  }
  baseUrl = `http://127.0.0.1:${service.server.address().port}`;
});

after(async () => {
  service.server.closeAllConnections();
  await new Promise((resolve, reject) => service.server.close(error => error ? reject(error) : resolve()));
});

test('warm retrieval service reports a bounded, versioned health record', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ready');
  assert.equal(body.mode, 'warm-local-service');
  assert.match(body.index_version, /^[a-f0-9]{20}$/);
  assert.match(body.node_version, /^v\d+/);
});

test('warm retrieval preserves deterministic study and row constraints', async () => {
  const response = await fetch(`${baseUrl}/search`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      q: 'PMMA',
      conditions: [
        {field: 'oxygen_initial_percent', value: 22.2, mode: 'required', operator: 'eq', unit: '% vol', tolerance: 0},
        {field: 'material', value: 'PMMA', mode: 'required', operator: 'contains'},
      ],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  const bass = body.verified.find(group => group.id === 'PSI-25');
  assert.ok(bass);
  assert.ok(bass.matchingTestCount > 0);
  assert.ok(bass.support.length <= 2);
});

test('warm retrieval rejects invalid conditions without returning internals', async () => {
  const response = await fetch(`${baseUrl}/search`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({q: 'PMMA', conditions: [{field: 'unknown', value: 'x', mode: 'required'}]}),
  });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {error: 'invalid_conditions'});
});
