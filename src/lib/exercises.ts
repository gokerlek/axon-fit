import 'server-only';
import * as v from 'valibot';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { appRepo } from './github/client';
import { readJson, writeJson } from './github/files';
import { customExercisesSchema, type Exercise } from './schemas/exercise';

/**
 * Egzersizler: hazır kütüphane (pakette) + PT'nin kendi egzersizleri (repo'da).
 *
 * İkisi ayrı durur ki paket güncellemesi PT'nin eklediklerini ezmesin. Aynı kimlik
 * iki tarafta da varsa PT'ninki kazanır — böylece PT hazır bir egzersizin ipuçlarını
 * kendine göre değiştirebilir.
 *
 * Sunucuda önbellek yok, her okuma GitHub'dan taze: kaydın hemen ardından açılan
 * sayfa yeni kaydı görmeli. Next'in veri önbelleği rota ucundan temizlendiğinde bu
 * garanti değil (kayıttan sonra açılan detay sayfası eski listeyi görüp 404 verdi).
 * Tek PT'li uygulamada her sayfada bir GitHub okuması sorun değil; istemcide
 * React Query önbelleği var.
 */

export const CUSTOM_EXERCISES_PATH = 'data/exercises.json';

export type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/** Taze okuma (yazmadan önce `sha` için ve silme/güncelleme kararları için). */
export async function readCustomExercises(): Promise<{ items: Exercise[]; sha: string | null }> {
  const stored = await readJson<unknown>(appRepo(), CUSTOM_EXERCISES_PATH);
  if (!stored) return { items: [], sha: null };

  const parsed = v.safeParse(customExercisesSchema, stored.content);
  // Bozuk dosya uygulamayı düşürmez: hazır kütüphaneyle devam edilir.
  return { items: parsed.success ? parsed.output : [], sha: stored.sha };
}

export async function writeCustomExercises(
  items: Exercise[],
  message: string,
  sha: string | null,
): Promise<void> {
  await writeJson(appRepo(), CUSTOM_EXERCISES_PATH, items, { sha: sha ?? undefined, message });
}

export async function listExercises(): Promise<ExerciseWithSource[]> {
  const { items } = await readCustomExercises();
  const customIds = new Set(items.map((item) => item.id));

  return [
    ...items.map((item) => ({ ...item, source: 'custom' as const })),
    ...EXERCISE_LIBRARY.filter((item) => !customIds.has(item.id)).map((item) => ({
      ...item,
      source: 'library' as const,
    })),
  ].sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

/** Başlıktan kimlik üretir; çakışırsa sonuna sayı ekler. */
export function slugify(title: string, taken: Set<string>): string {
  const harfler: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c', â: 'a' };
  const base =
    title
      .toLowerCase()
      .replace(/[ığüşöçâ]/g, (ch) => harfler[ch] ?? ch)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'egzersiz';

  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type ExerciseDetail = ExerciseWithSource & {
  /** PT'nin sürümü hazır kütüphanedeki bir egzersizin yerine geçiyor ("Varsayılana dön" mümkün). */
  overridesLibrary: boolean;
};

export async function getExercise(id: string, list?: ExerciseWithSource[]): Promise<ExerciseDetail | null> {
  const all = list ?? (await listExercises());
  const found = all.find((item) => item.id === id);
  if (!found) return null;
  const inLibrary = EXERCISE_LIBRARY.some((item) => item.id === id);
  return { ...found, overridesLibrary: found.source === 'custom' && inLibrary };
}
