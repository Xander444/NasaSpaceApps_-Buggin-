// Localhost-only deterministic retrieval service for the public container.
// It loads the committed evidence index once and never accepts file paths or code.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createEngine} from '../src/search/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'public', 'search', 'research-retrieval-index.json.gz');
const MAX_REQUEST_BYTES = 32_768;
const MAX_RESPONSE_BYTES = 250_000;

export function createRetrievalRuntime() {
  const index = JSON.parse(zlib.gunzipSync(fs.readFileSync(INDEX_PATH)));
  const engine = createEngine(index);
  let requests = 0;

  function search(options) {
    requests += 1;
    const result = engine.search(options);
    if (result.errors.length) {
      const error = new Error('Invalid conditions');
      error.code = 'invalid_conditions';
      throw error;
    }
    const groups = {};
    for (const category of ['verified', 'related']) {
      groups[category] = result[category].map(group => ({
        id: group.id,
        matchingTestCount: group.matchingTestCount,
        support: group.evidence.slice(0, 2).map(evidence => ({
          id: evidence.id,
          checks: evidence.checks,
          source_ids: evidence.doc.source_ids,
          text: evidence.doc.text.slice(0, 700),
          scope: evidence.doc.evidence_level,
        })),
      }));
    }
    return {...groups, index_version: index.index_version};
  }

  return {
    search,
    health: () => ({
      status: 'ready',
      mode: 'warm-local-service',
      index_version: index.index_version,
      node_version: process.version,
      requests,
      uptime_seconds: Math.round(process.uptime()),
    }),
  };
}

function jsonResponse(response, status, payload) {
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    response.writeHead(503, {'content-type': 'application/json', 'cache-control': 'no-store'});
    response.end('{"error":"response_budget"}');
    return;
  }
  response.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'});
  response.end(body);
}

export function startRetrievalService({host = '127.0.0.1', port = 8787} = {}) {
  const runtime = createRetrievalRuntime();
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      jsonResponse(response, 200, runtime.health());
      return;
    }
    if (request.method !== 'POST' || request.url !== '/search') {
      jsonResponse(response, 404, {error: 'not_found'});
      return;
    }

    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_REQUEST_BYTES) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > MAX_REQUEST_BYTES) {
        jsonResponse(response, 413, {error: 'request_too_large'});
        return;
      }
      try {
        const options = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!options || Array.isArray(options) || typeof options !== 'object') throw new Error('Invalid request');
        jsonResponse(response, 200, runtime.search(options));
      } catch (error) {
        const code = error?.code === 'invalid_conditions' ? 'invalid_conditions' : 'invalid_request';
        console.warn(`[retrieval-service] request_rejected category=${code}`);
        jsonResponse(response, code === 'invalid_conditions' ? 422 : 400, {error: code});
      }
    });
    request.on('error', error => {
      console.warn(`[retrieval-service] request_error type=${error?.constructor?.name || 'Error'}`);
      if (!response.headersSent) jsonResponse(response, 400, {error: 'invalid_request'});
    });
  });
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`[retrieval-service] ready host=${host} port=${address.port} index=${runtime.health().index_version} node=${process.version}`);
  });
  return {server, runtime};
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const parsedPort = Number(process.env.RESEARCH_RETRIEVAL_PORT || 8787);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535 ? parsedPort : 8787;
  startRetrievalService({port});
}
