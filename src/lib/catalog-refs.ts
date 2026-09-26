/**
 * Egzersiz, cihaz ve aparat arasındaki bağlar (SPEC §7.3).
 *
 * - Aparat silinince seçili olduğu cihazlardan ve egzersizlerden düşer.
 * - Cihaz silinince bağlı egzersizler cihazsız kalır; cihazdan seçilen aparat da düşer.
 * - Cihazın aparatları değişince (aparat çıkarma, tür değişimi, "Varsayılana dön") cihazda
 *   artık olmayan aparat, o cihazı kullanan egzersizlerden düşer.
 * - Egzersiz silinince başka egzersizlerde sabitlendiği muadillerden düşer.
 * - Kaydederken cihazın aparatları havuzda olmalı; egzersizin aparatı, cihazının
 *   aparatlarından biri olmalı.
 *
 * Temizlik yalnız PT'nin kayıtlarına uygulanır: hazır kütüphane yalnız hazır kimliklere
 * bağlanır (`src/data/libraries.test.ts`). Değişen kayıt yoksa `null` döner, dosya
 * boşuna yazılmaz. Boşalan isteğe bağlı alan `undefined` olur (JSON'a yazılmaz).
 *
 * Saf; yol takma adıyla çalışma zamanı içe aktarması yok (testler Node'un test aracıyla çalışır).
 */

/** Silinen aparat cihazların aparat listesinden çıkar. */
export function dropAttachmentFromDevices<T extends { attachments?: string[] | undefined }>(
  devices: readonly T[],
  attachmentId: string,
): T[] | null {
  if (!devices.some((device) => device.attachments?.includes(attachmentId))) return null;
  return devices.map((device) => {
    if (!device.attachments?.includes(attachmentId)) return device;
    const attachments = device.attachments.filter((id) => id !== attachmentId);
    return { ...device, attachments: attachments.length > 0 ? attachments : undefined };
  });
}

/** Silinen aparat onu seçen egzersizlerden düşer. */
export function dropAttachmentFromExercises<T extends { attachmentId?: string | undefined }>(
  exercises: readonly T[],
  attachmentId: string,
): T[] | null {
  if (!exercises.some((exercise) => exercise.attachmentId === attachmentId)) return null;
  return exercises.map((exercise) =>
    exercise.attachmentId === attachmentId ? { ...exercise, attachmentId: undefined } : exercise,
  );
}

/** Silinen cihaza bağlı egzersizler cihazsız kalır; aparat cihazdan seçildiği için o da düşer. */
export function dropDeviceFromExercises<T extends { deviceId?: string | undefined; attachmentId?: string | undefined }>(
  exercises: readonly T[],
  deviceId: string,
): T[] | null {
  if (!exercises.some((exercise) => exercise.deviceId === deviceId)) return null;
  return exercises.map((exercise) =>
    exercise.deviceId === deviceId ? { ...exercise, deviceId: undefined, attachmentId: undefined } : exercise,
  );
}

/**
 * Cihazın aparat listesi değişti (`attachments`: cihazın yeni aparatları): cihazda artık olmayan
 * aparat, o cihazı kullanan egzersizlerden düşer; egzersiz cihazında kalır.
 */
export function dropDetachedAttachments<T extends { deviceId?: string | undefined; attachmentId?: string | undefined }>(
  exercises: readonly T[],
  deviceId: string,
  attachments: readonly string[] | undefined,
): T[] | null {
  const detached = (exercise: T) =>
    exercise.deviceId === deviceId && exercise.attachmentId !== undefined && !(attachments ?? []).includes(exercise.attachmentId);
  if (!exercises.some(detached)) return null;
  return exercises.map((exercise) => (detached(exercise) ? { ...exercise, attachmentId: undefined } : exercise));
}

/** Silinen egzersiz, başka egzersizlerde sabitlendiği muadillerden düşer. */
export function dropPinnedAlternative<T extends { alternatives?: string[] | undefined }>(
  exercises: readonly T[],
  exerciseId: string,
): T[] | null {
  if (!exercises.some((exercise) => exercise.alternatives?.includes(exerciseId))) return null;
  return exercises.map((exercise) => {
    if (!exercise.alternatives?.includes(exerciseId)) return exercise;
    const alternatives = exercise.alternatives.filter((id) => id !== exerciseId);
    return { ...exercise, alternatives: alternatives.length > 0 ? alternatives : undefined };
  });
}

/** Cihaz kaydı: seçilen aparatlar havuzda (hazır + PT'nin) olmalı. Sorun varsa alan hatası. */
export function unknownAttachmentsProblem(ids: readonly string[], pool: ReadonlySet<string>): string | null {
  const missing = ids.filter((id) => !pool.has(id));
  return missing.length > 0 ? `Havuzda olmayan aparat seçilemez: ${missing.join(', ')}.` : null;
}

/** Egzersiz kaydı: aparat, seçili cihazın aparatlarından biri olmalı. Sorun varsa alan hatası. */
export function attachmentChoiceProblem(
  exercise: { deviceId?: string | undefined; attachmentId?: string | undefined },
  device: { attachments?: readonly string[] | undefined } | undefined,
): string | null {
  if (!exercise.attachmentId) return null;
  if (!exercise.deviceId) return 'Cihazsız egzersizde aparat seçilemez.';
  if (!device?.attachments?.includes(exercise.attachmentId)) return 'Bu aparat seçili cihaza takılı değil.';
  return null;
}

/** Egzersizde seçilebilir aparatlar: cihaza takılı olup havuzda duranlar, cihazdaki sırayla. */
export function attachmentChoices<A>(
  device: { attachments?: readonly string[] | undefined } | undefined,
  pool: ReadonlyMap<string, A>,
): A[] {
  return (device?.attachments ?? []).flatMap((id) => {
    const found = pool.get(id);
    return found === undefined ? [] : [found];
  });
}
