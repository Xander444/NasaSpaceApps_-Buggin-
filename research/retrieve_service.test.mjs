import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {startRetrievalService} from './retrieve_service.mjs';

let service;
let baseUrl;

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
