export async function fetchSemantic(address,query,indexVersion,{signal,timeout=5000}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  try{
    if(signal?.aborted)controller.abort();
    const response=await fetch(address.replace(/\/$/,'')+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,index_version:indexVersion}),signal:controller.signal});
    if(!response.ok)throw new Error(`Semantic service returned ${response.status}`);
    const data=await response.json();
    if(data.index_version!==indexVersion)throw new Error('Semantic index version mismatch');
    if(typeof data.model_version!=='string'||!Array.isArray(data.scores)||data.scores.some(s=>typeof s.id!=='string'||!Number.isFinite(s.score)))throw new Error('Invalid semantic response');
    return data;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
