import {angleGuide} from '@/lib/pose/angle-guide';
import type {PoseTask} from '@/lib/pose/protocols';
import type { Detection } from './use-pose-detection';
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,31],[24,26],[26,28],[28,32]];
export function PoseOverlay({detection,task='front'}:{detection:Detection|null;task?:PoseTask}) {
  if(!detection || detection.state!=='tracking' || !detection.width) return null;
  const guide=detection.analysis.quality==='ready'?angleGuide(detection.poses[0]??[],detection.width,detection.height,task,detection.analysis.side??'both'):null;
  return <svg viewBox={`0 0 ${detection.width} ${detection.height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 size-full -scale-x-100" aria-hidden="true">
    {detection.poses.map((points,person)=><g key={person} fill="#38bdf8" stroke="#38bdf8" strokeWidth={Math.max(2,detection.width/320)}>
      {EDGES.map(([a,b])=>{const p=points[a!]!,q=points[b!]!;return p?.visibility>=.55 && q?.visibility>=.55?<line key={`${a}-${b}`} x1={p.x*detection.width} y1={p.y*detection.height} x2={q.x*detection.width} y2={q.y*detection.height}/>:null;})}
      {points.map((p,i)=>p.visibility>=.55?<circle key={i} cx={p.x*detection.width} cy={p.y*detection.height} r={Math.max(3,detection.width/160)} stroke="#082f49"/>:null)}
    </g>)}
    {guide?<g fill="none" stroke="currentColor" className="text-primary" strokeWidth={Math.max(3,detection.width/180)}><path d={guide.path}/>{guide.axis?<path d={guide.axis} strokeDasharray="8 5" strokeWidth={Math.max(2,detection.width/320)}/>:<circle cx={guide.x} cy={guide.y} r={Math.max(5,detection.width/120)}/>}</g>:null}
  </svg>;
}
