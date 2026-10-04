import {requirePt} from '@/lib/guards';
import {PageHeader} from '@/components/page-header';
import {currentVersion} from '@/lib/updates/github';
import {UpdatePanel} from './update-panel';
export const metadata:Metadata={title:'Sürüm ve güncellemeler'};
export default async function UpdatesPage() {
  await requirePt();
  return <div className="flex max-w-2xl flex-col gap-6"><PageHeader title="Sürüm ve güncellemeler" description="Kurulu sürümü görüntüle, yeni sürümleri kontrol et ve uygulamanı güncelle." /><UpdatePanel current={currentVersion} /></div>;
}
import type {Metadata} from 'next';
