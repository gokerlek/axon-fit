import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { upgradeLegacyBlocks } from '../template-plan.ts';
import { templateFormSchema, templateSaveSchema, templateSchema } from './template.ts';

const at = '2026-09-24T09:00:00.000Z';

/** Eski biçim: blokta set sayısı, satırda tek hedef. */
function legacyBlocks(squatSets: unknown = 4) {
  return [
    { id: 'b_aaaaaa', kind: 'single', sets: squatSets, restSeconds: 150, rows: [{ id: 'r_aaaaaa', exerciseId: 'squat', target: { min: 5, max: 8 } }] },
    {
      id: 'b_bbbbbb',
      kind: 'superset',
      sets: 3,
      restSeconds: 90,
      rows: [
        { id: 'r_bbbbbb', exerciseId: 'curl', target: { min: 10, max: 15 }, note: 'Yavaş' },
        { id: 'r_cccccc', exerciseId: 'bench', target: { min: 8, max: 12 }, rule: { scheme: 'linear', targetRir: 1 } },
      ],
    },
  ];
}

const file = (blocks: unknown) => ({ id: 't_k2m9x4qa', name: 'Alt vücut A', description: '', blocks, createdAt: at, updatedAt: at });

function issues(result: { issues?: readonly v.BaseIssue<unknown>[] | undefined }): [string, string][] {
  return (result.issues ?? []).map((issue) => [issue.path?.map((segment) => String(segment.key)).join('.') ?? '', issue.message]);
}

/** Yeni biçimde tek satırlık şablon; satırın setleri verilir. */
function withSets(sets: unknown) {
  return file([{ id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench', sets }] }]);
}

describe('şablon dosyası: eski biçim', () => {
  test('okunurken satır başına sete çevrilir; not ve kural kalır', () => {
    const parsed = v.safeParse(templateSchema, file(legacyBlocks()));
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
    if (!parsed.success) return;
    const [single, superset] = parsed.output.blocks;
    assert.deepEqual(single?.rows[0]?.sets, Array.from({ length: 4 }, () => ({ min: 5, max: 8 })));
    assert.deepEqual(superset?.rows[0], {
      id: 'r_bbbbbb',
      exerciseId: 'curl',
      sets: Array.from({ length: 3 }, () => ({ min: 10, max: 15 })),
      note: 'Yavaş',
    });
    assert.deepEqual(superset?.rows[1]?.sets, Array.from({ length: 3 }, () => ({ min: 8, max: 12 })));
    assert.deepEqual(superset?.rows[1]?.rule, { scheme: 'linear', targetRir: 1 });
    assert.ok(parsed.output.blocks.every((block) => !('sets' in block)));
    assert.ok(parsed.output.blocks.every((block) => block.rows.every((row) => !('target' in row))));
  });

  test('geçersiz set sayısı onarılmaz', () => {
    assert.deepEqual(issues(v.safeParse(templateSchema, file(legacyBlocks(0)))), [['blocks.0.rows.0.sets', 'En az bir set olmalı.']]);
    assert.deepEqual(issues(v.safeParse(templateSchema, file(legacyBlocks(25)))), [
      ['blocks.0.rows.0.sets', 'Bir harekette en fazla 10 set olur.'],
    ]);
    assert.deepEqual(issues(v.safeParse(templateSchema, file(legacyBlocks('3')))), [['blocks.0.rows.0.sets', 'En az bir set olmalı.']]);
  });

  test('hedefi olmayan eski satır okunamaz', () => {
    const blocks = [{ id: 'b_aaaaaa', kind: 'single', sets: 3, restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'squat' }] }];
    assert.deepEqual(issues(v.safeParse(templateSchema, file(blocks))), [['blocks.0.rows.0.sets', 'Setler okunamadı.']]);
  });

  test('çeviri iki kez uygulanınca aynı; yeni biçime dokunmaz', () => {
    const once = upgradeLegacyBlocks(legacyBlocks());
    assert.deepEqual(upgradeLegacyBlocks(once), once);
    const current = [{ id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'squat', sets: [{ min: 5, max: 5 }] }] }];
    const upgraded = upgradeLegacyBlocks(current) as unknown[];
    assert.equal(upgraded[0], current[0]);
    assert.equal(upgradeLegacyBlocks('x'), 'x');
  });

  test('karışık blok: sayı düşer, yeni satırlar olduğu gibi', () => {
    const newRow = { id: 'r_aaaaaa', exerciseId: 'squat', sets: [{ min: 5, max: 5 }] };
    const [block] = upgradeLegacyBlocks([{ id: 'b_aaaaaa', kind: 'single', sets: 4, restSeconds: 90, rows: [newRow] }]) as Record<string, unknown>[];
    assert.equal('sets' in (block ?? {}), false);
    assert.equal((block?.rows as unknown[])[0], newRow);
  });

  test('kayıt ucu eski biçimi kabul eder, düzenleyicinin şeması etmez', () => {
    const body = { name: 'Alt vücut A', description: '', blocks: legacyBlocks() };
    const saved = v.safeParse(templateSaveSchema, body);
    assert.equal(saved.success, true, saved.issues?.[0]?.message ?? '');
    assert.equal(v.safeParse(templateFormSchema, body).success, false);
  });
});

describe('set kuralları', () => {
  test('geçerli setler: back-off, AMRAP', () => {
    const parsed = v.safeParse(templateSchema, withSets([{ min: 5, max: 5 }, { min: 8, max: 8, loadPct: 85 }, { min: 8, max: 12, loadPct: 85, amrap: true }]));
    assert.equal(parsed.success, true, parsed.issues?.[0]?.message ?? '');
  });

  test('aralık, yüzde, tam yük ve sayı sınırları', () => {
    assert.deepEqual(issues(v.safeParse(templateSchema, withSets([{ min: 12, max: 8 }]))), [
      ['blocks.0.rows.0.sets.0.max', 'Üst sınır alt sınırdan küçük olamaz.'],
    ]);
    assert.deepEqual(issues(v.safeParse(templateSchema, withSets([{ min: 8, max: 8 }, { min: 8, max: 8, loadPct: 30 }]))), [
      ['blocks.0.rows.0.sets.1.loadPct', 'Yük en az %40 olur.'],
    ]);
    assert.deepEqual(issues(v.safeParse(templateSchema, withSets([{ min: 8, max: 8 }, { min: 8, max: 8, loadPct: Number.NaN }]))), [
      ['blocks.0.rows.0.sets.1.loadPct', 'Sayı gir.'],
    ]);
    assert.deepEqual(
      issues(v.safeParse(templateSchema, withSets([{ min: 8, max: 8, loadPct: 85 }, { min: 8, max: 8, loadPct: 85 }]))),
      [['blocks.0.rows.0.sets', 'En az bir set tam yükte (yüzdesiz) olmalı.']],
    );
    assert.deepEqual(
      issues(v.safeParse(templateSchema, withSets(Array.from({ length: 11 }, () => ({ min: 8, max: 8 }))))),
      [['blocks.0.rows.0.sets', 'Bir harekette en fazla 10 set olur.']],
    );
  });
});
