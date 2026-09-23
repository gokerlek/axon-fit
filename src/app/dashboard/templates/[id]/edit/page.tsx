import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { TEMPLATE_ID_PATTERN } from '@/lib/schemas/template';
import { pickerDevices, pickerExercises, readTemplateFile } from '@/lib/templates';
import { InvalidTemplateAlert } from '../../invalid-template-alert';
import { TemplateForm } from '../../template-form';
import { TemplateActions } from '../template-actions';

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!TEMPLATE_ID_PATTERN.test(id)) notFound();
  const [file, exercises, devices] = await Promise.all([readTemplateFile(id), listExercises(), listDevices()]);
  if (!file) notFound();
  const name = file.template?.name ?? file.name ?? id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Şablonlar', href: '/dashboard/templates' },
          { label: name, href: `/dashboard/templates/${id}` },
          { label: 'Düzenle' },
        ]}
        title="Şablonu düzenle"
        actions={<TemplateActions id={id} name={name} />}
      />
      {file.template ? (
        <TemplateForm
          editing={{ template: file.template, sha: file.sha }}
          exercises={pickerExercises(exercises)}
          devices={pickerDevices(devices)}
        />
      ) : (
        <InvalidTemplateAlert id={id} problem={file.problem} />
      )}
    </div>
  );
}
