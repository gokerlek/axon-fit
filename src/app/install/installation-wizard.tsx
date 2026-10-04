'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Field,FieldLabel,FieldError,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {authSecret,environmentFile,initialWizardValues,validateStep,type WizardValues,type WizardErrors} from '@/lib/installation/wizard';

const STEPS=['GitHub hesabın','GitHub girişi','İsteğe bağlı AI','Vercel’e aktar'];
function WizardInput({name,label,value,onChange,error,type='text',description}:{name:keyof WizardValues;label:string;value:string;onChange:(name:keyof WizardValues,value:string)=>void;error?:string;type?:string;description?:string}) {
  return <Field data-invalid={Boolean(error)||undefined}><FieldLabel htmlFor={name}>{label}</FieldLabel><Input id={name} name={name} type={type} value={value} onChange={event=>onChange(name,event.target.value)} autoComplete={type==='password'?'new-password':'off'} spellCheck={false} maxLength={1000} aria-invalid={Boolean(error)||undefined} aria-describedby={error?`${name}-error`:description?`${name}-help`:undefined} />{description && <FieldDescription id={`${name}-help`}>{description}</FieldDescription>}{error && <FieldError id={`${name}-error`}>{error}</FieldError>}</Field>;
}
export function InstallationWizard({homepage,initial,automaticAvailable,demo=false}:{homepage:string;initial:{owner:string;codeRepo:string};automaticAvailable:boolean;demo?:boolean}) {
  const router=useRouter();
  const [step,setStep]=useState(0);
  const [values,setValues]=useState<WizardValues>(initialWizardValues(initial.owner,initial.codeRepo));
  const [errors,setErrors]=useState<WizardErrors>({});
  const [notice,setNotice]=useState('');
  const [exported,setExported]=useState(false);
  const [vercelToken,setVercelToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [automaticError,setAutomaticError]=useState('');
  const [canRetryDeploy,setCanRetryDeploy]=useState(false);
  const change=(name:keyof WizardValues,value:string)=>{setValues(previous=>({...previous,[name]:value}));setErrors(previous=>({...previous,[name]:undefined}));setNotice('');};
  async function next() {
    if(step===0){
      if(!values.githubToken.trim()){setErrors({githubToken:'GitHub’da oluşturduğun anahtarı buraya yapıştır.'});return;}
      setBusy(true);setNotice('');
      try{
        let owner=initial.owner||'ornek-pt';
        if(!demo){
          const response=await fetch('/api/install/github',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:values.githubToken,automatic:automaticAvailable})});
          const account=await response.json() as {owner?:string;error?:string};
          if(!response.ok||!account.owner){setErrors({githubToken:account.error??'Anahtar doğrulanamadı.'});return;}
          owner=account.owner;
        }
        const resolved={...values,owner};const nextErrors=validateStep(0,resolved);setErrors(nextErrors);
        if(Object.keys(nextErrors).length){setNotice('Uygulamanın GitHub bağlantısı bulunamadı. Kendi Vercel projenin Production adresinden aç.');return;}
        setValues({...resolved,authSecret:values.authSecret||authSecret(crypto.getRandomValues(new Uint8Array(32)))});
        setStep(1);
      }catch{setErrors({githubToken:'GitHub’a bağlanılamadı. Bağlantını kontrol edip tekrar dene.'});}
      finally{setBusy(false);}
      return;
    }
    const nextErrors=validateStep(step,values);setErrors(nextErrors);
    if(Object.keys(nextErrors).length)return;
    if(step===1&&!demo){
      setBusy(true);setNotice('');
      try{
        const response=await fetch('/api/install/oauth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:values.clientId,clientSecret:values.clientSecret})});
        const result=await response.json() as {error?:string};
        if(!response.ok){setErrors({clientSecret:result.error??'GitHub giriş bilgileri doğrulanamadı.'});return;}
      }catch{setErrors({clientSecret:'GitHub’a bağlanılamadı. Bağlantını kontrol edip tekrar dene.'});return;}
      finally{setBusy(false);}
    }
    setNotice('');setStep(previous=>Math.min(previous+1,3));
  }
  async function copy(text:string,environment=false) {
    try{await navigator.clipboard.writeText(text);setNotice(environment?'Ayarlar kopyalandı. Kendi Vercel projenin Environment Variables ekranına yapıştır.':'Adres kopyalandı.');if(environment)setExported(true);}
    catch{setNotice('Kopyalama yapılamadı. .env dosyasını indirerek devam edebilirsin.');}
  }
  function download() {
    try{
      const blob=new Blob([environmentFile(values)],{type:'text/plain;charset=utf-8'});
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='axon-fit.env';link.click();URL.revokeObjectURL(url);
      setExported(true);setNotice('Dosya hazırlandı. Kendi Vercel projenin Environment Variables ekranına aktar.');
    }catch(error){setNotice(error instanceof Error?error.message:'Dosya hazırlanamadı.');}
  }
  async function automatic(resumeOnly=false) {
    setAutomaticError('');
    if(demo){setNotice('Simülasyon tamamlandı. Gerçek kurulumda ayarlar Vercel’e aktarılır ve yeni yayın başlayınca giriş ekranı açılır. Bu denemede hiçbir hesaba yazılmadı.');return;}
    if(!vercelToken.trim()){setAutomaticError('Kendi Vercel tokenını gir. Yalnız bu projenin kurulumu için kullanılacak.');return;}
    setBusy(true);
    try{
      const response=await fetch('/api/install/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values,vercelToken:vercelToken.trim(),resumeOnly})});
      const result=await response.json() as {error?:string;canRetryDeploy?:boolean};
      if(!response.ok){setAutomaticError(result.error??'Kurulum tamamlanamadı.');setCanRetryDeploy(result.canRetryDeploy??false);return;}
      setVercelToken('');router.push('/install?stage=publishing');
    }catch{setAutomaticError('Bağlantı kesildi. Vercel’de ayarların ve son yayının durumunu kontrol et. Ayarlar kaydedildiyse yeniden yayınlamayı dene.');setCanRetryDeploy(true);}
    finally{setBusy(false);}
  }
  const field=(name:keyof WizardValues,label:string,description?:string,type='text')=><WizardInput name={name} label={label} value={values[name]??''} onChange={change} error={errors[name]} description={description} type={type} />;
  return <Card><CardContent className="flex flex-col gap-6">
    {demo && <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-2"><p className="font-semibold">Kurulum simülasyonu</p><p>Gerçek anahtar girme. Örnek bilgilerle adımları gez; bu ekranda hiçbir hesaba işlem yapılmaz.</p><Button type="button" variant="outline" onClick={()=>{setValues(previous=>({...previous,githubToken:'ghp_simulasyon',clientId:'ornek-client-id',clientSecret:'ornek-client-secret'}));setErrors({});}}>Örnek bilgileri doldur</Button></div>}
    <div className="space-y-3"><p className="text-sm font-medium" aria-live="polite">Adım {step+1} / 4 · {STEPS[step]}</p><div className="flex gap-2" aria-hidden="true">{STEPS.map((label,index)=><span key={label} className={`h-1.5 flex-1 rounded-full ${index<=step?'bg-primary':'bg-muted'}`} />)}</div></div>
    <form className="flex flex-col gap-5" onSubmit={event=>{event.preventDefault();void next();}} noValidate>
      {step===0 && <>
        <h2 className="text-xl font-semibold">GitHub hesabını bağla</h2>
        <p className="text-sm text-muted-foreground">{initial.owner?'Uygulama bağlantısını bulduk.':'GitHub hesabını anahtardan otomatik tanıyacağız.'} Kod ve yayın ayarlarını senin için hazırlıyoruz; danışanlarının verileri için ayrı, özel bir alanı da otomatik oluşturacağız.</p>
        <ol className="list-decimal space-y-3 pl-5 text-sm">
          <li>Aşağıdaki düğmeyle GitHub’da anahtar oluşturma ekranını aç.</li>
          <li>Adı <strong>Axon Fit</strong> olsun. <strong>repo</strong>, <strong>delete_repo</strong> ve <strong>workflow</strong> seçeneklerinin işaretli olduğunu kontrol et. Bir geçerlilik süresi seç.</li>
          <li><strong>Generate token</strong> düğmesine bas. Oluşan anahtarı kopyalayıp aşağıya yapıştır.</li>
        </ol>
        <a href="https://github.com/settings/tokens/new?scopes=repo%2Cdelete_repo%2Cworkflow&description=Axon%20Fit" target="_blank" rel="noreferrer" className="text-primary underline">GitHub’da anahtar oluştur</a>
        {field('githubToken','GitHub’dan kopyaladığın anahtar','Verilerini kendi GitHub hesabında saklar. workflow izni, eksik güncelleme dosyasını kod repona eklemek için kullanılır; mevcut dosyan değiştirilmez.','password')}
      </>}
      {step===1 && <>
        <h2 className="text-xl font-semibold">GitHub ile girişini hazırla</h2>
        <p className="text-sm text-muted-foreground">Bu adımı <strong>{values.owner}</strong> GitHub hesabında tamamla. Aşağıdaki düğmeyi aç ve uygulama adı olarak <strong>Axon Fit</strong> yaz.</p>
        <a href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer" className="text-sm text-primary underline">GitHub OAuth App oluştur</a>
        <div className="space-y-4 rounded-lg bg-muted p-4 text-sm"><p>Uygulamanın adresini otomatik bulduk. Bağlı bir özel domainin varsa onu kullanıyoruz. Bu iki hazır adresi GitHub’daki aynı adlı alanlara kopyala.</p><Field><FieldLabel htmlFor="homepage">Homepage URL</FieldLabel><Input id="homepage" value={homepage} readOnly /><Button type="button" variant="outline" onClick={()=>copy(homepage)}>Homepage adresini kopyala</Button></Field><Field><FieldLabel htmlFor="callback">Authorization callback URL</FieldLabel><Input id="callback" value={`${homepage}/api/auth/github/callback`} readOnly /><Button type="button" variant="outline" onClick={()=>copy(`${homepage}/api/auth/github/callback`)}>Callback adresini kopyala</Button></Field></div>
        <p className="text-sm">GitHub’da <strong>Register application</strong> düğmesine bas. Açılan ekrandaki <strong>Client ID</strong> değerini kopyala; <strong>Generate a new client secret</strong> ile giriş anahtarını oluştur. İkisini aşağıya yapıştır.</p>
        {field('clientId','Client ID')}
        {field('clientSecret','Client Secret',undefined,'password')}
      </>}
      {step===2 && <>
        <h2 className="text-xl font-semibold">Gemini anahtarı eklemek ister misin?</h2>
        <p className="text-sm text-muted-foreground">Bu adımı boş bırakarak devam edebilirsin. Anahtarını sonradan Ayarlar → Yapay zekâ ve Gemini anahtarı ekranından ekleyebilirsin.</p>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kendi Gemini anahtarımı oluştur</a>
        {field('geminiKey','Gemini API anahtarı · isteğe bağlı',undefined,'password')}
      </>}
      {step===3 && <>
        <h2 className="text-xl font-semibold">Ayarları kendi Vercel projene aktar</h2>
        <div className="rounded-lg bg-muted p-4 text-sm space-y-1"><p>GitHub hesabın: {values.owner}</p><p>Uygulama adresin: {homepage}</p><p>Özel veri alanı ve güvenli oturum ayarları otomatik hazırlanır.</p></div>
        {automaticAvailable?<div className="flex flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-semibold">Otomatik aktar ve yayınla</h3>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground"><li>Aşağıdaki düğmeyle Vercel’de anahtar oluşturma ekranını aç.</li><li><strong>Create Token</strong> düğmesine bas; isim olarak <strong>Axon kurulumu</strong> yaz.</li><li><strong>Scope</strong> alanında uygulamanın bulunduğu hesabı veya team’i seç. <strong>Expiration</strong> alanında bir geçerlilik süresi seç.</li><li>Anahtarı oluştur, kopyala ve aşağıya yapıştır. <strong>Otomatik kur ve yayınla</strong> düğmesi kalan işlemleri tamamlar.</li></ol>
          <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kendi Vercel tokenımı oluştur</a>
          <Field><FieldLabel htmlFor="vercelToken">Vercel’den kopyaladığın anahtar</FieldLabel><Input id="vercelToken" name="vercelToken" type="password" value={vercelToken} onChange={event=>setVercelToken(event.target.value)} autoComplete="new-password" maxLength={1000} disabled={busy} /></Field>
          <p className="text-xs text-muted-foreground">Ayarlar yalnız kendi uygulamanın sunucusu üzerinden kendi Vercel projenine gönderilir. Vercel tokenı env, DB veya çerezde saklanmaz. Kurulum bitince Vercel’den iptal edebilirsin.</p>
          {automaticError && <p role="alert" className="text-sm text-destructive">{automaticError}</p>}
          <Button type="button" disabled={busy} onClick={()=>automatic(canRetryDeploy)}>{busy?'Ayarlar aktarılıyor…':canRetryDeploy?'Kurulumu tamamlamayı tekrar dene':'Otomatik kur ve yayınla'}</Button>
        </div>:<p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Otomatik aktarım kendi Vercel Production yayınında açılır. Yerel veya Preview ortamında aşağıdaki manuel aktarımı kullanabilirsin.</p>}
        <details className="rounded-lg border p-4" open={!automaticAvailable}><summary className="cursor-pointer font-medium">Manuel aktarım</summary><div className="flex flex-col gap-4 pt-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground"><li>Kendi Vercel projenin Settings → Environment Variables ekranını aç.</li><li>Ayarları kopyala veya dosyayı indir. Vercel’e yapıştır/aktar ve Production ortamını seç. Token, Secret ve API anahtarlarını Secret olarak kaydet.</li><li>Yeni ayarların kullanılması için yeni Production yayını başlat.</li></ol>
          <p className="text-xs text-muted-foreground">Manuel çıktı sunucuya gönderilmez. İndirdiğin dosya sır içerir; kod reposuna ekleme.</p>
          <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={()=>copy(environmentFile(values),true)}>Ayarları kopyala</Button><Button type="button" disabled={busy} variant="outline" onClick={download}>.env dosyasını indir</Button></div>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Kendi Vercel projelerimi aç</a>
          <Button render={<Link href="/install?stage=publishing" />} disabled={!exported||busy}>Yeni yayını kontrol et</Button>
        </div></details>
      </>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <div className="flex justify-between gap-3 pt-2">{step>0?<Button type="button" variant="outline" disabled={busy} onClick={()=>{setStep(previous=>previous-1);setErrors({});setNotice('');setCanRetryDeploy(false);}}>Geri</Button>:<span />}{step<3 && <Button type="submit" disabled={busy}>{busy?step===1?'GitHub girişi doğrulanıyor…':'Hesabın doğrulanıyor…':step===2 && !values.geminiKey?'AI anahtarını atla':'Devam et'}</Button>}</div>
    </form>
    {step<3 && <p className="text-xs text-muted-foreground">Bilgiler yalnız bu açık sekmede tutulur. Sayfayı yenilersen yeniden girmen gerekir.</p>}
  </CardContent></Card>;
}
