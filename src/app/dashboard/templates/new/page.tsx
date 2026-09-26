import type { Metadata } from 'next';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { PageHeader } from '@/components/page-header';
import { USER_MENU_GUTTER } from '@/components/user-menu-spot';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { pickerDevices, pickerExercises } from '@/lib/templates';
import { TemplateForm } from '../template-form';

export const metadata: Metadata = { title: 'Yeni şablon' };

/** Şablon oluşturma: düzenleme sayfasıyla aynı desen ("‹ Şablonlar", Kaydet "Hareketler" başlığında). */
export default async function NewTemplatePage() {
  await requirePt();
  const [exercises, devices, config] = await Promise.all([listExercises(), listDevices(), readAppConfig()]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <EditorBackLink href="/dashboard/templates" label="Şablonlar" className={USER_MENU_GUTTER} />
        <PageHeader
          title="Yeni şablon"
          description="Şablon uygulama repo'nda durur ve birden çok danışana atanabilir; içine kişisel bilgi yazma."
        />
      </div>
      <TemplateForm editing={null} exercises={pickerExercises(exercises)} devices={pickerDevices(devices)} timeZone={config.timeZone} />
    </div>
  );
}
