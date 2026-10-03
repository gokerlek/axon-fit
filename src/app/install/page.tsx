import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {environmentStatus} from '@/lib/installation/readiness';
import {Publishing} from './publishing';
import {InstallationWizard} from './installation-wizard';

export const dynamic='force-dynamic';
export default async function InstallPage({searchParams}:{searchParams:Promise<{stage?:string}>}) {
  if(environmentStatus(process.env)==='ready')redirect('/login');
  const params=await searchParams;
  const incoming=await headers();
  const host=incoming.get('x-forwarded-host')??incoming.get('host')??'localhost:3000';
  const scheme=incoming.get('x-forwarded-proto')??(host.startsWith('localhost')||host.startsWith('127.')?'http':'https');
  const homepage=process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:`${scheme}://${host}`;
  return <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-8 sm:py-16">
    <header className="space-y-3"><p className="text-sm font-medium text-primary">AXON FIT · KURULUM</p><h1 className="font-heading text-3xl font-semibold">Kendi panelin, kendi hesabın.</h1><p className="text-muted-foreground">Bu kopya kendi Vercel projen ve özel GitHub repolarınla çalışır. Ayrı bir kurulum servisi veya veritabanı kurman gerekmez.</p></header>
    {params.stage==='publishing'?<Publishing />:<InstallationWizard homepage={homepage} demo={process.env.AXON_SETUP_DEMO==='1'} automaticAvailable={process.env.VERCEL_ENV==='production' && Boolean(process.env.VERCEL_PROJECT_ID)} initial={{owner:process.env.VERCEL_GIT_REPO_OWNER??'',codeRepo:process.env.VERCEL_GIT_REPO_SLUG??'axon-fit'}} />}
  </main>;
}
