import 'server-only';
import { canRecordHealth, healthFieldState } from './client-status';
import { careInputOf, careStampOf, editorCareOf, type CareInput, type EditorCare } from './constraint-filter';
import type { CareTags } from './constraints';
import { readHealthIfAllowed } from './health';
import type { Client } from './schemas/client';

/**
 * Danışanın kısıtları PT ekranlarında (tasarım `kisit-tarama.md` §3.2, §3.3) — okuma ve bağlama. Yalnız `conditions`
 * onayı varken dosya okunur; yoksa kısıtsız.
 */

/** Süzgecin girdisi; onay yoksa ya da dosya okunamıyorsa null. */
export async function loadCareInput(client: Client, today: string): Promise<CareInput | null> {
  if (!canRecordHealth(client, 'conditions')) return null;
  const record = await readHealthIfAllowed(client, ['conditions']).catch(() => null);
  return record ? careInputOf(record, { today, painConsent: canRecordHealth(client, 'check_in') }) : null;
}

/**
 * Program düzenleyicisinin kısıt bilgisi. Modülde kısıtlar hiç yoksa null (sheet bugünkü gibi); seçili ama onay
 * yoksa yalnız durum ("kısıtlar kullanılamıyor").
 */
export async function loadEditorCare(client: Client, items: readonly (CareTags & { id: string })[], today: string): Promise<EditorCare | null> {
  const state = healthFieldState(client, 'conditions');
  if (state === 'off' || state === 'not_selected') return null;
  const input = await loadCareInput(client, today);
  if (!input) return { clientId: client.id, unavailable: 'Kısıtlar kullanılamıyor: danışanın sağlık onayı yok.', summary: [], pending: [], map: {} };
  return editorCareOf(client.id, items, input);
}

/** Bugün'ün gün planı damgasının kısıt parçası (`workout-routes.ts` ile aynı hesap); onay yoksa boş. */
export async function loadCareStamp(client: Client): Promise<string> {
  if (!canRecordHealth(client, 'conditions')) return '';
  const record = await readHealthIfAllowed(client, ['conditions']).catch(() => null);
  return careStampOf(record);
}
