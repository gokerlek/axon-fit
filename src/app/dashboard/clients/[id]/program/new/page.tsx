import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { blankProgramBody, programIdSource } from '@/lib/program-plan';
import { readProgramFile } from '@/lib/programs';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { listTemplates, pickerDevices, pickerExercises } from '@/lib/templates';
import { ProgramForm } from '../program-form';

/** Program oluşturma: düzenleyici boş iskeletle açılır; ilk "Programı oluştur" dosyayı yazar. */
export default async function NewProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  // Program zaten var (okunamasa da): düzenleme sayfası.
  if (await readProgramFile(id)) redirect(`/dashboard/clients/${id}/program/edit`);

  const [templateFiles, exercises, devices, config] = await Promise.all([
    listTemplates().catch(() => []),
    listExercises(),
    listDevices(),
    readAppConfig(),
  ]);
  const templates = templateFiles.flatMap((file) =>
    file.template ? [{ id: file.template.id, name: file.template.name, blocks: file.template.blocks }] : [],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: 'Danışanlar', href: '/dashboard/clients' },
          { label: loaded.client.name, href: `/dashboard/clients/${id}` },
          { label: 'Program oluştur' },
        ]}
        title="Program oluştur"
        description="Program yalnız bu danışanın repo'sunda durur. Şablondan başlarsan şablonda sonradan yapılan değişiklikler buraya yansımaz."
      />
      <ProgramForm
        clientId={id}
        mode="create"
        // Kimlikler sunucuda üretilir: sunucu ve tarayıcı çizimi aynı olsun.
        initial={blankProgramBody(programIdSource([]))}
        baseRevision={null}
        stored={null}
        templates={templates}
        exercises={pickerExercises(exercises)}
        devices={pickerDevices(devices)}
        now={new Date().toISOString()}
        timeZone={config.timeZone}
      />
    </div>
  );
}
