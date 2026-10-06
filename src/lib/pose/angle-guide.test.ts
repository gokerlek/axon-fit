import{test}from'node:test';import assert from'node:assert/strict';
import{angleGuide}from'./angle-guide.ts';
const p=(x:number,y:number)=>({x,y,visibility:1});
test('angle guide follows the anatomical visible side and uses pixel coordinates',()=>{
 const points=Array.from({length:33},()=>p(.5,.5));points[24]=p(.5,.25);points[26]=p(.5,.5);points[28]=p(.75,.5);
 const guide=angleGuide(points,1000,500,'squat','right');assert.ok(guide);assert.equal(guide?.x,500);assert.equal(guide?.y,250);assert.ok(guide?.path.includes('A'));
 points[26]!.visibility=0;assert.equal(angleGuide(points,1000,500,'squat','right'),null);
});
