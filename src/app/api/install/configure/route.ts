import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {automaticInstall,automaticSchema,InstallationError} from '@/lib/installation/automatic';
import {vercelGateway} from '@/lib/installation/vercel';
import {environmentStatus} from '@/lib/installation/readiness';
import {sameOrigin} from '@/lib/updates/core';
import {callbackUrl} from '@/lib/urls';

export const maxDuration=60;
export async function POST(request:Request) {
  if(!sameOrigin(request))return NextResponse.json({error:'İstek kaynağı doğrulanamadı.'},{status:403});
  if(process.env.AXON_SETUP_DEMO==='1')return NextResponse.json({error:'Bu bir simülasyon. Gerçek ayarlar aktarılmaz.'},{status:400});
  if(environmentStatus(process.env)==='ready')return NextResponse.json({error:'Kurulum zaten tamamlanmış. Mevcut sırlar değiştirilmedi.'},{status:409});
  const projectId=process.env.VERCEL_PROJECT_ID;
  if(process.env.VERCEL_ENV!=='production' || !projectId)return NextResponse.json({error:'Otomatik aktarım yalnız kendi Vercel Production yayınında kullanılabilir. Sistem ortam değişkenlerinin açık olduğunu kontrol et.'},{status:400});
  const contentLength=Number(request.headers.get('content-length')??0);
  if(contentLength>16000)return NextResponse.json({error:'İstek çok büyük.'},{status:413});
  const input=v.safeParse(automaticSchema,await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({error:'Gerekli hesap ve anahtar bilgilerini kontrol et.'},{status:400});
  try{
    const deployed=await automaticInstall(projectId,input.output.values,input.output.resumeOnly,vercelGateway(input.output.vercelToken,fetch,callbackUrl(request)));
    return NextResponse.json({status:'publishing',deploymentId:deployed.id},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Kurulum tamamlanamadı.',canRetryDeploy:error instanceof InstallationError && error.canRetryDeploy},{status:502,headers:{'Cache-Control':'no-store'}});}
}
