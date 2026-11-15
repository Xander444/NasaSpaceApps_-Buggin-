import React,{useEffect,useRef,useState} from 'react';
import {researchRequest} from './research';
import {Citations} from './Evidence';

export default function ResearchPanel({index,prompt,controls,context,contextKey,onRanking,onKeyword,onApprove}){
 const [state,setState]=useState('idle'),[error,setError]=useState(''),[answers,setAnswers]=useState([]),[analysis,setAnalysis]=useState(null),[rounds,setRounds]=useState(0),[recommendation,setRecommendation]=useState(null);
 const pending=useRef(null),generation=useRef(0),priorKey=useRef(contextKey);
 function cancel(){generation.current++;pending.current?.abort();pending.current=null;}
 useEffect(()=>()=>cancel(),[]);
 useEffect(()=>{if(priorKey.current!==contextKey){cancel();onRanking(null);setRecommendation(null);setState('stale');priorKey.current=contextKey;}},[contextKey]);
 const busy=['analyzing','retrieving','ranking'].includes(state);
 async function run(searchNow=false,editedIntent=null){
  cancel();const version=generation.current;const controller=new AbortController();pending.current=controller;
  const timer=setTimeout(()=>controller.abort(),65000);
  setError('');setRecommendation(null);onRanking(null);setState('analyzing');
  try{
   const ready=await researchRequest('status',null,controller.signal);
   if(version!==generation.current)return;
   if(ready.status!=='ready'){setState('unconfigured');return;}
   const body={prompt,answers,controls,context:JSON.stringify(context??null),index_version:index.index_version,summary_version:ready.summary_version,search_now:searchNow,rounds};
   const interpreted=editedIntent?{...analysis,interpretation:editedIntent,status:'ready',questions:[]}:await researchRequest('analyze',body,controller.signal);
   if(version!==generation.current)return;
   setAnalysis(interpreted);
   if(interpreted.status==='needs_clarification'){setRounds(r=>Math.min(2,r+1));setState('needs_clarification');return;}
   setState('retrieving');
   // The server first runs deterministic retrieval, then ranks the eligible summaries.
   setState('ranking');
   const ranked=await researchRequest('recommend',{...body,intent:interpreted.interpretation},controller.signal);
   if(version!==generation.current)return;
   setRecommendation(ranked);onRanking({key:contextKey,...ranked});setState(ranked.gap==='no_indexed_match'?'no indexed match':'ready');
  }catch(e){if(version===generation.current){setError(e.name==='AbortError'?'Research request timed out. Keyword search remains ready.':e.message);setState('unavailable');}}
  finally{clearTimeout(timer);}
 }
 function reset(){cancel();setAnswers([]);setAnalysis(null);setRounds(0);setRecommendation(null);setError('');setState('idle');onRanking(null);fetch('/api/research/session',{method:'DELETE'}).catch(()=>{});}
 function answer(question,value){setAnswers(a=>{const next=a.filter(x=>x.question!==question);return [...next,{question,answer:value}].slice(-4);});}
 return <section className="panel research-panel" aria-label="AI-guided research">
  <div className="paneltop"><h2>AI-guided search</h2><button onClick={()=>{cancel();onKeyword();}}>Use keyword search now</button></div>
  <p>On Analyze, your question, answers, scenario context and relevant public study summaries are sent to Gemini. Suggestions do not change required filters. Do not include private information.</p>
  <div role="status" aria-live="polite"><b>{state}</b>{error&&<p>{error}</p>}{state==='unconfigured'&&<p>Gemini is not configured. Use the private terminal key helper; keyword search is available.</p>}{state==='stale'&&<p>The question or controls changed. Analyze again to refresh recommendations.</p>}</div>
  {answers.map(a=><label className="research-field" key={a.question}>{a.question}<input maxLength={400} value={a.answer} onChange={e=>{cancel();onRanking(null);setRecommendation(null);setState('stale');answer(a.question,e.target.value);}}/></label>)}
  {analysis&&<details open><summary>What I understand · editable</summary>{[['goal','Goal'],['environment','Environment'],['desired_data','Desired data']].map(([key,label])=><label className="research-field" key={key}>{label}<input maxLength={key==='goal'?400:200} value={analysis.interpretation[key]??''} onChange={e=>{cancel();onRanking(null);setRecommendation(null);setState('stale');setAnalysis(a=>({...a,interpretation:{...a.interpretation,[key]:e.target.value||null}}));}}/></label>)}<p>Unknowns: {analysis.interpretation.unknowns.join('; ')||'None identified; unreported measurements remain unknown.'}</p><p>Confirmed controls: {controls.conditions.length} condition(s); the controls above take precedence.</p>{analysis.proposed_conditions.map((p,i)=><div key={i}><p>Proposed {p.condition.field}: {p.condition.value} {p.condition.unit} · from “{p.user_span}”</p><button onClick={()=>onApprove(p.condition)}>Add as preferred condition</button></div>)}</details>}
  {state==='needs_clarification'&&analysis?.questions.map(question=><fieldset key={question.question}><legend>{question.question}</legend><p>{question.why}</p><div className="button-row">{[...question.options,'Not sure'].map(option=><button type="button" key={option} aria-pressed={answers.find(a=>a.question===question.question)?.answer===option} onClick={()=>answer(question.question,option)}>{option}</button>)}</div><label className="research-field">Your answer<input maxLength={400} value={answers.find(a=>a.question===question.question)?.answer||''} onChange={e=>answer(question.question,e.target.value)}/></label></fieldset>)}
  <div className="button-row"><button disabled={busy||!prompt.trim()} onClick={()=>run(false)}>{state==='needs_clarification'?'Continue':'Analyze request'}</button><button disabled={busy||!prompt.trim()} onClick={()=>run(true)}>Search with what I have</button>{analysis&&<button disabled={busy||!analysis.interpretation.goal?.trim()} onClick={()=>run(true,analysis.interpretation)}>Search edited interpretation</button>}<button disabled={!analysis} onClick={()=>{cancel();onRanking(null);setRecommendation(null);setState(analysis.questions.length?'needs_clarification':'stale');}}>Back</button><button onClick={reset}>Reset AI session</button></div>
  {recommendation&&<div><h3>{recommendation.ranked.length?'Gemini-ranked recommendations':'No AI-ranked recommendations'}</h3><p>{recommendation.message}</p><p className="muted">{recommendation.model} · {recommendation.cache_hit?'Cached response · 0 new calls':`${recommendation.request_usage.calls} ranking call(s)`}. Unlisted studies retain deterministic order and are not AI-ranked.</p>{recommendation.ranked.map(r=><article key={r.id}><h4>{index.investigations.find(i=>i.id===r.id)?.program} · {r.id}</h4><p>Source excerpt{r.excerpt_truncated?' (shortened)':''} · {r.scope}</p><blockquote>{r.excerpt}</blockquote><Citations index={index} ids={[r.source_id]}/>{r.caveats.map(c=><p className="muted" key={c}>{c}</p>)}</article>)}</div>}
 </section>;
}
