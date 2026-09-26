'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Stepper } from '@/components/ui/stepper';
import type { CheckInResponse } from '@/lib/check-in-routes';
import { formatNumber, formatRecent } from '@/lib/format';
import { DURATION, EASE, tween } from '@/lib/motion';
import { ApiError, fetchJson } from '@/lib/query/errors';
import { afterState, CR10_LABELS, cr10Text, PAIN_SCALE_ENDS } from '@/lib/session-check';
import { afterDismissed, dismissAfter, fetchCheckContext, flushCheckIns, queueCheckIn, readCheckCache } from './check-in-storage';
import { ScaleField } from './check-scale';
import { writerId } from './workout-storage';

const ELEVEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** Süre sınırı: seans şemasıyla aynı (`sessionEffortSchema`). */
const MINUTES = { min: 1, max: 600 } as const;

function painText(value: number): string {
  return value === 0 ? `0 · ${PAIN_SCALE_ENDS.low}` : value === 10 ? `10 · ${PAIN_SCALE_ENDS.high}` : `${formatNumber(value)}/10`;
}

/**
 * Bugün'ün antrenman sonrası kartı (tasarım §2.9, açık soru 10: Bugün kartı): "Antrenman ne kadar zordu?"
 * Bitişten 10 dk sonra açılır, 24 saat durur (SPEC §4: seans RPE'si ~10 dk sonra; Haddad 2017: toplama anı
 * sabit tutulur). Zorunlu değil: "Şimdi değil" o antrenman için kapatır.
 *
 * - CR-10 (0–10, adlı basamaklar Foster uyarlaması) ve süre (önceden dolu, düzeltilebilir): antrenman
 *   verisi, `PATCH /api/me/sessions/[id]` → seans dosyasının `effort`'u.
 * - Ağrı takibi onaylıysa seans içi en yüksek ağrı (NPRS) ve isteğe bağlı "Hangi harekette?": sağlık
 *   verisi, `POST /api/me/check-in` → `health.json` (sonraki antrenmanın yoklaması bunları kullanır).
 *   Gönderilemezse telefonda bekler.
 * - Girdi `GET /api/me/check-in`'den (telefonda saklanır; antrenman başındaki sheet de onu kullanır).
 */
export function AfterCheck({ clientId }: { clientId: string }) {
  const [data, setData] = useState<CheckInResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [peak, setPeak] = useState<number | undefined>(undefined);
  const [rows, setRows] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);

  useEffect(() => {
    const cached = readCheckCache(clientId);
    // Telefonda saklanan girdi sunucu çiziminden sonra okunur (ilk çizim sunucununkiyle aynı kalsın).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setData(cached.data);
    const controller = new AbortController();
    fetchCheckContext(clientId, controller.signal)
      .then(setData)
      .catch(() => undefined);
    // Antrenmanda gönderilemeyen yoklamalar: açılışta ve bağlantı gelince.
    void flushCheckIns(clientId);
    const onOnline = () => void flushCheckIns(clientId);
    window.addEventListener('online', onOnline);
    return () => {
      controller.abort();
      window.removeEventListener('online', onOnline);
    };
  }, [clientId]);

  const prompt = data?.after ?? null;
  const state = prompt ? afterState(prompt.finishedAt, now) : null;

  // Bitişten 10 dk dolmadıysa o ana kurulur (Bugün açık kalırsa kart kendiliğinden gelir).
  useEffect(() => {
    if (!prompt) return;
    const current = afterState(prompt.finishedAt, Date.now());
    if (current.state !== 'early') return;
    const id = window.setTimeout(() => setNow(Date.now()), current.inMs + 100);
    return () => window.clearTimeout(id);
  }, [prompt]);

  const visible = Boolean(prompt && state?.state === 'due' && closed !== prompt.sessionId && !afterDismissed(clientId, prompt.sessionId));
  const duration = minutes ?? prompt?.durationMin ?? null;

  const save = async () => {
    if (!prompt || rpe === undefined) return;
    setBusy(true);
    // Ağrı önce kuyruğa: antrenman verisi gönderilemese de sağlık cevabı kaybolmaz.
    if (data?.parts.pain && peak !== undefined) {
      queueCheckIn(clientId, { sessionId: prompt.sessionId, painPeak: peak, ...(peak > 0 && rows.length > 0 ? { painRows: rows } : {}) });
      void flushCheckIns(clientId);
    }
    try {
      const effort = { sessionRpe: rpe, ...(duration !== null ? { durationMin: Math.min(MINUTES.max, Math.max(MINUTES.min, Math.round(duration))) } : {}) };
      await fetchJson(`/api/me/sessions/${prompt.sessionId}`, { method: 'PATCH', body: JSON.stringify({ writer: writerId(), effort }) });
      // Telefondaki girdi tazelenene kadar kart yeniden çıkmasın.
      dismissAfter(clientId, prompt.sessionId);
      setClosed(prompt.sessionId);
      toast.success('Kaydedildi. Teşekkürler!');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Kaydedilemedi. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    if (!prompt) return;
    dismissAfter(clientId, prompt.sessionId);
    setClosed(prompt.sessionId);
  };

  const toggleRow = (rowId: string) => setRows((current) => (current.includes(rowId) ? current.filter((item) => item !== rowId) : [...current, rowId]));

  return (
    <AnimatePresence initial={false}>
      {visible && prompt ? (
        <motion.div
          key={prompt.sessionId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: tween(DURATION.base) }}
          exit={{ opacity: 0, transition: tween(DURATION.fast, EASE.exit) }}>
          <Card>
            <CardHeader>
              <CardDescription>
                {prompt.dayName ?? 'Antrenman'} · {formatRecent(prompt.finishedAt, data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)} bitti
              </CardDescription>
              <CardTitle className="text-xl">Antrenman ne kadar zordu?</CardTitle>
              <CardDescription>Bütün antrenmanı düşün: 0 dinlenme, 10 yapabileceğinin en zoru.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ScaleField
                id="after-rpe"
                label="Zorluk"
                values={ELEVEN}
                columns={6}
                value={rpe}
                onChange={setRpe}
                describe={cr10Text}
                ends={[`0 · ${CR10_LABELS[0]}`, `10 · ${CR10_LABELS[10]}`]}
              />
              <div className="flex items-center justify-between gap-3">
                <p id="after-minutes" className="text-[0.9375rem] font-medium">
                  Süre
                </p>
                <Stepper
                  value={duration}
                  onValueChange={(changed) => setMinutes(changed === null || !Number.isFinite(changed) ? null : Math.min(MINUTES.max, Math.max(MINUTES.min, Math.round(changed))))}
                  min={MINUTES.min}
                  max={MINUTES.max}
                  step={5}
                  unit="dk"
                  aria-label="Süre, dakika"
                  decrementLabel="Süreyi azalt"
                  incrementLabel="Süreyi artır"
                />
              </div>
              {data?.parts.pain ? (
                <>
                  <ScaleField
                    id="after-pain"
                    label="Antrenmanda ağrın en çok ne kadardı?"
                    hint="İsteğe bağlı. Sonraki antrenmanın planı buna göre ayarlanır."
                    values={ELEVEN}
                    columns={6}
                    value={peak}
                    onChange={setPeak}
                    describe={painText}
                    ends={[painText(0), painText(10)]}
                  />
                  {peak !== undefined && peak > 0 && prompt.exercises.length > 0 ? (
                    <div role="group" aria-labelledby="after-rows" className="flex flex-col gap-2">
                      <p id="after-rows" className="text-[0.9375rem] font-medium">
                        Hangi harekette? <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {prompt.exercises.map((item) => (
                          <Button
                            key={item.rowId}
                            variant={rows.includes(item.rowId) ? 'default' : 'secondary'}
                            aria-pressed={rows.includes(item.rowId)}
                            className="h-auto min-h-11 max-w-full px-4 py-2 whitespace-normal"
                            onClick={() => toggleRow(item.rowId)}>
                            {item.title}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-col items-stretch gap-2">
              <Button size="lg" className="h-12 w-full" disabled={rpe === undefined || busy} onClick={() => void save()}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Kaydet
              </Button>
              <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={later}>
                Şimdi değil
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
