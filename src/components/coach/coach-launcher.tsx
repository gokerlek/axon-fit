'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sparkle, X } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CoachPanel } from './coach-panel';
import { coachClientOf, coachPage, COACH_PAGE_LABELS } from '@/lib/ai/coach-context';
import { fetchJson } from '@/lib/query/errors';
import type { CoachHighlight } from '@/lib/ai/coach-highlights';
export function CoachLauncher({ role, clientId }: { role: 'pt' | 'client'; clientId?: string }) {
  const pathname = usePathname(), page = coachPage(pathname), routeClient = role === 'pt' ? coachClientOf(pathname) : clientId ?? null;
  const [open, setOpen] = useState(false), [generalPath, setGeneralPath] = useState<string | null>(null);
  const selected = generalPath === pathname && role === 'pt' ? null : routeClient;
  return <>
    {role === 'client' && clientId ? <CoachNudge key={`${clientId}:${pathname}`} clientId={clientId} onOpen={() => setOpen(true)} /> : null}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button data-reorder-hide className="fixed right-4 bottom-[calc(var(--dock-clearance,6rem)+1rem)] z-40 h-12 gap-2 rounded-full px-4 shadow-lg" />}><Sparkle className="size-6" weight="fill" />AI koç</SheetTrigger>
      <SheetContent className="w-full! sm:max-w-xl! h-dvh gap-0 pb-[env(safe-area-inset-bottom)] [&>[data-slot=sheet-close]]:size-11">
        <SheetHeader className="shrink-0 pr-14 pt-[max(1rem,env(safe-area-inset-top))]">
          <SheetTitle className="text-xl">AI koç</SheetTitle>
          <SheetDescription>{role === 'client' ? 'Yalnız kendi kayıtların · ' : selected ? 'Bu danışanın kayıtları · ' : 'Tüm danışanlar · '}{COACH_PAGE_LABELS[page]}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {role === 'pt' && routeClient ? <Button className="mb-4 h-11 w-full" variant="outline" onClick={() => setGeneralPath(selected ? pathname : null)}>{selected ? 'Tüm danışanları değerlendir' : 'Bu danışanın önerilerine dön'}</Button> : null}
          <CoachPanel key={`${role}:${selected ?? 'general'}:${page}`} clientId={selected ?? 'c_ptgeneral'} role={role} page={page} general={role === 'pt' && !selected} />
          {role === 'client' ? <Link href="/me/ayarlar" onClick={() => setOpen(false)} className="mt-6 inline-block underline">Kutlama ve öneri tercihleri</Link> : null}
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
function CoachNudge({ clientId, onOpen }: { clientId: string; onOpen: () => void }) {
  const query = useQuery({ queryKey: ['coach', clientId, 'highlights'], queryFn: () => fetchJson<CoachHighlight[]>('/api/me/coach/highlights'), staleTime: 60000 });
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { const stored: unknown = JSON.parse(sessionStorage.getItem(`coach-dismissed:${clientId}`) ?? '[]'); return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []; } catch { return []; }
  });
  const active = query.data?.filter(item => !dismissed.includes(item.id)) ?? [];
  if (!active.length) return null;
  const close = () => {
    const next = [...new Set([...dismissed, ...active.map(item => item.id)])].slice(-90);
    setDismissed(next); try { sessionStorage.setItem(`coach-dismissed:${clientId}`, JSON.stringify(next)); } catch { /* Dismissal still works in memory. */ }
  };
  return <aside aria-label="Koçtan mesaj" className="fixed right-4 bottom-[calc(var(--dock-clearance,6rem)+4.75rem)] z-40 max-h-[35dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-4 shadow-lg">
    <div className="flex items-center justify-between"><p className="font-semibold">Koçtan mesaj</p><Button size="icon" variant="ghost" className="size-11" aria-label="Koç mesajını kapat" onClick={close}><X /></Button></div>
    {active.map(item => <p key={item.id} className="mt-2 text-sm leading-relaxed">{item.text}</p>)}
    <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => { close(); onOpen(); }}>Önerileri aç</Button>
  </aside>;
}
