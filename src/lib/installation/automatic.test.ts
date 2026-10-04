import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {automaticInstall,automaticSchema,InstallationError,type InstallGateway,type Environment,type EnvironmentItem} from './automatic.ts';
import type {WizardValues} from './wizard.ts';
const values:WizardValues={owner:'coach',codeRepo:'coach-app',codeBranch:'main',appRepo:'coach-data',githubToken:'github-test',clientId:'id',clientSecret:'secret',authSecret:'a'.repeat(64),geminiKey:''};
function fixture() {
  const calls:string[]=[];const env:Environment[]=[];const created:EnvironmentItem[]=[];
  const gateway:InstallGateway={
    async project(id){calls.push(`project:${id}`);return {id,name:'app',link:{type:'github',org:'coach',repo:'coach-app',repoId:123,productionBranch:'main'}};},
    async env(){return env;},async githubOwner(){return {login:'coach',scopes:['repo','delete_repo']};},
    async validateOAuth(){calls.push('oauth');},
    async ensureWorkflow(token,repo,branch){assert.equal(token,values.githubToken);calls.push(`workflow:${repo}:${branch}`);},
    async create(id,items){calls.push(`create:${id}`);created.push(...items);env.push(...items);},
    async deploy(project){calls.push(`deploy:${project.id}`);return {id:'deployment-test'};},
  };
  return {gateway,calls,env,created};
}
test('automatic setup touches only its injected current project and writes only PT production values',async()=>{
  const f=fixture();await automaticInstall('current-project',values,false,f.gateway);
  assert.deepEqual(f.calls,['project:current-project','oauth','workflow:coach/coach-app:main','create:current-project','deploy:current-project']);
  assert.ok(f.created.length>0);
  for(const item of f.created){assert.deepEqual(item.target,['production']);if(/TOKEN|SECRET/.test(item.key)){assert.equal(item.type,'sensitive');assert.equal(item.visibility,'secret');}}
  assert.ok(!f.created.some(e=>/VERCEL|INSTALLER|INTEGRATION|BOOTSTRAP/.test(e.key)));
  assert.equal(v.safeParse(automaticSchema,{values,vercelToken:'temporary',projectId:'another-project'}).success,false);
});
test('other project or GitHub owner and existing production credentials never get overwritten',async()=>{
  for(const variant of ['wrong-id','wrong-owner','existing'] as const){const f=fixture();
    if(variant==='wrong-id')f.gateway.project=async()=>({id:'someone-else',name:'app'});
    if(variant==='wrong-owner')f.gateway.project=async id=>({id,name:'app',link:{type:'github',org:'someone-else',repo:'coach-app'}});
    if(variant==='existing')f.env.push({key:'AUTH_SECRET',target:['production']});
    await assert.rejects(automaticInstall('current-project',values,false,f.gateway));
    assert.equal(f.created.length,0);assert.ok(!f.calls.some(call=>call.startsWith('deploy:')));
  }
});
test('wrong GitHub token owner or missing scope stops before writing environment',async()=>{
  for(const user of [{login:'someone',scopes:['repo','delete_repo']},{login:'coach',scopes:['repo']}]){const f=fixture();f.gateway.githubOwner=async()=>user;
    await assert.rejects(automaticInstall('current-project',values,false,f.gateway));assert.equal(f.created.length,0);
  }
});
test('deployment failure permits retry without another secret write and stale setup cannot overwrite',async()=>{
  const f=fixture();f.gateway.deploy=async()=>{throw new Error('provider internal error');};
  await assert.rejects(automaticInstall('current-project',values,false,f.gateway),error=>error instanceof InstallationError && error.canRetryDeploy);
  const count=f.created.length;
  await assert.rejects(automaticInstall('current-project',values,false,f.gateway));
  f.gateway.deploy=async()=>({id:'retried'});
  assert.equal((await automaticInstall('current-project',values,true,f.gateway)).id,'retried');
  assert.equal(f.created.length,count);
  await assert.rejects(automaticInstall('current-project',{...values,appRepo:'different'},true,f.gateway));
});
test('partial env failure can resume by filling only missing values without overwriting saved secrets',async()=>{
  const f=fixture();const create=f.gateway.create;
  f.gateway.create=async(id,items)=>{await create(id,items.slice(0,3));throw new Error('partial write');};
  await assert.rejects(automaticInstall('current-project',values,false,f.gateway),error=>error instanceof InstallationError&&error.canRetryDeploy);
  assert.ok(!f.calls.some(call=>call.startsWith('deploy:')));
  const preserved=f.env.slice();
  f.gateway.create=async(id,items)=>{assert.ok(items.every(item=>!preserved.some(saved=>saved.key===item.key)));await create(id,items);};
  await automaticInstall('current-project',values,true,f.gateway);
  for(const saved of preserved)assert.equal(f.env.find(item=>item.key===saved.key),saved);
  assert.equal(new Set(f.env.map(item=>item.key)).size,f.env.length);
  assert.ok(f.calls.some(call=>call.startsWith('deploy:')));
});
test('workflow failure stops before persisting secrets or deploying',async()=>{
  const f=fixture();f.gateway.ensureWorkflow=async()=>{throw new Error('workflow permission missing');};
  await assert.rejects(automaticInstall('current-project',values,false,f.gateway),/workflow permission/);
  assert.equal(f.created.length,0);
  assert.ok(!f.calls.some(call=>call.startsWith('deploy:')));
});
test('retry also verifies the token owner before touching the workflow',async()=>{
  const f=fixture();await automaticInstall('current-project',values,false,f.gateway);
  f.calls.length=0;f.gateway.githubOwner=async()=>({login:'another-account',scopes:['repo','delete_repo']});
  await assert.rejects(automaticInstall('current-project',values,true,f.gateway),/PT hesabına/);
  assert.deepEqual(f.calls,['project:current-project']);
});
test('invalid OAuth credentials stop before workflow creation, secret writes and deployment',async()=>{
  const f=fixture();f.gateway.validateOAuth=async()=>{throw new Error('Client Secret invalid');};
  await assert.rejects(automaticInstall('current-project',values,false,f.gateway),/Client Secret/);
  assert.deepEqual(f.calls,['project:current-project']);
  assert.equal(f.created.length,0);
});
test('missing optional Gemini value in provider readback prevents deployment and permits retry',async()=>{
  const f=fixture();const create=f.gateway.create;
  f.gateway.create=async(id,items)=>create(id,items.filter(item=>item.key!=='GEMINI_API_KEY'));
  await assert.rejects(automaticInstall('current-project',{...values,geminiKey:'test-key'},false,f.gateway),error=>error instanceof InstallationError&&error.canRetryDeploy);
  assert.ok(!f.calls.some(call=>call.startsWith('deploy:')));
  f.gateway.create=create;
  await automaticInstall('current-project',{...values,geminiKey:'test-key'},true,f.gateway);
  assert.equal(f.env.find(item=>item.key==='GEMINI_API_KEY')?.value,'test-key');
});
