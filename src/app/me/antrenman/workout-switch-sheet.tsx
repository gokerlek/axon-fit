'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fetchJson } from '@/lib/query/errors';
import type { WorkoutResponse } from '@/lib/workout-routes';

export function WorkoutSwitchSheet({ open, onOpenChange, onSwitch }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitch: (program: string, day: string) => void;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-2xl">
      <SheetHeader>
        <SheetTitle>Antrenmanı değiştir</SheetTitle>
        <SheetDescription>Yaptığın setler mevcut antrenmanın kaydı olarak korunur. Seçtiğin program/gün ayrı bir antrenman olarak başlar; kayıtlar birbirine karışmaz.</SheetDescription>
      </SheetHeader>
      {open ? <WorkoutChoice onSwitch={onSwitch} onCancel={() => onOpenChange(false)} /> : null}
    </SheetContent>
  </Sheet>;
}

function WorkoutChoice({ onSwitch, onCancel }: { onSwitch: (program: string, day: string) => void; onCancel: () => void }) {
  const [selectedProgram, setProgram] = useState<string | null>(null);
  const [selectedDay, setDay] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ['workout-switch', 'choices'], queryFn: () => fetchJson<WorkoutResponse>('/api/me/workout'), staleTime: 0 });
  const program = selectedProgram ?? overview.data?.program?.id ?? 'pt';
  const preview = useQuery({
    queryKey: ['workout-switch', 'preview', program],
    queryFn: () => fetchJson<WorkoutResponse>(`/api/me/workout?preview=1&program=${encodeURIComponent(program)}`),
    enabled: !!overview.data,
    staleTime: 0,
  });
  const day = selectedDay ?? preview.data?.day?.dayId ?? '';
  const choices = overview.data?.selection?.choices ?? (overview.data?.program ? [{ id: overview.data.program.id ?? null, name: overview.data.program.name ?? 'PT programı' }] : []);
  const error = overview.error || preview.error ? 'Programlar açılamadı. Bağlantını kontrol edip yeniden aç.' : preview.data && !preview.data.day ? preview.data.problem ?? 'Bu programda uygulanabilecek gün yok.' : null;
  return <>
    <div className="flex flex-col gap-4 px-4">
      <label className="flex flex-col gap-2 text-sm">Program
        <select className="min-h-11 rounded-lg border bg-background p-2" value={program} disabled={!overview.data} onChange={event => { setProgram(event.target.value); setDay(null); }}>
          {choices.map(choice => <option key={choice.id ?? 'pt'} value={choice.id ?? 'pt'}>{choice.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm">Antrenman günü
        <select className="min-h-11 rounded-lg border bg-background p-2" value={day} disabled={!preview.data?.day} onChange={event => setDay(event.target.value)}>
          {preview.data?.program?.days.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </label>
      {preview.isFetching ? <p role="status" className="text-sm text-muted-foreground">Program açılıyor…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
    <SheetFooter>
      <Button disabled={preview.isFetching || !preview.data?.day || !day || !!error} onClick={() => onSwitch(program, day)}>Setleri koru ve bu antrenmana geç</Button>
      <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
    </SheetFooter>
  </>;
}
