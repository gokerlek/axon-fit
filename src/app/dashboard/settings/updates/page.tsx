import {requirePt} from '@/lib/guards';
import {PageHeader} from '@/components/page-header';
import {currentVersion} from '@/lib/updates/github';
import {UpdatePanel} from './update-panel';
export default async function UpdatesPage() {
  await requirePt();
  return <div className="flex max-w-2xl flex-col gap-6"><PageHeader title="Uygulama sürümü" description="Kararlı sürümleri kontrol et ve yalnız uygulamanın kodunu güncelle." /><UpdatePanel current={currentVersion} /></div>;
}
