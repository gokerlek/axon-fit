import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newerRelease,codeRepository,validUpdateCommit} from './core.ts';
test('only stable strictly newer semver releases qualify',()=>{
  assert.ok(newerRelease('v0.2.0','0.1.9'));
  for(const tag of ['v0.1.9','v0.1.8','v0.2.0-beta','v00.2.0','main','v1.0.0; rm -rf'])assert.equal(newerRelease(tag,'0.1.9'),false);
});
test('update target cannot be upstream, another owner, data repo or client repo',()=>{
  assert.equal(codeRepository('coach/app','coach','data'),'coach/app');
  for(const repo of ['gokerlek/axon-fit','someone/app','coach/data','coach/client-test','coach/Client-test','coach/..','coach/.','coach/../data',undefined])assert.throws(()=>codeRepository(repo,'coach','data'));
});
test('stale, merged or unrelated staging commits never replace the production branch',()=>{
  const commit={parents:[{sha:'expected'}],message:'Axon update v0.2.0'};
  assert.ok(validUpdateCommit(commit,'expected','v0.2.0'));
  assert.equal(validUpdateCommit(commit,'newer-head','v0.2.0'),false);
  assert.equal(validUpdateCommit({...commit,parents:[{sha:'expected'},{sha:'other'}]},'expected','v0.2.0'),false);
  assert.equal(validUpdateCommit({...commit,message:'custom code'},'expected','v0.2.0'),false);
});
