import{test}from'node:test';import assert from'node:assert/strict';import*as v from'valibot';
import{cameraMeasurementSchema,withCameraMeasurement}from'../schemas/camera-measurement.ts';
const record={id:'bca4a530-df9f-42ca-b0ce-dfaf1b977844',capturedAt:'2026-10-04T10:00:00.000Z',task:'side',protocol:2,model:'mediapipe-lite-v1',side:'left',width:1280,height:720,durationMs:6000,validSamples:45,totalSamples:48,repetitions:0,level:'manual',metrics:[{id:'trunk_tilt',median:5,minimum:4,maximum:6,range:2,spread:2}]};
test('camera record accepts only compact summary, rejects images and claimed validation',()=>{
 assert.equal(v.safeParse(cameraMeasurementSchema,record).success,true);
 assert.equal(v.safeParse(cameraMeasurementSchema,{...record,image:'base64'}).success,false);
 assert.equal(v.safeParse(cameraMeasurementSchema,{...record,validated:true}).success,false);
});
test('wrong metrics, impossible summary and incomplete dynamic tasks are rejected',()=>{
 assert.equal(v.safeParse(cameraMeasurementSchema,{...record,metrics:[{...record.metrics[0],id:'near_knee'}]}).success,false);
 assert.equal(v.safeParse(cameraMeasurementSchema,{...record,validSamples:70}).success,false);
 assert.equal(v.safeParse(cameraMeasurementSchema,{...record,task:'elbow',repetitions:1,metrics:[{...record.metrics[0],id:'near_elbow'}]}).success,false);
});
test('retry is idempotent and other health fields are preserved',()=>{
 const parsed=v.parse(cameraMeasurementSchema,record);const base={version:2 as const,checkIns:[],measurements:[]};
 const added=withCameraMeasurement(base,parsed);assert.equal(added.cameraMeasurements?.length,1);
 assert.equal(withCameraMeasurement(added,parsed),added);assert.equal(added.measurements,base.measurements);
});
test('camera summary round-trips through the health schema and stays in screening consent slice',async()=>{
 const {healthRecordSchema}=await import('../schemas/health.ts');
 const {healthSlice}=await import('../health-view.ts');
 const entry=v.parse(cameraMeasurementSchema,record);
 const base={version:2 as const,checkIns:[{date:'2026-10-04',painBaseline:0}],measurements:[]};
 assert.equal(v.safeParse(healthRecordSchema,base).success,true);
 const saved=v.parse(healthRecordSchema,JSON.parse(JSON.stringify(withCameraMeasurement(base,entry))));
 assert.deepEqual(saved.checkIns,base.checkIns);
 assert.deepEqual(healthSlice(saved,['screening']).cameraMeasurements,[entry]);
 assert.equal(healthSlice(saved,['measurements']).cameraMeasurements,undefined);
 assert.equal(healthSlice(saved,[]).cameraMeasurements,undefined);
 assert.throws(()=>withCameraMeasurement(saved,{...entry,width:720}),/CAMERA_ID_CONFLICT/);
});
test('history comparisons require same task, side, protocol and recorded chair conditions',async()=>{
 const {comparable}=await import('../schemas/camera-measurement.ts');
 const entry=v.parse(cameraMeasurementSchema,record);
 assert.equal(comparable(entry,{...entry,id:'ba08aa2c-4ba4-40bb-b4c1-0a2f18aa5211'}),true);
 assert.equal(comparable(entry,{...entry,side:'right'}),false);
 assert.equal(comparable(entry,{...entry,width:720,height:1280}),false);
 const chair={...entry,task:'sit_stand' as const};
 assert.equal(comparable(chair,chair),false);
 assert.equal(comparable({...chair,chairHeightCm:45,armSupport:false},{...chair,chairHeightCm:45,armSupport:true}),false);
 assert.equal(comparable({...chair,chairHeightCm:45,armSupport:false},{...chair,chairHeightCm:45,armSupport:false}),true);
});
test('trash and restore are idempotent, preserve all other health data and exclude trash from comparisons',async()=>{
 const {withCameraTrash,comparable}=await import('../schemas/camera-measurement.ts');
 const entry=v.parse(cameraMeasurementSchema,record);
 const base={version:2 as const,checkIns:[],measurements:[],cameraMeasurements:[entry]};
 const deleted=withCameraTrash(base,entry.id,true,'2026-10-05T10:00:00.000Z');
 assert.ok(deleted.cameraMeasurements?.[0]?.deletedAt);
 assert.equal(deleted.measurements,base.measurements);
 assert.equal(withCameraTrash(deleted,entry.id,true,'2026-10-05T11:00:00.000Z'),deleted);
 assert.equal(comparable(entry,deleted.cameraMeasurements![0]!),false);
 const restored=withCameraTrash(deleted,entry.id,false,'2026-10-05T10:00:00.000Z');
 assert.deepEqual(restored.cameraMeasurements,[entry]);
 assert.throws(()=>withCameraTrash(base,'missing',true,'2026-10-05T10:00:00.000Z'),/CAMERA_NOT_FOUND/);
});
