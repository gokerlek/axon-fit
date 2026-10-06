'use client';
import {useState,useSyncExternalStore} from 'react';
import {Button} from '@/components/ui/button';
import {PROTOCOLS,type PoseTask} from '@/lib/pose/protocols';
type Point=[number,number];
type Figure={head:Point;shoulder:Point;hip:Point;knee:Point;ankle:Point;elbow:Point;wrist:Point};
const stand:Figure={head:[90,32],shoulder:[90,62],hip:[90,120],knee:[90,171],ankle:[90,220],elbow:[99,101],wrist:[104,138]};
const poses:Record<PoseTask,Figure>={
 front:stand,side:stand,
 squat:{head:[57,67],shoulder:[63,96],hip:[64,143],knee:[113,164],ankle:[90,220],elbow:[100,92],wrist:[132,85]},
 knee:{...stand,knee:[90,171],ankle:[51,191]},
 hinge:{head:[145,110],shoulder:[122,112],hip:[68,129],knee:[83,173],ankle:[90,220],elbow:[117,147],wrist:[114,178]},
 shoulder_flexion:{...stand,elbow:[90,23],wrist:[90,4]},
 shoulder_abduction:{...stand,elbow:[126,56],wrist:[159,47]},
 elbow:{...stand,elbow:[99,101],wrist:[120,72]},
 sit_stand:{head:[74,54],shoulder:[74,84],hip:[74,139],knee:[125,139],ankle:[125,190],elbow:[92,119],wrist:[124,137]},
};
const subscribe=(listener:()=>void)=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);};
const reducedSnapshot=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function MovementReference({task,compact=false}:{task:PoseTask;compact?:boolean}){
 const [frame,setFrame]=useState<'loop'|'start'|'move'>('loop');
 const reduced=useSyncExternalStore(subscribe,reducedSnapshot,()=>true);
 const protocol=PROTOCOLS[task];const base:Figure=protocol.view==='Önden'?{...stand,knee:[111,171],ankle:[121,220],elbow:[117,98],wrist:[131,132]}:stand;const target:Figure=protocol.dynamic?{...poses[task],...(protocol.view==='Önden'?{knee:base.knee,ankle:base.ankle}:{})}:base;const moving=protocol.dynamic && !reduced && frame==='loop';const figure=frame==='move'?target:base;
 const points=(figure:Figure,keys:(keyof Figure)[])=>keys.map(key=>figure[key].join(',')).join(' ');
 const limb=(keys:(keyof Figure)[],accent=false)=><polyline points={points(figure,keys)} fill="none" stroke="currentColor" strokeWidth={accent?5:3} strokeLinecap="round" strokeLinejoin="round" className={accent?'text-primary':'text-foreground/65'}>{moving?<animate attributeName="points" values={`${points(base,keys)};${points(target,keys)};${points(base,keys)}`} dur="6s" repeatCount="indefinite"/>:null}</polyline>;
 const joint=task==='hinge'?'hip':task==='elbow'?'elbow':task.startsWith('shoulder')?'shoulder':'knee';
 return <figure className={`flex flex-col items-center gap-2 ${compact?'w-28 sm:w-40':'w-full max-w-64'}`}>
  <svg viewBox="0 0 180 246" role="img" aria-label={`${protocol.title}: başlangıç, hareket ve başlangıca dönüş örneği`} className={`${compact?'h-32 sm:h-44':'h-64'} w-full overflow-visible`}>
   <path d="M20 228H160" stroke="currentColor" className="text-border"/>
   {task==='sit_stand'?<path d="M28 142H79V221M28 103V221" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted-foreground"/>:null}
   <circle cx={figure.head[0]} cy={figure.head[1]} r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/65">{moving?<><animate attributeName="cx" values={`${base.head[0]};${target.head[0]};${base.head[0]}`} dur="6s" repeatCount="indefinite"/><animate attributeName="cy" values={`${base.head[1]};${target.head[1]};${base.head[1]}`} dur="6s" repeatCount="indefinite"/></>:null}</circle>
   {limb(['head','shoulder','hip'],task==='hinge' || task==='side')}
   {limb(['hip','knee','ankle'],['squat','knee','sit_stand'].includes(task))}
   {limb(['shoulder','elbow','wrist'],task.startsWith('shoulder') || task==='elbow')}
   {protocol.view==='Önden'?<g transform="translate(180 0) scale(-1 1)">{limb(['shoulder','elbow','wrist'],task==='shoulder_abduction')}{limb(['hip','knee','ankle'])}</g>:null}
   <circle cx={figure[joint][0]} cy={figure[joint][1]} r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" className="text-primary">{moving?<><animate attributeName="cx" values={`${base[joint][0]};${target[joint][0]};${base[joint][0]}`} dur="6s" repeatCount="indefinite"/><animate attributeName="cy" values={`${base[joint][1]};${target[joint][1]};${base[joint][1]}`} dur="6s" repeatCount="indefinite"/></>:null}</circle>
  </svg>
  {!compact && protocol.dynamic?<div className="flex flex-wrap justify-center gap-1" role="group" aria-label="Referans hareketin kareleri"><Button variant="ghost" size="sm" aria-pressed={frame==='start'} onClick={()=>setFrame('start')}>Başlangıç</Button><Button variant="ghost" size="sm" aria-pressed={frame==='move'} onClick={()=>setFrame('move')}>Hareket</Button><Button variant="ghost" size="sm" disabled={reduced} aria-pressed={frame==='loop' && !reduced} onClick={()=>setFrame('loop')}>Oynat</Button></div>:null}
  <figcaption className="text-center text-xs text-muted-foreground">{protocol.view} · {protocol.dynamic?'Başla → hareket et → geri dön':'Rahat ve sabit dur'}{!compact?<span className="mt-1 block">Temsili çizim; ulaşman gereken açı veya derinlik değildir.</span>:null}</figcaption>
 </figure>;
}
