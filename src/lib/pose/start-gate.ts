/** Acquisition checks steadiness, not anatomical normality or exercise technique. */
export class StartGate {
 private samples:{at:number;values:number[]}[]=[];
 private last=-Infinity;
 add(at:number,values:number[],ready:boolean):boolean{
  if(!Number.isFinite(at)||at<=this.last)return false;
  const gap=at-this.last>500;this.last=at;
  if(!ready || !values.length || values.some(v=>!Number.isFinite(v))){this.samples=[];return false;}
  if(gap)this.samples=[];
  if(this.samples.length && values.length!==this.samples[0]!.values.length)this.samples=[];
  this.samples.push({at,values});
  const stable=values.every((_,index)=>{const all=this.samples.map(s=>s.values[index]!);return Math.max(...all)-Math.min(...all)<=4;});
  if(!stable){this.samples=[{at,values}];return false;}
  return this.samples.length>=8 && at-this.samples[0]!.at>=1000;
 }
}
