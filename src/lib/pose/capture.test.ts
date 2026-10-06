import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CaptureSession} from './capture.ts';
const metric=(degrees:number)=>[{id:'near_knee',label:'Diz',degrees},{id:'trunk_tilt',label:'Gövde',degrees:5}];
const add=(s:CaptureSession,values:number[],start=0)=>values.forEach((n,i)=>s.add(start+i*120,metric(n),true));
test('static measurement summarizes multiple samples rather than one frame',()=>{
 const s=new CaptureSession('front',0); for(let i=0;i<50;i++)s.add(i*120,[{id:'shoulder_tilt',label:'Omuz',degrees:i%2?4:6},{id:'trunk_tilt',label:'Gövde',degrees:2},{id:'hip_tilt',label:'Kalça',degrees:2}],true);
 const r=s.finish(6000);assert.equal(r.ok,true);if(r.ok){assert.equal(r.metrics[0]?.median,5);assert.ok(r.validSamples>20);}
});
test('one frame and poor coverage cannot be saved as completed measurement',()=>{
 const s=new CaptureSession('front',0);s.add(0,[],false);assert.equal(s.finish(6000).ok,false);
 const q=new CaptureSession('front',0);for(let i=0;i<50;i++)q.add(i*120,i<10?metric(90):[],i<10);assert.equal(q.finish(6000).ok,false);
});
test('dynamic ROM requires complete down-and-back repetitions, not static pose',()=>{
 const s=new CaptureSession('squat',0);add(s,Array(60).fill(180));assert.equal(s.finish(7200).ok,false);
 const q=new CaptureSession('squat',0);add(q,[180,180,180,160,130,100,130,160,180,180,180,160,130,100,130,160,180,180,180,160,130,100,130,160,180,180,180]);
 const r=q.finish(4000);assert.equal(r.ok,true);if(r.ok){assert.equal(r.repetitions,3);assert.equal(r.metrics[0]?.range,80);}
});
test('tracking gap cannot connect two incomplete halves into a repetition',()=>{
 const s=new CaptureSession('squat',0);add(s,[180,180,160,100]);s.add(700,[],false);add(s,[130,160,180],1000);assert.equal(s.finish(4000).ok,false);
});
test('slow cycles retain neutral endpoint and full ROM',()=>{
 const s=new CaptureSession('squat',0);
 const down=Array.from({length:17},(_,i)=>180-i*5),up=Array.from({length:16},(_,i)=>105+i*5);
 add(s,[180,180,180,...down,...up,...down,...up,...down,...up]);
 const r=s.finish(13000);assert.equal(r.ok,true);if(r.ok)assert.equal(r.metrics[0]?.range,80);
});
test('an unusable frame has no side identity and does not poison a side capture',()=>{
 const s=new CaptureSession('side',0);
 for(let i=0;i<50;i++)s.add(i*120,i===20?[]:[{id:'trunk_tilt',label:'Gövde',degrees:5}],i!==20,i===20?'both':'left');
 assert.equal(s.finish(6000).ok,true);
});
test('a genuinely changed visible side rejects a capture',()=>{
 const s=new CaptureSession('side',0);
 for(let i=0;i<50;i++)s.add(i*120,[{id:'trunk_tilt',label:'Gövde',degrees:5}],true,i===20?'right':'left');
 assert.equal(s.finish(6000).ok,false);
});
test('source dimension changes cannot be saved as one consistent capture',()=>{
 const s=new CaptureSession('side',0,{width:1280,height:720});
 for(let i=0;i<50;i++)s.add(i*120,[{id:'trunk_tilt',label:'Gövde',degrees:5}],true,'left',i===20?{width:720,height:1280}:{width:1280,height:720});
 assert.equal(s.finish(6000).ok,false);
});
test('phase exposes observed departure, return and tracking loss without judging exercise correctness',()=>{
 const s=new CaptureSession('squat',0);
 add(s,[180,180,180,180]);assert.equal(s.phase,'start');
 s.add(480,metric(140),true);assert.equal(s.phase,'away');
 s.add(600,metric(100),true);assert.equal(s.phase,'away');
 s.add(720,metric(140),true);assert.equal(s.phase,'return');
 s.add(840,[],false);assert.equal(s.phase,'lost');
 assert.equal(s.repetitions,0);
});
