import 'server-only';
import * as v from 'valibot';
import type { DeviceWithSource } from './devices';
import type { ExerciseWithSource } from './exercises';
import { appRepo, GithubError } from './github/client';
import { deleteFile, getFileSha, listDir, readJson, writeJson } from './github/files';
import type { TemplateOption } from './program-plan';
import { TEMPLATE_ID_PATTERN, templateSchema, type Template } from './schemas/template';
import type { EditorDevice, PickerExercise } from './template-edit';

/**
 * Antrenman şablonları: her biri uygulama repo'sunda ayrı dosya (`data/templates/<id>.json`,
 * SPEC §3). Ayrı dosya: iki şablona aynı anda yazmak çakışmaz, geçmiş şablon başına okunur.
 *
 * Liste, dosyaların içerik özetine (blob sha) göre bellekte tutulur: sha içeriğin
 * kendisinden çıktığı için önbellek hiç eskimez — dosya değişince sha da değişir.
 * Tek dosya okuması her zaman tazedir (düzenleme ve kayıt sha'yı buradan alır).
 */

export const TEMPLATES_DIR = 'data/templates';
const FILE_PATTERN = /^t_[a-z0-9]{8}\.json$/;
const CACHE_LIMIT = 300;
const READ_CHUNK = 8;

/** Dosya yolu; kimlik kalıba uymuyorsa (ör. `../clients`) istek hiç çıkmaz. */
export function templatePath(id: string): string {
  if (!TEMPLATE_ID_PATTERN.test(id)) throw new GithubError(`Geçersiz şablon kimliği: ${id}`, 400);
  return `${TEMPLATES_DIR}/${id}.json`;
}

export type TemplateFile =
  | { sha: string; template: Template; name: string; problem: null }
  /** Okunamayan dosya (bozuk JSON, şemaya uymuyor, kimlik dosya adıyla uyuşmuyor). */
  | { sha: string; template: null; name: string | null; problem: string; id: string };

function parseTemplateFile(id: string, content: unknown, sha: string): TemplateFile {
  const raw = content && typeof content === 'object' ? (content as Record<string, unknown>) : {};
  const name = typeof raw.name === 'string' ? raw.name : null;
  const parsed = v.safeParse(templateSchema, content);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    return { sha, template: null, name, id, problem: `${v.getDotPath(issue) ?? 'dosya'}: ${issue.message}` };
  }
  if (parsed.output.id !== id) {
    return { sha, template: null, name, id, problem: 'Dosyadaki kimlik dosya adıyla uyuşmuyor.' };
  }
  return { sha, template: parsed.output, name: parsed.output.name, problem: null };
}

/** Taze okuma. `null`: yok ya da kimlik geçersiz. Bozuk dosya hata değil, sorunuyla döner. */
export async function readTemplateFile(id: string): Promise<TemplateFile | null> {
  if (!TEMPLATE_ID_PATTERN.test(id)) return null;
  const path = templatePath(id);
  let stored: Awaited<ReturnType<typeof readJson<unknown>>>;
  try {
    stored = await readJson<unknown>(appRepo(), path);
  } catch (error) {
    // Bozuk JSON: silinebilsin ya da üzerine yazılabilsin diye sha ayrıca alınır.
    if (error instanceof GithubError && error.status === 500) {
      const sha = await getFileSha(appRepo(), path);
      return sha ? { sha, template: null, name: null, id, problem: 'Dosya JSON olarak okunamadı.' } : null;
    }
    throw error;
  }
  return stored ? parseTemplateFile(id, stored.content, stored.sha) : null;
}

/** İçerik özeti → okunmuş dosya. Ekleme sırasıyla en eskisi düşer. */
const cache = new Map<string, TemplateFile>();

function remember(file: TemplateFile) {
  cache.delete(file.sha);
  cache.set(file.sha, file);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function sortKey(file: TemplateFile): string {
  return file.template ? file.template.name : (file.name ?? file.id);
}

/**
 * Bütün şablonlar: geçerliler ada göre, okunamayanlar sonda. Önbellekte olmayanlar
 * 8'erli okunur. Tek dosyanın hatası listeyi düşürmez (okunamayan olarak görünür);
 * klasör okunamazsa hata fırlar.
 */
export async function listTemplates(): Promise<TemplateFile[]> {
  const entries = (await listDir(appRepo(), TEMPLATES_DIR)).filter((entry) => entry.type === 'file' && FILE_PATTERN.test(entry.name));
  const files = new Map<string, TemplateFile>();
  const misses = entries.filter((entry) => {
    const cached = cache.get(entry.sha);
    if (cached) files.set(entry.name, cached);
    return !cached;
  });

  for (let start = 0; start < misses.length; start += READ_CHUNK) {
    await Promise.all(
      misses.slice(start, start + READ_CHUNK).map(async (entry) => {
        const id = entry.name.replace(/\.json$/, '');
        try {
          const file = await readTemplateFile(id);
          if (!file) return;
          // Okunan sürümün sha'sıyla saklanır: liste ile okuma arasında değiştiyse bir sonraki liste yeniden okur.
          remember(file);
          files.set(entry.name, file);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Okunamadı.';
          files.set(entry.name, { sha: entry.sha, template: null, name: null, id, problem: message });
        }
      }),
    );
  }

  const all = entries.flatMap((entry) => {
    const file = files.get(entry.name);
    return file ? [file] : [];
  });
  return [
    ...all.filter((file) => file.template).sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'tr')),
    ...all.filter((file) => !file.template).sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'tr')),
  ];
}

/** Seçiciler için geçerli şablonların kimliği ve adı (ör. danışanın başlangıç şablonu). */
export async function templateChoices(): Promise<{ id: string; name: string }[]> {
  return (await listTemplates()).flatMap((file) => (file.template ? [{ id: file.template.id, name: file.template.name }] : []));
}

/**
 * Danışanlara açık şablonlar (`docs/design/kendi-program.md` §3.8): kendi programın "Hazır şablondan" başlangıcı ve
 * gün ekleme. Yalnız bayraklı (`sharedWithClients`) ve okunabilen şablonlar; açıklama gönderilmez.
 */
export async function clientTemplates(): Promise<TemplateOption[]> {
  return (await listTemplates()).flatMap((file) =>
    file.template?.sharedWithClients ? [{ id: file.template.id, name: file.template.name, blocks: file.template.blocks }] : [],
  );
}

/**
 * Danışanın kimlikle okuması (`?sablon=t_…`): şablon kimlikleri tahmin edilebilir, bu yüzden işaretsiz şablon
 * yokmuş gibi null döner (liste süzgeci yetmez, §3.8).
 */
export async function clientTemplate(id: string): Promise<TemplateOption | null> {
  const file = await readTemplateFile(id);
  const template = file?.template;
  return template && template.sharedWithClients === true ? { id: template.id, name: template.name, blocks: template.blocks } : null;
}

export async function writeTemplate(template: Template, options: { sha?: string; message: string }): Promise<{ sha: string }> {
  return writeJson(appRepo(), templatePath(template.id), template, { sha: options.sha, message: options.message });
}

export async function deleteTemplateFile(id: string, sha: string, message: string): Promise<void> {
  await deleteFile(appRepo(), templatePath(id), { sha, message });
}

/**
 * Düzenleyicinin kütüphane paneli için egzersizler: yalnız gereken alanlar (ipucu,
 * açıklama, video ve medikal etiketler yok) — sayfa yükü küçük kalsın.
 */
export function pickerExercises(list: readonly ExerciseWithSource[]): PickerExercise[] {
  return list.map((exercise) => ({
    id: exercise.id,
    title: exercise.title,
    category: exercise.category,
    trackingType: exercise.trackingType,
    equipment: exercise.equipment,
    ...(exercise.deviceId ? { deviceId: exercise.deviceId } : {}),
    ...(exercise.pattern ? { pattern: exercise.pattern } : {}),
    ...(exercise.grip ? { grip: exercise.grip } : {}),
    ...(exercise.alternatives?.length ? { alternatives: exercise.alternatives } : {}),
    ...(exercise.progression ? { progression: exercise.progression } : {}),
    loadStepKg: exercise.loadStepKg,
    minLoadKg: exercise.minLoadKg,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    stabilizerMuscles: exercise.stabilizerMuscles,
    source: exercise.source,
  }));
}

/** Düzenleyicinin cihazları: ad, tür ve ağırlık ayarı (görsel, not ve aparatlar yok). */
export function pickerDevices(list: readonly DeviceWithSource[]): EditorDevice[] {
  return list.map((device) => ({
    id: device.id,
    name: device.name,
    kind: device.kind,
    ...(device.baseKg !== undefined ? { baseKg: device.baseKg } : {}),
    ...(device.stepKg !== undefined ? { stepKg: device.stepKg } : {}),
    ...(device.maxKg !== undefined ? { maxKg: device.maxKg } : {}),
    ...(device.addOnsKg?.length ? { addOnsKg: device.addOnsKg } : {}),
    ...(device.pulleyRatio !== undefined ? { pulleyRatio: device.pulleyRatio } : {}),
    ...(device.weightsKg?.length ? { weightsKg: device.weightsKg } : {}),
  }));
}
