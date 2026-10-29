import catalog from '../../shared/catalog.json' with { type: 'json' };
import {sha256} from './hash.js';
export const {knowledge, rules} = catalog;
export const LIMITS = {bytes:2_000_000,events:10_000,retained:20_000};
const SECRET_KEY=/^(password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|api[_-]?key|authorization|cookie|set-cookie|private[_-]?key)$/i;
export function stableStringify(value) {
  if(value===null)return'n';
  if(typeof value==='boolean')return value?'b1':'b0';
  if(typeof value==='number'){const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,value===0?0:value);return'd'+[...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,'0')).join('');}
  if(Array.isArray(value)) return `a[${value.map(stableStringify).join(',')}]`;
  if(value && typeof value==='object') return `o{${Object.keys(value).sort().map(k=>`${stableStringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  return 's'+JSON.stringify(value);
}
export function fingerprint(value) {
  return sha256(stableStringify(value)).slice(0,24).toUpperCase();
}
function redact(value,depth=0) {
  if(depth>12) throw Error('Log objects may be nested at most 12 levels.');
  if(typeof value==='string'&&/[\uD800-\uDFFF]/u.test(value))throw Error('Log text must contain valid Unicode.');
  if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)) throw Error('Log numbers must be finite and within the safe integer range.');
  if(Array.isArray(value)) return value.map(v=>redact(v,depth+1));
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([k])=>!k.startsWith('_')).map(([k,v])=>{if(/[\uD800-\uDFFF]/u.test(k))throw Error('Log field names must contain valid Unicode.');return[k,SECRET_KEY.test(k)?'[REDACTED]':redact(v,depth+1)];}));
  return value;
}
export function parseCsv(raw) {
  const rows=[]; let row=[],cell='',quoted=false,closed=false;
  const push=()=>{row.push(cell);cell='';closed=false;};
  for(let i=0;i<raw.length;i++) {
    const c=raw[i];
    if(quoted) {if(c==='"') {if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c==='"'){if(cell||closed)throw Error('Malformed CSV quoting.');quoted=true;}
    else if(c===',')push();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&raw[i+1]==='\n')i++;push();if(row.some(x=>x.trim()))rows.push(row);row=[];}
    else{if(closed)throw Error('Unexpected characters after a quoted CSV field.');cell+=c;}
  }
  if(quoted)throw Error('Unclosed quoted CSV field.');
  if(cell||row.length||closed){push();if(row.some(x=>x.trim()))rows.push(row);}
  const headers=rows.shift()?.map(x=>x.trim());
  if(!headers||!['timestamp','source_ip','event'].every(k=>headers.includes(k))||new Set(headers).size!==headers.length)throw Error('CSV needs unique headers including timestamp, source_ip, and event.');
  return rows.map((cells,index)=>{if(cells.length!==headers.length)throw Error(`CSV row ${index+2} has ${cells.length} fields; expected ${headers.length}.`);return Object.fromEntries(headers.map((h,i)=>[h,h==='bytes'&&cells[i].trim()?Number(cells[i]):cells[i]]));});
}
function validIp(ip) {
  if(ip.includes(':')){try{return new URL(`http://[${ip}]/`).hostname.startsWith('[');}catch{return false;}}
  return /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(ip)&&ip.split('.').every(p=>Number(p)<=255);
}
export function parseLogs(raw) {
  if(new TextEncoder().encode(raw).length>LIMITS.bytes)throw Error('Log upload exceeds the 2 MB limit.');
  raw=raw.replace(/^\uFEFF/,'').trim();if(!raw)throw Error('Provide at least one log event.');
  let records;
  if(!/^[\[{]/.test(raw)&&raw.split(/\r?\n/)[0].includes(','))records=parseCsv(raw);
  else{try{const parsed=JSON.parse(raw);records=Array.isArray(parsed)?parsed:[parsed];}catch{try{records=raw.split(/\r?\n/).filter(x=>x.trim()).map((line,index)=>{try{return JSON.parse(line);}catch{throw Error(`Invalid JSON on line ${index+1}.`);}});}catch(e){throw Error(`${e.message} Use JSON, JSON Lines, or CSV.`);}}}
  if(!records.length||records.length>LIMITS.events)throw Error('Provide between 1 and 10,000 events.');
  return records.map((item,index)=>{
    const fail=message=>{throw Error(`Event ${index+1}: ${message}`);};
    if(!item||typeof item!=='object'||Array.isArray(item))fail('expected an object.');
    if(!['timestamp','source_ip','event'].every(k=>typeof item[k]==='string'&&item[k].trim()))fail('timestamp, source_ip, and event strings are required.');
    const e=redact(item);if(e.asset!=null&&typeof e.asset!=='string')fail('asset must be a string.');e.source_ip=e.source_ip.trim().toLowerCase();e.event=e.event.trim().toLowerCase();e.asset=String(e.asset||'Unspecified asset').trim();
    if(e.asset.length>200||e.event.length>100||(typeof e.username==='string'&&e.username.length>200))fail('asset and username may contain at most 200 characters; event at most 100.');
    if(!validIp(e.source_ip))fail('source_ip must be a valid IPv4 or IPv6 address.');
    if(e.source_ip.includes(':'))e.source_ip=new URL(`http://[${e.source_ip}]/`).hostname.slice(1,-1);
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(e.timestamp)||!Number.isFinite(Date.parse(e.timestamp)))fail('timestamp must be ISO 8601 with a timezone.');
    const [y,m,d,h,min,s]=e.timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/).slice(1).map(Number);
    if(y<1970||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate()||h>23||min>59||s>59)fail('timestamp contains an invalid date or time (minimum year 1970).');
    if(Date.parse(e.timestamp)<0)fail('timestamp must be at or after 1970-01-01 UTC.');
    e.timestamp=new Date(e.timestamp).toISOString();e.asset=e.asset||'Unspecified asset';
    if('bytes'in e&&(typeof e.bytes!=='number'||!Number.isSafeInteger(e.bytes)||e.bytes<0))fail('bytes must be a non-negative integer.');
    if(e.username!=null&&typeof e.username!=='string')fail('username must be a string.');if(e.username)e.username=e.username.trim();
    return e;
  }).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||fingerprint(a).localeCompare(fingerprint(b)));
}
export function uniqueEvents(events){return [...new Map(events.map(e=>[fingerprint(e),e])).entries()].sort(([ka,a],[kb,b])=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||ka.localeCompare(kb)).map(([,event])=>event);}
export function detect(input) {
  const events=uniqueEvents(input),groups=new Map(),findings=[];
  for(const e of events){const key=stableStringify([e.source_ip,e.asset]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
  const add=(rule,evidence,explanation)=>{
    const first=evidence[0],last=evidence.at(-1);
    findings.push({id:`CG-${fingerprint([rule.id,first.source_ip,first.asset,first.timestamp,rule.id==='AUTH-003'?fingerprint(last):''])}`,rule_id:rule.id,title:rule.title,severity:rule.severity,risk_score:{Critical:95,High:75,Medium:45,Low:20}[rule.severity],source_ip:first.source_ip,asset:first.asset,timestamp:last.timestamp,first_seen:first.timestamp,events:evidence.length,status:'Open',explanation,knowledge_id:rule.knowledge_id,evidence,recommendations:rule.recommendations,notes:[],history:[]});
  };
  for(const group of groups.values()){
    for(const id of ['AUTH-001','AUTH-002','ACCESS-001']){
      const rule=rules.find(r=>r.id===id),matches=group.filter(e=>e.event===rule.event&&(id!=='AUTH-002'||e.username));
      let end=0;const names=new Map(),times=matches.map(e=>Date.parse(e.timestamp));
      for(let start=0;start<matches.length;){
        while(end<matches.length&&times[end]-times[start]<=rule.window_seconds*1000){const name=matches[end].username;names.set(name,(names.get(name)||0)+1);end++;}
        const count=id==='AUTH-002'?names.size:end-start;
        if(count>=rule.threshold){const window=matches.slice(start,end);add(rule,window,id==='AUTH-002'?`${count} distinct usernames received failed logins from this source on this asset within ten minutes. This may indicate password spraying; validate expected automation.`:`${count} ${id==='AUTH-001'?'failed logins':'access denials'} from this source on this asset within ten minutes. Validate whether the activity is malicious or a configuration issue.`);start=end;names.clear();}
        else{const name=matches[start].username;if(names.get(name)===1)names.delete(name);else names.set(name,names.get(name)-1);start++;}
      }
    }
    const accounts=new Map();
    for(const e of group){
      if(e.username&&['login_failed','login_success'].includes(e.event)){
        const account=accounts.get(e.username)||{failed:[],head:0};
        while(account.head<account.failed.length&&Date.parse(e.timestamp)-Date.parse(account.failed[account.head].timestamp)>600000)account.head++;
        if(e.event==='login_failed'){account.failed.push(e);accounts.set(e.username,account);}
        else{const failed=account.failed.slice(account.head);if(failed.length>=5)add(rules.find(r=>r.id==='AUTH-003'),[...failed,e],`A successful login followed ${failed.length} failures for the same account, source, and asset within ten minutes. Confirm the session with the account owner; legitimate password recovery can produce the same pattern.`);accounts.delete(e.username);}
      }
      if(e.event==='privilege_escalation')add(rules.find(r=>r.id==='PRIV-001'),[e],'A privilege escalation event was recorded. Confirm whether this elevation was approved before treating it as compromise.');
      if(e.event==='large_transfer'&&e.bytes>=100000000)add(rules.find(r=>r.id==='DATA-001'),[e],`An outbound transfer of ${Math.round(e.bytes/1000000)} MB exceeded the 100 MB review threshold. Volume alone does not establish exfiltration.`);
    }
  }
  return findings.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)||a.id.localeCompare(b.id));
}
export function analyzeLocal(raw){const events=parseLogs(raw);return{findings:detect(events),events_analyzed:events.length,events};}
const STOP=new Set(['what','this','that','with','from','have','does','about','should','could','please','explain','would','into','your','they','them','then']);
export function retrieve(query,limit=2){
  const terms=[...new Set(query.toLowerCase().match(/[a-z0-9]+/g)||[])].filter(w=>w.length>2&&!STOP.has(w));
  return knowledge.map(doc=>{const title=`${doc.title} ${doc.tags.join(' ')}`.toLowerCase(),body=doc.text.toLowerCase();return{...doc,relevance:terms.reduce((score,w)=>score+(title.includes(w)?3:body.includes(w)?1:0),0)};}).filter(d=>d.relevance>0).sort((a,b)=>b.relevance-a.relevance||a.id.localeCompare(b.id)).slice(0,limit);
}
