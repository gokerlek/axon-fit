import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonth,shiftMonth} from './workout-calendar.ts';
import type {HistoryMonth,HistoryRow} from './session-history.ts';
const row=(id:string,day:string):HistoryRow=>({id,dayOfMonth:day,weekday:'',title:'Gün A',meta:'3 set',prs:0,otherDay:false,unfinished:false});
test('calendar keeps multiple sessions on one date and Monday-first leap-year alignment',()=>{
 const months:HistoryMonth[]=[{key:'2024-02',label:'Şubat',rows:[row('one','29'),row('two','29'),row('three','1')]}];
 const result=calendarMonth(months,'2024-02');
 assert.equal(result.cells[0],null);assert.equal(result.cells[3]?.date,'2024-02-01');
 assert.equal(result.days,2);assert.equal(result.sessions,3);
 assert.deepEqual(result.cells.find(x=>x?.date==='2024-02-29')?.rows.map(x=>x.id),['one','two']);
 assert.equal(result.cells.some(x=>x?.date==='2024-02-30'),false);
});
test('month navigation crosses years, empty months retain valid dates',()=>{
 assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
 const empty=calendarMonth([],'2026-10');assert.equal(empty.sessions,0);assert.equal(empty.cells.filter(Boolean).length,31);
});
