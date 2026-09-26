import type { DropAction } from '@/lib/drop-target';
import { combineMessage, moveMessage } from '../../../lib/edit-messages.ts';
import { combineInto, moveItem, moveRegroups } from '../../../lib/template-edit.ts';
import type { Editor } from '../editor-context';

/** Bırakmanın forma yazımı için düzenleyiciden gerekenler. */
export type DropEditor = Pick<Editor, 'current' | 'update' | 'updateWithUndo' | 'exercises' | 'newIds' | 'close'>;

/**
 * Bırakınca forma tek yazım (`EditorDnd`): `moveItem` ya da `combineInto`. Gruplamayı değiştiren
 * bırakma "Geri al"lıdır (`updateWithUndo`): üstüne bırakma, gruptan çıkaran ya da gruba katan çizgi
 * (`moveRegroups`); grubun türü ve süreleri geri sürükleyince dönmez. Yalnız sıralamada geri al yok
 * (`update`; geri sürüklemek yeter). Olmayan taşımada yazım yok; olunca kart kapalı oturur.
 *
 * Saf modül (çalışma zamanı içe aktarmaları göreli): testler Node'un kendi test aracıyla çalışır.
 */
export function commitDrop(ed: DropEditor, itemId: string, action: NonNullable<DropAction>): void {
  const titleOf = (exerciseId: string) => ed.exercises.get(exerciseId)?.title ?? 'Silinmiş egzersiz';
  const before = ed.current();
  if (action.type === 'move') {
    const next = moveItem(before, itemId, action.destination, ed.exercises, ed.newIds(before));
    if (next === before) return;
    const message = moveMessage(before, next, itemId, titleOf);
    if (moveRegroups(before, itemId, action.destination)) ed.updateWithUndo(() => next, message, { highlight: itemId });
    else ed.update(() => next, { highlight: itemId, announce: message });
  } else {
    const next = combineInto(before, itemId, action.targetId, ed.exercises);
    if (next === before) return;
    ed.updateWithUndo(() => next, combineMessage(before, next, itemId, action.targetId, action.outcome, titleOf), { highlight: itemId });
  }
  ed.close(itemId);
}
