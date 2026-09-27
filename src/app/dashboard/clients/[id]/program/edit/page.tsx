import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { SectionHeader } from '@/components/section-header';
import { loadEditorCare } from '@/lib/client-care';
import { clientTargetNotes } from '@/lib/client-targets';
import { loadClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { formatDayShort, todayIn } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { readProgramFile } from '@/lib/programs';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { listTemplates, pickerDevices, pickerExercises } from '@/lib/templates';
import { InvalidProgramAlert } from '../invalid-program-alert';
import { ProgramActions } from '../program-actions';
import { ProgramForm } from '../program-form';

export const metadata: Metadata = { title: 'Programı düzenle' };

/**
 * Program düzenleme — evreler, günler, hareketler. Şablon düzenleyicisiyle aynı desen: başlığın üstünde
 * "‹ Program", Kaydet ("Programı kaydet") "Hareketler" başlığında, yıkıcı eylem ("Programı sil") başlıkta
 * ikincil görünümde.
 */
export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id)) notFound();
  const loaded = await loadClient(id);
  if (!loaded) notFound();
  if (!loaded.ok) redirect(`/dashboard/clients/${id}`);
  const file = await readProgramFile(id);
  if (!file) redirect(`/dashboard/clients/${id}/program/new`);

  if (!file.program) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <EditorBackLink href={`/dashboard/clients/${id}/program`} label="Program" />
          <SectionHeader title="Programı düzenle" actions={<ProgramActions clientId={id} />} />
        </div>
        <InvalidProgramAlert problem={file.problem} />
      </div>
    );
  }

  const program = file.program;
  const [templateFiles, exercises, devices, config] = await Promise.all([
    listTemplates().catch(() => []),
    listExercises(),
    listDevices(),
    readAppConfig(),
  ]);
  const templates = templateFiles.flatMap((item) =>
    item.template ? [{ id: item.template.id, name: item.template.name, blocks: item.template.blocks }] : [],
  );
  // Danışanın kısıtları (tasarım `kisit-tarama.md` §3.2): sheet'te işaret, kartta rozet; onay yoksa yalnız durum.
  const care = await loadEditorCare(loaded.client, exercises, todayIn(config.timeZone));
  // Danışanın geçerli satır hedefleri (tasarım §6.2): kartta "Danışan güncelledi · hedef 10–14 · 26 Eyl".
  const tracking = new Map(exercises.map((exercise) => [exercise.id, exercise.trackingType]));
  const clientTargets = Object.fromEntries(
    Object.entries(clientTargetNotes(program.phases, program.clientTargets, (exerciseId) => tracking.get(exerciseId) ?? 'weight_reps')).map(
      ([rowId, note]) => [rowId, { text: `${note.text} · ${formatDayShort(todayIn(config.timeZone, new Date(note.at)))}`, sets: note.sets, baseSets: note.baseSets }],
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <EditorBackLink href={`/dashboard/clients/${id}/program`} label="Program" />
        <SectionHeader title="Programı düzenle" actions={<ProgramActions clientId={id} />} />
      </div>
      <ProgramForm
        clientId={id}
        mode="edit"
        initial={{ phased: program.phased, currentPhaseId: program.current.phaseId, phases: program.phases, weekdays: program.schedule?.weekdays ?? [] }}
        base={{ revision: program.revision, createdAt: program.createdAt }}
        stored={{ current: program.current, rotation: program.rotation }}
        templates={templates}
        exercises={pickerExercises(exercises)}
        devices={pickerDevices(devices)}
        now={new Date().toISOString()}
        timeZone={config.timeZone}
        clientDays={program.clientSchedule ?? null}
        clientTargets={clientTargets}
        care={care}
      />
    </div>
  );
}
