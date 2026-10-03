import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkUpdates} from './check.ts';

test('repo access failure preserves the available release and blocks automatic updating with a reason',async()=>{
  const release={tag:'v0.1.1',automatic:true};
  const result=await checkUpdates('0.1.0',async()=>release,async()=>{throw new Error('Kod reposuna erişilemiyor.');});
  assert.deepEqual(result,{current:'0.1.0',release,run:null,automationError:'Kod reposuna erişilemiyor.'});
});
test('failed release lookup never reports that the app is up to date',async()=>{
  await assert.rejects(checkUpdates('0.1.0',async()=>{throw new Error('Release unavailable');},async()=>null),/Release unavailable/);
});
test('healthy checks retain staging status and permit automatic updating',async()=>{
  const result=await checkUpdates('0.1.0',async()=>({tag:'v0.1.1',automatic:true}),async()=>({id:12}));
  assert.deepEqual(result.run,{id:12});
  assert.equal(result.automationError,null);
});
