import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {githubTokenSchema} from '@/lib/installation/wizard';
import {vercelGateway} from '@/lib/installation/vercel';
import {environmentStatus} from '@/lib/installation/readiness';
import {sameOrigin} from '@/lib/updates/core';
import {connectGithubAccount,InstallationAccountError} from '@/lib/installation/account';

export const maxDuration=60;

export async function POST(request:Request) {
  if(!sameOrigin(request))return NextResponse.json({error:'İstek kaynağı doğrulanamadı.'},{status:403});
  if(environmentStatus(process.env)==='ready'||process.env.AXON_SETUP_DEMO==='1')return NextResponse.json({error:'Bu ortamda hesap doğrulaması kullanılmaz.'},{status:409});
  const body=await request.text();
  if(body.length>2000)return NextResponse.json({error:'Anahtarı kontrol et.'},{status:400});
  let json:unknown;try{json=JSON.parse(body);}catch{json=null;}
  const input=v.safeParse(v.strictObject({token:githubTokenSchema,automatic:v.optional(v.boolean(),false)}),json);
  if(!input.success)return NextResponse.json({error:'GitHub’dan oluşturduğun anahtarı yapıştır.'},{status:400});
  try{
    const gateway=vercelGateway('');
    const owner=await connectGithubAccount(input.output.token,process.env.VERCEL_GIT_REPO_OWNER,process.env.VERCEL_GIT_REPO_SLUG,input.output.automatic,gateway.githubOwner,gateway.ensureWorkflow);
    return NextResponse.json({owner},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof InstallationAccountError?error.message:'GitHub anahtarı doğrulanamadı. Anahtarın tamamını ve süresini kontrol et.'},{status:400});}
}
