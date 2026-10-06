import { notFound, redirect } from 'next/navigation';
import { requirePt } from '@/lib/guards';
import { readPtSession } from '@/lib/session';
import { readClient } from '@/lib/clients';
import { getAssistant } from '@/lib/ai/assistant-routes';
import { assistantDeps } from '@/lib/ai/assistant-service';
import type { AssistantView } from '@/lib/ai/assistant-contract';
import { listExercises } from '@/lib/exercises';
import { listDevices } from '@/lib/devices';
import { listTemplates, pickerExercises, pickerDevices } from '@/lib/templates';
import { readAppConfig } from '@/lib/config';
import { todayIn } from '@/lib/format';
import { loadEditorCare } from '@/lib/client-care';
import { EditorBackLink } from '@/components/block-editor/editor-back-link';
import { SectionHeader } from '@/components/section-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProgramForm } from '../../../program/program-form';
export const metadata = { title: 'AI programını düzenle' };
export default async function DraftEditor({ params }: { params: Promise<{ id: string; draftId: string }> }) {
  await requirePt();
  const { id, draftId } = await params;
  const deps = assistantDeps(readPtSession), result = await getAssistant(deps, id);
  if (result.status !== 200) notFound();
  const draft = (result.body as AssistantView).drafts.find(d => d.id === draftId);
  if (!draft) notFound();
  if (draft.status === 'saved') redirect(`/dashboard/clients/${id}/program`);
  const [stored, exercises, devices, templates, config] = await Promise.all([readClient(id), listExercises(), listDevices(), listTemplates(), readAppConfig()]);
  if (!stored) notFound();
  const care = await loadEditorCare(stored.client, exercises, todayIn(config.timeZone));
  return <div className="flex flex-col gap-6">
    <EditorBackLink href={`/dashboard/clients/${id}/coach`} label="AI koç" />
    <SectionHeader title="AI programını düzenle" description="Günleri, hareketleri ve bileşik blokları düzenle; hazır olduğunda danışana ata." />
    <Alert><AlertDescription>Onayladığında mevcut PT programının yerine atanır. Bu ekranda yaptığın değişiklikler onaylayana kadar danışanı etkilemez.</AlertDescription></Alert>
    <ProgramForm clientId={id} aiDraftId={draft.id} mode="create" initial={draft.body} base={draft.baseRevision === null ? null : { revision: draft.baseRevision, createdAt: draft.baseCreatedAt }} stored={null} exercises={pickerExercises(exercises)} devices={pickerDevices(devices)} templates={templates.flatMap(t => t.template ? [{ id: t.template.id, name: t.template.name, blocks: t.template.blocks }] : [])} now={new Date().toISOString()} timeZone={config.timeZone} care={care} />
  </div>;
}
