'use client';

import { useMemo, useState } from 'react';
import { LabeledSelect } from '@/components/labeled-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { formatNumber } from '@/lib/format';
import type { TemplateOption } from '@/lib/program-plan';
import type { PickerExercise } from '@/lib/template-edit';
import { templateSummary } from '@/lib/template-plan';

/**
 * Şablondan gün ekleme: şablonun blokları yeni kimlikle kopyalanır; gün şablona bağlı
 * kalmaz (burada yapılan değişiklik şablonu, şablonda sonradan yapılan değişiklik günü
 * etkilemez).
 */
export function AddDayDialog({
  open,
  onOpenChange,
  phaseName,
  templates,
  exercises,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Evreli programda evrenin adı; evresizde `null`. */
  phaseName: string | null;
  templates: TemplateOption[];
  exercises: ReadonlyMap<string, PickerExercise>;
  onAdd: (template: TemplateOption) => void;
}) {
  const sorted = useMemo(() => [...templates].sort((a, b) => a.name.localeCompare(b.name, 'tr')), [templates]);
  const [templateId, setTemplateId] = useState(sorted[0]?.id ?? '');
  const template = sorted.find((item) => item.id === templateId);
  const summary = template ? templateSummary({ blocks: template.blocks }, exercises) : null;
  const labels = Object.fromEntries(sorted.map((item) => [item.id, item.name]));

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Şablondan gün ekle</DialogTitle>
          <DialogDescription>
            {phaseName === null ? 'Programa' : `'${phaseName}' evresine`} yeni gün olarak eklenir; şablonla bağı kalmaz, burada
            yaptığın değişiklik şablonu etkilemez.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="add-day-template">Şablon</FieldLabel>
          <LabeledSelect id="add-day-template" value={templateId || undefined} labels={labels} onChange={setTemplateId} />
          {summary ? (
            <FieldDescription className="tabular-nums">
              {formatNumber(summary.rows)} hareket · {formatNumber(summary.workingSets)} set · ≈ {formatNumber(summary.minutes)} dk
            </FieldDescription>
          ) : null}
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="button" disabled={!template} onClick={() => template && onAdd(template)}>
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
