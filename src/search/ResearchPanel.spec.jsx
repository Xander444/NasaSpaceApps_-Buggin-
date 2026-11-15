import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import ResearchPanel from './ResearchPanel';
import {researchRequest} from './research';
vi.mock('./research',()=>({researchRequest:vi.fn()}));
let host,root,props;
const ready={status:'ready',interpretation:{goal:'detect smoke',environment:null,desired_data:'smoke measurements',unknowns:[]},proposed_conditions:[],questions:[]};
const ranking={ranked:[],gap:'inspect_evidence',message:'Inspect evidence',model:'mock',request_usage:{calls:1}};
const question={question:'Which goal?',why:'Different experiments support each goal.',options:['Detection','Suppression']};
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 props={index:{index_version:'index',sources:{},investigations:[]},prompt:'spacecraft fire',controls:{conditions:[]},context:{airflow_speed_status:'unknown'},contextKey:'first',onRanking:vi.fn(),onKeyword:vi.fn(),onApprove:vi.fn()};
 researchRequest.mockReset();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function render(){await act(async()=>root.render(<ResearchPanel {...props}/>));}
async function click(text){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button.click());}
test('opening panel, selecting a chip, and editing answers make no inference calls',async()=>{
 await render();expect(researchRequest).not.toHaveBeenCalled();
 researchRequest.mockResolvedValueOnce({status:'ready',summary_version:'v'}).mockResolvedValueOnce({...ready,status:'needs_clarification',questions:[question]});
 await click('Analyze request');expect(host.textContent).toContain('Which goal?');expect(researchRequest).toHaveBeenCalledTimes(2);
 await click('Detection');expect(researchRequest).toHaveBeenCalledTimes(2);
 researchRequest.mockResolvedValueOnce({status:'ready',summary_version:'v'}).mockResolvedValueOnce(ready).mockResolvedValueOnce(ranking);
 await click('Continue');
 expect(researchRequest.mock.calls[3][1].answers).toEqual([{question:'Which goal?',answer:'Detection'}]);
 expect(props.onRanking).toHaveBeenLastCalledWith(expect.objectContaining({key:'first'}));
});
test('keyword action aborts pending SI and ignores late results',async()=>{
 let finish;
 researchRequest.mockResolvedValueOnce({status:'ready',summary_version:'v'}).mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));
 await render();await click('Analyze request');const signal=researchRequest.mock.calls[1][2];
 await click('Return to keyword search');expect(signal.aborted).toBe(true);expect(props.onKeyword).toHaveBeenCalledTimes(1);
 await act(async()=>finish(ready));expect(researchRequest).toHaveBeenCalledTimes(2);expect(props.onRanking.mock.calls.every(([r])=>r===null)).toBe(true);
});
test('context changes invalidate pending results without another request',async()=>{
 let finish;researchRequest.mockResolvedValueOnce({status:'ready',summary_version:'v'}).mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));
 await render();await click('Analyze request');props={...props,contextKey:'changed'};await render();
 await act(async()=>finish(ready));expect(host.textContent).toContain('Needs refresh');expect(researchRequest).toHaveBeenCalledTimes(2);
});
test('search-now is distinct from keyword and reset clears conversation',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));
 researchRequest.mockResolvedValueOnce({status:'ready',summary_version:'v'}).mockResolvedValueOnce(ready).mockResolvedValueOnce(ranking);
 await render();await click('Search with current details');expect(researchRequest.mock.calls[1][1].search_now).toBe(true);expect(props.onKeyword).not.toHaveBeenCalled();
 await click('Reset SI session');expect(host.textContent).not.toContain('What I understand');expect(fetch).toHaveBeenCalledWith('/api/research/session',{method:'DELETE'});
});
test('unconfigured backend leaves keyword action available',async()=>{
 researchRequest.mockResolvedValue({status:'unconfigured'});await render();await click('Analyze request');
 expect(host.textContent).toContain('Gemini is not configured');await click('Return to keyword search');expect(props.onKeyword).toHaveBeenCalled();expect(researchRequest).toHaveBeenCalledTimes(1);
});
