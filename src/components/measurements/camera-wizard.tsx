'use client';
import Link from 'next/link';
import {createPortal} from 'react-dom';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useReducer,useRef,useState,useSyncExternalStore} from 'react';
import {ArrowLeft,ArrowRight,Camera,Check,X} from '@phosphor-icons/react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {UnsavedChangesGuard} from '@/components/unsaved-changes-guard';
import {CameraPreviewSession,cameraErrorMessage} from '@/lib/camera-preview';
import {qualityMessages} from '@/lib/pose/geometry';
import {PROTOCOLS,POSE_TASKS,METRIC_LABELS,type PoseTask} from '@/lib/pose/protocols';
import {MOVEMENT_CUES,METRIC_EXPLANATIONS,measurementMeaning} from '@/lib/pose/guidance';
import {authoritativeRecords} from '@/lib/pose/record-set';
import {initialSession,sessionReducer} from '@/lib/pose/session-flow';
import {comparable,type CameraMeasurement} from '@/lib/schemas/camera-measurement';
import {CameraCapturePanel} from './camera-capture-panel';
import {MovementReference} from './movement-reference';
import {CameraHistory} from './camera-history';
import {PoseOverlay} from './pose-overlay';
import {usePoseDetection} from './use-pose-detection';
const SETTINGS_EVENT='axon-camera-settings';
function subscribe(listener:()=>void){window.addEventListener('storage',listener);window.addEventListener(SETTINGS_EVENT,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(SETTINGS_EVENT,listener);};}
function readSetting(key:string){try{return localStorage.getItem(key)??'';}catch{return '';}}
function writeSetting(key:string,value:string){try{localStorage.setItem(key,value);}catch{}window.dispatchEvent(new Event(SETTINGS_EVENT));}
export function CameraWizard({manualHref,backHref,manualLabel='Manuel ölçüm gir',clientId,clientName,records=[],timeZone='Europe/Istanbul',initialTask='front',backLabel='Ölçüm merkezine dön'}:{manualHref:string;backHref:string;manualLabel?:string;clientId:string;clientName?:string;records?:CameraMeasurement[];timeZone?:string;initialTask?:PoseTask;backLabel?:string}){
 const [flow,dispatch]=useReducer(sessionReducer,initialSession);
 const [selected,setSelected]=useState<PoseTask[]>([initialTask]);
 const [drafts,setDrafts]=useState<Record<string,CameraMeasurement>>({});
 const [trashChanges,setTrashChanges]=useState<Record<string,boolean>>({});
 const [savedIds,setSavedIds]=useState<string[]>([]);
 const [saving,setSaving]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [status,setStatus]=useState<'idle'|'requesting'|'active'|'error'>('idle');
 const [session]=useState(()=>new CameraPreviewSession<MediaStream>());
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
 const [deviceId,setDeviceId]=useState('');
 const [checks,setChecks]=useState([false,false,false]);
 const [capturing,setCapturing]=useState(false);
 const [chairHeight,setChairHeight]=useState('');const [armSupport,setArmSupport]=useState(false);
 const videoRef=useRef<HTMLVideoElement>(null);
 const headingRef=useRef<HTMLHeadingElement>(null);
 const requestTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const openRef=useRef(false);
 const consentKey=`axon-camera-processing-v1:${clientId}`;
 const consent=useSyncExternalStore(subscribe,()=>readSetting(consentKey)==='yes',()=>false);
 const router=useRouter();
 const taskId=flow.queue[flow.index]??'front',task=PROTOCOLS[taskId];
 const inSession=flow.stage!=='list';
 const detection=usePoseDetection(videoRef,status==='active' && flow.stage==='capture',taskId,session.stream);
 const resultId=flow.results[taskId]?.id;const result=resultId?drafts[resultId]:undefined;
 const pending=Object.values(drafts).filter(record=>!savedIds.includes(record.id));
 const completeRecords=Object.values(flow.results).flatMap(r=>r && drafts[r.id]?[drafts[r.id]!]:[]);
 const release=useCallback(()=>{session.stop();if(requestTimer.current)clearTimeout(requestTimer.current);requestTimer.current=null;if(videoRef.current)videoRef.current.srcObject=null;openRef.current=false;},[session]);
 const stop=useCallback(()=>{release();setStatus('idle');setChecks([false,false,false]);setCapturing(false);},[release]);
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState!=='visible')stop();};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
  return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);release();};
 },[release,stop]);
 useEffect(()=>{
  const video=videoRef.current;if(video && status==='active' && flow.stage==='capture')video.srcObject=session.stream;
  return()=>{if(video)video.srcObject=null;};
 },[status,session,flow.stage]);
 useEffect(()=>{
  if(!inSession)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';
  const siblings=Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement && !node.hasAttribute('data-camera-session')).map(node=>({node,inert:node.inert}));
  siblings.forEach(({node})=>{node.inert=true;});headingRef.current?.focus();
  return()=>{document.body.style.overflow=before;siblings.forEach(({node,inert})=>{node.inert=inert;});};
 },[inSession,flow.stage]);
 useEffect(()=>{
  if(!pending.length)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[pending.length]);
 useEffect(()=>{
  if(!navigator.mediaDevices?.enumerateDevices)return;
  let disposed=false;const refresh=()=>{void navigator.mediaDevices.enumerateDevices().then(all=>{if(!disposed)setDevices(all.filter(d=>d.kind==='videoinput'));}).catch(()=>{});};
  refresh();navigator.mediaDevices.addEventListener('devicechange',refresh);
  return()=>{disposed=true;navigator.mediaDevices.removeEventListener('devicechange',refresh);};
 },[status]);
 async function openCamera(chosen=deviceId){
  if(!consent || openRef.current)return;
  if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){setError('Kamera için HTTPS veya localhost gerekir. Manuel ölçümle devam edebilirsin.');return;}
  release();openRef.current=true;setStatus('requesting');setError(null);setChecks([false,false,false]);
  const stored=chosen || readSetting('axon-camera-device-v1');
  const present=stored && devices.some(d=>d.deviceId===stored);
  requestTimer.current=setTimeout(()=>{release();setStatus('error');setError('Kamera izni bekleniyor. Tarayıcının izin penceresini kontrol edip yeniden dene.');},30000);
  try{
   const stream=await session.open(()=>navigator.mediaDevices.getUserMedia({audio:false,video:{...(present?{deviceId:{exact:stored}}:{facingMode:'user'}),width:{ideal:1280},height:{ideal:720}}}));
   if(!stream)return;
   if(requestTimer.current)clearTimeout(requestTimer.current);requestTimer.current=null;openRef.current=false;
   if(document.visibilityState!=='visible'){stop();return;}
   stream.getVideoTracks().forEach(track=>track.addEventListener('ended',stop,{once:true}));
   const actual=stream.getVideoTracks()[0]?.getSettings().deviceId??'';setDeviceId(actual);writeSetting('axon-camera-device-v1',actual);setStatus('active');dispatch({type:'capture'});
  }catch(cause){release();setStatus('error');setError(cameraErrorMessage(cause));}
 }
 function list(){stop();setError(null);dispatch({type:'list'});}
 function start(tasks=selected){setError(null);dispatch({type:'start',tasks});}
 function advance(type:'next'|'skip'){setError(null);if(flow.index===flow.queue.length-1)stop();dispatch({type});}
 function prepareNext(){advance('next');}
 function repeat(task:PoseTask){setSelected([task]);setError(null);dispatch({type:'start',tasks:[task]});}
 async function save(record:CameraMeasurement,advance=false){
  if(saving)return;if(savedIds.includes(record.id)){if(advance)prepareNext();return;}
  setSaving(record.id);setError(null);
  try{
   const response=await fetch(`/api/clients/${clientId}/camera-measurements`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
   const body=await response.json();if(!response.ok)throw new Error(body.error??'Ölçüm kaydedilemedi.');
   setSavedIds(ids=>[...ids,record.id]);dispatch({type:'saved',id:record.id});router.refresh();if(advance)prepareNext();
  }catch(cause){setError(cause instanceof Error?cause.message:'Kaydetme tamamlanamadı. Sonuç burada duruyor; yeniden deneyebilirsin.');}
  finally{setSaving(null);}
 }
 const cameraPicker=<label className="flex min-w-0 items-center gap-2 text-xs"><Camera className="size-4 shrink-0"/><span className="sr-only">Kamera seç</span><select aria-label="Kamera seç" className="h-10 min-w-0 max-w-48 rounded-lg border bg-background px-2 text-sm" value={deviceId} disabled={capturing || status==='requesting'} onChange={event=>{const id=event.target.value;setDeviceId(id);writeSetting('axon-camera-device-v1',id);if(status==='active')void openCamera(id);}}><option value="">Varsayılan kamera</option>{devices.map((device,index)=><option key={device.deviceId || index} value={device.deviceId}>{device.label || `Kamera ${index+1}`}</option>)}</select></label>;
 function resultContent(record:CameraMeasurement){
  const protocol=PROTOCOLS[record.task];
  const previous=authoritativeRecords(records,Object.values(drafts).filter(r=>savedIds.includes(r.id)),trashChanges).filter(r=>r.id!==record.id && r.capturedAt<record.capturedAt && comparable(r,record)).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt))[0];
  return <div className="flex flex-col gap-5">
   <p className="text-sm text-muted-foreground">{measurementMeaning(record.task)} {protocol.view} çekim · {record.repetitions?`${record.repetitions} tamamlanan tekrar`:'Rahat duruş'}.</p>
   <dl className="flex flex-col divide-y">{record.metrics.map(metric=>{
    const value=protocol.dynamic?metric.range:metric.median;const before=previous?.metrics.find(m=>m.id===metric.id);const delta=before?value-(protocol.dynamic?before.range:before.median):null;
    return <div key={metric.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-4"><dt className="font-medium">{METRIC_LABELS[metric.id]}{protocol.dynamic?' · açı değişimi':''}</dt><dd className="text-2xl font-semibold tabular-nums">{value.toFixed(1)}°</dd><dd className="col-span-2 max-w-2xl text-sm text-muted-foreground">{METRIC_EXPLANATIONS[metric.id]}{delta!==null?<span className="mt-1 block">Önceki aynı koşuldaki kayda göre {delta>0?'+':''}{delta.toFixed(1)}°. Fark tek başına gelişim veya gerileme göstermez.</span>:null}</dd></div>;
   })}</dl>
   <p className="text-sm">Bu kayıt PT’nin hareketini ve önceki ölçümlerini birlikte incelemesine yardımcı olur. Doğru/yanlış hareket puanı veya klinik kabul sınırı değildir.</p>
   <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Ölçüm koşulları ve teknik bilgiler</summary><p className="mt-2 text-xs text-muted-foreground">{record.side==='both'?'İki taraf':record.side==='left'?'Sol taraf':'Sağ taraf'} · {(record.durationMs/1000).toFixed(1)} sn · {record.validSamples}/{record.totalSamples} net örnek · {record.width}×{record.height} · Protokol {record.protocol} · 2D tahmin. Kamera eğimi ve perspektif sonucu etkiler. Görüntü saklanmaz.</p></details>
  </div>;
 }
 const overlay=inSession?<div role="dialog" aria-modal="true" aria-labelledby="camera-session-title" data-camera-session="true" className="fixed inset-0 z-[70] flex h-dvh flex-col bg-background text-foreground" onKeyDown={event=>{if(event.key==='Escape' && !capturing && !saving)list();}}>
  <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
   <div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{clientName?`${clientName} · `:''}{flow.index+1}/{flow.queue.length} analiz</p><h2 id="camera-session-title" ref={headingRef} tabIndex={-1} className="truncate font-heading text-lg font-semibold outline-none">{flow.stage==='complete'?'Analiz oturumu özeti':task.title}</h2></div>
   <Button variant="ghost" className="size-11 shrink-0" aria-label="Analiz listesine dön" disabled={capturing || Boolean(saving)} onClick={list}><X/></Button>
  </header>
  {flow.stage==='capture'?<>
   <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">{cameraPicker}<Button variant="ghost" size="sm" disabled={capturing} onClick={()=>{stop();dispatch({type:'repeat'});}}>{status==='active'?'Kamerayı kapat':'Hazırlığa dön'}</Button></div>
   {!checks.every(Boolean)?<div className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 border-b px-4 py-3 text-xs" aria-label="Çekim konumunu doğrula">{['Başım ve ayaklarım kadrajda.','Telefon düz ve sabit duruyor.','Işık yeterli; eklemlerim görünür.'].map((label,index)=><label key={label} className="flex min-h-9 items-center gap-2"><Checkbox checked={checks[index]} disabled={status!=='active'} onCheckedChange={value=>setChecks(current=>current.map((old,i)=>i===index?value:old))}/>{label}</label>)}</div>:null}
   <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
    <video ref={videoRef} autoPlay muted playsInline aria-label="Canlı kamera önizlemesi" onError={()=>{stop();setError('Önizleme açılamadı. Kamerayı yeniden aç.');}} className="absolute inset-0 size-full object-contain -scale-x-100"/>
    <PoseOverlay detection={detection} task={taskId}/>
    <div className="absolute top-3 left-3 right-3 flex flex-wrap justify-between gap-2"><p className="max-w-lg rounded-lg bg-background/95 px-3 py-2 text-xs" role="status">{error??(status!=='active'?'Kamera kapalı. Yeniden açmak için hazırlığa dön.':detection?.state==='error'?'Algılama yüklenemedi. Kamerayı yeniden aç.':detection?.state!=='tracking'?'Vücut algılama hazırlanıyor…':qualityMessages[detection.analysis.quality])}</p><span className="rounded-lg bg-background/95 px-2 py-2 text-xs">{task.view} · Aynalı önizleme</span></div>
    <div className="absolute right-3 bottom-3 rounded-xl border bg-background/95 p-2"><MovementReference key={taskId} task={taskId} compact/></div>
    <div className="absolute bottom-3 left-3 flex max-w-[55%] flex-col gap-1 rounded-lg bg-background/95 p-2" aria-label="Canlı açılar">{task.metrics.map(id=>{const metric=detection?.analysis.quality==='ready'?detection.analysis.metrics.find(m=>m.id===id):null;return <p key={id} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 text-xs"><span>{METRIC_LABELS[id]}</span><span className="text-right font-mono tabular-nums">{metric?`${metric.degrees.toFixed(1)}°`:'—'}</span></p>;})}</div>
   </div>
   <footer className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
    <div className="mx-auto max-w-4xl"><CameraCapturePanel key={`${session.stream?.id}-${taskId}-${checks.every(Boolean)}`} detection={detection} task={taskId} enabled={status==='active' && checks.every(Boolean)} chairHeight={chairHeight?Number(chairHeight):undefined} armSupport={armSupport} onBusyChange={setCapturing} onComplete={record=>{setDrafts(all=>({...all,[record.id]:record}));dispatch({type:'result',id:record.id});}}/></div>
   </footer>
  </>:<>
   <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-4xl">
     {error?<p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>:null}
     {flow.stage==='prepare'?<div className="grid items-start gap-6 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="flex justify-center rounded-xl bg-muted/30 p-4"><MovementReference key={taskId} task={taskId}/></div>
      <div className="flex flex-col gap-5"><div><h3 className="font-semibold">Nasıl yapacaksın?</h3><p className="mt-2 text-sm">{MOVEMENT_CUES[taskId].start}</p><ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm">{task.dynamic?<><li>{MOVEMENT_CUES[taskId].away}</li><li>{MOVEMENT_CUES[taskId].back}</li><li>Üç kez tekrarla. Hareketi zorlamadan, rahat sınırında yap.</li></>:<li>Altı saniye rahat ve sabit dur; kendini zorla düzeltme.</li>}</ol></div>
       <div><h3 className="font-semibold">Neyi ölçeceğiz?</h3><p className="mt-2 text-sm text-muted-foreground">{task.metrics.map(id=>METRIC_LABELS[id]).join(', ')}. {measurementMeaning(taskId)}</p></div>
       <div className="flex flex-col gap-3"><p className="text-sm">Telefonu düz ve sabit tut. {task.view} çekim yap; başın ve ayakların kadrajda kalsın.</p>{cameraPicker}
        {!consent?<label className="flex items-start gap-3 text-sm"><Checkbox checked={consent} onCheckedChange={value=>writeSetting(consentKey,value?'yes':'no')}/>Görüntünün yalnız bu cihazda açı analizi için işlenmesine izin veriyorum. Görüntü saklanmaz.</label>:<p className="text-xs text-muted-foreground">Cihazda işleme onayı hatırlandı. <button type="button" className="underline" onClick={()=>{writeSetting(consentKey,'no');stop();}}>Onayı geri çek</button></p>}
        <p className="text-xs text-muted-foreground">Tarayıcının kamera izni ilk açılışta ayrıca sorulabilir. Mikrofon açılmaz.</p>
       </div>
       {taskId==='sit_stand'?<div className="flex flex-col gap-3"><label className="text-sm">Sandalye yüksekliği · cm (isteğe bağlı)<Input type="number" min={20} max={100} value={chairHeight} onChange={e=>setChairHeight(e.target.value)} className="mt-1"/></label><label className="flex items-center gap-2 text-sm"><Checkbox checked={armSupport} onCheckedChange={setArmSupport}/>Kol desteği kullanıyorum</label></div>:null}
       {status==='active'?<div className="flex flex-col gap-2">{['Başım ve ayaklarım kadrajda.','Telefon düz ve sabit duruyor.','Işık yeterli; eklemlerim görünür.'].map((label,index)=><label key={label} className="flex items-center gap-3 text-sm"><Checkbox checked={checks[index]} onCheckedChange={value=>setChecks(current=>current.map((old,i)=>i===index?value:old))}/>{label}</label>)}</div>:null}
      </div>
     </div>:null}
     {flow.stage==='result' && result?resultContent(result):null}
     {flow.stage==='complete'?<div className="flex flex-col gap-5"><p className="text-sm text-muted-foreground">{completeRecords.length} analiz ölçüldü · {flow.skipped.length} analiz atlandı. Kaydetmediğin sonuçlar bu sayfada korunur; sayfadan ayrılırsan kaybolur.</p>{completeRecords.map(record=><div key={record.id} className="rounded-xl border p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{PROTOCOLS[record.task].title}</h3><Button variant="outline" disabled={Boolean(saving) || savedIds.includes(record.id)} onClick={()=>void save(record)}>{savedIds.includes(record.id)?'Kaydedildi':saving===record.id?'Kaydediliyor…':'Ölçümü kaydet'}</Button></div>{resultContent(record)}</div>)}{!completeRecords.length?<p>Ölçüm alınmadı. Analiz listesine dönüp tekrar başlayabilirsin.</p>:null}</div>:null}
    </div>
   </div>
   <footer className="shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
    <Button variant="ghost" disabled={Boolean(saving) || status==='requesting'} onClick={list}><ArrowLeft/>Analiz listesi</Button>
    <div className="flex flex-wrap gap-2">
     {flow.stage==='prepare'?<><Button variant="outline" disabled={status==='requesting'} onClick={()=>{setError(null);advance('skip');}}>Bu analizi atla</Button><Button disabled={!consent || status==='requesting'} onClick={()=>{if(status==='active')dispatch({type:'capture'});else void openCamera();}}>{status==='requesting'?'Kamera izni bekleniyor…':status==='active'?'Ölçüm alanına geç':'Kamerayı aç'}<ArrowRight/></Button></>:null}
     {flow.stage==='result' && result?<><Button variant="outline" disabled={Boolean(saving)} onClick={()=>{setError(null);dispatch({type:'repeat'});}}>Tekrar ölç</Button><Button disabled={Boolean(saving)} onClick={()=>void save(result,true)}>{saving?'Kaydediliyor…':flow.index+1<flow.queue.length?'Kaydet ve sonraki analiz':'Kaydet ve oturumu bitir'}<ArrowRight/></Button><Button variant="ghost" disabled={Boolean(saving)} onClick={prepareNext}>Kaydetmeden devam et</Button></>:null}
     {flow.stage==='complete'?<Button disabled={Boolean(saving)} onClick={list}>Analiz listesine dön</Button>:null}
    </div>
   </div></footer>
  </>}
 </div>:null;
 return <>
  <UnsavedChangesGuard active={flow.stage==='list' && pending.length>0 && !saving} description="Kaydedilmemiş kamera sonuçları var. Analizler arasında geçişte korunur; bu sayfadan ayrılırsan kaybolur." onLeave={()=>{}}/>
  <div className="flex flex-col gap-6">
   <div><h3 className="font-heading text-xl font-semibold">Analizlerini seç</h3><p className="mt-1 text-sm text-muted-foreground">Bir veya birkaç analiz seç. Her hareketin örneğini görerek sırayla ilerleyeceksin. {clientName?`Ölçülecek kişi: ${clientName}.`:''}</p></div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Analiz seçimi">{POSE_TASKS.map(id=><button key={id} type="button" aria-pressed={selected.includes(id)} onClick={()=>setSelected(current=>current.includes(id)?current.filter(task=>task!==id):[...current,id])} className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${selected.includes(id)?'border-primary/40 bg-primary/5':'bg-card hover:bg-muted/50'}`}><span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${selected.includes(id)?'border-primary bg-primary text-primary-foreground':'border-input'}`}>{selected.includes(id)?<Check className="size-3"/>:null}</span><span><span className="block font-medium">{PROTOCOLS[id].title}</span><span className="mt-1 block text-sm text-muted-foreground">{PROTOCOLS[id].subtitle}</span></span></button>)}</div>
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{selected.length} analiz seçildi{selected.length?` · Sıra: ${selected.map(id=>PROTOCOLS[id].title).join(' → ')}`:''}</p><div className="flex flex-wrap gap-2">{flow.queue.length?<Button variant="outline" onClick={()=>dispatch({type:'resume'})}>Oturuma devam et</Button>:null}<Button disabled={!selected.length || Boolean(saving)} onClick={()=>start()}>{flow.queue.length?'Yeni oturum başlat':'Seçilen analizleri başlat'}<ArrowRight/></Button></div></div>
   {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
   {pending.length?<section className="flex flex-col gap-3 rounded-xl border p-4"><h3 className="font-medium">Kaydedilmemiş sonuçlar · {pending.length}</h3>{pending.map(record=><div key={record.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{PROTOCOLS[record.task].title} · {new Date(record.capturedAt).toLocaleTimeString('tr-TR',{timeZone})}</span><Button variant="outline" disabled={Boolean(saving)} onClick={()=>void save(record)}>{saving===record.id?'Kaydediliyor…':'Ölçümü kaydet'}</Button></div>)}</section>:null}
   <CameraHistory clientId={clientId} timeZone={timeZone} records={records} onRepeat={repeat} onTrashChange={(id,removed)=>setTrashChanges(old=>({...old,[id]:removed}))}/>
   <div className="flex flex-wrap gap-3 border-t pt-4"><Button nativeButton={false} variant="ghost" render={<Link href={backHref}/>}>{backLabel}</Button><Button nativeButton={false} variant="outline" render={<Link href={manualHref}/>}>{manualLabel}</Button></div>
   <p className="text-xs text-muted-foreground">Görüntü yalnız cihazında işlenir, saklanmaz. Açılar 2D tahmindir; sonuçlar PT değerlendirmesini destekler. Program otomatik değişmez.</p>
  </div>
  {overlay?createPortal(overlay,document.body):null}
 </>;
}
