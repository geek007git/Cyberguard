import {analyzeLocal,detect,fingerprint,uniqueEvents,LIMITS} from './engine.js';
import {sampleLogs} from '../data.js';
export const STORAGE_KEY='cyberguard-workspace-v2';
export function emptyWorkspace(){return{version:2,incidents:[],total_events:0,events:[],batches:[]};}
export function ingest(workspace,content,filename='Pasted logs',now=new Date().toISOString()){
  const parsed=analyzeLocal(content),events=uniqueEvents([...(workspace.events||[]),...parsed.events]);
  if(events.length>LIMITS.retained)throw Error('This workspace retains up to 20,000 unique events. Export your workspace before starting another workspace.');
  const added=events.length-(workspace.events?.length||0),old=new Map(workspace.incidents.map(i=>[i.id,i])),findings=detect(events);let created=0;
  const matched=new Set(),newFindings=[];
  for(const finding of findings){
    let previous=old.get(finding.id);
    if(!previous){const evidence=new Set(finding.evidence.map(fingerprint));previous=workspace.incidents.find(i=>!matched.has(i.id)&&i.rule_id===finding.rule_id&&i.source_ip===finding.source_ip&&i.asset===finding.asset&&i.evidence.some(e=>evidence.has(fingerprint(e))));}
    if(!previous){created++;const record={...finding,history:[{at:now,type:'created',text:'Detected by '+finding.rule_id}]};old.set(finding.id,record);newFindings.push(record);}
    else{matched.add(previous.id);const history=[...(previous.history||[])];if(previous.events!==finding.events||previous.first_seen!==finding.first_seen)history.push({at:now,type:'evidence',text:`Evidence refreshed: ${finding.events} correlated events`});old.set(previous.id,{...finding,id:previous.id,status:previous.status,notes:previous.notes||[],history});}
  }
  const batch={id:'B-'+fingerprint([filename,now,workspace.batches?.length||0]),filename,imported_at:now,submitted:parsed.events_analyzed,added,duplicates:parsed.events_analyzed-added,findings:created};
  return{workspace:{...workspace,version:2,events,total_events:events.length,incidents:[...old.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)),batches:[batch,...(workspace.batches||[])]},result:{events_analyzed:parsed.events_analyzed,new_events:added,duplicates:batch.duplicates,findings:newFindings,batch}};
}
export function updateIncident(workspace,id,changes,now=new Date().toISOString()){
  if(!workspace.incidents.some(i=>i.id===id))throw Error('Incident not found.');
  return{...workspace,incidents:workspace.incidents.map(i=>{
    if(i.id!==id)return i;
    if(changes.status&&!['Open','Investigating','Resolved'].includes(changes.status))throw Error('Invalid incident status.');
    const history=[...(i.history||[])];let notes=[...(i.notes||[])];
    if(changes.status&&changes.status!==i.status)history.push({at:now,type:'status',text:`Status changed from ${i.status} to ${changes.status}`});
    if(changes.note?.trim()){const text=changes.note.trim();if(text.length>2000)throw Error('Notes can contain at most 2,000 characters.');notes.push({id:fingerprint([id,text,now,notes.length]),at:now,text});history.push({at:now,type:'note',text:'Analyst note added'});}
    return{...i,status:changes.status||i.status,notes,history};
  })};
}
export function loadDemo(){
  try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved?.version===2&&Array.isArray(saved.incidents)&&Array.isArray(saved.events)&&Array.isArray(saved.batches))return saved;}catch{}
  const{workspace}=ingest(emptyWorkspace(),JSON.stringify(sampleLogs()),'sample-security-logs.json');
  return workspace.incidents[2]?updateIncident(workspace,workspace.incidents[2].id,{status:'Investigating',note:'Reviewing the activity and expected maintenance schedule with the service owner.'}):workspace;
}
