export type Landmark = { x: number; y: number; visibility: number; presence?: number };
import { PROTOCOLS, type PoseTask } from './protocols.ts';
export type { PoseTask } from './protocols.ts';
export type Metric = { id: string; label: string; degrees: number };
export type Quality = 'ready' | 'no_person' | 'multiple' | 'cropped' | 'uncertain';
export type Analysis = { quality: Quality; metrics: Metric[]; side?:'left'|'right'|'both' };
export const qualityMessages: Record<Quality, string> = {
  ready: 'Vücut algılandı. Telefonun düz olduğunu kontrol et.',
  no_person: 'Vücut bulunamadı. Işığı artır; kameradan biraz uzaklaş.',
  multiple: 'Kadrajda birden fazla kişi var. Tek kişi kalmalı.',
  cropped: 'Başın ve ayakların dahil tüm vücudun görünmeli; biraz uzaklaş.',
  uncertain: 'Noktalar yeterince net değil. Kamerayı sabitle; eklemlerini görünür tut.',
};
const valid = (p: Landmark) => Number.isFinite(p.x) && Number.isFinite(p.y);
export function angleAt(a: Landmark, b: Landmark, c: Landmark, w: number, h: number): number | null {
  if (![a,b,c].every(valid) || !(w>0 && h>0 && Number.isFinite(w+h))) return null;
  const ax=(a.x-b.x)*w, ay=(a.y-b.y)*h, cx=(c.x-b.x)*w, cy=(c.y-b.y)*h;
  const length=Math.hypot(ax,ay)*Math.hypot(cx,cy);
  return length<1e-8 ? null : Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/length)))*180/Math.PI;
}
export function lineTilt(a: Landmark,b: Landmark,w: number,h: number): number | null {
  if (![a,b].every(valid) || !(w>0 && h>0)) return null;
  const dx=Math.abs((b.x-a.x)*w),dy=Math.abs((b.y-a.y)*h);
  return Math.hypot(dx,dy)<1e-8 ? null : Math.atan2(dy,dx)*180/Math.PI;
}
const midpoint=(a:Landmark,b:Landmark):Landmark=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,visibility:Math.min(a.visibility,b.visibility)});
const visible=(p:Landmark|undefined):p is Landmark=>!!p && valid(p) && p.visibility>=.55 && (p.presence??1)>=.55;
export function analyzePose(poses: Landmark[][], w:number,h:number,task:PoseTask):Analysis {
  const fail=(quality:Quality):Analysis=>({quality,metrics:[]});
  if (!poses.length) return fail('no_person');
  if (poses.length!==1) return fail('multiple');
  const p=poses[0]!;
  const score=(ids:number[])=>Math.min(...ids.map(i=>p[i]?.visibility??0));
  const near=score([11,23,25,27,31])>=score([12,24,26,28,32])?[11,23,25,27,31]:[12,24,26,28,32];
  const protocol=PROTOCOLS[task];
  const sided=protocol.view==='Yandan';
  const arm=task==='shoulder_flexion' || task==='elbow';
  const required=sided?[0,...near,...(arm?[near[0]!+2,near[0]!+4]:[])]:[0,11,12,23,24,25,26,27,28,31,32,...(task==='shoulder_abduction'?[13,14,15,16]:[])];
  if (!required.every(i=>visible(p[i])) || !(w>0 && h>0)) return fail('uncertain');
  if (required.some(i=>p[i]!.x<.02 || p[i]!.x>.98 || p[i]!.y<.02 || p[i]!.y>.98)) return fail('cropped');
  const metrics:Metric[]=[];
  const add=(id:string,label:string,degrees:number|null)=>{if(degrees!==null && Number.isFinite(degrees)) metrics.push({id,label,degrees});};
  if(task==='front') {
    add('shoulder_tilt','Omuz çizgisi · yataya göre',lineTilt(p[11]!,p[12]!,w,h));
    add('hip_tilt','Kalça çizgisi · yataya göre',lineTilt(p[23]!,p[24]!,w,h));
  }
  const shoulder=sided?p[near[0]!]!:midpoint(p[11]!,p[12]!);
  const hip=sided?p[near[1]!]!:midpoint(p[23]!,p[24]!);
  const tilt=lineTilt(shoulder,hip,w,h);
  if(protocol.metrics.includes('trunk_tilt'))add('trunk_tilt','Gövde ekseni · dikeye göre',tilt===null?null:90-tilt);
  if(protocol.metrics.includes('near_knee'))add('near_knee','Görünür diz · iç açı',angleAt(p[near[1]!]!,p[near[2]!]!,p[near[3]!]!,w,h));
  if(task==='hinge')add('near_hip','Kalça · gövde–bacak iç açısı',angleAt(shoulder,hip,p[near[2]!]!,w,h));
  if(task==='shoulder_flexion')add('near_shoulder','Kol · gövdeye göre kaldırma',angleAt(hip,shoulder,p[near[0]!+2]!,w,h));
  if(task==='elbow')add('near_elbow','Dirsek · iç açı',angleAt(shoulder,p[near[0]!+2]!,p[near[0]!+4]!,w,h));
  if(task==='shoulder_abduction'){
    add('left_shoulder','Sol kol · gövdeye göre kaldırma',angleAt(p[23]!,p[11]!,p[13]!,w,h));
    add('right_shoulder','Sağ kol · gövdeye göre kaldırma',angleAt(p[24]!,p[12]!,p[14]!,w,h));
  }
  return metrics.length===protocol.metrics.length?{quality:'ready',metrics,side:sided?(near[0]===11?'left':'right'):'both'}:fail('uncertain');
}
