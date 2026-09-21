'use client';

import { useMemo, useState } from 'react';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation, useServiceQuery } from '@/lib/query/use-service';
import {
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  type Exercise,
  type Muscle,
} from '@/lib/schemas/exercise';
import { ExerciseForm } from './exercise-form';
import styles from './exercises.module.css';

type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/**
 * Egzersiz listesi: arama, kas grubuna göre süzme, ekleme/düzenleme/silme.
 *
 * İlk veri sunucudan gelir (`initial`), sonrası React Query'de. Yazma işlemleri
 * `invalidate` ile listeyi tazeler; elle yeniden çekme yok.
 */
export function ExerciseList({ initial }: { initial: ExerciseWithSource[] }) {
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [adding, setAdding] = useState(false);

  const { data } = useServiceQuery({
    key: ['exercises'],
    fn: ({ signal }) => fetchJson<{ exercises: ExerciseWithSource[] }>('/api/exercises', { signal }),
    initialData: { exercises: initial },
  });

  const remove = useServiceMutation({
    fn: (id: string) => fetchJson<{ ok: true }>(`/api/exercises/${id}`, { method: 'DELETE' }),
    invalidate: [['exercises']],
    notify: { success: 'Egzersiz silindi.' },
  });

  const exercises = data?.exercises ?? initial;

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr');
    return exercises.filter((item) => {
      if (muscle && item.targetMuscle !== muscle && !item.secondaryMuscles.includes(muscle)) return false;
      if (!query) return true;
      return item.title.toLocaleLowerCase('tr').includes(query);
    });
  }, [exercises, search, muscle]);

  // Süzgeçte yalnız gerçekten kullanılan kas grupları görünsün.
  const usedMuscles = useMemo(
    () => MUSCLES.filter((item) => exercises.some((exercise) => exercise.targetMuscle === item)),
    [exercises],
  );

  if (adding || editing) {
    return (
      <ExerciseForm
        editing={editing}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
        onCancel={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <>
      <div className={styles.top}>
        <div>
          <h1>Egzersizler</h1>
          <span className={styles.count}>
            {exercises.length} egzersiz · {exercises.filter((item) => item.source === 'custom').length} tanesi senin
          </span>
        </div>
        <button type="button" className={styles.primary} onClick={() => setAdding(true)}>
          Yeni
        </button>
      </div>

      <input
        className={styles.search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Egzersiz ara"
        aria-label="Egzersiz ara"
        type="search"
      />

      <div className={styles.filters}>
        <button type="button" className={styles.chip} aria-pressed={muscle === null} onClick={() => setMuscle(null)}>
          Hepsi
        </button>
        {usedMuscles.map((item) => (
          <button
            key={item}
            type="button"
            className={styles.chip}
            aria-pressed={muscle === item}
            onClick={() => setMuscle(muscle === item ? null : item)}>
            {MUSCLE_LABELS[item]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>Aramana uyan egzersiz yok.</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>
                  {item.title}
                  {item.source === 'custom' ? <span className={styles.badge}>senin</span> : null}
                </div>
                <div className={styles.meta}>
                  {MUSCLE_LABELS[item.targetMuscle]} · {EQUIPMENT_LABELS[item.equipment]}
                  {item.video ? ' · video var' : ''}
                </div>
              </div>

              {item.source === 'custom' ? (
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setEditing(item)}
                    aria-label={`${item.title} egzersizini düzenle`}>
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.danger}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`"${item.title}" silinsin mi?`)) remove.mutate(item.id);
                    }}
                    aria-label={`${item.title} egzersizini sil`}>
                    Sil
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
