import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { announcementRegion, floatingSaveShown, type FloatingSaveState } from './editor-signals.ts';

const base: FloatingSaveState = { saveable: true, headerMounted: true, headerOffscreen: true, headerFocused: false };

test('yüzen Kaydet: her genişlikte, kaydedilecek şey varken ve başlıktaki Kaydet görünmüyorken', () => {
  assert.equal(floatingSaveShown(base), true);
  // Başlıktaki görünüyor, kaydedilecek bir şey yok, başlıkta Kaydet çizili değil (seçim modu), başlıktaki odakta.
  assert.equal(floatingSaveShown({ ...base, headerOffscreen: false }), false);
  assert.equal(floatingSaveShown({ ...base, saveable: false }), false);
  assert.equal(floatingSaveShown({ ...base, headerMounted: false }), false);
  assert.equal(floatingSaveShown({ ...base, headerFocused: true }), false);
});

test('yüzen Kaydet dokunmatiğe bağlı değil; konumu telefonda dock\'un üstünde, masaüstünde köşede (kaynak taraması)', () => {
  const source = readFileSync(new URL('./editor-save.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /useMediaQuery/);
  assert.match(source, /fixed right-6 bottom-6 z-30 touch:right-4 touch:bottom-\(--dock-clearance\)/);
});

test('tek canlı bölge: "Geri al" toast\'u çıkan değişikliğin cümlesini yalnız toast okur', () => {
  assert.equal(announcementRegion(true), 'toast');
  assert.equal(announcementRegion(false), 'editor');
  // Toast açan yollar kendi aria-live paragrafına aynı cümleyi yazmaz.
  const strip = (file: string) =>
    readFileSync(new URL(file, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const editor = strip('./block-editor.tsx');
  const undo = editor.slice(editor.indexOf("const updateWithUndo = useCallback<Editor['updateWithUndo']>"), editor.indexOf('const openAdd'));
  assert.ok(undo.includes('showUndoToast(message'));
  assert.doesNotMatch(undo, /announce\(message\)/);
  const program = strip('../../app/dashboard/clients/[id]/program/program-form.tsx');
  const offer = program.slice(program.indexOf('const offerUndo = useCallback('), program.indexOf('const updateWithUndo = useCallback'));
  assert.ok(offer.includes('showUndoToast(message'));
  assert.doesNotMatch(offer, /setAnnouncement\(message\)/);
});
