'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bandaids, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { afterReportText, REGION_LABELS } from '@/lib/constraints';
import { DURATION, EASE, tween } from '@/lib/motion';
import type { PainReportOffer } from '@/lib/pain-report';
import { ReportSheet, type ReportDraft } from '../../../report-sheet';

/**
 * "Antrenörüne kısıt olarak bildir" kısayolu (tasarım `kisit-tarama.md` §3.7, faz 6): bu antrenmanda ağrıyla geçilen ve
 * son antrenmanlarda da ağrıyla geçilmiş hareket için Sağlık sayfasındaki bildirim sheet'i, hareketten önerilen bölge,
 * zorlayan ve hazır notla açılır; taraf ve öteki sorular danışanın. Telaşsız metin; tanı, "risk", "yasak" yok.
 * Gönderince kutu yerini şiddete göre ne yapacağını söyleyen satıra bırakır (`DURATION.base` giriş, `fast` çıkış).
 */
export function PainReportCallout({ offers }: { offers: readonly PainReportOffer[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [sent, setSent] = useState<Record<number, string>>({});
  const offer = open === null ? null : offers[open];
  const initial: ReportDraft = offer
    ? { ...(offer.region ? { region: offer.region } : {}), triggers: offer.triggers, note: offer.note }
    : { triggers: [], note: '' };

  return (
    <div className="flex flex-col gap-2.5">
      {offers.map((item, index) => (
        <AnimatePresence key={item.note} mode="wait" initial={false}>
          {sent[index] ? (
            <motion.p
              key="sent"
              role="status"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: tween(DURATION.base) }}
              className="flex items-start gap-2 rounded-xl bg-card p-3.5 text-sm ring-1 ring-foreground/10">
              <CheckCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
              {sent[index]}
            </motion.p>
          ) : (
            <motion.section
              key="offer"
              exit={{ opacity: 0, transition: tween(DURATION.fast, EASE.exit) }}
              aria-label="Ağrı yüzünden geçilen hareket"
              className="flex flex-col gap-2.5 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
              <p className="flex items-start gap-2 text-[0.9375rem] font-medium">
                <Bandaids weight="fill" className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
                Ağrı yüzünden yine geçtin
              </p>
              <p className="text-sm">{item.exercises.join(' · ')}</p>
              <p className="text-sm text-muted-foreground">
                {item.region ? `${REGION_LABELS[item.region]} için ` : ''}antrenörüne bildirirsen programını buna göre ayarlar.
              </p>
              <Button variant="outline" className="h-11 w-full" onClick={() => setOpen(index)}>
                Antrenörüne kısıt olarak bildir
              </Button>
            </motion.section>
          )}
        </AnimatePresence>
      ))}
      <ReportSheet
        open={offer !== null && offer !== undefined}
        onOpenChange={(next) => (next ? undefined : setOpen(null))}
        editing={null}
        initial={initial}
        onSent={(draft) => {
          const text =
            draft.severity && draft.type ? afterReportText({ severity: draft.severity, type: draft.type, ...(draft.since ? { since: draft.since } : {}) }) : 'Antrenörüne iletildi.';
          if (open !== null) setSent((current) => ({ ...current, [open]: text }));
          setOpen(null);
        }}
      />
    </div>
  );
}
