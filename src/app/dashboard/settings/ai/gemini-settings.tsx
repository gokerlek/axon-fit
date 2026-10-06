'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Field,FieldLabel,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {fetchJson} from '@/lib/query/errors';
import {geminiKeyError} from '@/lib/ai/gemini-key-input';
import type {KeyStatus} from '@/lib/ai/credentials';

export function GeminiSettings({initial}:{initial:KeyStatus|null}) {
  const [status,setStatus]=useState(initial);const [key,setKey]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function save(value:string|null) {
    if(value!==null){const problem=geminiKeyError(value);if(problem){setError(problem);setMessage('');return;}}
    setBusy(true);setError('');setMessage('');
    try{
      const next=await fetchJson<KeyStatus>('/api/settings/gemini',{method:'POST',body:JSON.stringify({key:value})});
      setStatus(next);setKey('');setMessage(value===null?'Paneldeki anahtar kaldırıldı.':'Gemini anahtarı kaydedildi. Yeniden yayınlamana gerek yok.');
    }catch(err){setError(err instanceof Error?err.message:'Anahtar kaydedilemedi.');}
    finally{setBusy(false);}
  }
  return <Card><CardContent className="flex flex-col gap-5">
    <div className="space-y-2"><h2 className="text-lg font-semibold">Gemini bağlantısı</h2><p role="status" className="text-sm text-muted-foreground">{status===null?'Anahtar durumu okunamadı. Özel veri alanına erişimini kontrol et veya anahtarı yeniden kaydet.':status.configured?status.source==='environment'?'Anahtar kurulum sırasında Vercel’de tanımlanmış.':'Anahtar bu panelden kaydedilmiş.':'Henüz Gemini anahtarı eklenmedi.'}</p></div>
    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Google AI Studio’da Gemini anahtarı oluştur</a>
    <form className="flex flex-col gap-4" onSubmit={event=>{event.preventDefault();void save(key);}}>
      <Field><FieldLabel htmlFor="gemini-key">{status?.configured?'Yeni Gemini API anahtarı':'Gemini API anahtarı'}</FieldLabel><Input id="gemini-key" type="password" autoComplete="new-password" spellCheck={false} value={key} onChange={event=>setKey(event.target.value)} disabled={busy} maxLength={200} /><FieldDescription>Kaydedilmiş anahtar tekrar gösterilmez. Google AI Studio’daki kopyalama düğmesiyle tam anahtarı al; anahtar adını veya gizlenmiş önizlemeyi yapıştırma. Boş bırakırsan mevcut anahtar değişmez.</FieldDescription></Field>
      <Button type="submit" disabled={busy||!key.trim()} className="self-start">{busy?'Kaydediliyor…':status?.configured?'Anahtarı değiştir':'Anahtarı kaydet'}</Button>
    </form>
    {status?.source==='settings'&&<Button type="button" variant="outline" disabled={busy} className="self-start" onClick={()=>void save(null)}>Paneldeki anahtarı kaldır</Button>}
    <p className="text-xs text-muted-foreground">Buradan eklediğin anahtar kendi özel veri alanında şifreli saklanır ve Vercel’deki anahtarın yerine kullanılır. Kaldırırsan varsa Vercel’deki anahtar tekrar kullanılır; Google’daki anahtar iptal olmaz.</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm text-primary">{message}</p>}
  </CardContent></Card>;
}
