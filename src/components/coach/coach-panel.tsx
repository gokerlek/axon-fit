'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { WeekdayToggle } from '@/components/weekday-toggle';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { DayPlan } from '@/components/program/day-plan';
import type { TrackingType } from '@/lib/progression';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { CoachConnection } from './coach-connection';
import { fetchJson } from '@/lib/query/errors';
import { EQUIPMENT, EQUIPMENT_LABELS } from '@/lib/schemas/exercise';
import { GOALS, GOAL_LABELS, type AssistantSelection, type AssistantView, type AssistantDraft } from '@/lib/ai/assistant-contract';
import type { COACH_PAGES } from '@/lib/ai/coach-contract';
import { answerCoach } from '@/lib/ai/coach-engine';
import { BODY_MUSCLES, isBodyMuscle } from '@/lib/muscles';
import { EMPTY_CARE } from '@/lib/constraint-filter';

export function CoachPanel({ clientId, role, page: _page = 'overview', general = false, transport = fetchJson }: { clientId: string; role: 'pt' | 'client'; page?: typeof COACH_PAGES[number]; general?: boolean; transport?: typeof fetchJson }) {
  const endpoint = general ? '/api/coach' : role === 'pt' ? `/api/clients/${clientId}/coach` : '/api/me/coach';
  const cache = useQueryClient(), instance = useId();
  const queryKey = ['coach', clientId, role, 'assistant'];
  const query = useQuery({ queryKey, queryFn: () => transport<AssistantView>(endpoint) });
  const [tab, setTab] = useState('review');
  const [text, setText] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [formOpen, setFormOpen] = useState(false);
  const [goal, setGoal] = useState<AssistantSelection['goal'] | ''>(''), [fullBody, setFullBody] = useState(true), [muscles, setMuscles] = useState<AssistantSelection['muscles']>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]), [equipment, setEquipment] = useState<AssistantSelection['conditions']['equipment']>([]), [minutes, setMinutes] = useState(45);
  const ready = !!goal && weekdays.length > 0 && equipment.length > 0 && Number.isInteger(minutes) && minutes >= 15 && minutes <= 120 && (fullBody || muscles.length > 0);
  async function action(run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await run(); await cache.invalidateQueries({ queryKey: ['coach', clientId, role] }); }
    catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı. Yeniden dene.'); }
    finally { setBusy(false); }
  }
  async function request(input: object) {
    await action(async () => {
      const data = await transport<AssistantView>(endpoint, { method: 'POST', body: JSON.stringify({ ...input, requestId: crypto.randomUUID() }) });
      cache.setQueryData(queryKey, data);
      if ('action' in input && input.action === 'generate') setTab('program');
      if (data.interpreted) {
        const result = data.interpreted;
        if (result.intent !== 'fitness') {
          setNotice(result.intent === 'unclear' ? 'Hedef netleşmedi. Aşağıdan hedef ve kaslarını seçebilirsin.' : answerCoach({ intent: result.intent, exerciseIds: [] }, { facts: [], exercises: [], care: EMPTY_CARE, existingExerciseIds: [], healthUnavailable: false, today: '' }).answer);
          if (result.intent !== 'unclear') { setFormOpen(false); return; }
        } else {
          setNotice('Yazdıkların seçimlere dönüştü. Belirtmediğin alanlar doldurulmadı; kontrol edip eksikleri tamamla.');
          setGoal(result.goal ?? '');
          // An interpretation starts a fresh form: do not reuse unrelated conditions from a previous goal.
          setFullBody(result.fullBody ?? false); setMuscles(result.muscles);
          setWeekdays(result.weekdays ?? []); setMinutes(result.minutes ?? 0); setEquipment(result.equipment ?? []);
        }
        setFormOpen(true);
      }
    });
  }
  const data = query.data;
  if (query.isPending) return <div role="status" aria-label="AI önerileri açılıyor" className="flex flex-col gap-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (query.error || !data) return <Alert variant="destructive"><AlertTitle>Öneriler açılamadı</AlertTitle><AlertDescription><Button variant="outline" onClick={() => void query.refetch()}>Yeniden dene</Button></AlertDescription></Alert>;
  const review = data.reviews.at(-1);
  return <div className="flex flex-col gap-6">
    {data.access !== 'ready' ? <Alert><AlertTitle>AI desteği kapalı</AlertTitle><AlertDescription>{role === 'pt' ? <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/edit`} />}>Danışan ayarlarını aç</Button> : 'PT, danışan bilgilerinden açabilir.'}</AlertDescription></Alert> :
    <Tabs value={tab} onValueChange={value => setTab(String(value))}>
      <TabsList><TabsTrigger value="review">Gelişim</TabsTrigger>{!general ? <TabsTrigger value="program">Program hazırla</TabsTrigger> : null}</TabsList>
      <TabsContent value="review" className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle>Gelişim değerlendirmesi</CardTitle><CardDescription>{review ? new Date(review.at).toLocaleString('tr-TR') : 'Önemli değişiklikler ve sonraki adım.'}</CardDescription><CardAction><Button disabled={busy} onClick={() => void request({ action: 'review' })}>{busy ? 'Hazırlanıyor…' : review ? 'Yeniden değerlendir' : 'Değerlendir'}</Button></CardAction></CardHeader>
          <CardContent className="flex flex-col gap-5">{review?.insights?.length ? review.insights.map((insight, index) => <div key={`${insight.title}-${index}`} className="flex flex-col gap-2"><p className="font-medium">{insight.title}</p><p>{insight.finding}</p><p className="text-muted-foreground"><span className="font-medium text-foreground">Sonraki adım: </span>{insight.next}</p></div>) : <p className="text-muted-foreground">{review ? 'Bu eski değerlendirme kayıt özetidir. Gelişim ve sonraki adımlar için yeniden değerlendir.' : 'Kayıtları karşılaştırmak için Değerlendir’e bas.'}</p>}</CardContent>
          {review ? <CardFooter><Dialog><DialogTrigger render={<Button variant="ghost" />}>Dayanak kayıtları</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Dayanak kayıtları</DialogTitle></DialogHeader><ul className="flex list-disc flex-col gap-1 pl-4">{review.sources.map(source => <li key={source}>{source}</li>)}</ul></DialogContent></Dialog></CardFooter> : null}
        </Card>
      </TabsContent>
      {!general ? <TabsContent value="program" className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle>Programını hazırlayalım</CardTitle><CardDescription>Hedefi ve koşulları belirle; taslağı oluşturucuda düzenle.</CardDescription></CardHeader><CardContent>
          <FieldGroup><Field><FieldLabel htmlFor={`${instance}-goal`}>Ne yapmak istiyorsun?</FieldLabel><Textarea id={`${instance}-goal`} placeholder="Bütün beden, haftada 2 gün, 45 dakika, dambıl." value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={1500} disabled={busy} /></Field>
            <div className="flex flex-wrap gap-2"><Button disabled={busy || !text.trim() || !data.connection} onClick={() => void request({ action: 'interpret', text: text.trim() })}>Hedefi yorumla</Button><Button variant="outline" disabled={busy} onClick={() => { setFormOpen(true); setNotice(''); }}>Kendim seçeyim</Button></div>
          </FieldGroup>
        </CardContent></Card>
        {notice ? <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert> : null}
        {formOpen ? <Card><CardHeader><CardTitle>Antrenman koşulları</CardTitle></CardHeader><CardContent><FieldGroup>
          <Field><FieldLabel htmlFor={`${instance}-selection`}>Hedef</FieldLabel><Select value={goal || null} onValueChange={value => setGoal(value as AssistantSelection['goal'])} disabled={busy} items={GOALS.map(g => ({ value: g, label: GOAL_LABELS[g] }))}><SelectTrigger id={`${instance}-selection`} className="w-full"><SelectValue placeholder="Hedef seç" /></SelectTrigger><SelectContent><SelectGroup>{GOALS.map(g => <SelectItem key={g} value={g}>{GOAL_LABELS[g]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field orientation="horizontal"><Checkbox id={`${instance}-full`} checked={fullBody} disabled={busy} onCheckedChange={setFullBody} /><FieldLabel htmlFor={`${instance}-full`}>Bütün beden</FieldLabel></Field>
          {!fullBody ? <MuscleMap label="Çalıştırmak istediğin kasları seç" selected={muscles.filter(isBodyMuscle)} disabled={busy ? BODY_MUSCLES : []} onToggle={m => setMuscles(muscles.includes(m) ? muscles.filter(x => x !== m) : [...muscles, m])} /> : null}
          <Field><FieldLabel id={`${instance}-weekdays`}>Antrenman günleri</FieldLabel><WeekdayToggle id={`${instance}-weekdays`} value={weekdays} onChange={setWeekdays} disabled={busy} /></Field>
          <Field><FieldLabel htmlFor={`${instance}-minutes`}>Seans süresi (dakika)</FieldLabel><Input id={`${instance}-minutes`} type="number" min={15} max={120} step={1} value={minutes || ''} placeholder="15–120" disabled={busy} onChange={e => setMinutes(Number(e.target.value))} /></Field>
          <FieldSet disabled={busy}><FieldLegend>Ekipman</FieldLegend><div className="grid grid-cols-2 gap-3">{EQUIPMENT.filter(value => data.exercises.some(e => e.equipment === value)).map(value => <Field key={value} orientation="horizontal"><Checkbox id={`${instance}-equipment-${value}`} checked={equipment.includes(value)} onCheckedChange={checked => setEquipment(checked ? [...equipment, value] : equipment.filter(x => x !== value))} /><FieldLabel htmlFor={`${instance}-equipment-${value}`}>{EQUIPMENT_LABELS[value]}</FieldLabel></Field>)}</div></FieldSet>
        </FieldGroup></CardContent><CardFooter className="flex flex-wrap gap-2"><Button disabled={busy || !ready} onClick={() => void request({ action: 'generate', kind: 'program', selection: { goal: goal as AssistantSelection['goal'], fullBody, muscles: fullBody ? [] : muscles, conditions: { weekdays, minutes, equipment } } })}>Program oluştur</Button><Button variant="outline" disabled={busy || !ready} onClick={() => void request({ action: 'generate', kind: 'workout', selection: { goal: goal as AssistantSelection['goal'], fullBody, muscles: fullBody ? [] : muscles, conditions: { weekdays, minutes, equipment } } })}>Tek antrenman oluştur</Button></CardFooter></Card> : null}
        {data.drafts.length ? [...data.drafts].reverse().map(draft => <DraftCard key={draft.id} draft={draft} data={data} role={role} clientId={clientId} busy={busy} apply={() => void action(() => transport(endpoint, { method: 'PATCH', body: JSON.stringify({ id: draft.id }) }))} />) : null}
      </TabsContent> : null}
    </Tabs>}
    {role === 'client' ? <CoachConnection clientId={clientId} enabled={data.access !== 'off'} connected={data.connection === 'client'} busy={busy} action={action} transport={transport} /> : !data.connection ? <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/settings/ai" />}>Gemini bağlantısı ekle</Button> : null}
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
  </div>;
}
function DraftCard({ draft, data, role, clientId, busy, apply }: { draft: AssistantDraft; data: AssistantView; role: 'pt' | 'client'; clientId: string; busy: boolean; apply: () => void }) {
  const exercises = new Map(data.exercises.map(e => [e.id, { title: e.title, trackingType: e.trackingType as TrackingType }]));
  const days = draft.body.phases.flatMap(p => p.days);
  return <Card><CardHeader><CardTitle>{draft.name}</CardTitle><CardDescription>{GOAL_LABELS[draft.selection.goal]} · {days.length} gün</CardDescription><CardAction><Badge variant="secondary">{draft.status === 'saved' ? 'Atandı / kaydedildi' : 'Taslak'}</Badge></CardAction></CardHeader>
    <CardContent className="flex flex-col gap-4"><Tabs defaultValue={days[0]?.id}><div className="overflow-x-auto"><TabsList>{days.map(day => <TabsTrigger key={day.id} value={day.id}>{day.name}</TabsTrigger>)}</TabsList></div>{days.map(day => <TabsContent key={day.id} value={day.id}><DayPlan blocks={day.blocks} exercises={exercises} missing="show" audience={role} /></TabsContent>)}</Tabs>
      {draft.attention.length ? <Alert><AlertTitle>Gözden geçirilecekler</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-4">{draft.attention.map(t => <li key={t}>{t}</li>)}</ul></AlertDescription></Alert> : null}
      <Dialog><DialogTrigger render={<Button variant="ghost" />}>Seçim gerekçesi</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Seçim gerekçesi</DialogTitle></DialogHeader><ul className="flex list-disc flex-col gap-2 pl-4">{draft.rationale.map(t => <li key={t}>{t}</li>)}</ul></DialogContent></Dialog>
    </CardContent><CardFooter className="flex flex-col items-start gap-3">
      {role === 'pt' && draft.status !== 'saved' ? <><div className="flex flex-wrap gap-2"><Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/coach/drafts/${draft.id}`} />}>Oluşturucuda düzenle</Button><Button disabled={busy} onClick={apply}>Onayla ve danışana ata</Button></div><p className="text-muted-foreground">Onaylandığında mevcut PT programının yerine geçer.</p></> : <Button variant="outline" nativeButton={false} render={<Link href={role === 'pt' ? `/dashboard/clients/${clientId}/program` : draft.status === 'saved' ? draft.savedBy === 'pt' ? '/me/programlar/antrenor' : `/me/programlar/${draft.programId}` : `/me/programlar/ai/${draft.id}`} />}>{draft.status === 'saved' ? 'Programı aç' : 'Oluşturucuda düzenle ve kaydet'}</Button>}
    </CardFooter></Card>;
}
