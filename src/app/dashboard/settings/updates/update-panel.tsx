'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {fetchJson} from '@/lib/query/errors';

type Result={current:string;release:{tag:string;automatic:boolean}|null;run:{id:number;tag:string;status:string;conclusion:string|null;applied:boolean;url:string}|null};
export function UpdatePanel({current}:{current:string}) {
  const [result,setResult]=useState<Result|null>(null);
  const [accepted,setAccepted]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function check() {
    setBusy(true);setError('');
    try{setResult(await fetchJson<Result>('/api/updates'));}
    catch(err){setError(err instanceof Error?err.message:'Kontrol tamamlanamadı.');}
    finally{setBusy(false);}
  }
  async function update(action:'start'|'apply') {
    if(!accepted || !result)return;
    setBusy(true);setError('');setMessage('');
    try{
      await fetchJson('/api/updates',{method:'POST',body:JSON.stringify(action==='start'?{action,tag:result.release?.tag,overwriteAccepted:accepted}:{action,runId:result.run?.id,overwriteAccepted:accepted})});
      setMessage(action==='start'?'Güncelleme hazırlanıyor. Biraz sonra durumunu kontrol et; hazırlık başarılıysa Yayınla ile tamamla.':'Kod güncellendi. Vercel Production yayını hazır olduğunda yeni sürüm burada görünecek. Yayın başarısızsa Vercel’de hata kaydını kontrol et.');
      setResult(await fetchJson<Result>('/api/updates'));
    }catch(err){setError(err instanceof Error?err.message:'Güncelleme tamamlanamadı.');}
    finally{setBusy(false);}
  }
  return <Card><CardContent className="flex flex-col gap-5">
    <div><p className="text-sm text-muted-foreground">Kurulu sürüm</p><p className="font-heading text-2xl font-semibold">v{result?.current??current}</p></div>
    <Button variant="outline" onClick={check} disabled={busy}>{busy?'Kontrol ediliyor…':'Güncellemeleri kontrol et'}</Button>
    {result && <p role="status">{result.release?`Yeni kararlı sürüm: ${result.release.tag}`:'Daha yeni bir kararlı sürüm bulunamadı.'}</p>}
    {result?.release && !result.release.automatic && <p className="text-sm text-muted-foreground">Bu sürüm manuel güncelleme gerektiriyor. Sürüm notlarını takip et.</p>}
    {result?.run && <div className="rounded-lg bg-muted p-4 text-sm space-y-2"><p>{result.run.tag} · {result.run.applied?'Kod yayın dalına aktarıldı':result.run.status!=='completed'?'Hazırlanıyor':result.run.conclusion==='success'?'Yayınlanmaya hazır':'Hazırlık başarısız'}</p><a href={result.run.url} target="_blank" rel="noreferrer" className="text-primary underline">GitHub Actions ayrıntıları</a></div>}
    {result?.release?.automatic && <>
      <p className="text-sm text-muted-foreground">Kodda yaptığın değişikliklerin üzerine yazılır. Kodun mevcut sürümü yedek etiketle saklanır. Veri repoları ve Vercel ortam değişkenleri bu işlemde değiştirilmez. Workflow dosyaları manuel güncellenir.</p>
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy} className="mt-1 size-4 shrink-0" />Kod değişikliklerimin üzerine yazılmasını kabul ediyorum.</label>
      {result.run?.conclusion==='success' && !result.run.applied && result.run.tag===result.release.tag ? <Button onClick={()=>update('apply')} disabled={!accepted||busy}>Güncellemeyi yayınla</Button> : <Button onClick={()=>update('start')} disabled={!accepted||busy||Boolean(result.run && result.run.status!=='completed')}>Yeni sürümü hazırla</Button>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <a href="https://github.com/gokerlek/axon-fit/blob/main/docs/UPDATES.md" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kod değişikliklerimi koruyarak manuel güncelle</a>
  </CardContent></Card>;
}
