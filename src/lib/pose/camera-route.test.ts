import{test}from'node:test';import assert from'node:assert/strict';
import{saveCameraRoute,type CameraRouteDeps}from'./camera-route.ts';
import type{Client}from'../schemas/client.ts';
const headers=new Headers({origin:'http://localhost:3000','content-type':'application/json'});
const client={id:'c_testabc',modules:{health:{enabled:true,fields:['screening']}},consents:{health:{granted:true,fields:['screening'],version:'1',versions:{screening:'1'}}}} as unknown as Client;
let saved=0;
const deps:CameraRouteDeps={session:async()=>({role:'pt'}),loadClient:async()=>client,allowed:()=>true,save:async()=>{saved++;},now:()=>new Date('2026-10-04T10:00:00Z')};
const body={id:'bca4a530-df9f-42ca-b0ce-dfaf1b977844',capturedAt:'2026-10-04T10:00:00.000Z',task:'side',protocol:2,model:'mediapipe-lite-v1',side:'left',width:1280,height:720,durationMs:6000,validSamples:45,totalSamples:48,repetitions:0,level:'manual',metrics:[{id:'trunk_tilt',median:5,minimum:4,maximum:6,range:2,spread:2}]};
test('wrong origin, unauthenticated, another client and withdrawn consent never write',async()=>{
 for(const d of [{...deps,session:async()=>null},{...deps,session:async()=>({role:'client' as const,clientId:'c_another'})},{...deps,allowed:()=>false}]){const n=saved;assert.equal((await saveCameraRoute(d,headers,'http://localhost:3000','c_testabc',body)).status,403);assert.equal(saved,n);}
 const n=saved;assert.equal((await saveCameraRoute(deps,new Headers({'content-type':'application/json',origin:'https://evil.test'}),'http://localhost:3000','c_testabc',body)).status,403);assert.equal(saved,n);
});
test('valid owner saves; malformed and future measurements never write',async()=>{
 assert.equal((await saveCameraRoute(deps,headers,'http://localhost:3000','c_testabc',body)).status,201);
 const n=saved;assert.equal((await saveCameraRoute(deps,headers,'http://localhost:3000','c_testabc',{...body,image:'x'})).status,400);
 assert.equal((await saveCameraRoute(deps,headers,'http://localhost:3000','c_testabc',{...body,capturedAt:'2027-10-04T10:00:00.000Z'})).status,400);assert.equal(saved,n);
});
test('trash and restore use same ownership, origin and consent gates as saving',async()=>{
 const {trashCameraRoute}=await import('./camera-route.ts');
 let calls=0;
 const trash=async()=>{calls++;};
 const d={...deps,trash};const input={id:body.id,action:'trash'};
 assert.equal((await trashCameraRoute({...d,session:async()=>({role:'client',clientId:'c_another'})},headers,'http://localhost:3000','c_testabc',input)).status,403);
 assert.equal((await trashCameraRoute({...d,allowed:()=>false},headers,'http://localhost:3000','c_testabc',input)).status,403);
 assert.equal((await trashCameraRoute(d,new Headers({origin:'https://evil.test','content-type':'application/json'}),'http://localhost:3000','c_testabc',input)).status,403);
 assert.equal(calls,0);
 assert.equal((await trashCameraRoute(d,headers,'http://localhost:3000','c_testabc',input)).status,200);
 assert.equal((await trashCameraRoute(d,headers,'http://localhost:3000','c_testabc',{...input,action:'restore'})).status,200);
 assert.equal(calls,2);
});
