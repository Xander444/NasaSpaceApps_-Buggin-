import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRanking,researchRequest} from './research.js';

test('AI reorders only within verified and related groups, keeping omitted order',()=>{
 const result={verified:[{id:'a'},{id:'b'},{id:'c'}],related:[{id:'d'},{id:'e'}]};
 const ranked=applyRanking(result,{ranked:[{id:'e'},{id:'b'}]});
 assert.deepEqual(ranked.verified.map(x=>x.id),['b','a','c']);
 assert.deepEqual(ranked.related.map(x=>x.id),['e','d']);
 assert.deepEqual(result.verified.map(x=>x.id),['a','b','c']);
 assert.equal(applyRanking(result,null),result);
});
test('research transport preserves exact state and forwards cancellation',async()=>{
 const old=globalThis.fetch;const controller=new AbortController();
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/research/analyze');assert.equal(options.signal,controller.signal);assert.equal(JSON.parse(options.body).prompt,'NOT final O2 22.2%');return {ok:true,json:async()=>({status:'ready'})};};
 try{assert.equal((await researchRequest('analyze',{prompt:'NOT final O2 22.2%'},controller.signal)).status,'ready');}finally{globalThis.fetch=old;}
});
test('non-JSON backend failures remain service errors',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>{throw Error('html')}});
 try{await assert.rejects(researchRequest('status'),/backend unavailable/);}finally{globalThis.fetch=old;}
});
