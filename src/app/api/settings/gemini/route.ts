import {NextResponse} from 'next/server';
import * as v from 'valibot';
import {readPtSession} from '@/lib/session';
import {sameOrigin} from '@/lib/updates/core';
import {geminiKeySchema} from '@/lib/ai/credentials';
import {geminiKeyStatus,saveGeminiKey} from '@/lib/ai/gemini-key';

export const dynamic='force-dynamic';
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET() {
  if(!(await readPtSession()))return response({error:'Bu işlem yalnız PT’ye açık.'},403);
  try{return response(await geminiKeyStatus());}
  catch{return response({error:'Anahtar durumu okunamadı. Özel veri alanına erişimini kontrol et.'},502);}
}
export async function POST(request:Request) {
  if(!sameOrigin(request)||!(await readPtSession()))return response({error:'Bu işlem yalnız PT’ye açık.'},403);
  const body=await request.text();if(body.length>1000)return response({error:'Anahtarı kontrol et.'},400);
  let json:unknown;try{json=JSON.parse(body);}catch{json=null;}
  const parsed=v.safeParse(v.strictObject({key:v.nullable(geminiKeySchema)}),json);
  if(!parsed.success)return response({error:'Gemini anahtarının tamamını boşluksuz yapıştır.'},400);
  try{await saveGeminiKey(parsed.output.key);return response(await geminiKeyStatus());}
  catch{return response({error:'Anahtar kaydedilemedi. Özel veri alanına erişimini kontrol edip tekrar dene.'},502);}
}
