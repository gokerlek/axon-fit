'use client';

import { Field, FieldArray, Form, getDeepError, insert, remove, setInput, useForm } from '@formisch/react';
import { fetchJson } from '@/lib/query/errors';
import { applyFieldErrors } from '@/lib/query/field-errors';
import { useServiceMutation } from '@/lib/query/use-service';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  TRACKING_TYPES,
  exerciseFormSchema,
  type Exercise,
  type ExerciseInput,
  type Muscle,
} from '@/lib/schemas/exercise';
import styles from './exercises.module.css';

const TRACKING_LABELS: Record<(typeof TRACKING_TYPES)[number], string> = {
  weight_reps: 'Ağırlık + tekrar',
  bodyweight_reps: 'Vücut ağırlığı (tekrar)',
  duration: 'Süre',
};

const BLANK: ExerciseInput = {
  title: '',
  description: '',
  cues: [''],
  category: 'compound',
  trackingType: 'weight_reps',
  equipment: 'barbell',
  targetMuscle: 'chest',
  secondaryMuscles: [],
  loadIncrementKg: 2.5,
  minLoadKg: 0,
};

/**
 * Egzersiz ekleme/düzenleme.
 *
 * İpuçları `FieldArray` ile: satır eklenip çıkarılabiliyor. Kaydedince PT'nin
 * repo'sundaki `data/exercises.json` güncellenir ve liste tazelenir.
 */
/** Düzenlemede kimlik forma girmez: şemada yok. */
function toInput({ id: _id, ...rest }: Exercise): ExerciseInput {
  return rest;
}

function FormErrorSummary({ form }: { form: ReturnType<typeof useForm<typeof exerciseFormSchema>> }) {
  const error = getDeepError(form);
  if (!error) return null;
  return (
    <p role="alert" className={styles.error}>
      {error}
    </p>
  );
}

export function ExerciseForm({
  editing,
  onDone,
  onCancel,
}: {
  editing: Exercise | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const form = useForm({
    schema: exerciseFormSchema,
    initialInput: editing ? toInput(editing) : BLANK,
  });

  const save = useServiceMutation({
    fn: (values: ExerciseInput) =>
      fetchJson<{ id: string }>('/api/exercises', {
        method: 'POST',
        // Yeni egzersizde kimlik sunucuda başlıktan üretilir; düzenlemede mevcut kimlik gider.
        body: JSON.stringify(editing ? { ...values, id: editing.id } : values),
      }),
    invalidate: [['exercises']],
    notify: { success: editing ? 'Egzersiz güncellendi.' : 'Egzersiz eklendi.' },
    onError: (error) => applyFieldErrors(form as never, error),
    onSuccess: onDone,
  });

  return (
    <Form
      of={form}
      className={styles.panel}
      onSubmit={(values) => save.mutateAsync(values as ExerciseInput).catch(() => undefined)}>
      {/* Ekranda karşılığı olmayan bir doğrulama hatası kalırsa form sessizce
          gönderilmez; bu özet o durumu görünür kılar. */}
      <FormErrorSummary form={form} />
      <Field of={form} path={['title']}>
        {(field) => (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="title">
              Egzersiz adı
            </label>
            <input {...field.props} id="title" className={styles.input} value={field.input ?? ''} />
            {field.errors ? <p className={styles.error}>{field.errors[0]}</p> : null}
          </div>
        )}
      </Field>

      <Field of={form} path={['description']}>
        {(field) => (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">
              Açıklama
            </label>
            <textarea
              {...field.props}
              id="description"
              className={styles.textarea}
              value={field.input ?? ''}
              placeholder="Hareketin ne işe yaradığı, kısa."
            />
            {field.errors ? <p className={styles.error}>{field.errors[0]}</p> : null}
          </div>
        )}
      </Field>

      <div className={styles.field}>
        <span className={styles.label}>İpuçları</span>
        <FieldArray of={form} path={['cues']}>
          {(array) => (
            <>
              {array.items.map((item, index) => (
                <div key={item} className={styles.cueRow}>
                  <Field of={form} path={['cues', index]}>
                    {(field) => (
                      <input
                        {...field.props}
                        className={styles.input}
                        value={field.input ?? ''}
                        placeholder="Kürek kemiklerini sıkıştır"
                      />
                    )}
                  </Field>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.danger}`}
                    aria-label={`${index + 1}. ipucunu sil`}
                    onClick={() => remove(form, { path: ['cues'], at: index })}>
                    Sil
                  </button>
                </div>
              ))}
              {array.items.length < 6 ? (
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => insert(form, { path: ['cues'], initialInput: '' })}>
                  İpucu ekle
                </button>
              ) : null}
            </>
          )}
        </FieldArray>
      </div>

      <div className={styles.row}>
        <Field of={form} path={['targetMuscle']}>
          {(field) => (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="targetMuscle">
                Hedef kas
              </label>
              <select {...field.props} id="targetMuscle" className={styles.select} value={field.input ?? ''}>
                {MUSCLES.map((muscle) => (
                  <option key={muscle} value={muscle}>
                    {MUSCLE_LABELS[muscle]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>

        <Field of={form} path={['equipment']}>
          {(field) => (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="equipment">
                Ekipman
              </label>
              <select {...field.props} id="equipment" className={styles.select} value={field.input ?? ''}>
                {EQUIPMENT.map((item) => (
                  <option key={item} value={item}>
                    {EQUIPMENT_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>
      </div>

      <div className={styles.row}>
        <Field of={form} path={['category']}>
          {(field) => (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="category">
                Tür
              </label>
              <select {...field.props} id="category" className={styles.select} value={field.input ?? ''}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {CATEGORY_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>

        <Field of={form} path={['trackingType']}>
          {(field) => (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trackingType">
                Kayıt türü
              </label>
              <select {...field.props} id="trackingType" className={styles.select} value={field.input ?? ''}>
                {TRACKING_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {TRACKING_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>
      </div>

      <Field of={form} path={['secondaryMuscles']}>
        {(field) => {
          const selected = (field.input ?? []) as Muscle[];
          return (
            <div className={styles.field}>
              <span className={styles.label}>Yardımcı kaslar</span>
              <div className={styles.filters}>
                {MUSCLES.map((muscle) => {
                  const on = selected.includes(muscle);
                  return (
                    <button
                      key={muscle}
                      type="button"
                      className={styles.chip}
                      aria-pressed={on}
                      onClick={() =>
                        setInput(form, {
                          path: ['secondaryMuscles'],
                          input: on ? selected.filter((item) => item !== muscle) : [...selected, muscle],
                        })
                      }>
                      {MUSCLE_LABELS[muscle]}
                    </button>
                  );
                })}
              </div>
              {field.errors ? <p className={styles.error}>{field.errors[0]}</p> : null}
            </div>
          );
        }}
      </Field>

      <div className={styles.row}>
        <Field of={form} path={['loadIncrementKg']}>
          {(field) => (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="loadIncrementKg">
                Artış (kg)
              </label>
              <input
                {...field.props}
                id="loadIncrementKg"
                className={styles.input}
                type="number"
                step="0.5"
                value={field.input ?? 0}
              />
              {field.errors ? <p className={styles.error}>{field.errors[0]}</p> : null}
            </div>
          )}
        </Field>

        <Field of={form} path={['minLoadKg']}>
          {(field) => (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="minLoadKg">
                Taban ağırlık (kg)
              </label>
              <input
                {...field.props}
                id="minLoadKg"
                className={styles.input}
                type="number"
                step="0.5"
                value={field.input ?? 0}
              />
              {field.errors ? <p className={styles.error}>{field.errors[0]}</p> : null}
            </div>
          )}
        </Field>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          Vazgeç
        </button>
        <button type="submit" className={styles.primary} disabled={save.isPending}>
          {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </Form>
  );
}
