export function applyRanking(result,recommendation){
 if(!recommendation)return result;
 const order=new Map(recommendation.ranked.map((r,i)=>[r.id,i]));
 const sort=groups=>groups.map((g,i)=>({g,i})).sort((a,b)=>(order.get(a.g.id)??1e6)-(order.get(b.g.id)??1e6)||a.i-b.i).map(x=>x.g);
 return {...result,verified:sort(result.verified),related:sort(result.related)};
}
export async function researchRequest(path,body,signal){
 const response=await fetch('/api/research/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal});
 let data;try{data=await response.json();}catch{throw Error('Research backend unavailable. Keyword search remains ready.');}
 if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Invalid research request. Check the input and conditions.');
 return data;
}
