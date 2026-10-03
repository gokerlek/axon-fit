import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import * as v from 'valibot';

export const geminiKeySchema=v.pipe(v.string(),v.trim(),v.minLength(20,'Gemini anahtarının tamamını yapıştır.'),v.maxLength(200),v.regex(/^[A-Za-z0-9_-]+$/,'Anahtarı boşluksuz yapıştır.'));
const recordSchema=v.strictObject({version:v.literal(1),encrypted:v.nullable(v.string())});
export type KeyRecord=v.InferOutput<typeof recordSchema>;
export type KeyStatus={configured:boolean;source:'settings'|'environment'|null};
export type KeyStore={
  checkPrivate:()=>Promise<void>;
  read:()=>Promise<{content:unknown;sha:string}|null>;
  write:(record:KeyRecord,sha?:string)=>Promise<void>;
};
export type KeyContext={secret:string;owner:string;repo:string};
function encryptionKey(context:KeyContext) {
  if(Buffer.byteLength(context.secret)<32)throw new Error('Geçersiz oturum anahtarı.');
  return createHash('sha256').update(`axon-fit:gemini:v1\0${context.owner}/${context.repo}\0${context.secret}`).digest();
}
export function sealKey(key:string,context:KeyContext):string {
  const value=v.parse(geminiKeySchema,key);
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(context),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(part=>part.toString('base64url')).join('.');
}
export function openKey(encrypted:string,context:KeyContext):string {
  const parts=encrypted.split('.');
  if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))throw new Error('Anahtar kaydı okunamadı.');
  const [iv,tag,data]=parts.map(part=>Buffer.from(part,'base64url'));
  if(iv!.length!==12||tag!.length!==16)throw new Error('Anahtar kaydı okunamadı.');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(context),iv!);decipher.setAuthTag(tag!);
  return v.parse(geminiKeySchema,Buffer.concat([decipher.update(data!),decipher.final()]).toString('utf8'));
}
export async function resolveKey(store:KeyStore,context:KeyContext,environmentKey?:string):Promise<{key:string|null;status:KeyStatus}> {
  await store.checkPrivate();
  const saved=await store.read();
  if(saved){
    const record=v.parse(recordSchema,saved.content);
    if(record.encrypted)return {key:openKey(record.encrypted,context),status:{configured:true,source:'settings'}};
  }
  const key=environmentKey?.trim()||null;
  return {key,status:{configured:Boolean(key),source:key?'environment':null}};
}
export async function saveKey(store:KeyStore,context:KeyContext,key:string|null):Promise<void> {
  const encrypted=key===null?null:sealKey(key,context);
  await store.checkPrivate();
  const current=await store.read();
  if(current)v.parse(recordSchema,current.content); // Never silently replace a damaged record.
  await store.write({version:1,encrypted},current?.sha);
}
