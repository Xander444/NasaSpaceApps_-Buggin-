// Fixed local bridge: never accepts paths, code, or source records from callers.
import fs from 'node:fs';
import {createEngine} from '../src/search/engine.js';
let input='';
for await (const chunk of process.stdin) { input+=chunk; if(input.length>32768) throw Error('Request too large'); }
const request=JSON.parse(input);
const index=JSON.parse(fs.readFileSync(new URL('../public/search/index.json',import.meta.url)));
const result=createEngine(index).search(request);
if(result.errors.length)throw Error('Invalid conditions');
const groups={};
for(const category of ['verified','related']) groups[category]=result[category].map(g=>({id:g.id,matchingTestCount:g.matchingTestCount,
 support:g.evidence.slice(0,2).map(e=>({id:e.id,checks:e.checks,source_ids:e.doc.source_ids,text:e.doc.text.slice(0,700),scope:e.doc.evidence_level}))}));
process.stdout.write(JSON.stringify({...groups,index_version:index.index_version}));
