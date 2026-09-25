import { PageHeader } from '@/components/page-header';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { pickerDevices, pickerExercises } from '@/lib/templates';
import { TemplateForm } from '../template-form';

export default async function NewTemplatePage() {
  await requirePt();
  const [exercises, devices, config] = await Promise.all([listExercises(), listDevices(), readAppConfig()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Şablonlar', href: '/dashboard/templates' }, { label: 'Yeni şablon' }]}
        title="Yeni şablon"
        description="Şablon uygulama repo'nda durur ve birden çok danışana atanabilir; içine kişisel bilgi yazma."
      />
      <TemplateForm editing={null} exercises={pickerExercises(exercises)} devices={pickerDevices(devices)} timeZone={config.timeZone} />
    </div>
  );
}
