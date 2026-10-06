import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authoritativeRecords} from './record-set.ts';
test('saved draft cannot revive a server-trashed record in comparison candidates',()=>{
 const draft:{id:string;deletedAt?:string;value:number}={id:'one',value:1};
 const server={...draft,deletedAt:'2026-10-05T10:00:00.000Z'};
 assert.deepEqual(authoritativeRecords([server],[draft]),[server]);
});
test('confirmed trash/restore changes apply immediately while refresh is pending',()=>{
 const draft={id:'one',deletedAt:undefined};
 const removed=authoritativeRecords([], [draft],{one:true});
 assert.ok(removed[0]?.deletedAt);
 assert.equal(authoritativeRecords(removed,[],{one:false})[0]?.deletedAt,undefined);
 assert.equal(authoritativeRecords([], [draft]).length,1);
});
