import type {Metadata} from 'next';
import {requirePt} from '@/lib/guards';
import {geminiKeyStatus} from '@/lib/ai/gemini-key';
import {PageHeader} from '@/components/page-header';
import {GeminiSettings} from './gemini-settings';
import type {KeyStatus} from '@/lib/ai/credentials';

export const metadata:Metadata={title:'Yapay zekâ ayarları'};
export default async function AiSettingsPage() {
  await requirePt();
  let status:KeyStatus|null=null;
  try{status=await geminiKeyStatus();}catch{/* Allow re-entry after AUTH_SECRET rotation; don't reveal provider errors. */}
  return <div className="flex flex-col gap-6"><PageHeader title="Yapay zekâ ayarları" description="Gemini anahtarını kurulumdan sonra ekle veya değiştir." /><GeminiSettings initial={status} /></div>;
}
