import 'server-only';
import {serverEnv} from '@/lib/env';
import {appRepoFiles} from '@/lib/app-repo-files';
import {checkAppRepo} from '@/lib/github/repos';
import {resolveKey,saveKey,type KeyStore} from './credentials';

const PATH='secrets/gemini.json';
function dependencies() {
  const env=serverEnv();const files=appRepoFiles();
  const store:KeyStore={
    checkPrivate:async()=>{if(!(await checkAppRepo()).exists)throw new Error('Özel veri alanı hazır değil. Önce kurulum görünümünü kaydet.');},
    read:()=>files.readJson(PATH),
    write:async(record,sha)=>{await files.writeJson(PATH,record,{sha,message:'Gemini bağlantı ayarı güncellendi'});},
  };
  return {store,context:{secret:env.authSecret,owner:env.owner,repo:env.appRepo}};
}
/** Future AI calls must resolve here, so keys added after setup also take effect. */
export async function geminiApiKey():Promise<string|null> {
  const {store,context}=dependencies();return (await resolveKey(store,context,process.env.GEMINI_API_KEY)).key;
}
export async function geminiKeyStatus() {
  const {store,context}=dependencies();return (await resolveKey(store,context,process.env.GEMINI_API_KEY)).status;
}
export async function saveGeminiKey(key:string|null) {
  const {store,context}=dependencies();await saveKey(store,context,key);
}
