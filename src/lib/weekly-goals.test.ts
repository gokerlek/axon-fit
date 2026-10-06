import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotGoals} from './weekly-goals.ts';
test('changing the current goal leaves previous weekly targets unchanged',()=>{
 const old=snapshotGoals({},['2026-09-01','2026-09-08'],3);
 assert.deepEqual(snapshotGoals(old,['2026-09-01','2026-09-08','2026-10-05'],5),{'2026-08-31':3,'2026-09-07':3,'2026-10-05':5});
});
