import {test} from 'node:test';
import assert from 'node:assert/strict';
import {githubRequest} from './request.ts';

test('public release checks send no PT credential; private repo checks use it',async()=>{
  const headers:string[]=[];
  const fetcher:typeof fetch=async(_url,init)=>{headers.push(new Headers(init?.headers).get('Authorization')??'');return Response.json({ok:true});};
  await githubRequest(undefined,'/repos/gokerlek/axon-fit/releases/latest',{},false,fetcher);
  await githubRequest('test-secret','/repos/coach/app',{},false,fetcher);
  assert.deepEqual(headers,['','Bearer test-secret']);
});
test('repo and branch 404 errors identify their failing operation without leaking credentials or response bodies',async()=>{
  const fetcher:typeof fetch=async()=>new Response('test-secret',{status:404});
  for(const [path,expected] of [['/repos/coach/app',/coach\/app.*GITHUB_TOKEN/],['/repos/coach/app/git/ref/heads/main',/main.*dal/],['/repos/coach/app/actions/workflows/axon-update.yml/dispatches',/axon-update.yml.*Actions/]] as const){
    await assert.rejects(githubRequest('test-secret',path,{},false,fetcher),(error:Error)=>expected.test(error.message)&&!error.message.includes('test-secret'));
  }
  assert.equal(await githubRequest('test-secret','/repos/coach/app/actions/workflows/axon-update.yml/runs',{},true,fetcher),null);
});
