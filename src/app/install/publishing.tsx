'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Spinner} from '@/components/ui/spinner';
export function Publishing() {
  const [timedOut,setTimedOut]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();const deadline=Date.now()+300_000;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(Date.now()>deadline){setTimedOut(true);return;}
      try{const response=await fetch('/api/install/status',{cache:'no-store',signal:controller.signal});if(response.ok && (await response.json()).status==='ready'){window.location.replace('/login');return;}}
      catch{/* A deployment switch can briefly interrupt requests. */}
      if(!controller.signal.aborted)timer=setTimeout(poll,5000);
    };
    timer=setTimeout(poll,1000);return()=>{controller.abort();clearTimeout(timer);};
  },[]);
  return <Card><CardContent className="flex flex-col gap-4" role="status" aria-live="polite"><h2 className="text-xl font-semibold">{timedOut?'Yayını kontrol et':'Yeni yayının bekleniyor'}</h2>{!timedOut && <Spinner className="size-6" />}<p className="text-muted-foreground">{timedOut?'Gerekli ayarlar henüz yeni yayında görülmedi. Kendi Vercel projenin Production ortamındaki değerleri ve son yayın sonucunu kontrol et.':'Yeni Production yayını hazır olduğunda giriş ekranına geçeceksin. Manuel aktarım kullandıysan kendi Vercel projeninde yayın başlattığından emin ol.'}</p><a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kendi Vercel projelerimi aç</a><Button variant="outline" render={<Link href="/install" />}>Kurulum adımlarına dön</Button></CardContent></Card>;
}
