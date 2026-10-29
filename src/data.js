export {knowledge,rules,analyzeLocal,parseLogs,detect,retrieve} from './lib/engine.js';
export {loadDemo} from './lib/workspace.js';
export function sampleLogs(){
  const base=Date.now(),logs=[];
  const add=(minutes,source_ip,event,asset,extra={})=>logs.push({timestamp:new Date(base-minutes*60000).toISOString(),source_ip,event,asset,...extra});
  for(let i=0;i<12;i++)add(18+i/2,'203.0.113.42','login_failed','auth-server-01',{username:'admin'});
  add(17,'203.0.113.42','login_success','auth-server-01',{username:'admin'});
  add(47,'192.0.2.18','privilege_escalation','prod-api-02',{username:'svc-deploy'});
  add(94,'198.51.100.76','large_transfer','db-primary',{bytes:842000000});
  for(let i=0;i<6;i++)add(165+i,'203.0.113.89','access_denied','internal-gateway');
  for(let i=0;i<8;i++)add(291+i,'198.51.100.12','login_failed','vpn-gateway',{username:`user-${i}`});
  for(let i=0;i<4;i++)add(370+i,'192.0.2.64','access_denied','storage-service');
  for(let i=0;i<180;i++)add(i*7.6,'192.0.2.100','login_success','workspace-app');
  return logs;
}
