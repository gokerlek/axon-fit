import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { OwnProgramForm } from '@/components/program/own-program-form';
import { SectionHeader } from '@/components/section-header';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { requirePt } from '@/lib/guards';
import { isOwnProgramId } from '@/lib/own-programs';
import { readOwnProgramOf } from '@/lib/own-programs-store';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { listTemplates, pickerDevices, pickerExercises } from '@/lib/templates';

export const metadata: Metadata = { title: 'Danışanın programını düzenle' };

/**
 * PT danışanın paylaştığı programı düzenler (`docs/design/kendi-program.md` §4, §3.5): `OwnProgramForm` `own-pt`
 * kipinde (ad salt okuma, tam düzenleyici, "+ Gün"de bütün şablonlar). Kayıt `PUT /api/clients/[id]/programs/[pid]`;
 * paylaşım o arada kapandıysa 403, program silindiyse 404, başkası kaydettiyse 412 (form söyler). Paylaşılmamış
 * dosya açılmaz: görünüm sayfası nedenini söyler.
 */
export default async function EditOwnProgramPtPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  await requirePt();
  const { id, pid } = await params;
  if (!CLIENT_ID_PATTERN.test(id) || !isOwnProgramId(pid)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);

  const viewHref = `/dashboard/clients/${id}/program/own/${pid}`;
  const read = await readOwnProgramOf(id, pid);
  if (read.status === 'missing') notFound();
  if (read.status === 'invalid' || !read.program.shared) redirect(viewHref);

  const program = read.program;
  const [templateFiles, exercises, devices, config] = await Promise.all([listTemplates().catch(() => []), listExercises(), listDevices(), readAppConfig()]);
  const templates = templateFiles.flatMap((item) => (item.template ? [{ id: item.template.id, name: item.template.name, blocks: item.template.blocks }] : []));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <EditorBackLink href={viewHref} label={program.name} />
        <SectionHeader title={`${program.name} · danışanın programı`} description="Kaydedince danışana bildirilir; programın geçmişine senin adınla yazılır." />
      </div>
      <OwnProgramForm
        mode="own-pt"
        clientId={id}
        programId={pid}
        creating={false}
        initial={{ name: program.name, currentPhaseId: program.current.phaseId, phases: program.phases, weekdays: program.schedule?.weekdays ?? [] }}
        base={{ revision: program.revision, createdAt: program.createdAt }}
        exercises={pickerExercises(exercises)}
        devices={pickerDevices(devices)}
        ptProgram={null}
        templates={templates}
        otherNames={[]}
        timeZone={config.timeZone}
        saveUrl={`/api/clients/${id}/programs/${pid}`}
        doneHref={viewHref}
      />
    </div>
  );
}
