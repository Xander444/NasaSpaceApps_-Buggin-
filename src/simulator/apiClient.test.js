import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationServiceError,fetchPrecomputedCabin,precomputedCabinUrl,requestSimulation,simulationApiUrl} from './apiClient.js';

const response=(payload,{ok=true,status=200}={})=>({ok,status,json:async()=>payload});

test('public backend URL and successful simulation response',async()=>{
  let request;
  const payload={metric_name:'relative screening index',samples:1000};
  const result=await requestSimulation({scenario:{name:'fixture'},samples:1000,baseUrl:'https://screening.example/',fetchImpl:async(url,options)=>{request={url,options};return response(payload);}});
  assert.equal(request.url,'https://screening.example/api/simulate');
  assert.equal(JSON.parse(request.options.body).samples,1000);
  assert.deepEqual(result,payload);
  assert.equal(simulationApiUrl(''),'/api/simulate');
});

test('rejected input keeps the backend validation message',async()=>{
  await assert.rejects(
    requestSimulation({scenario:{},fetchImpl:async()=>response({detail:'Confirm model units in metres.'},{ok:false,status:422})}),
    error=>error instanceof SimulationServiceError&&error.kind==='rejected-input'&&error.status===422&&/metres/.test(error.message),
  );
});

test('gateway, capacity, and server failures remain retryable service errors',async()=>{
  for(const status of [502,503,500]){
    await assert.rejects(
      requestSimulation({scenario:{},fetchImpl:async()=>response({detail:'temporarily unavailable'},{ok:false,status})}),
      error=>error instanceof SimulationServiceError&&error.kind==='service-unavailable'&&error.status===status,
    );
  }
});

test('service failure does not affect the static precomputed cabin path',async()=>{
  await assert.rejects(
    requestSimulation({scenario:{},fetchImpl:async()=>{throw new TypeError('network down');}}),
    error=>error instanceof SimulationServiceError&&error.kind==='service-unavailable',
  );
  let requested;
  const fixture={precomputed_fixture:{model_sha256_verified:true}};
  const loaded=await fetchPrecomputedCabin({basePath:'/flame/',fetchImpl:async url=>{requested=url;return response(fixture);}});
  assert.equal(requested,'/flame/simulation/cabin-demo.json');
  assert.equal(precomputedCabinUrl('/'),'/simulation/cabin-demo.json');
  assert.deepEqual(loaded,fixture);
});

