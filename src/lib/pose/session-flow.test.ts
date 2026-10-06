import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sessionReducer,initialSession} from './session-flow.ts';
test('queue preserves completed results on list return and resumes the next unfinished task',()=>{
 let s=sessionReducer(initialSession,{type:'start',tasks:['front','squat']});
 s=sessionReducer(s,{type:'result',id:'one'});
 s=sessionReducer(s,{type:'saved',id:'one'});
 s=sessionReducer(s,{type:'list'});
 assert.equal(s.results.front?.id,'one');
 s=sessionReducer(s,{type:'resume'});
 assert.equal(s.queue[s.index],'squat');
 assert.equal(s.stage,'prepare');
});
test('repeat keeps old result until replaced; skip advances and completion has an explicit summary',()=>{
 let s=sessionReducer(initialSession,{type:'start',tasks:['front','side']});
 s=sessionReducer(s,{type:'result',id:'one'});
 s=sessionReducer(s,{type:'repeat'});
 assert.equal(s.results.front?.id,'one');
 s=sessionReducer(s,{type:'result',id:'two'});
 assert.equal(s.results.front?.id,'two');
 s=sessionReducer(s,{type:'next'});
 assert.equal(s.queue[s.index],'side');
 s=sessionReducer(s,{type:'skip'});
 assert.equal(s.stage,'complete');
 assert.equal(s.results.front?.id,'two');
});
test('empty and duplicate selections cannot create broken queues',()=>{
 assert.equal(sessionReducer(initialSession,{type:'start',tasks:[]}),initialSession);
 assert.deepEqual(sessionReducer(initialSession,{type:'start',tasks:['side','side']}).queue,['side']);
});
