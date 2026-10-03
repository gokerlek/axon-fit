import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identifyGithubAccount} from './account.ts';
test('setup identifies the account from GitHub instead of trusting typed owner',async()=>{
  assert.equal(await identifyGithubAccount('test-token','COACH',async token=>{assert.equal(token,'test-token');return {login:'coach',scopes:['repo','delete_repo']};}),'coach');
  assert.equal(await identifyGithubAccount('test-token',undefined,async()=>({login:'coach',scopes:['repo','delete_repo']})),'coach');
});
test('setup rejects another account, insufficient scopes and invalid identity',async()=>{
  for(const account of [{login:'someone-else',scopes:['repo','delete_repo']},{login:'coach',scopes:['repo']},{login:'bad/owner',scopes:['repo','delete_repo']}]){
    await assert.rejects(identifyGithubAccount('test-token','coach',async()=>account));
  }
});
