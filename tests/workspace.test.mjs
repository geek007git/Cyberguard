import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLogs,analyzeLocal,detect,retrieve,fingerprint} from '../src/lib/engine.js';
import {emptyWorkspace,ingest,updateIncident} from '../src/lib/workspace.js';
import {csvCell,reportContent} from '../src/lib/reports.js';

const event=(minute,extra={})=>({timestamp:`2026-10-26T10:${String(minute).padStart(2,'0')}:00Z`,source_ip:'192.0.2.1',event:'login_failed',asset:'auth-01',...extra});
const run=events=>analyzeLocal(JSON.stringify(events));

test('correlates evidence across uploads and skips repeated normalized events',()=>{
  const first=ingest(emptyWorkspace(),JSON.stringify([event(0),event(1),event(2)]),'first.json');
  assert.equal(first.workspace.incidents.length,0);
  const next=ingest(first.workspace,JSON.stringify([event(2),event(3),event(4)]),'second.json');
  assert.equal(next.workspace.total_events,5);assert.equal(next.result.duplicates,1);assert.equal(next.workspace.incidents.length,1);
  const again=ingest(next.workspace,JSON.stringify([event(0),event(1)]));
  assert.equal(again.workspace.total_events,5);assert.equal(again.result.new_events,0);assert.equal(again.result.findings.length,0);
  assert.equal(again.workspace.batches.length,3);
});
test('investigation statuses, notes, and history survive re-analysis',()=>{
  const content=JSON.stringify([0,1,2,3,4].map(m=>event(m))),first=ingest(emptyWorkspace(),content).workspace,id=first.incidents[0].id;
  const updated=updateIncident(first,id,{status:'Resolved',note:'Approved authentication test.'});
  assert.equal(updated.incidents[0].notes[0].text,'Approved authentication test.');assert.equal(updated.incidents[0].history.length,3);
  const repeated=ingest(updated,content).workspace;
  assert.equal(repeated.incidents[0].status,'Resolved');assert.equal(repeated.incidents[0].notes.length,1);
  assert.throws(()=>updateIncident(updated,id,{status:'Invalid'}),/Invalid/);
  assert.throws(()=>updateIncident(updated,'missing',{note:'test'}),/not found/);
});
test('isolates assets and detects separate episodes from a repeated source',()=>{
  const split=[0,1,2,3,4].map(m=>event(m,{asset:m<3?'a':'b'}));assert.equal(run(split).findings.length,0);
  const episodes=[0,1,2,3,4,20,21,22,23,24].map(m=>event(m));assert.equal(run(episodes).findings.length,2);
});
test('late-arriving evidence preserves an existing incident ID and investigation',()=>{
  const first=ingest(emptyWorkspace(),JSON.stringify([1,2,3,4,5].map(m=>event(m)))).workspace,id=first.incidents[0].id;
  const reviewed=updateIncident(first,id,{status:'Investigating',note:'Review in progress.'});
  const next=ingest(reviewed,JSON.stringify([event(0)]));
  assert.equal(next.workspace.incidents.length,1);assert.equal(next.workspace.incidents[0].id,id);
  assert.equal(next.workspace.incidents[0].events,6);assert.equal(next.workspace.incidents[0].notes.length,1);assert.equal(next.result.findings.length,0);
});
test('password spray counts distinct usernames and requires a common source and asset',()=>{
  assert.equal(run([0,1,2,3,4].map(m=>event(m,{username:`user-${m}`}))).findings.filter(i=>i.rule_id==='AUTH-002').length,1);
  assert.equal(run([0,1,2,3,4].map(m=>event(m,{username:'same'}))).findings.filter(i=>i.rule_id==='AUTH-002').length,0);
});
test('successful authentication correlation requires the same account',()=>{
  const failures=[0,1,2,3,4].map(m=>event(m,{username:'alice'}));
  const success=event(5,{event:'login_success',username:'alice'});
  assert.equal(run([...failures,success]).findings.filter(i=>i.rule_id==='AUTH-003').length,1);
  assert.equal(run([...failures,{...success,username:'bob'}]).findings.filter(i=>i.rule_id==='AUTH-003').length,0);
});
test('redacts sensitive fields recursively before detection and storage',()=>{
  const parsed=parseLogs(JSON.stringify(event(0,{password:'do-not-store',metadata:{api_key:'secret',nested:[{authorization:'Bearer hidden'}]},_time:0})))[0];
  assert.equal(parsed.password,'[REDACTED]');assert.equal(parsed.metadata.api_key,'[REDACTED]');assert.equal(parsed.metadata.nested[0].authorization,'[REDACTED]');assert.equal('_time'in parsed,false);
});
test('CSV supports quoted commas, doubled quotes, multiline values, and numeric bytes',()=>{
  const csv='timestamp,source_ip,event,asset,bytes\r\n2026-10-26T10:00:00Z,192.0.2.1,large_transfer,"database, \"\"primary\"\"",100000000';
  const result=analyzeLocal(csv);assert.equal(result.findings.length,1);assert.equal(result.events[0].asset,'database, "primary"');
  assert.throws(()=>parseLogs('timestamp,source_ip,event\n"unterminated'),/Unclosed/);
  assert.throws(()=>parseLogs('timestamp,source_ip,event\na,b'),/fields/);
});
test('validates real dates, IP addresses, nesting, and transfer types',()=>{
  for(const extra of [{timestamp:'2026-02-30T10:00:00Z'},{source_ip:'999.1.1.1'},{bytes:-1},{bytes:true},{username:5}])assert.throws(()=>run([event(0,extra)]));
  assert.equal(parseLogs(JSON.stringify(event(0,{source_ip:'2001:db8::1'})))[0].source_ip,'2001:db8::1');
});
test('normalizes timezones and object ordering for duplicate detection',()=>{
  const a=event(0),b={event:'login_failed',asset:'auth-01',source_ip:'192.0.2.1',timestamp:'2026-10-26T15:30:00+05:30'};
  const parsed=parseLogs(JSON.stringify([a,b]));assert.equal(fingerprint(parsed[0]),fingerprint(parsed[1]));
  const result=ingest(emptyWorkspace(),JSON.stringify([a,b]));assert.equal(result.workspace.total_events,1);assert.equal(result.result.duplicates,1);
});
test('unmatched knowledge queries abstain rather than return arbitrary documents',()=>{
  assert.deepEqual(retrieve('baking blueberry muffins'),[]);
  assert.equal(retrieve('password spraying and MFA')[0].id,'authentication');
});
test('reports preserve evidence and notes while CSV cells resist formula evaluation',()=>{
  const incident=run([event(0,{event:'privilege_escalation',asset:'=HYPERLINK("bad")'})]).findings[0];
  const json=JSON.parse(reportContent([incident],'selected workspace','json'));assert.deepEqual(json.incidents[0].evidence,incident.evidence);
  assert.match(csvCell('=1+1'),/^"'/);assert.match(csvCell('  @SUM(A1)'),/^"'/);
  assert.match(reportContent([incident],'all time'),/PRIV-001/);assert.match(reportContent([incident],'all time'),/not probabilities/);
});
