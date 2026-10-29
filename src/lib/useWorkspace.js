import {useCallback,useEffect,useRef,useState} from 'react';
import {api,saveToken} from './api';
import {loadDemo,ingest,updateIncident,STORAGE_KEY,emptyWorkspace} from './workspace';
import {retrieve} from './engine';
export function useWorkspace(){
  const[data,setData]=useState(loadDemo),[mode,setMode]=useState('checking'),[provider,setProvider]=useState(false),[connectionError,setConnectionError]=useState(''),[storageWarning,setStorageWarning]=useState(''),[refreshing,setRefreshing]=useState(false);
  const generation=useRef(0),dataRef=useRef(data),modeRef=useRef(mode),demoRef=useRef(data);dataRef.current=data;modeRef.current=mode;if(mode==='demo')demoRef.current=data;
  const connect=useCallback(async(token)=>{
    if(typeof token==='string')saveToken(token.trim());
    const request=++generation.current;setRefreshing(true);setConnectionError('');
    try{
      const health=await api('/api/health',{timeout:5000});if(health.status!=='ok')throw Error('Unexpected API health response.');
      const next=await api('/api/incidents');if(!Array.isArray(next.incidents))throw Error('Unexpected workspace response.');
      if(request===generation.current){setData({...emptyWorkspace(),...next});setMode('connected');setProvider(health.llm_configured);setConnectionError('');}
    }catch(e){if(request===generation.current){setConnectionError(e.message);if(e.status===401){setMode('locked');setData(emptyWorkspace());setProvider(false);}else if(modeRef.current!=='connected'){setData(demoRef.current);setMode('demo');setProvider(false);}}}
    finally{if(request===generation.current)setRefreshing(false);}
  },[]);
  useEffect(()=>{connect();return()=>{generation.current++;};},[connect]);
  useEffect(()=>{if(mode==='demo'){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));setStorageWarning('');}catch{setStorageWarning('Browser storage is full or unavailable. Changes are kept in memory for this session. Export your workspace to preserve them.');}}else setStorageWarning('');},[data,mode]);
  function useDemo(){generation.current++;setRefreshing(false);setData(demoRef.current);setMode('demo');setProvider(false);setConnectionError('');}
  async function importLogs(content,filename){
    if(!['demo','connected'].includes(modeRef.current))throw Error('Connect to the backend or choose the demo workspace in Settings.');
    if(modeRef.current==='demo'){
      const next=ingest(dataRef.current,content,filename);dataRef.current=next.workspace;setData(next.workspace);return next.result;
    }
    const request=generation.current,result=await api('/api/analyze',{method:'POST',body:JSON.stringify({content,filename}),timeout:45000});
    const next=await api('/api/incidents');if(request===generation.current)setData({...emptyWorkspace(),...next});return result;
  }
  async function editIncident(id,changes){
    if(modeRef.current==='demo'){const next=updateIncident(dataRef.current,id,changes);dataRef.current=next;setData(next);return next.incidents.find(i=>i.id===id);}
    if(modeRef.current!=='connected')throw Error('The workspace is not connected.');
    const request=generation.current,incident=await api(`/api/incidents/${id}`,{method:'PATCH',body:JSON.stringify(changes)});
    if(request===generation.current)setData(prev=>({...prev,incidents:prev.incidents.map(i=>i.id===id?incident:i)}));return incident;
  }
  async function assistant(question,incident){
    if(modeRef.current==='connected')return api('/api/assistant',{method:'POST',body:JSON.stringify({question,incident_id:incident?.id}),timeout:75000});
    const sources=retrieve(question+' '+(incident?.title||''));
    return{mode:sources.length?'Reference guidance - not AI-generated':'No matching reference',answer:(incident?incident.explanation+'\n\n':'')+(sources.length?sources.map(s=>s.text).join('\n\n'):'No relevant material was found in the bundled references. Ask about authentication, security logging, or incident response.'),sources};
  }
  async function exportWorkspace(){return modeRef.current==='connected'?api('/api/workspace/export'):dataRef.current;}
  return{data,mode,provider,connectionError,storageWarning,refreshing,connect,useDemo,importLogs,editIncident,assistant,exportWorkspace};
}
