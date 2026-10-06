import{test}from'node:test';import assert from'node:assert/strict';
import{StartGate}from'./start-gate.ts';
test('starting acquisition needs consecutive fresh stable samples and resets on loss',()=>{
 const gate=new StartGate();
 for(let i=0;i<6;i++)assert.equal(gate.add(i*120,[180],true),false);
 gate.add(720,[],false);
 for(let i=0;i<9;i++)assert.equal(gate.add(840+i*120,[178],true),false);
 assert.equal(gate.add(1920,[178],true),true);
});
test('moving and duplicate samples cannot pass acquisition',()=>{
 const gate=new StartGate();
 for(let i=0;i<20;i++)assert.equal(gate.add(i*120,[180-i*3],true),false);
 const frozen=new StartGate();for(let i=0;i<20;i++)assert.equal(frozen.add(0,[180],true),false);
});
