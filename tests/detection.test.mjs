import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLocal, sampleLogs} from '../src/data.js';

const logs = minutes => minutes.map(m => ({timestamp:`2026-10-26T10:${String(m).padStart(2,'0')}:00Z`, source_ip:'192.0.2.1', event:'login_failed'}));
const run = events => analyzeLocal(JSON.stringify(events));

test('failed logins require five events in a ten minute window', () => {
  assert.equal(run(logs([0,1,2,3,4])).findings.length, 1);
  assert.equal(run(logs([0,1,2,3])).findings.length, 0);
  assert.equal(run(logs([0,11,22,33,44])).findings.length, 0);
});
test('time windows include the boundary and accept unordered input', () => {
  assert.equal(run(logs([10,0,4,2,6])).findings[0].events, 5);
  assert.equal(run(logs([0,2,4,6,10])).findings[0].id, run(logs([10,0,4,2,6])).findings[0].id);
});
test('sources do not contaminate each other', () => {
  const events=logs([0,1,2,3,4]); events[4].source_ip='192.0.2.2';
  assert.equal(run(events).findings.length, 0);
});
test('authorization denials and privilege elevations get distinct severities', () => {
  const denied=logs([0,1,2]).map(e=>({...e,event:'access_denied'}));
  assert.equal(run(denied).findings[0].severity,'Medium');
  assert.equal(run([{...denied[0],event:'privilege_escalation'}]).findings[0].severity,'Critical');
});
test('transfer threshold is inclusive and numeric', () => {
  const event={...logs([0])[0],event:'large_transfer'};
  assert.equal(run([{...event,bytes:99999999}]).findings.length,0);
  assert.equal(run([{...event,bytes:100000000}]).findings[0].severity,'High');
  assert.throws(()=>run([{...event,bytes:'100000000'}]), /non-negative integer/);
});
test('invalid formats and missing timezones produce actionable errors', () => {
  for (const raw of ['bad', 'null', '[]', '[{}]', JSON.stringify({...logs([0])[0],timestamp:'2026-10-26T10:00:00'})]) assert.throws(()=>analyzeLocal(raw));
  assert.throws(()=>analyzeLocal('x'.repeat(2000001)), /2 MB/);
});
test('JSON Lines and JSON arrays produce the same incidents', () => {
  const events=logs([0,1,2,3,4]);
  assert.deepEqual(analyzeLocal(events.map(e=>JSON.stringify(e)).join('\n')),run(events));
});
test('sample logs cover all detection families and count benign events', () => {
  const result=run(sampleLogs());
  assert.equal(result.events_analyzed,213);
  assert.equal(result.findings.length,8);
  assert.equal(new Set(result.findings.map(i=>i.title)).size,6);
});
