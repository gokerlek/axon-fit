'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { fetchJson } from '@/lib/query/errors';
import type { CoachPreferences } from '@/lib/ai/coach-contract';
const LABELS = { comments: ['Antrenman yorumları', 'Kaydettiğim antrenman hakkında kısa bir özet göster.'], celebrations: ['Kutlama ve tebrikler', 'Antrenmanımı tamamladığımda motive eden bir mesaj göster.'], suggestions: ['Koç önerileri', 'Kayıtlarıma dayanan sonraki adım önerilerini göster.'] };
export function CoachPreferenceForm({ clientId }: { clientId: string }) {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['coach', clientId, 'preferences'], queryFn: () => fetchJson<CoachPreferences>('/api/me/coach/preferences') });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function change(field: keyof CoachPreferences, checked: boolean) {
    if (!query.data || busy) return;
    setBusy(true); setError('');
    try {
      const data = await fetchJson<CoachPreferences>('/api/me/coach/preferences', { method: 'PUT', body: JSON.stringify({ ...query.data, [field]: checked }) });
      cache.setQueryData(['coach', clientId, 'preferences'], data);
      await cache.invalidateQueries({ queryKey: ['coach', clientId, 'highlights'] });
    } catch (error) { setError(error instanceof Error ? error.message : 'Tercih kaydedilemedi.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border p-4" aria-label="AI koç tercihleri"><h2 className="text-lg font-semibold">AI koç tercihleri</h2><p className="mt-1 text-sm text-muted-foreground">AI koç düğmesi her sayfada bulunur. Otomatik mesajlar PT AI desteğini açtığında tercihlerine göre gösterilir. Sağlık kayıtları mevcut sağlık izninin kapsamıyla sınırlıdır; bu mesajlar için Gemini çağrısı yapılmaz.</p>
    {query.isPending ? <p className="mt-3" role="status">Tercihler açılıyor…</p> : query.data ? <div className="mt-4 flex flex-col gap-4">{(Object.keys(LABELS) as (keyof CoachPreferences)[]).map(field => <div key={field} className="flex min-h-11 items-center justify-between gap-4"><label htmlFor={`coach-${field}`} className="flex-1"><span className="font-medium">{LABELS[field][0]}</span><span className="mt-1 block text-sm text-muted-foreground">{LABELS[field][1]}</span></label><Switch id={`coach-${field}`} disabled={busy} checked={query.data![field]} onCheckedChange={checked => void change(field, checked)} /></div>)}</div> : <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>Tercihleri yeniden aç</Button>}
    {error ? <p role="alert" className="mt-3 text-destructive">{error}</p> : null}
  </section>;
}
