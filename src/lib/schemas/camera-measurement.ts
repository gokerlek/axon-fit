import * as v from 'valibot';
import {POSE_TASKS,PROTOCOLS,POSE_PROTOCOL} from '../pose/protocols.ts';
import type {HealthRecord} from './health.ts';
const finite=(max:number)=>v.pipe(v.number(),v.finite(),v.minValue(0),v.maxValue(max));
const integer=(min:number,max:number)=>v.pipe(finite(max),v.integer(),v.minValue(min));
export const cameraMetricSchema=v.pipe(v.strictObject({
 id:v.pipe(v.string(),v.maxLength(32)),median:finite(180),minimum:finite(180),maximum:finite(180),range:finite(180),spread:finite(180),
}),v.check(m=>m.minimum<=m.median && m.median<=m.maximum && m.range<=m.maximum-m.minimum+.01 && m.spread<=m.maximum-m.minimum+.01,'Ölçüm özeti tutarsız.'));
export const cameraMeasurementSchema=v.pipe(v.strictObject({
 id:v.pipe(v.string(),v.uuid()),capturedAt:v.pipe(v.string(),v.isoTimestamp()),task:v.picklist(POSE_TASKS),
 protocol:v.literal(POSE_PROTOCOL),model:v.literal('mediapipe-lite-v1'),side:v.picklist(['left','right','both']),
 width:integer(1,7680),height:integer(1,7680),durationMs:integer(3000,120000),
 validSamples:integer(20,1200),totalSamples:integer(20,1500),repetitions:integer(0,60),level:v.literal('manual'),
 deletedAt:v.optional(v.pipe(v.string(),v.isoTimestamp())),
 chairHeightCm:v.optional(v.pipe(finite(100),v.minValue(20))),armSupport:v.optional(v.boolean()),
 metrics:v.pipe(v.array(cameraMetricSchema),v.minLength(1),v.maxLength(6)),
}),v.check(r=>r.validSamples<=r.totalSamples && r.validSamples/r.totalSamples>=.7 && r.validSamples/(r.durationMs/1000)>=4,'Yeterli örnek yok.'),
 v.check(r=>{const p=PROTOCOLS[r.task];return r.metrics.length===p.metrics.length && p.metrics.every(id=>r.metrics.some(m=>m.id===id)) && (p.dynamic?r.repetitions>=3:r.repetitions===0) && (p.view==='Önden'?r.side==='both':r.side!=='both') && (r.task==='sit_stand' || (r.chairHeightCm===undefined && r.armSupport===undefined));},'Görev ve ölçüm sonucu eşleşmiyor.'));
export type CameraMeasurement=v.InferOutput<typeof cameraMeasurementSchema>;
export const CAMERA_RECORD_LIMIT=2000;
export function withCameraMeasurement(record:HealthRecord,entry:CameraMeasurement):HealthRecord {
 const list=record.cameraMeasurements??[];
 const existing=list.find(r=>r.id===entry.id);
 if(existing){if(JSON.stringify(existing)!==JSON.stringify(entry))throw new Error('CAMERA_ID_CONFLICT');return record;}
 if(list.length>=CAMERA_RECORD_LIMIT)throw new Error('CAMERA_LIMIT');
 return {...record,cameraMeasurements:[entry,...list]};
}
export function comparable(a:CameraMeasurement,b:CameraMeasurement):boolean {
 return !a.deletedAt && !b.deletedAt && a.protocol===b.protocol && a.model===b.model && a.task===b.task && a.side===b.side && a.width===b.width && a.height===b.height && a.level===b.level && (a.task!=='sit_stand' || (a.chairHeightCm!==undefined && a.chairHeightCm===b.chairHeightCm && a.armSupport===b.armSupport));
}

export function withCameraTrash(record:HealthRecord,id:string,deleted:boolean,at:string):HealthRecord {
 const entry=record.cameraMeasurements?.find(r=>r.id===id);
 if(!entry)throw new Error('CAMERA_NOT_FOUND');
 if(Boolean(entry.deletedAt)===deleted)return record;
 const updated={...entry};
 if(deleted)updated.deletedAt=at;else delete updated.deletedAt;
 return {...record,cameraMeasurements:record.cameraMeasurements!.map(r=>r.id===id?updated:r)};
}
