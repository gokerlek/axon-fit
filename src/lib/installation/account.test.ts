import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identifyGithubAccount,connectGithubAccount} from './account.ts';
test('setup identifies the account from GitHub instead of trusting typed owner',async()=>{
  assert.equal(await identifyGithubAccount('test-token','COACH',async token=>{assert.equal(token,'test-token');return {login:'coach',scopes:['repo','delete_repo']};}),'coach');
  assert.equal(await identifyGithubAccount('test-token',undefined,async()=>({login:'coach',scopes:['repo','delete_repo']})),'coach');
});
test('setup rejects another account, insufficient scopes and invalid identity',async()=>{
  for(const account of [{login:'someone-else',scopes:['repo','delete_repo']},{login:'coach',scopes:['repo']},{login:'bad/owner',scopes:['repo','delete_repo']}]){
    await assert.rejects(identifyGithubAccount('test-token','coach',async()=>account));
  }
});
test('automatic setup explains the missing workflow permission before later steps',async()=>{
  await assert.rejects(identifyGithubAccount('token',undefined,async()=>({login:'coach',scopes:['repo','delete_repo']}),true),/workflow/);
  assert.equal(await identifyGithubAccount('token',undefined,async()=>({login:'coach',scopes:['repo','delete_repo','workflow']}),true),'coach');
});
test('both manual and automatic Vercel setup prepare the bound code repo while local setup and wrong accounts never write',async()=>{
  const calls:string[]=[];
  const lookup=async()=>({login:'coach',scopes:['repo','delete_repo','workflow']});
  const prepare=async(_token:string,repo:string,branch:string)=>{calls.push(`${repo}:${branch}`);};
  await connectGithubAccount('token','coach','app',false,lookup,prepare);
  await connectGithubAccount('token','coach','app',true,lookup,prepare);
  await connectGithubAccount('token',undefined,undefined,false,lookup,prepare);
  await assert.rejects(connectGithubAccount('token','other','app',true,lookup,prepare));
  assert.deepEqual(calls,['coach/app:main','coach/app:main']);
});
