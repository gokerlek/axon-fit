import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {readPtSession} from '@/lib/session';
import {sameOrigin} from '@/lib/updates/core';
import {availableRelease,currentVersion,startUpdate,updateStatus,applyUpdate} from '@/lib/updates/github';

export const dynamic='force-dynamic';
export async function GET() {
  if(!(await readPtSession()))return NextResponse.json({error:'Bu işlem yalnız PT’ye açık.'},{status:403});
  try {return NextResponse.json({current:currentVersion,release:await availableRelease(),run:await updateStatus()},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Sürüm kontrol edilemedi.'},{status:502});}
}
const schema=v.variant('action',[
  v.object({action:v.literal('start'),tag:v.string(),overwriteAccepted:v.literal(true)}),
  v.object({action:v.literal('apply'),runId:v.pipe(v.number(),v.integer(),v.minValue(1)),overwriteAccepted:v.literal(true)}),
]);
export async function POST(request:Request) {
  if(!sameOrigin(request) || !(await readPtSession()))return NextResponse.json({error:'Bu işlem yalnız PT’ye açık.'},{status:403});
  const input=v.safeParse(schema,await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({error:'Kod değişikliklerinin üzerine yazılacağını onayla.'},{status:400});
  try {if(input.output.action==='apply'){await applyUpdate(input.output.runId);return NextResponse.json({ok:true});}return NextResponse.json(await startUpdate(input.output.tag));}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Güncelleme başlatılamadı.'},{status:502});}
}
