'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {PROTOCOLS,METRIC_LABELS,type PoseTask} from '@/lib/pose/protocols';
import {measurementMeaning,METRIC_EXPLANATIONS} from '@/lib/pose/guidance';
import {comparable,type CameraMeasurement} from '@/lib/schemas/camera-measurement';
export function CameraHistory({records,timeZone='Europe/Istanbul',clientId,onRepeat,onTrashChange}:{records:CameraMeasurement[];timeZone?:string;clientId?:string;onRepeat?:(task:PoseTask)=>void;onTrashChange?:(id:string,removed:boolean)=>void}){
 const [limit,setLimit]=useState(10);const [trash,setTrash]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);
 const [changes,setChanges]=useState<Record<string,boolean>>({});const router=useRouter();
 const all=records.map(record=>record.id in changes?{...record,deletedAt:changes[record.id]?(record.deletedAt??new Date().toISOString()):undefined}:record).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt));
 const active=all.filter(record=>!record.deletedAt),deleted=all.filter(record=>record.deletedAt);const shown=trash?deleted:active;
 async function change(record:CameraMeasurement,remove:boolean){
  if(!clientId || busy)return;setBusy(record.id);setError(null);
  try{
   const response=await fetch(`/api/clients/${clientId}/camera-measurements`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:record.id,action:remove?'trash':'restore'})});
   const body=await response.json();if(!response.ok)throw new Error(body.error??'Ölçüm değiştirilemedi.');
   setChanges(old=>({...old,[record.id]:remove}));onTrashChange?.(record.id,remove);router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:'İşlem tamamlanamadı. Yeniden deneyebilirsin.');}
  finally{setBusy(null);}
 }
 return <section className="flex flex-col gap-4" aria-label="Kamera ölçüm geçmişi">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-heading text-lg font-semibold">{trash?'Silinen kamera ölçümleri':'Kamera ölçüm geçmişi'}</h3><p className="mt-1 text-sm text-muted-foreground">{trash?'Silinen kayıtları buradan geri alabilirsin.':'Aynı yöntem ve kayıtlı koşullardaki ölçümler karşılaştırılır. Fark tek başına gelişim veya gerileme değildir.'}</p></div><Button variant="outline" onClick={()=>{setTrash(value=>!value);setLimit(10);}}>{trash?'Ölçüm geçmişi':`Silinenler (${deleted.length})`}</Button></div>
  {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
  {!shown.length?<p className="rounded-lg border p-4 text-sm text-muted-foreground">{trash?'Silinen ölçüm yok.':'Henüz kaydedilmiş kamera ölçümü yok. Kamerayla ölçüm al düğmesiyle başlayabilirsin.'}</p>:shown.slice(0,limit).map(record=>{
   const protocol=PROTOCOLS[record.task];const previous=active.find(r=>r.capturedAt<record.capturedAt && comparable(record,r));
   return <Card key={record.id}><CardHeader><CardTitle>{protocol.title}</CardTitle><CardDescription>{new Date(record.capturedAt).toLocaleString('tr-TR',{timeZone})} · {record.side==='both'?'İki taraf':record.side==='left'?'Sol taraf':'Sağ taraf'}{record.repetitions?` · ${record.repetitions} tekrar`:''}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <dl className="flex flex-col gap-3">{record.metrics.map(metric=>{
     const old=previous?.metrics.find(m=>m.id===metric.id),value=protocol.dynamic?metric.range:metric.median,delta=old?value-(protocol.dynamic?old.range:old.median):null;
     return <div key={metric.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><dt>{METRIC_LABELS[metric.id]}{protocol.dynamic?' · açı değişimi':''}</dt><dd className="font-mono tabular-nums">{value.toFixed(1)}°{delta!==null?<span className="ml-3 text-xs text-muted-foreground">Öncekiye göre {delta>0?'+':''}{delta.toFixed(1)}°</span>:null}</dd></div>;
    })}</dl>
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Bu sonuç ne anlama geliyor?</summary><div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground"><p>{measurementMeaning(record.task)}</p>{record.metrics.map(metric=><p key={metric.id}>{METRIC_LABELS[metric.id]}: {METRIC_EXPLANATIONS[metric.id]}</p>)}<p>2D tahmin · {(record.durationMs/1000).toFixed(1)} sn · {record.validSamples}/{record.totalSamples} net örnek · {record.width}×{record.height} · Protokol {record.protocol}. Telefon düzlüğü kullanıcı tarafından kontrol edildi.{record.task==='sit_stand'?` Sandalye: ${record.chairHeightCm??'belirtilmedi'}${record.chairHeightCm?' cm':''}; kol desteği ${record.armSupport?'var':'yok'}.`:''}</p><p>PT önceki kayıt ve antrenman koşullarıyla birlikte değerlendirir. Klinik kabul sınırı veya doğru/yanlış hareket puanı değildir.</p></div></details>
    {!trash && !previous?<p className="text-xs text-muted-foreground">Aynı kayıtlı koşullarda önceki ölçüm yok.</p>:null}
    <div className="flex flex-wrap gap-2">{trash?<Button variant="outline" disabled={Boolean(busy)} onClick={()=>void change(record,false)}>{busy===record.id?'Geri alınıyor…':'Geri al'}</Button>:<>{onRepeat?<Button variant="outline" onClick={()=>onRepeat(record.task)}>Tekrar ölç</Button>:clientId?<Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/measurements/camera?analysis=${record.task}`}/>}>Tekrar ölç</Button>:null}{clientId?<Button variant="ghost" disabled={Boolean(busy)} onClick={()=>void change(record,true)}>{busy===record.id?'Siliniyor…':'Sil · geri alınabilir'}</Button>:null}</>}</div>
   </CardContent></Card>;
  })}
  {shown.length>limit?<Button variant="outline" onClick={()=>setLimit(value=>value+10)}>Daha fazla göster</Button>:null}
 </section>;
}
