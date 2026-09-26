import { createHash } from 'node:crypto';
import * as v from 'valibot';
import {
  attachmentChoiceProblem,
  dropAttachmentFromDevices,
  dropAttachmentFromExercises,
  dropDetachedAttachments,
  dropDeviceFromExercises,
  dropPinnedAlternative,
  unknownAttachmentsProblem,
} from './catalog-refs.ts';
import {
  ATTACHMENTS,
  DEVICES,
  EXERCISES,
  readCatalog,
  readRetiredIds,
  retireId,
  updateCatalog,
  withLibrary,
  writeCatalog,
  type Catalog,
  type CatalogKind,
} from './catalog-store.ts';
import { takesAttachments } from './device-loads.ts';
import { GithubError } from './github/errors.ts';
import type { RepoFiles } from './repo-files.ts';
import { attachmentIdSchema, attachmentSaveSchema, LEGACY_ATTACHMENT_IDS } from './schemas/attachment.ts';
import {
  deviceIdSchema,
  deviceSaveSchema,
  needsBase,
  needsMax,
  needsStep,
  needsWeights,
  takesAddOns,
  type Device,
} from './schemas/device.ts';
import { exerciseSchema } from './schemas/exercise.ts';
import { newRecordId } from './slug.ts';
import { brokenRecordMessage, hasUnreadable, storedIds } from './stored-list.ts';

/**
 * Egzersiz, cihaz ve aparat uçlarının çekirdeği (SPEC §7.2, §7.3). Rota yalnız oturumu denetler
 * ve isteği buraya verir; GitHub'a `RepoFiles` ile erişilir, sonuç durum kodu ve gövde olarak
 * döner. Silme temizliği, kaydetme denetimleri ve kimlik kuralları böylece `npm test`'te sahte
 * repo'yla sınanır (`catalog-actions.test.ts`).
 *
 * Kurallar:
 * - Aynı kimlikte okunamayan (ham) kayıt varken o kimliğe yazılmaz (409): yazılsaydı dosya
 *   düzeltilince aynı kimlikte iki kayıt olurdu.
 * - Silinen PT kaydının kimliği bir daha verilmez (`data/retired-ids.json`, silmenin son adımı).
 *   Hazır kaydın PT sürümünü silmek ("Varsayılana dön") silme değildir: kimlik ayrılmaz.
 * - Silmede bağlar önce kalkar, her dosya taze okunur ve kendi `sha`'sıyla yazılır. Yarıda kalırsa
 *   ne yapıldığı söylenir; silmeyi yeniden denemek kalan adımları tamamlar.
 *
 * Saf; yol takma adıyla çalışma zamanı içe aktarması yok (testler Node'un test aracıyla çalışır).
 */

/** Ucun yanıtı: rota bunu olduğu gibi döner (`{ error, fields? }` ya da başarı verisi). */
export type Outcome = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown> = { ok: true }): Outcome => ({ status: 200, body });
const problem = (status: number, error: string): Outcome => ({ status, body: { error } });
const fieldProblem = (field: string, message: string): Outcome => ({
  status: 400,
  body: { error: 'Bilgileri kontrol et.', fields: { [field]: message } },
});
const brokenRecord = (path: string): Outcome => problem(409, brokenRecordMessage(path));
const noIdFromName = (field: string): Outcome => ({
  status: 400,
  body: { error: 'Bu addan geçerli bir kimlik üretilemedi. Adı değiştirip tekrar dene.', fields: { [field]: 'Bu addan kimlik üretilemedi.' } },
});

/** Şema hataları alan alan (her alanın ilk hatası). */
function invalidInput(issues: readonly v.BaseIssue<unknown>[]): Outcome {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((segment) => String(segment.key)).join('.');
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return { status: 400, body: { error: 'Bilgileri kontrol et.', fields } };
}

/** Beklenmeyen hata: GitHub'ın nedeni ve durumu, yoksa 502. */
function failed(error: unknown, fallback: string): Outcome {
  const failure = error instanceof GithubError ? error : null;
  return problem(failure?.status ?? 502, failure?.message ?? fallback);
}

/** İş bir adımda durdu: ne yapıldığı ve GitHub'ın nedeni (409'da istemci bir kez yeniden dener). */
function stopped(error: unknown, message: string): Outcome {
  const failure = error instanceof GithubError ? error : null;
  return problem(failure?.status ?? 502, failure ? `${message} ${failure.message}` : message);
}

/** Görsel artıkta kalmasın; silinemezse kayıt yine doğru, yalnız repo'da artık kalır. */
async function removeMedia(files: RepoFiles, path: string, message: string): Promise<void> {
  const sha = await files.getFileSha(path).catch(() => null);
  if (sha) await files.deleteFile(path, { sha, message }).catch(() => undefined);
}

const RETIRE_FAILED: Record<CatalogKind, string> = {
  exercises: 'Egzersiz silindi ama silinenler listesine yazılamadı; silmeyi tekrar dene.',
  devices: 'Cihaz silindi ama silinenler listesine yazılamadı; silmeyi tekrar dene.',
  attachments: 'Aparat silindi ama silinenler listesine yazılamadı; silmeyi tekrar dene.',
};

/** Silmenin son adımı: kimlik bir daha verilmesin. Durursa kayıt gitmiştir; silmeyi yeniden denemek bunu tamamlar. */
async function retire(files: RepoFiles, kind: CatalogKind, id: string): Promise<Outcome> {
  try {
    await retireId(files, kind, id, `Silinen kimlik bir daha verilmeyecek: ${id}`);
    return ok();
  } catch (error) {
    return stopped(error, RETIRE_FAILED[kind]);
  }
}

/**
 * Dosyada da hazır kütüphanede de olmayan kimliği silmek: önceki silme kaydı kaldırıp kimliği
 * listeye yazamadan durmuş olabilir; yeniden deneme o adımı tamamlar (zaten listedeyse yazmaz).
 * Kimlik biçimine uymayan yol listeye hiç yazılmaz.
 */
async function finishDeletion(
  files: RepoFiles,
  kind: CatalogKind,
  idSchema: v.GenericSchema<string>,
  id: string,
  notFound: string,
): Promise<Outcome> {
  if (!v.is(idSchema, id)) return problem(404, notFound);
  return retire(files, kind, id);
}

/** Cihaz: hazır katalogda ya da PT'nin (okunabilen) cihazlarında olmalı. */
const DEVICE_MISSING = 'Bu cihaz bulunamadı: silinmiş ya da dosyada okunamıyor olabilir.';

async function findDevice(files: RepoFiles, id: string): Promise<Device | undefined> {
  return withLibrary((await readCatalog(files, DEVICES)).items, DEVICES.library).find((item) => item.id === id);
}

// ── Egzersizler ────────────────────────────────────────────────────────────────

/** Kimliksiz gelen istek yeni egzersizdir: kimlik başlıktan üretilir. */
const exerciseSaveSchema = v.object({ ...exerciseSchema.entries, id: v.optional(exerciseSchema.entries.id) });

/**
 * Egzersiz kaydı: yeni ya da (kimlikle) güncelleme. Hazır bir egzersizi kaydetmek PT'nin sürümünü oluşturur.
 *
 * - Cihaz var olmalı (hazır ya da PT'nin); aparat o cihazın aparatlarından biri olmalı.
 * - Hazır egzersizin PT sürümü ilk kez yazılırken kütüphanedeki aparatı, PT'nin cihaz sürümünde
 *   yoksa düşer (PT aparatı cihazından çıkarmış olabilir). Gerekçe: PT'nin dosyasındaki her
 *   egzersizin aparatı cihazında durur; cihaz kaydı ve "Varsayılana dön" bunu korur, form da yalnız
 *   cihazdaki aparatları sunar. Denetim kütüphanedeki cihaza göre yapılsaydı dosyaya bu kurala
 *   uymayan bir kayıt girer, bir sonraki cihaz kaydında sessizce değişirdi. PT'nin kendi seçtiği
 *   (kütüphanedekinden farklı) aparat cihazda yoksa yine 400.
 */
export async function saveExercise(files: RepoFiles, raw: unknown): Promise<Outcome> {
  const parsed = v.safeParse(exerciseSaveSchema, raw);
  if (!parsed.success) return invalidInput(parsed.issues);
  // Sabitlenen muadiller kendi ucundan yazılır; burada istemcinin gönderdiği yok sayılır.
  const { id: requestedId, primaryMuscles, secondaryMuscles, stabilizerMuscles, alternatives: _ignored, ...rest } = parsed.output;

  try {
    const file = await readCatalog(files, EXERCISES);
    if (requestedId && hasUnreadable(file, requestedId)) return brokenRecord(EXERCISES.path);
    const index = requestedId ? file.items.findIndex((item) => item.id === requestedId) : -1;
    const library = requestedId ? EXERCISES.library.find((item) => item.id === requestedId) : undefined;
    // Kimlikle gelen istek var olan kaydı günceller: silinmiş kimlik (eski sekmeden) yeniden doğmaz.
    if (requestedId && index < 0 && !library) return problem(404, 'Egzersiz bulunamadı.');

    let attachmentId = rest.attachmentId;
    if (rest.deviceId || attachmentId) {
      const device = rest.deviceId ? await findDevice(files, rest.deviceId) : undefined;
      if (rest.deviceId && !device) return fieldProblem('deviceId', DEVICE_MISSING);
      const inherited = index < 0 && library !== undefined && attachmentId === library.attachmentId && rest.deviceId === library.deviceId;
      if (inherited && attachmentChoiceProblem({ deviceId: rest.deviceId, attachmentId }, device)) attachmentId = undefined;
      const choice = attachmentChoiceProblem({ deviceId: rest.deviceId, attachmentId }, device);
      if (choice) return fieldProblem('attachmentId', choice);
    }

    // Bir kas yalnız bir seviyede: hedef > yardımcı > dengeleyici.
    const input = {
      ...rest,
      attachmentId,
      primaryMuscles,
      secondaryMuscles: secondaryMuscles.filter((muscle) => !primaryMuscles.includes(muscle)),
      stabilizerMuscles: stabilizerMuscles.filter((muscle) => !primaryMuscles.includes(muscle) && !secondaryMuscles.includes(muscle)),
    };

    if (requestedId) {
      const stored = file.items[index] ?? library;
      const entry = { ...input, id: requestedId, alternatives: stored?.alternatives };
      const next = index >= 0 ? file.items.map((item, i) => (i === index ? entry : item)) : [...file.items, entry];
      await writeCatalog(files, EXERCISES, next, `Egzersiz güncellendi: ${input.title}`, file);
      return ok({ id: requestedId });
    }

    // Dosyadaki (okunamayanlar dahil), hazır ve silinmiş kimlikler dolu.
    const { ids: retired } = await readRetiredIds(files);
    const taken = new Set([...storedIds(file), ...EXERCISES.library.map((item) => item.id), ...retired.exercises]);
    const id = newRecordId(input.title, taken, exerciseSchema.entries.id);
    if (!id) return noIdFromName('title');
    await writeCatalog(files, EXERCISES, [...file.items, { ...input, id }], `Egzersiz eklendi: ${input.title}`, file);
    return ok({ id });
  } catch (error) {
    return failed(error, 'Egzersiz kaydedilemedi.');
  }
}

/**
 * PT'nin egzersizini siler; hazır bir egzersizin sürümüyse varsayılana döner. Hazır kütüphanedekiler
 * silinemez. Silinen egzersiz PT'nin diğer egzersizlerindeki sabitlemelerden düşer (aynı dosya, tek
 * yazma), sonra kimliği silinenler listesine girer. Varsayılana dönüşte kimlik hazır kütüphanede
 * yaşar: sabitlemeler kalır, kimlik ayrılmaz.
 */
export async function deleteExercise(files: RepoFiles, id: string): Promise<Outcome> {
  try {
    const file = await readCatalog(files, EXERCISES);
    if (hasUnreadable(file, id)) return brokenRecord(EXERCISES.path);
    const target = file.items.find((item) => item.id === id);
    const inLibrary = EXERCISES.library.some((item) => item.id === id);
    if (!target) {
      if (inLibrary) return problem(404, 'Bu egzersiz hazır kütüphaneden geliyor, silinemez.');
      return finishDeletion(files, 'exercises', exerciseSchema.entries.id, id, 'Egzersiz bulunamadı.');
    }

    const rest = file.items.filter((item) => item.id !== id);
    const next = inLibrary ? rest : (dropPinnedAlternative(rest, id) ?? rest);
    await writeCatalog(files, EXERCISES, next, `Egzersiz silindi: ${target.title}`, file);
    return inLibrary ? ok() : retire(files, 'exercises', id);
  } catch (error) {
    return failed(error, 'Egzersiz silinemedi.');
  }
}

const alternativesSchema = v.object({
  alternatives: v.pipe(
    v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/))),
    v.maxLength(12, 'En fazla 12 muadil sabitlenebilir.'),
  ),
});

/**
 * PT'nin sabitlediği muadilleri yazar (sıra korunur). Hazır bir egzersizde bu, düzenlemede olduğu
 * gibi PT'nin sürümünü oluşturur; kütüphanedeki aparat PT'nin cihaz sürümünde yoksa düşer (bkz. `saveExercise`).
 */
export async function pinAlternatives(files: RepoFiles, id: string, raw: unknown): Promise<Outcome> {
  const parsed = v.safeParse(alternativesSchema, raw);
  if (!parsed.success) return problem(400, parsed.issues[0].message);

  try {
    const file = await readCatalog(files, EXERCISES);
    if (hasUnreadable(file, id)) return brokenRecord(EXERCISES.path);
    const own = file.items.find((item) => item.id === id);
    const entry = own ?? EXERCISES.library.find((item) => item.id === id);
    if (!entry) return problem(404, 'Egzersiz bulunamadı.');

    const known = new Set([...file.items.map((item) => item.id), ...EXERCISES.library.map((item) => item.id)]);
    const alternatives = [...new Set(parsed.output.alternatives)].filter((other) => other !== id && known.has(other));
    let updated = { ...entry, alternatives: alternatives.length > 0 ? alternatives : undefined };
    if (!own && entry.attachmentId) {
      const device = entry.deviceId ? await findDevice(files, entry.deviceId) : undefined;
      if (attachmentChoiceProblem(entry, device)) updated = { ...updated, attachmentId: undefined };
    }
    const next = own ? file.items.map((item) => (item.id === id ? updated : item)) : [...file.items, updated];
    await writeCatalog(files, EXERCISES, next, `Muadiller güncellendi: ${entry.title}`, file);
    return ok({ alternatives });
  } catch (error) {
    return failed(error, 'Muadiller kaydedilemedi.');
  }
}

// ── Cihazlar ───────────────────────────────────────────────────────────────────

/**
 * Cihaz kaydı: yeni ya da (kimlikle) güncelleme. Hazır bir cihazı güncellemek PT'nin sürümünü
 * oluşturur. Türün kullanmadığı ayarlar kayda girmez (ör. dambıl setinde blok adımı); aparatlar
 * havuzda olmalı. Güncellemede cihazda artık olmayan aparat (çıkarıldı ya da tür aparat almıyor),
 * bu cihazı kullanan PT egzersizlerinden düşer.
 */
export async function saveDevice(files: RepoFiles, raw: unknown): Promise<Outcome> {
  const parsed = v.safeParse(deviceSaveSchema, raw);
  if (!parsed.success) return invalidInput(parsed.issues);

  const { id: requestedId, ...input } = parsed.output;
  const kind = input.kind;
  const clean: Omit<Device, 'id' | 'attachments'> = {
    name: input.name,
    kind,
    ...(needsBase(kind) ? { baseKg: input.baseKg } : {}),
    ...(needsStep(kind) ? { stepKg: input.stepKg } : {}),
    ...(needsMax(kind) || kind === 'plate_loaded' ? { maxKg: input.maxKg } : {}),
    ...(takesAddOns(kind) && input.addOnsKg?.length ? { addOnsKg: [...new Set(input.addOnsKg)].sort((a, b) => a - b) } : {}),
    ...(kind === 'cable' ? { pulleyRatio: input.pulleyRatio ?? 1 } : {}),
    ...(needsWeights(kind) ? { weightsKg: [...new Set(input.weightsKg ?? [])].sort((a, b) => a - b) } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
  // Havuzdaki aparat kimlikleri; aynısı iki kez girilmesin.
  const attachments = takesAttachments(kind) ? [...new Set(input.attachments ?? [])] : [];
  const withAttachments = attachments.length > 0 ? { attachments } : {};

  try {
    // Aparatlar havuzdan (hazır + PT'nin) seçilir: silinmiş ya da hiç olmamış kimlik yazılmaz.
    if (attachments.length > 0) {
      const pool = new Set(withLibrary((await readCatalog(files, ATTACHMENTS)).items, ATTACHMENTS.library).map((item) => item.id));
      const unknown = unknownAttachmentsProblem(attachments, pool);
      if (unknown) return fieldProblem('attachments', unknown);
    }

    const file = await readCatalog(files, DEVICES);
    if (requestedId) {
      if (hasUnreadable(file, requestedId)) return brokenRecord(DEVICES.path);
      const index = file.items.findIndex((item) => item.id === requestedId);
      const stored = file.items[index] ?? DEVICES.library.find((item) => item.id === requestedId);
      if (!stored) return problem(404, 'Cihaz bulunamadı.');
      // Görsel yalnız görsel ucundan yazılır; kayıtlı olan korunur.
      const entry: Device = { ...clean, ...withAttachments, id: requestedId, ...(stored.image ? { image: stored.image } : {}) };
      const next = index >= 0 ? file.items.map((item, i) => (i === index ? entry : item)) : [...file.items, entry];
      await writeCatalog(files, DEVICES, next, `Cihaz güncellendi: ${clean.name}`, file);
      try {
        await updateCatalog(
          files,
          EXERCISES,
          (items) => dropDetachedAttachments(items, requestedId, entry.attachments),
          `Cihazdan çıkarılan aparat egzersizlerden düştü: ${clean.name}`,
        );
      } catch (error) {
        return stopped(error, 'Cihaz kaydedildi ama cihazdan çıkarılan aparat egzersizlerden düşürülemedi; yeniden kaydet.');
      }
      return ok({ id: requestedId });
    }

    // Dosyadaki (okunamayanlar dahil), hazır ve silinmiş kimlikler dolu.
    const { ids: retired } = await readRetiredIds(files);
    const taken = new Set([...storedIds(file), ...DEVICES.library.map((item) => item.id), ...retired.devices]);
    const id = newRecordId(clean.name, taken, deviceIdSchema);
    if (!id) return noIdFromName('name');
    await writeCatalog(files, DEVICES, [...file.items, { ...clean, ...withAttachments, id }], `Cihaz eklendi: ${clean.name}`, file);
    return ok({ id });
  } catch (error) {
    return failed(error, 'Cihaz kaydedilemedi.');
  }
}

/**
 * PT'nin cihazını siler; hazır bir cihazın PT sürümüyse varsayılana döner. Hazır katalogdakiler
 * silinemez. Silinen cihaza bağlı PT egzersizleri cihazsız kalır (kendi ağırlık adımlarıyla devam
 * eder), cihazdan seçtikleri aparat da düşer (SPEC §7.3). Varsayılana dönüşte cihaz hazır sürümüyle
 * kalır; yalnız hazır sürümde olmayan aparat egzersizlerden düşer. Cihazın görseli de silinir;
 * aparat fotoğrafları havuzda kalır.
 *
 * Bağlar önce kalkar; yarıda kalırsa cihaz yerinde durur ve silme yeniden denenebilir.
 */
export async function deleteDevice(files: RepoFiles, id: string): Promise<Outcome> {
  try {
    const file = await readCatalog(files, DEVICES);
    if (hasUnreadable(file, id)) return brokenRecord(DEVICES.path);
    const target = file.items.find((item) => item.id === id);
    const library = DEVICES.library.find((item) => item.id === id);
    if (!target) {
      if (library) return problem(404, 'Bu cihaz hazır katalogdan geliyor, silinemez.');
      return finishDeletion(files, 'devices', deviceIdSchema, id, 'Cihaz bulunamadı.');
    }

    let unlinked = false;
    try {
      unlinked = await updateCatalog(
        files,
        EXERCISES,
        (items) => (library ? dropDetachedAttachments(items, id, library.attachments) : dropDeviceFromExercises(items, id)),
        library ? `Cihazın hazır sürümünde olmayan aparat egzersizlerden düştü: ${target.name}` : `Cihaz egzersizlerden çıkarıldı: ${target.name}`,
      );
    } catch (error) {
      return stopped(
        error,
        library
          ? 'Cihaz varsayılana dönmedi: hazır sürümde olmayan aparat egzersizlerden düşürülemedi.'
          : 'Cihaz silinmedi: bağlı egzersizlerden çıkarılamadı.',
      );
    }

    try {
      await writeCatalog(files, DEVICES, file.items.filter((item) => item.id !== id), `Cihaz silindi: ${target.name}`, file);
    } catch (error) {
      if (!unlinked) throw error;
      return stopped(
        error,
        library
          ? 'Hazır sürümde olmayan aparat egzersizlerden düştü ama cihaz varsayılana dönmedi.'
          : 'Cihaz bağlı egzersizlerden çıkarıldı ama silinemedi.',
      );
    }
    if (target.image) await removeMedia(files, target.image, 'Cihaz görseli silindi');
    return library ? ok() : retire(files, 'devices', id);
  } catch (error) {
    return failed(error, 'Cihaz silinemedi.');
  }
}

// ── Aparatlar ──────────────────────────────────────────────────────────────────

/** Yeni aparat ya da (kimlikle) güncelleme. Hazır bir aparatı değiştirmek PT'nin sürümünü oluşturur. */
export async function saveAttachment(files: RepoFiles, raw: unknown): Promise<Outcome> {
  const parsed = v.safeParse(attachmentSaveSchema, raw);
  if (!parsed.success) return invalidInput(parsed.issues);

  const { id: requestedId, name } = parsed.output;
  try {
    const file = await readCatalog(files, ATTACHMENTS);
    if (requestedId) {
      if (hasUnreadable(file, requestedId)) return brokenRecord(ATTACHMENTS.path);
      const index = file.items.findIndex((item) => item.id === requestedId);
      const stored = file.items[index] ?? ATTACHMENTS.library.find((item) => item.id === requestedId);
      if (!stored) return problem(404, 'Aparat bulunamadı.');
      // Fotoğraf yalnız görsel ucundan yazılır; kayıtlı olan korunur.
      const entry = { id: requestedId, name, ...(stored.image ? { image: stored.image } : {}) };
      const next = index >= 0 ? file.items.map((item, i) => (i === index ? entry : item)) : [...file.items, entry];
      await writeCatalog(files, ATTACHMENTS, next, `Aparat güncellendi: ${name}`, file);
      return ok({ id: requestedId });
    }

    // Dosyadaki (okunamayanlar dahil), hazır, silinmiş ve eski sabit kimlikler dolu.
    const { ids: retired } = await readRetiredIds(files);
    const taken = new Set([
      ...storedIds(file),
      ...ATTACHMENTS.library.map((item) => item.id),
      ...LEGACY_ATTACHMENT_IDS,
      ...retired.attachments,
    ]);
    const id = newRecordId(name, taken, attachmentIdSchema);
    if (!id) return noIdFromName('name');
    await writeCatalog(files, ATTACHMENTS, [...file.items, { id, name }], `Aparat eklendi: ${name}`, file);
    return ok({ id });
  } catch (error) {
    return failed(error, 'Aparat kaydedilemedi.');
  }
}

/**
 * PT'nin aparatını siler; hazır bir aparatın PT sürümüyse varsayılana döner. Hazır havuzdakiler
 * silinemez. Silinen aparat seçili olduğu PT cihazlarından ve egzersizlerinden düşer (SPEC §7.3);
 * varsayılana dönüşte kimlik hazır havuzda yaşadığı için bağlar kalır. Aparatın fotoğrafı da silinir.
 *
 * Bağlar önce kalkar (cihazlar, sonra egzersizler); yarıda kalırsa aparat yerinde durur ve silme
 * yeniden denenebilir: bağı kalmış silinmiş aparat olmaz.
 */
export async function deleteAttachment(files: RepoFiles, id: string): Promise<Outcome> {
  try {
    const file = await readCatalog(files, ATTACHMENTS);
    if (hasUnreadable(file, id)) return brokenRecord(ATTACHMENTS.path);
    const target = file.items.find((item) => item.id === id);
    const inLibrary = ATTACHMENTS.library.some((item) => item.id === id);
    if (!target) {
      if (inLibrary) return problem(404, 'Bu aparat hazır havuzdan geliyor, silinemez.');
      return finishDeletion(files, 'attachments', attachmentIdSchema, id, 'Aparat bulunamadı.');
    }

    let unlinked = false;
    if (!inLibrary) {
      try {
        unlinked = await updateCatalog(files, DEVICES, (items) => dropAttachmentFromDevices(items, id), `Aparat cihazlardan çıkarıldı: ${target.name}`);
      } catch (error) {
        return stopped(error, 'Aparat silinmedi: seçili olduğu cihazlardan çıkarılamadı.');
      }
      try {
        const changed = await updateCatalog(
          files,
          EXERCISES,
          (items) => dropAttachmentFromExercises(items, id),
          `Aparat egzersizlerden çıkarıldı: ${target.name}`,
        );
        unlinked ||= changed;
      } catch (error) {
        return stopped(
          error,
          unlinked
            ? 'Aparat silinmedi: cihazlardan çıkarıldı ama seçili olduğu egzersizlerden çıkarılamadı.'
            : 'Aparat silinmedi: seçili olduğu egzersizlerden çıkarılamadı.',
        );
      }
    }

    try {
      await writeCatalog(files, ATTACHMENTS, file.items.filter((item) => item.id !== id), `Aparat silindi: ${target.name}`, file);
    } catch (error) {
      if (!unlinked) throw error;
      return stopped(error, 'Aparat bağlı kayıtlarından çıkarıldı ama silinemedi.');
    }
    if (target.image) await removeMedia(files, target.image, 'Aparat fotoğrafı silindi');
    return inLibrary ? ok() : retire(files, 'attachments', id);
  } catch (error) {
    return failed(error, 'Aparat silinemedi.');
  }
}

// ── Görseller (cihaz görseli, aparat fotoğrafı) ────────────────────────────────

type ImageRecord = { id: string; name: string; image?: string | undefined };

type ImageText = {
  folder: string;
  notFound: string;
  upload: string;
  updated: string;
  oldRemoved: string;
  removed: string;
  fileRemoved: string;
  uploadFailed: string;
  removeFailed: string;
};

const DEVICE_IMAGE: ImageText = {
  folder: 'media/devices',
  notFound: 'Cihaz bulunamadı.',
  upload: 'Cihaz görseli',
  updated: 'Cihaz görseli güncellendi',
  oldRemoved: 'Eski cihaz görseli kaldırıldı',
  removed: 'Cihaz görseli kaldırıldı',
  fileRemoved: 'Cihaz görseli silindi',
  uploadFailed: 'Görsel yüklenemedi.',
  removeFailed: 'Görsel kaldırılamadı.',
};

const ATTACHMENT_IMAGE: ImageText = {
  folder: 'media/attachments',
  notFound: 'Aparat bulunamadı.',
  upload: 'Aparat fotoğrafı',
  updated: 'Aparat fotoğrafı güncellendi',
  oldRemoved: 'Eski aparat fotoğrafı kaldırıldı',
  removed: 'Aparat fotoğrafı kaldırıldı',
  fileRemoved: 'Aparat fotoğrafı silindi',
  uploadFailed: 'Aparat fotoğrafı yüklenemedi.',
  removeFailed: 'Aparat fotoğrafı kaldırılamadı.',
};

/**
 * Görsel yükleme (türü ve içeriği rota denetler): dosya `<klasör>/<kimlik>-<özet>.<uzantı>` olarak
 * yazılır, kayıtta yalnız `image` değişir. Hazır bir kayda görsel eklemek PT'nin sürümünü oluşturur.
 */
async function saveImageOf<T extends ImageRecord>(
  files: RepoFiles,
  catalog: Catalog<T>,
  text: ImageText,
  id: string,
  bytes: Uint8Array,
  extension: string,
): Promise<Outcome> {
  try {
    const file = await readCatalog(files, catalog);
    if (hasUnreadable(file, id)) return brokenRecord(catalog.path);
    const own = file.items.find((item) => item.id === id);
    const entry = own ?? catalog.library.find((item) => item.id === id);
    if (!entry) return problem(404, text.notFound);

    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const path = `${text.folder}/${id}-${digest}.${extension}`;
    const existing = await files.getFileSha(path);
    await files.writeBinary(path, bytes, { sha: existing ?? undefined, message: `${text.upload}: ${entry.name}` });

    const updated = { ...entry, image: path };
    const next = own ? file.items.map((item) => (item.id === id ? updated : item)) : [...file.items, updated];
    await writeCatalog(files, catalog, next, `${text.updated}: ${entry.name}`, file);
    if (entry.image && entry.image !== path) await removeMedia(files, entry.image, text.oldRemoved);
    return ok({ image: path });
  } catch (error) {
    return failed(error, text.uploadFailed);
  }
}

/** Görseli kaldırır: kayıttan düşer, dosya silinir. Hazır kayıtta ya da görsel yoksa yapılacak iş yok. */
async function removeImageOf<T extends ImageRecord>(files: RepoFiles, catalog: Catalog<T>, text: ImageText, id: string): Promise<Outcome> {
  try {
    const file = await readCatalog(files, catalog);
    if (hasUnreadable(file, id)) return brokenRecord(catalog.path);
    const entry = file.items.find((item) => item.id === id);
    if (!entry?.image) return ok();

    const image = entry.image;
    const next = file.items.map((item) => (item.id === id ? { ...item, image: undefined } : item));
    await writeCatalog(files, catalog, next, `${text.removed}: ${entry.name}`, file);
    await removeMedia(files, image, text.fileRemoved);
    return ok();
  } catch (error) {
    return failed(error, text.removeFailed);
  }
}

export const saveDeviceImage = (files: RepoFiles, id: string, bytes: Uint8Array, extension: string) =>
  saveImageOf(files, DEVICES, DEVICE_IMAGE, id, bytes, extension);
export const removeDeviceImage = (files: RepoFiles, id: string) => removeImageOf(files, DEVICES, DEVICE_IMAGE, id);
export const saveAttachmentImage = (files: RepoFiles, id: string, bytes: Uint8Array, extension: string) =>
  saveImageOf(files, ATTACHMENTS, ATTACHMENT_IMAGE, id, bytes, extension);
export const removeAttachmentImage = (files: RepoFiles, id: string) => removeImageOf(files, ATTACHMENTS, ATTACHMENT_IMAGE, id);
