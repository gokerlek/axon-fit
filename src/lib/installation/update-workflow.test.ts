import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensureUpdateWorkflow} from './update-workflow.ts';

test('missing workflow is created only in the selected code repo and branch using the bundled template',async()=>{
  const writes:{path:string;body:Record<string,string>}[]=[];
  const fake:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-token');
    if(url.pathname==='/repos/coach/app')return Response.json({full_name:'coach/app'});
    assert.equal(url.pathname,'/repos/coach/app/contents/.github/workflows/axon-update.yml');
    if(init?.method==='PUT'){writes.push({path:url.pathname,body:JSON.parse(String(init.body))});return Response.json({commit:{sha:'new'}},{status:201});}
    assert.equal(url.searchParams.get('ref'),'main');
    return new Response(null,{status:404});
  };
  await ensureUpdateWorkflow('test-token','coach/app','main',['repo','workflow'],fake);
  assert.equal(writes.length,1);
  assert.equal(writes[0]!.body.branch,'main');
  assert.equal('sha' in writes[0]!.body,false);
  assert.equal(Buffer.from(writes[0]!.body.content!,'base64').toString(),readFileSync(new URL('../../../.github/workflows/axon-update.yml',import.meta.url),'utf8'));
  assert.ok(!JSON.stringify(writes).includes('test-token'));
});
test('an existing custom workflow is preserved without requiring new permissions',async()=>{
  const fake:typeof fetch=async(input,init)=>{
    assert.notEqual(init?.method,'PUT');
    return String(input).includes('/contents/')?Response.json({type:'file',content:'custom'}):Response.json({full_name:'coach/app'});
  };
  await ensureUpdateWorkflow('token','coach/app','main',['repo'],fake);
});
test('missing workflow scope, inaccessible repo and rejected writes never report setup success or echo secrets',async()=>{
  const noScope:typeof fetch=async input=>String(input).includes('/contents/')?new Response(null,{status:404}):Response.json({full_name:'coach/app'});
  await assert.rejects(ensureUpdateWorkflow('secret','coach/app','main',['repo'],noScope),/workflow izni/);
  await assert.rejects(ensureUpdateWorkflow('secret','coach/app','main',['workflow'],async()=>new Response('secret',{status:404})),error=>error instanceof Error&&!error.message.includes('secret'));
  const denied:typeof fetch=async(input,init)=>init?.method==='PUT'?new Response('secret',{status:403}):noScope(input,init);
  await assert.rejects(ensureUpdateWorkflow('secret','coach/app','main',['repo','workflow'],denied),error=>error instanceof Error&&!error.message.includes('secret'));
});
test('a concurrent creator is accepted after rereading but never overwritten',async()=>{
  let reads=0;let writes=0;
  const fake:typeof fetch=async(input,init)=>{
    if(!String(input).includes('/contents/'))return Response.json({full_name:'coach/app'});
    if(init?.method==='PUT'){writes++;return new Response(null,{status:422});}
    return ++reads===1?new Response(null,{status:404}):Response.json({type:'file'});
  };
  await ensureUpdateWorkflow('token','coach/app','main',['workflow'],fake);
  assert.equal(writes,1);assert.equal(reads,2);
});
