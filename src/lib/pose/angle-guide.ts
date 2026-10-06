import type {Landmark} from './geometry.ts';
import type {PoseTask} from './protocols.ts';
export function angleGuide(points:Landmark[],width:number,height:number,task:PoseTask,side:'left'|'right'|'both'):{x:number;y:number;path:string;axis?:string}|null{
 const shoulder=side==='right'?12:11,hip=shoulder+12,knee=shoulder+14,ankle=shoulder+16;
 const pixel=(p:Landmark)=>({x:p.x*width,y:p.y*height});
 if(!(width>0 && height>0))return null;
 if(task==='front' || task==='side'){
  const ids=task==='front'?[11,12]:[shoulder,hip];
  const nodes=ids.map(i=>points[i]);if(nodes.some(p=>!p || p.visibility<.55 || !Number.isFinite(p.x+p.y)))return null;
  const a=pixel(nodes[0]!),b=pixel(nodes[1]!);const x=(a.x+b.x)/2,y=(a.y+b.y)/2,r=Math.max(12,width/18);
  return {x,y,path:`M ${a.x} ${a.y} L ${b.x} ${b.y}`,axis:task==='front'?`M ${x-r} ${y} H ${x+r}`:`M ${b.x} ${b.y-r} V ${b.y+r}`};
 }
 const ids=task==='hinge'?[shoulder,hip,knee]:task==='elbow'?[shoulder,shoulder+2,shoulder+4]:task.startsWith('shoulder')?[hip,shoulder,shoulder+2]:[hip,knee,ankle];
 const nodes=ids.map(i=>points[i]);if(nodes.some(p=>!p || p.visibility<.55 || !Number.isFinite(p.x+p.y)))return null;
 const a=pixel(nodes[0]!),b=pixel(nodes[1]!),c=pixel(nodes[2]!);
 const ux=a.x-b.x,uy=a.y-b.y,vx=c.x-b.x,vy=c.y-b.y,u=Math.hypot(ux,uy),v=Math.hypot(vx,vy);
 if(u<1 || v<1)return null;
 const r=Math.min(width/25,u*.4,v*.4),start={x:b.x+ux/u*r,y:b.y+uy/u*r},end={x:b.x+vx/v*r,y:b.y+vy/v*r};
 return {x:b.x,y:b.y,path:`M ${start.x} ${start.y} A ${r} ${r} 0 0 ${ux*vy-uy*vx>=0?1:0} ${end.x} ${end.y}`};
}
