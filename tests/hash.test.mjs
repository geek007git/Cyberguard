import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256} from '../src/lib/hash.js';
import {fingerprint,stableStringify} from '../src/lib/engine.js';
test('browser SHA-256 matches the platform implementation across message sizes',()=>{
  for(const text of ['', 'abc', 'Security 🔐 evidence', 'x'.repeat(55),'x'.repeat(56),'x'.repeat(64),'x'.repeat(10000)])assert.equal(sha256(text),createHash('sha256').update(text).digest('hex'));
});
test('typed canonical encoding distinguishes data types and stabilizes nested objects',()=>{
  assert.notEqual(fingerprint(1),fingerprint('1'));assert.notEqual(fingerprint(null),fingerprint('null'));
  assert.equal(fingerprint({a:1,b:{c:.1}}),fingerprint({b:{c:.1},a:1}));
  assert.equal(stableStringify(-0),stableStringify(0));
  assert.equal(stableStringify(.1),'d3fb999999999999a');
});
