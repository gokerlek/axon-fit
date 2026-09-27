import 'server-only';
import { canRecordHealth, healthFieldState } from './client-status';
import { careInputOf, careStampOf, editorCareOf, type CareInput, type EditorCare } from './constraint-filter';
import { constraintsOf, type CareTags } from './constraints';
import { readHealthIfAllowed } from './health';
import type { Client, HealthField } from './schemas/client';
import { cellTitle, constraintSuppress, painHistory } from './screening';
import { screeningMarks } from './screening-care';

/**
 * Danışanın kısıtları PT ekranlarında (tasarım `kisit-tarama.md` §3.2, §3.3) — okuma ve bağlama. Yalnız `conditions`
 * onayı varken dosya okunur; yoksa kısıtsız. Program düzenleyicisinde tarama da (§4.6, faz 6): yalnız `screening`
 * onayı varken.
 */

/** Süzgecin girdisi; onay yoksa ya da dosya okunamıyorsa null. */
export async function loadCareInput(client: Client, today: string): Promise<CareInput | null> {
  if (!canRecordHealth(client, 'conditions')) return null;
  const record = await readHealthIfAllowed(client, ['conditions']).catch(() => null);
  return record ? careInputOf(record, { today, painConsent: canRecordHealth(client, 'check_in') }) : null;
}

const NO_CONSENT = 'Kısıtlar kullanılamıyor: danışanın sağlık onayı yok.';

/**
 * Program düzenleyicisinin kısıt ve tarama bilgisi. Modülde kısıtlar seçili değil ve tarama onaylı değilse null
 * (sheet bugünkü gibi); kısıtlar seçili ama onay yoksa yalnız durum ("kısıtlar kullanılamıyor"). `screening: false`
 * taramayı hiç okumaz (egzersiz listesinin `?client=` önizlemesi yalnız kısıtları söyler).
 */
export async function loadEditorCare(
  client: Client,
  items: readonly (CareTags & { id: string; title: string })[],
  today: string,
  options: { screening?: boolean } = {},
): Promise<EditorCare | null> {
  const state = healthFieldState(client, 'conditions');
  const conditionsSelected = state !== 'off' && state !== 'not_selected';
  const conditions = canRecordHealth(client, 'conditions');
  const screening = options.screening !== false && canRecordHealth(client, 'screening');
  if (!conditionsSelected && !screening) return null;
  const parts: HealthField[] = [...(conditions ? (['conditions'] as const) : []), ...(screening ? (['screening'] as const) : [])];
  const record = parts.length > 0 ? await readHealthIfAllowed(client, parts).catch(() => null) : null;
  const care: EditorCare =
    conditions && record
      ? editorCareOf(client.id, items, careInputOf(record, { today, painConsent: canRecordHealth(client, 'check_in') }))
      : { clientId: client.id, ...(conditionsSelected ? { unavailable: NO_CONSENT } : {}), summary: [], pending: [], map: {} };
  if (!screening || !record) return care;
  const screenings = record.screenings ?? [];
  if (screenings.length === 0) return care;
  // İpucundaki gerileme/ilerleme adlarında kısıtın izinsiz yasakladığı hareket önerilmez (Tarama sayfasıyla aynı).
  const blocked = new Set(Object.entries(care.map).flatMap(([id, flag]) => (flag.group === 'blocked' ? [id] : [])));
  const titles = new Map(items.map((item) => [item.id, item.title]));
  const marks = screeningMarks(screenings, items, {
    titleOf: (id) => (blocked.has(id) ? undefined : titles.get(id)),
    suppress: conditions ? constraintSuppress(constraintsOf(record)) : undefined,
  });
  const pain = painHistory(screenings).open.map((item) => cellTitle(item.testId, item.side));
  return { ...care, screening: marks, ...(pain.length > 0 ? { screeningPain: pain } : {}) };
}

/** Bugün'ün gün planı damgasının kısıt parçası (`workout-routes.ts` ile aynı hesap); onay yoksa boş. */
export async function loadCareStamp(client: Client): Promise<string> {
  if (!canRecordHealth(client, 'conditions')) return '';
  const record = await readHealthIfAllowed(client, ['conditions']).catch(() => null);
  return careStampOf(record);
}
