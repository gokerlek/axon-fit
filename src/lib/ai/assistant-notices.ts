import * as v from 'valibot';
import { assistantStoreSchema } from './assistant-contract.ts';
import type { OwnIndex } from '../own-program-index.ts';
import { NOTICE_WINDOW_DAYS, type PtNotice } from '../notices.ts';
export function assistantNotices(raw: unknown, permissionHash: string, own: OwnIndex | null, now: Date): PtNotice[] {
  const parsed = v.safeParse(assistantStoreSchema, raw); if (!parsed.success) return [];
  return parsed.output.drafts.flatMap(draft => {
    const item = own?.items.find(i => i.id === draft.programId && i.shared);
    if (!item || (item.clientEditedAt && draft.savedAt && item.clientEditedAt > draft.savedAt) || (item.ptEditedAt && draft.savedAt && item.ptEditedAt > draft.savedAt) || draft.savedBy !== 'client' || draft.permissionHash !== permissionHash || !draft.savedAt || now.getTime() - Date.parse(draft.savedAt) > NOTICE_WINDOW_DAYS * 86400000) return [];
    return draft.attention.length ? [{ key: `ai:${draft.id}`, kind: 'own_program' as const, at: draft.savedAt, text: `AI ile oluşturulan ${draft.name}: ${draft.attention.join(' ')}`, target: 'program' as const }] : [];
  });
}
