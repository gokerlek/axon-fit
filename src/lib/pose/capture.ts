import type { Metric } from './geometry.ts';
import {PROTOCOLS,type PoseTask} from './protocols.ts';
export type MetricSummary={id:string;median:number;minimum:number;maximum:number;range:number;spread:number};
export type CaptureResult={ok:true;metrics:MetricSummary[];validSamples:number;totalSamples:number;durationMs:number;repetitions:number;side:'left'|'right'|'both';fps:number}|{ok:false;reason:string};
export const median=(values:number[])=>{const a=[...values].sort((x,y)=>x-y);const n=a.length;return n%2?a[Math.floor(n/2)]!:(a[n/2-1]!+a[n/2]!)/2;};
export class CaptureSession {
 private samples:Metric[][]=[];
 private cycles:Metric[][][]=[];
 private cycle:Metric[][]=[];
 private baseline:number[]=[];
 private approach:Metric[][]=[];
 private changedSource=false;
 readonly source?:{width:number;height:number};
 private observed:'acquiring'|'start'|'away'|'return'|'lost'='acquiring';
 private previousChange=0;
 get phase(){return this.observed;}
 private excursion=false;
 private count=0;
 private last=-Infinity;
 private side:'left'|'right'|'both'|null=null;
 private changedSide=false;
 readonly task:PoseTask;
 readonly startedAt:number;
 constructor(task:PoseTask,startedAt:number,source?:{width:number;height:number}){this.task=task;this.startedAt=startedAt;this.source=source;}
 get repetitions(){return this.cycles.length;}
 get validSamples(){return this.samples.length;}
 add(at:number,metrics:Metric[],ready:boolean,side:'left'|'right'|'both'='both',source?:{width:number;height:number}){
  if(!Number.isFinite(at) || at<this.startedAt || at<=this.last)return;
  this.count++;
  if(this.source && source && (this.source.width!==source.width || this.source.height!==source.height)){this.changedSource=true;return;}
  const gap=at-this.last>500;
  this.last=at;
  const protocol=PROTOCOLS[this.task];
  // Every required metric must belong to the same usable frame.
  const required=protocol.metrics.every(id=>metrics.some(m=>m.id===id && Number.isFinite(m.degrees) && m.degrees>=0 && m.degrees<=180));
  const usable=ready && required;
  if(!usable){this.observed='lost';this.excursion=false;this.cycle=[];this.approach=[];return;}
  if(this.side && this.side!==side){this.changedSide=true;return;}
  this.side??=side;
  if(this.samples.length>=1200)return;
  this.samples.push(metrics.map(m=>({...m})));
  if(!protocol.dynamic){this.observed='start';return;}
  const primary=metrics.find(m=>m.id===protocol.primary)!.degrees;
  if(this.baseline.length<3){this.baseline.push(primary);this.approach=[metrics];this.observed=this.baseline.length<3?'acquiring':'start';return;}
  if(gap){this.excursion=false;this.cycle=[];this.approach=[];}
  const change=protocol.direction*(primary-median(this.baseline));
  this.observed=change<=10?'start':this.excursion && change<this.previousChange-1?'return':'away';
  this.previousChange=change;
  if(!this.excursion){
   const start=this.approach[0]?.find(m=>m.id===protocol.primary)?.degrees;
   // Preserve the nearest neutral frame before departure, including slow ramps.
   if(change<=10 && (start===undefined || Math.abs(primary-median(this.baseline))<=Math.abs(start-median(this.baseline))))this.approach=[metrics];
   else if(this.approach.length)this.approach.push(metrics);
   if(change>=20 && this.approach.length>=2){this.excursion=true;this.cycle=this.approach;this.approach=[];}
  }else this.cycle.push(metrics);
  if(this.excursion && change<=10 && this.cycle.length>=4){this.cycles.push(this.cycle);this.cycle=[];this.excursion=false;this.approach=[metrics];this.observed='start';}
 }
 finish(at:number):CaptureResult {
  const durationMs=at-this.startedAt;
  const fps=this.samples.length/(durationMs/1000);
  if(this.changedSource)return {ok:false,reason:'Kamera yönü veya çözünürlüğü değişti. Telefonu aynı konumda sabitleyip yeniden başlat.'};
  if(this.changedSide)return {ok:false,reason:'Ölçüm sırasında taraf değişti. Aynı taraf kameraya dönük kalmalı; yeniden dene.'};
  if(durationMs<3000 || durationMs>120000 || this.samples.length<20 || fps<4 || this.samples.length/Math.max(1,this.count)<.7)return {ok:false,reason:'Yeterli net görüntü alınamadı. Kamerayı sabitle, ışığı ve kadrajı kontrol edip yeniden dene.'};
  const protocol=PROTOCOLS[this.task];
  if(protocol.dynamic && this.cycles.length<3)return {ok:false,reason:'Üç tam tekrar algılanmadı. Başlangıç konumuna dönerek yavaşça üç tekrar yap; hareketi zorlamadan yeniden dene.'};
  const ids=this.samples[0]!.map(m=>m.id);
  const metrics=ids.map(id=>{
   const all=this.samples.flatMap(row=>row.filter(m=>m.id===id).map(m=>m.degrees));
   const ranges=this.cycles.map(c=>{const a=c.flatMap(row=>row.filter(m=>m.id===id).map(m=>m.degrees));return Math.max(...a)-Math.min(...a);});
   return {id,median:median(all),minimum:Math.min(...all),maximum:Math.max(...all),range:protocol.dynamic?median(ranges):Math.max(...all)-Math.min(...all),spread:protocol.dynamic?Math.max(...ranges)-Math.min(...ranges):Math.max(...all)-Math.min(...all)};
  });
  if(!protocol.dynamic && metrics.some(m=>m.spread>5))return {ok:false,reason:'Duruş örnekleri fazla değişti. Sabit ve rahat durarak yeniden dene.'};
  return {ok:true,metrics,validSamples:this.samples.length,totalSamples:this.count,durationMs,repetitions:this.repetitions,side:this.side??'both',fps};
 }
}
