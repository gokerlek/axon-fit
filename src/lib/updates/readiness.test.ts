import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireUpdateWorkflow} from './readiness.ts';

test('a cloned repo without the workflow gets a file-specific setup error before dispatch',async()=>{
  let actionsRead=false;
  await assert.rejects(requireUpdateWorkflow('coach/app',async()=>false,async()=>{actionsRead=true;return null;}),/\.github\/workflows\/axon-update.yml.*eksik/);
  assert.equal(actionsRead,false);
});
test('disabled fork workflows are distinguished from missing workflow files',async()=>{
  await assert.rejects(requireUpdateWorkflow('coach/app',async()=>true,async()=>({state:'disabled_manually'})),/devre dışı.*Enable workflow/);
  await assert.rejects(requireUpdateWorkflow('coach/app',async()=>true,async()=>null),/dosyası var.*Actions/);
});
test('only an active registered workflow permits dispatch',async()=>{
  await requireUpdateWorkflow('coach/app',async()=>true,async()=>({state:'active'}));
});
