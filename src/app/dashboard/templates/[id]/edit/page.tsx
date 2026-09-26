import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { PageHeader } from '@/components/page-header';
import { USER_MENU_GUTTER } from '@/components/user-menu-spot';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { TEMPLATE_ID_PATTERN } from '@/lib/schemas/template';
import { pickerDevices, pickerExercises, readTemplateFile } from '@/lib/templates';
import { InvalidTemplateAlert } from '../../invalid-template-alert';
import { TemplateForm } from '../../template-form';
import { TemplateActions } from '../template-actions';

export const metadata: Metadata = { title: 'Şablonu düzenle' };

/**
 * Şablon düzenleme. Program düzenleyicisiyle aynı desen: başlığın üstünde "‹" dönüş (şablonun
 * detayına), Kaydet "Hareketler" başlığında, yıkıcı eylem ("Sil") başlıkta ikincil görünümde.
 */
export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!TEMPLATE_ID_PATTERN.test(id)) notFound();
  const [file, exercises, devices, config] = await Promise.all([readTemplateFile(id), listExercises(), listDevices(), readAppConfig()]);
  if (!file) notFound();
  const name = file.template?.name ?? file.name ?? id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <EditorBackLink href={`/dashboard/templates/${id}`} label={name} className={USER_MENU_GUTTER} />
        <PageHeader title="Şablonu düzenle" actions={<TemplateActions id={id} name={name} />} />
      </div>
      {file.template ? (
        <TemplateForm
          editing={{ template: file.template, sha: file.sha }}
          exercises={pickerExercises(exercises)}
          devices={pickerDevices(devices)}
          timeZone={config.timeZone}
        />
      ) : (
        <InvalidTemplateAlert id={id} problem={file.problem} />
      )}
    </div>
  );
}
