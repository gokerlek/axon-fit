'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {PROTOCOLS,POSE_PROTOCOL,type PoseTask} from '@/lib/pose/protocols';
import {MOVEMENT_CUES} from '@/lib/pose/guidance';
import {CaptureSession} from '@/lib/pose/capture';
import {StartGate} from '@/lib/pose/start-gate';
import type {CameraMeasurement} from '@/lib/schemas/camera-measurement';
import type {Detection} from './use-pose-detection';
type Mode='idle'|'countdown'|'acquiring'|'measuring';
export function CameraCapturePanel({detection,task,enabled,chairHeight,armSupport,onComplete,onBusyChange}:{detection:Detection|null;task:PoseTask;enabled:boolean;chairHeight?:number;armSupport:boolean;onComplete:(result:CameraMeasurement)=>void;onBusyChange:(busy:boolean)=>void}){
 const latest=useRef(detection);
 const interval=useRef<ReturnType<typeof setInterval>|null>(null);
 const capture=useRef<CaptureSession|null>(null);
 const modeRef=useRef<Mode>('idle');
 const [mode,setMode]=useState<Mode>('idle');
 const [progress,setProgress]=useState({seconds:0,repetitions:0});
 const [cue,setCue]=useState('Hazır olduğunda ölçümü başlat.');
 const [error,setError]=useState<string|null>(null);
 const [sound,setSound]=useState(false);
 const lastSpeech=useRef('');const lastSpokenAt=useRef(-Infinity);
 const protocol=PROTOCOLS[task];const instruction=MOVEMENT_CUES[task];
 useEffect(()=>{latest.current=detection;},[detection]);
 useEffect(()=>()=>{if(interval.current)clearInterval(interval.current);capture.current=null;if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();onBusyChange(false);},[onBusyChange]);
 function say(text:string){
  setCue(text);
  if(sound && text!==lastSpeech.current && performance.now()-lastSpokenAt.current>900 && typeof speechSynthesis!=='undefined'){
   lastSpeech.current=text;lastSpokenAt.current=performance.now();speechSynthesis.cancel();const speech=new SpeechSynthesisUtterance(text);speech.lang='tr-TR';speechSynthesis.speak(speech);
  }
 }
 function stop(){
  if(interval.current)clearInterval(interval.current);interval.current=null;capture.current=null;modeRef.current='idle';setMode('idle');onBusyChange(false);
  if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();lastSpeech.current='';
 }
 function finish(){
  const session=capture.current;if(!session)return;
  const frame=latest.current;
  if(frame?.state==='tracking')session.add(frame.sampledAt,frame.analysis.metrics,frame.analysis.quality==='ready',frame.analysis.side??'both',{width:frame.width,height:frame.height});
  const result=session.finish(performance.now());stop();
  if(!result.ok){setError(result.reason);setCue('Ölçüm tamamlanamadı. Aynı hareketi yeniden deneyebilirsin.');return;}
  onComplete({id:crypto.randomUUID(),capturedAt:new Date().toISOString(),task,protocol:POSE_PROTOCOL,model:'mediapipe-lite-v1',side:result.side,width:session.source!.width,height:session.source!.height,durationMs:Math.round(result.durationMs),validSamples:result.validSamples,totalSamples:result.totalSamples,repetitions:result.repetitions,level:'manual',metrics:result.metrics,...(task==='sit_stand'?{armSupport,...(chairHeight!==undefined?{chairHeightCm:chairHeight}:{})}:{})});
 }
 function start(){
  const first=latest.current;
  if(!enabled || modeRef.current!=='idle' || first?.state!=='tracking' || first.analysis.quality!=='ready')return;
  if(task==='sit_stand' && chairHeight!==undefined && (!Number.isFinite(chairHeight) || chairHeight<20 || chairHeight>100)){setError('Sandalye yüksekliği 20–100 cm arasında olmalı; bilmiyorsan boş bırak.');return;}
  setError(null);setProgress({seconds:0,repetitions:0});onBusyChange(true);
  modeRef.current='countdown';setMode('countdown');const began=performance.now();const gate=new StartGate();let lastAt=-1,lastReps=0;
  say(`3 · ${instruction.start}`);
  interval.current=setInterval(()=>{
   const now=performance.now(),frame=latest.current;
   const ready=frame?.state==='tracking' && frame.analysis.quality==='ready' && now-frame.sampledAt<500;
   if(modeRef.current==='countdown'){
    if(now-began<3000){say(`${Math.max(1,3-Math.floor((now-began)/1000))} · ${instruction.start}`);return;}
    modeRef.current='acquiring';setMode('acquiring');
   }
   if(modeRef.current==='acquiring'){
    say(ready?'Başlangıç konumunda sabit kal; ölçüm hazırlanıyor.':'Vücut net görünmüyor. Kadrajı kontrol et.');
    if(now-began>18000){stop();setError('Sabit başlangıç örnekleri alınamadı. Kadrajı ve ışığı kontrol edip yeniden dene.');return;}
    if(frame && frame.sampledAt!==lastAt){lastAt=frame.sampledAt;
     if(gate.add(frame.sampledAt,frame.analysis.metrics.map(m=>m.degrees),Boolean(ready))){
      capture.current=new CaptureSession(task,now,{width:frame.width,height:frame.height});modeRef.current='measuring';setMode('measuring');say('Ölçüm başladı; başlangıç konumunu bir an koru.');
     }
    }
    return;
   }
   const session=capture.current;if(!session)return;
   if(frame?.state==='tracking')session.add(frame.sampledAt,frame.analysis.metrics,Boolean(ready),frame.analysis.side??'both',{width:frame.width,height:frame.height});
   setProgress({seconds:Math.floor((now-session.startedAt)/1000),repetitions:session.repetitions});
   if(!ready)say('Görüntü kayboldu; bu sırada tekrar sayılmıyor.');
   else if(session.repetitions>lastReps){lastReps=session.repetitions;say(`${lastReps} tekrar tamamlandı. ${instruction.start}`);}
   else if(protocol.dynamic && session.phase==='return')say(instruction.back);
   else if(protocol.dynamic && session.phase==='away')say(instruction.away);
   else if(protocol.dynamic && lastReps===0 && session.phase==='start')say(instruction.away);
   if(now-session.startedAt>=(protocol.dynamic?30000:6000) || (protocol.dynamic && session.repetitions>=3 && now-session.startedAt>=3000))finish();
  },120);
 }
 const busy=mode!=='idle';
 return <div className="flex flex-col gap-2" aria-label="Ölçüm kontrolleri">
  <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><p role="status" className="text-sm font-medium leading-5">{cue}</p><p className="whitespace-nowrap font-mono text-sm tabular-nums">{progress.seconds} sn{protocol.dynamic?` · ${progress.repetitions}/3`:''}</p></div>
  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
   <Button className="h-11" disabled={mode==='idle' && (!enabled || detection?.state!=='tracking' || detection.analysis.quality!=='ready')} onClick={busy?(mode==='measuring'?finish:()=>{stop();setCue('Ölçüm iptal edildi. Yeniden başlatabilirsin.');}):start}>{mode==='measuring'?'Ölçümü bitir':busy?'Hazırlığı iptal et':'Ölçümü başlat'}</Button>
   <label className="flex min-h-11 items-center gap-2 text-xs"><Checkbox checked={sound} disabled={busy} onCheckedChange={setSound}/>Sesli rehber</label>
  </div>
  <div className="h-10 overflow-y-auto text-xs leading-4"><p role={error?'alert':undefined} className={error?'text-destructive':'text-muted-foreground'}>{error??(protocol.dynamic?'Üç tam döngü · En fazla 30 sn · Rahat sınırında hareket et.':'6 sn rahat duruş · Görüntü saklanmaz.')}</p></div>
 </div>;
}
