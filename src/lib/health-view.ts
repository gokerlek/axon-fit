import { withConstraintsMigrated } from './constraints.ts';
import type { HealthField } from './schemas/client.ts';
import type { HealthRecord } from './schemas/health.ts';

/**
 * `health.json`'un parçalara göre dilimi ve yazıma hazırlığı (tasarım `kisit-tarama.md` §5.1, §5.3) — saf.
 *
 * Ekrana ve istemciye yalnız onaylı parçaların dilimi gider (`healthSlice`): kısıtlar onaylı, tarama onaysızsa
 * tarama günleri sayfaya hiç girmez. Yazımda dosya sürüm 2'ye getirilir: boş eski alanlar düşer, kısıt yazımında
 * eski `conditions` kısıtlara çevrilir; başka parçanın yazımı eski kısıtlara dokunmaz (onayı olmayan parça
 * işlenmez).
 */

/** Yalnız verilen parçaların alanları; ötekiler boş. */
export function healthSlice(record: HealthRecord, fields: readonly HealthField[]): HealthRecord {
  const allowed = new Set(fields);
  const slice: HealthRecord = { version: 2, checkIns: [], measurements: [] };
  if (record.sex) slice.sex = record.sex;
  if (allowed.has('measurements')) slice.measurements = record.measurements;
  if (allowed.has('check_in') || allowed.has('readiness')) {
    slice.checkIns = record.checkIns;
    if (record.toleranceMode) slice.toleranceMode = record.toleranceMode;
  }
  if (allowed.has('conditions')) {
    for (const key of ['conditions', 'surgeryDate', 'constraints', 'overrides', 'constraintLog'] as const) {
      if (record[key] !== undefined) Object.assign(slice, { [key]: record[key] });
    }
  }
  if (allowed.has('screening')) {
    if (record.cameraMeasurements) slice.cameraMeasurements = record.cameraMeasurements;
    if (record.screenings) slice.screenings = record.screenings;
    if (record.movementScreens) slice.movementScreens = record.movementScreens;
  }
  return slice;
}

/** Yazımdan önce: sürüm 2, boş eski alanlar düşer; kısıt yazımında eski kısıtlar çevrilir. */
export function prepareForWrite(record: HealthRecord, field: HealthField): HealthRecord {
  let next: HealthRecord = field === 'conditions' ? withConstraintsMigrated(record) : { ...record, version: 2 };
  if (next.conditions && next.conditions.length === 0) {
    const { conditions: _conditions, surgeryDate: _surgery, ...rest } = next;
    next = rest;
  }
  if (next.movementScreens && next.movementScreens.length === 0) {
    const { movementScreens: _screens, ...rest } = next;
    next = rest;
  }
  return next;
}
