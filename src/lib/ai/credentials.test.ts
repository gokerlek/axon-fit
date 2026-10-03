import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sealKey,openKey,resolveKey,saveKey,type KeyStore,type KeyRecord} from './credentials.ts';
const context={secret:'test-secret-'.repeat(4),owner:'test-coach',repo:'test-private-data'};
const key='AIza'+'test_only_fake_key_'.repeat(2);
function fixture() {
  let file:{content:unknown;sha:string}|null=null;const calls:string[]=[];
  const store:KeyStore={
    async checkPrivate(){calls.push('private');},
    async read(){calls.push('read');return file;},
    async write(record,sha){calls.push('write');assert.equal(sha,file?.sha);file={content:record,sha:'next-sha'};},
  };
  return {store,calls,get file(){return file;},set file(value:{content:unknown;sha:string}|null){file=value;}};
}
test('API key is encrypted with randomized authenticated ciphertext, bound to owner and repo',()=>{
  const encrypted=sealKey(key,context);assert.ok(!encrypted.includes(key));
  assert.notEqual(encrypted,sealKey(key,context));assert.equal(openKey(encrypted,context),key);
  for(const changed of [{...context,secret:'other-secret-'.repeat(4)},{...context,owner:'another-coach'},{...context,repo:'another-repo'}])assert.throws(()=>openKey(encrypted,changed));
  const parts=encrypted.split('.');parts[2]=(parts[2]!.startsWith('A')?'B':'A')+parts[2]!.slice(1);
  assert.throws(()=>openKey(parts.join('.'),context));assert.throws(()=>sealKey(key,{...context,secret:'short'}));
});
test('settings override env and removing settings restores env without revealing key in status',async()=>{
  const f=fixture();assert.deepEqual((await resolveKey(f.store,context)).status,{configured:false,source:null});
  assert.equal((await resolveKey(f.store,context,'environment-key')).status.source,'environment');
  await saveKey(f.store,context,key);
  assert.ok(!JSON.stringify(f.file).includes(key));
  const saved=await resolveKey(f.store,context,'environment-key');assert.equal(saved.key,key);assert.deepEqual(saved.status,{configured:true,source:'settings'});
  assert.ok(!JSON.stringify(saved.status).includes(key));
  await saveKey(f.store,context,null);assert.equal((await resolveKey(f.store,context,'environment-key')).key,'environment-key');
});
test('public or fork repo stops before reading or writing credentials',async()=>{
  const f=fixture();f.store.checkPrivate=async()=>{throw new Error('not private');};
  await assert.rejects(saveKey(f.store,context,key));await assert.rejects(resolveKey(f.store,context));assert.deepEqual(f.calls,[]);
});
test('damaged records fail closed without fallback to env or silent replacement',async()=>{
  const f=fixture();f.file={content:{version:1,encrypted:'broken'},sha:'old'};
  await assert.rejects(resolveKey(f.store,context,'environment-key'));
  f.file={content:{version:99,encrypted:'broken'},sha:'old'};
  await assert.rejects(saveKey(f.store,context,key));assert.ok(!f.calls.includes('write'));
});
test('invalid key is rejected before repo calls and replacement uses current sha',async()=>{
  const f=fixture();await assert.rejects(saveKey(f.store,context,'short'));assert.deepEqual(f.calls,[]);
  await saveKey(f.store,context,key);await saveKey(f.store,context,key+'_replacement');
  assert.equal(openKey((f.file!.content as KeyRecord).encrypted!,context),key+'_replacement');
});
