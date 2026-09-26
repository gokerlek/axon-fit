import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enterAction, keepLineEnter, type EnterField } from './enter-key.ts';

const key = (name: string, modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean } = {}) => ({
  key: name,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  ...modifiers,
});

test('Hedef ve Not (tek satır): Enter formu göndermez, değiştiricilerle de; başka hiçbir şey yapmaz', () => {
  for (const modifiers of [{}, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.equal(enterAction('line', key('Enter', modifiers)), 'block', JSON.stringify(modifiers));
  }
});

test('set satırı: Enter aynı sütunda sonraki, Shift+Enter önceki sete (form gönderilmez)', () => {
  assert.equal(enterAction('set', key('Enter')), 'next');
  assert.equal(enterAction('set', key('Enter', { ctrlKey: true })), 'next');
  assert.equal(enterAction('set', key('Enter', { shiftKey: true })), 'previous');
});

test('başka tuşlar ve yazı birleştirme (IME) onayı tarayıcıya kalır', () => {
  for (const field of ['line', 'set'] as EnterField[]) {
    assert.equal(enterAction(field, key('Enter', { isComposing: true })), 'pass', field);
    for (const name of ['a', '5', 'Tab', 'Escape', 'ArrowDown']) assert.equal(enterAction(field, key(name)), 'pass', `${field} ${name}`);
  }
});

test('Hedef ve Not kutularının onKeyDown\'ı: Enter\'da formun gönderimini engeller, başka tuşa ve IME onayına dokunmaz', () => {
  const pressed = (name: string, isComposing = false) => {
    let prevented = false;
    keepLineEnter({ nativeEvent: key(name, { isComposing }), preventDefault: () => (prevented = true) });
    return prevented;
  };
  assert.deepEqual([pressed('Enter'), pressed('Enter', true), pressed('a'), pressed('Tab')], [true, false, false, false]);
});

test('düzenleyici formlarında her tek satırlık kutu ve stepper Enter\'ı tutar (kaynak taraması)', () => {
  // Kaydet görünürken tek satırlık kutuda Enter şablonu kaydeder ya da programı danışana yayınlar:
  // şablon ve program formundaki her kutu kendi `onKeyDown`'ını taşımalı (`keepLineEnter` ya da set geçişi).
  const files = [
    '../../app/dashboard/templates/template-form.tsx',
    '../../app/dashboard/clients/[id]/program/day-editor.tsx',
    '../../app/dashboard/clients/[id]/program/phases-card.tsx',
    '../../app/dashboard/clients/[id]/program/save-template-dialog.tsx',
    './set-table.tsx',
    './block-items.tsx',
  ];
  let checked = 0;
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const [tag, name] of source.matchAll(/<(Input|InputGroupInput|Stepper|Control)\b[\s\S]*?\/>/g)) {
      checked++;
      assert.match(tag, /onKeyDown=/, `${file}: <${name}> Enter'ı tutmuyor`);
    }
  }
  // Şablon adı, gün adı, evre adı ve süresi, şablon olarak kaydet, 3 stepper, Hedef (2), set kutusu, Not.
  assert.ok(checked >= 11, `yalnız ${checked} kutu bulundu`);
});
