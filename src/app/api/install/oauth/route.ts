import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {githubTokenSchema} from '@/lib/installation/wizard';
import {verifyGithubOAuth} from '@/lib/installation/oauth';
import {environmentStatus} from '@/lib/installation/readiness';
import {sameOrigin} from '@/lib/updates/core';
import {callbackUrl} from '@/lib/urls';

export const maxDuration=30;

export async function POST(request:Request) {
  if(!sameOrigin(request))return NextResponse.json({error:'İstek kaynağı doğrulanamadı.'},{status:403});
  if(environmentStatus(process.env)==='ready'||process.env.AXON_SETUP_DEMO==='1')return NextResponse.json({error:'Bu ortamda kurulum doğrulaması kullanılmaz.'},{status:409});
  const text=await request.text();
  if(text.length>4000)return NextResponse.json({error:'GitHub giriş bilgilerini kontrol et.'},{status:400});
  let body:unknown;try{body=JSON.parse(text);}catch{body=null;}
  const input=v.safeParse(v.strictObject({clientId:githubTokenSchema,clientSecret:githubTokenSchema}),body);
  if(!input.success)return NextResponse.json({error:'Client ID ve Client Secret alanlarını doldur.'},{status:400});
  try{
    await verifyGithubOAuth(input.output.clientId,input.output.clientSecret,callbackUrl(request));
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'GitHub giriş bilgileri doğrulanamadı.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
