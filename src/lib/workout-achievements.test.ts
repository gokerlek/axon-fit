import {test} from 'node:test';
import assert from 'node:assert/strict';
import {achievementBaseline,achievementNotice} from './workout-achievements.ts';
import {sessionDoc,sessionEntry,workingSet} from './testing/session-fixtures.ts';
import {indexRowOf} from './session-index.ts';
const select={exerciseId:'bench-press',deviceId:undefined};
const doc=(kg:number,reps:number,count=1)=>sessionDoc({entries:[sessionEntry('e_aaaaaa',{sets:Array.from({length:count},(_,i)=>workingSet(`st_${String(i).padStart(8,'a')}`,i,{kg,reps}))})]});
const previous={...doc(50,10),id:'s_previous',status:'finished' as const,finishedAt:'2026-09-26T16:00:00Z'};
test('first exposure has no record or growth celebration; warmups do not count',()=>{
 assert.equal(achievementNotice(doc(0,0),doc(50,10),select,achievementBaseline([],[],select)),null);
 const baseline=achievementBaseline([indexRowOf(previous,'sha')],[previous],select);
 const after=doc(60,10);after.entries[0]!.sets[0]!.type='warmup';
 assert.equal(achievementNotice(sessionDoc(),after,select,baseline),null);
});
test('records use all matching device history and do not repeat equal achievements',()=>{
 const baseline=achievementBaseline([indexRowOf(previous,'sha')],[previous],select);
 const hit=achievementNotice(sessionDoc(),doc(60,10),select,baseline);
 assert.equal(hit?.kind,'record');assert.match(hit!.description,/60/);
 assert.equal(achievementNotice(doc(60,10),doc(60,10,2),select,baseline)?.kind,'progress');
 assert.equal(achievementNotice(doc(60,10),doc(60,10,2),select,baseline,[hit!.key,'bench-press@:progress']),null);
 const other=achievementBaseline([indexRowOf(previous,'sha')],[previous],{...select,deviceId:'machine-two'});
 assert.equal(achievementNotice(sessionDoc(),doc(60,10),select,other),null);
});
test('volume and set growth are factual progress, not personal records',()=>{
 const baseline=achievementBaseline([indexRowOf(previous,'sha')],[previous],select);
 const hit=achievementNotice(doc(40,10),doc(40,10,2),select,baseline);
 assert.equal(hit?.kind,'progress');assert.match(hit!.description,/2 set/);assert.match(hit!.description,/800/);
 assert.equal(achievementNotice(doc(40,10,2),doc(40,10,3),select,baseline,[hit!.key]),null);
});
