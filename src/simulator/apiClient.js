export class SimulationServiceError extends Error{
  constructor(message,{kind='service-error',status=null}={}){
    super(message);this.name='SimulationServiceError';this.kind=kind;this.status=status;
  }
}

export function simulationApiUrl(baseUrl='',path='/api/simulate'){
  const base=String(baseUrl||'').trim();
  if(!base)return path;
  return `${base.replace(/\/+$/,'')}${path.startsWith('/')?path:`/${path}`}`;
}

export function precomputedCabinUrl(basePath='/'){
  return `${String(basePath||'/').replace(/\/?$/,'/')}simulation/cabin-demo.json`;
}

export async function requestSimulation({scenario,samples=100_000,seed=2026,baseUrl='',fetchImpl=globalThis.fetch,timeoutMs=45_000}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(simulationApiUrl(baseUrl),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({scenario,samples,seed}),signal:controller.signal,
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const kind=response.status>=500||response.status===429?'service-unavailable':'rejected-input';
      throw new SimulationServiceError(payload.detail||`Simulation service returned HTTP ${response.status}.`,{kind,status:response.status});
    }
    return payload;
  }catch(error){
    if(error instanceof SimulationServiceError)throw error;
    const timedOut=error?.name==='AbortError';
    throw new SimulationServiceError(timedOut?'Simulation service timed out.':'Simulation service is unavailable.',{kind:timedOut?'timeout':'service-unavailable'});
  }finally{clearTimeout(timeout);}
}

export async function fetchPrecomputedCabin({basePath='/',fetchImpl=globalThis.fetch}={}){
  const response=await fetchImpl(precomputedCabinUrl(basePath));
  if(!response.ok)throw new Error(`Could not load the precomputed result (HTTP ${response.status}).`);
  return response.json();
}

