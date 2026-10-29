const TOKEN_KEY='cyberguard-workspace-token';
const API_BASE_URL=(import.meta.env.VITE_API_URL||'').replace(/\/+$/,'');
export function readToken(){try{return sessionStorage.getItem(TOKEN_KEY)||'';}catch{return '';}}
export function saveToken(value){try{if(value)sessionStorage.setItem(TOKEN_KEY,value);else sessionStorage.removeItem(TOKEN_KEY);}catch{throw Error('Session storage is unavailable. The access token could not be saved.');}}
export async function api(path,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),options.timeout||12000);
  try{
    const token=readToken();
    const response=await fetch(`${API_BASE_URL}${path}`,{...options,signal:controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(token?{'X-Workspace-Token':token}:{}),...options.headers}});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('application/json'))throw Error('The analysis API is unavailable. Start the backend and reconnect in Settings.');
    const result=await response.json();
    if(!response.ok){const error=Error(typeof result.detail==='string'?result.detail:result.detail?.map?.(d=>d.msg).join('; ')||'The request could not be completed.');error.status=response.status;throw error;}
    return result;
  }catch(e){if(e.name==='AbortError')throw Error('The request timed out. Check the backend connection and try again.');throw e;}
  finally{clearTimeout(timeout);}
}
