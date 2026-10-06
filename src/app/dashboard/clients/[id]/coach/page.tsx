import { notFound } from 'next/navigation';
import { requirePt } from '@/lib/guards';
import { readClient } from '@/lib/clients';
import { CLIENT_ID_PATTERN } from '@/lib/schemas/client';
import { SectionHeader } from '@/components/section-header';
import { CoachPanel } from '@/components/coach/coach-panel';
export const metadata = { title: 'AI koç' };
export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!CLIENT_ID_PATTERN.test(id) || !await readClient(id)) notFound();
  return <div className="flex flex-col gap-6"><SectionHeader title="AI koç" description="Danışanın kayıtlarını incele, koşullarına uygun program taslağını değerlendir." /><CoachPanel clientId={id} role="pt" /></div>;
}
