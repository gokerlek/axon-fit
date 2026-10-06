'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchJson } from '@/lib/query/errors';
export function CoachConnection({ clientId, enabled, connected, busy, action, transport = fetchJson }: { clientId: string; enabled: boolean; connected: boolean; busy: boolean; transport?: typeof fetchJson; action: (run: () => Promise<unknown>) => Promise<void> }) {
  const [key, setKey] = useState('');
  const query = useQuery({ queryKey: ['coach', clientId, 'own-key'], queryFn: () => transport<{ ownKey: boolean }>('/api/me/coach/connection') });
  const own = query.data?.ownKey ?? connected;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Kendi Gemini bağlantım {own ? '· bağlı' : '· isteğe bağlı'}</summary>
    <p className="mt-3 text-sm text-muted-foreground">Kendi anahtarını eklersen yazdığın hedefi yorumlarken o kullanılır. PT kendi bağlantısını kullanır. Anahtarın şifreli saklanır ve tekrar gösterilmez.</p>
    {!enabled ? <p className="mt-2 text-sm text-muted-foreground">Yeni bağlantı eklemek için PT AI desteğini açmalı. Mevcut bağlantını kaldırabilirsin.</p> : null}
    <a className="mt-2 inline-block text-sm underline" href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">Google AI Studio’dan anahtar al</a>
    <label className="mt-3 flex flex-col gap-2 text-sm">Gemini API anahtarı<Input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder={own ? 'Bağlantıyı değiştirmek için yeni anahtar' : 'Anahtarını yapıştır'} className="h-11" /></label>
    <div className="mt-3 flex flex-wrap gap-2"><Button className="h-11" disabled={busy || !enabled || !key.trim()} onClick={() => void action(async () => { await transport('/api/me/coach/connection', { method: 'PUT', body: JSON.stringify({ key: key.trim() }) }); setKey(''); await query.refetch(); })}>Kendi bağlantımı kaydet</Button>{own ? <Button variant="outline" className="h-11" disabled={busy} onClick={() => void action(async () => { await transport('/api/me/coach/connection', { method: 'PUT', body: JSON.stringify({ key: null }) }); await query.refetch(); })}>Kendi bağlantımı kaldır</Button> : null}</div>
  </details>;
}
