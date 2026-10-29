import {knowledge} from './engine.js';
export function downloadFile(name,content,type='text/plain'){
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function csvCell(value){const s=String(value??'');const safe=/^[\s]*[=+\-@\t\r]/.test(s)?`'${s}`:s;return `"${safe.replaceAll('"','""')}"`;}
export function reportContent(items,scope,format='md'){
  const generated=new Date().toISOString();
  if(format==='json')return JSON.stringify({generated_at:generated,scope,disclaimer:'Preliminary decision support; analyst validation required.',incidents:items},null,2);
  if(format==='csv')return [['ID','Title','Severity','Risk score (heuristic)','Status','Source IP','Asset','First seen','Last seen','Evidence events','Explanation','Analyst notes'],...items.map(i=>[i.id,i.title,i.severity,i.risk_score,i.status,i.source_ip,i.asset,i.first_seen,i.timestamp,i.events,i.explanation,(i.notes||[]).map(n=>n.text).join(' | ')])].map(row=>row.map(csvCell).join(',')).join('\r\n');
  return ['# CyberGuard AI — Security incident report',`Generated: ${generated}`,`Scope: ${scope}`,`Findings: ${items.length}`,'',...items.flatMap(i=>[
    `## ${i.id} · ${i.title}`,`Severity: ${i.severity} | Heuristic risk: ${i.risk_score??'unscored'}/100 | Status: ${i.status}`,`Rule: ${i.rule_id||'Legacy rule'}`,`Source: ${i.source_ip} | Asset: ${i.asset}`,`First seen: ${i.first_seen||i.timestamp} | Last seen: ${i.timestamp}`,`Evidence events: ${i.events}`,'',i.explanation,'','### Recommended actions',...(i.recommendations||['Validate the activity with the asset owner.']).map(s=>`- ${s}`),'',`Reference: ${knowledge.find(k=>k.id===i.knowledge_id)?.url||''}`,'','### Analyst notes',...(i.notes||[]).map(n=>`- ${n.at}: ${n.text}`),'','### Investigation history',...(i.history||[]).map(h=>`- ${h.at}: ${h.text}`),'','### Evidence','````json',JSON.stringify(i.evidence,null,2),'````',''
  ]),'Risk scores are rule-based triage weights, not probabilities. Findings require analyst validation and do not prove compromise.'].join('\n');
}
