import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentPain,
  earlierPainSessions,
  painRegionOf,
  painReportNote,
  painReportOffers,
  painSkippedExercises,
  repeatedPainSkips,
} from './pain-report.ts';
import type { HealthCheckIn } from './schemas/health.ts';
import { sessionEntry } from './testing/session-fixtures.ts';

const pain = (rowId: string) => ({ rowId, reason: 'pain' as const });

describe('ağrıyla geçilen hareketler', () => {
  const checkIns: HealthCheckIn[] = [
    { date: '2026-09-27', sessionId: 's_bugun001', skippedRows: [pain('r_squata'), pain('r_press1')] },
    { date: '2026-09-24', sessionId: 's_once0001', skippedRows: [pain('r_squata')] },
    { date: '2026-09-20', sessionId: 's_once0002', painBaseline: 2 },
    { date: '2026-09-18', sessionId: 's_once0003', skippedRows: [pain('r_evdesq')] },
    { date: '2026-08-01', sessionId: 's_eski0001', skippedRows: [pain('r_press1')] },
    { date: '2026-09-25', skippedRows: [pain('r_squata')] },
  ];

  test('bu antrenmanın satırları; önceki antrenmanlar pencerede, ağrıyla geçme kaydı olanlar, en yeni önce', () => {
    assert.deepEqual(currentPain(checkIns, 's_bugun001'), { date: '2026-09-27', rowIds: ['r_squata', 'r_press1'] });
    assert.equal(currentPain(checkIns, 's_once0002'), null);
    assert.equal(currentPain(checkIns, 's_yok00000'), null);
    assert.deepEqual(earlierPainSessions(checkIns, { sessionId: 's_bugun001', date: '2026-09-27' }), [
      { sessionId: 's_once0001', rowIds: ['r_squata'] },
      { sessionId: 's_once0003', rowIds: ['r_evdesq'] },
    ]);
  });

  test('satır → o günkü hareket (muadilse muadil); kaydı olmayan satır düşer', () => {
    const entries = [
      sessionEntry('e_aaaaaa', { rowId: 'r_squata', exerciseId: 'goblet-squat', title: 'Goblet Squat', status: 'skipped' }),
      sessionEntry('e_bbbbbb', { swappedFrom: 'r_press1', exerciseId: 'push-up', title: 'Şınav', status: 'skipped' }),
    ];
    assert.deepEqual(painSkippedExercises(entries, ['r_squata', 'r_press1', 'r_yokyok']), [
      { exerciseId: 'goblet-squat', title: 'Goblet Squat' },
      { exerciseId: 'push-up', title: 'Şınav' },
    ]);
  });

  test('iki antrenman: bu antrenman + öncekilerden en az biri; başka programın satırında da sayılır', () => {
    const current = [
      { exerciseId: 'goblet-squat', title: 'Goblet Squat' },
      { exerciseId: 'push-up', title: 'Şınav' },
    ];
    assert.deepEqual(repeatedPainSkips(current, [['goblet-squat'], ['goblet-squat', 'plank']]), [{ exerciseId: 'goblet-squat', title: 'Goblet Squat', sessions: 3 }]);
    assert.deepEqual(repeatedPainSkips(current, []), []);
  });
});

describe('kısayolun teklifi', () => {
  const tags: Record<string, { pattern?: 'squat' | 'hinge' | 'horizontal_push' | 'carry'; contractionType?: 'energy_storage_ballistic' }> = {
    'goblet-squat': { pattern: 'squat' },
    'jump-squat': { pattern: 'squat', contractionType: 'energy_storage_ballistic' },
    'push-up': { pattern: 'horizontal_push' },
    'romanian-deadlift': { pattern: 'hinge' },
    'farmer-walk': { pattern: 'carry' },
  };
  const tagsOf = (id: string) => tags[id];
  const item = (exerciseId: string, title: string, sessions = 2) => ({ exerciseId, title, sessions });

  test('bölge ve zorlayan kalıptan; taşıma ve bilinmeyende bölge yok', () => {
    assert.deepEqual(painRegionOf({ pattern: 'squat' }), { region: 'knee', trigger: 'squat' });
    assert.deepEqual(painRegionOf({ pattern: 'squat', contractionType: 'energy_storage_ballistic' }), { region: 'knee', trigger: 'jump' });
    assert.deepEqual(painRegionOf({ pattern: 'vertical_push' }), { region: 'shoulder', trigger: 'overhead' });
    assert.deepEqual(painRegionOf({ pattern: 'hinge' }), { region: 'lower_back', trigger: 'bend' });
    assert.deepEqual(painRegionOf({ pattern: 'carry' }), { region: null, trigger: null });
    assert.deepEqual(painRegionOf(undefined), { region: null, trigger: null });
  });

  test('bölgeye göre toplanır; not hareketleri ve antrenman sayısını söyler', () => {
    const offers = painReportOffers([item('goblet-squat', 'Goblet Squat'), item('jump-squat', 'Jump Squat', 3), item('push-up', 'Şınav')], tagsOf, []);
    assert.deepEqual(offers, [
      {
        region: 'knee',
        triggers: ['squat', 'jump'],
        exercises: ['Goblet Squat (2 antrenmanda)', 'Jump Squat (3 antrenmanda)'],
        note: 'Ağrı yüzünden geçtiğim: Goblet Squat (2 antrenmanda), Jump Squat (3 antrenmanda).',
      },
      { region: 'shoulder', triggers: [], exercises: ['Şınav (2 antrenmanda)'], note: 'Ağrı yüzünden geçtiğim: Şınav (2 antrenmanda).' },
    ]);
  });

  test('o bölgede açık kısıt ya da bekleyen bildirim varsa teklif yok; bölgesiz hareket kalır', () => {
    const offers = painReportOffers([item('goblet-squat', 'Goblet Squat'), item('farmer-walk', 'Farmer Walk')], tagsOf, [{ region: 'knee' }]);
    assert.deepEqual(
      offers.map((offer) => [offer.region, offer.exercises]),
      [[null, ['Farmer Walk (2 antrenmanda)']]],
    );
    assert.equal(painReportOffers([], tagsOf, []).length, 0);
  });

  test('en çok iki teklif; not 280 karakteri aşmaz', () => {
    const three = painReportOffers([item('goblet-squat', 'A'), item('push-up', 'B'), item('romanian-deadlift', 'C')], tagsOf, []);
    assert.equal(three.length, 2);
    const long = painReportNote(Array.from({ length: 20 }, (_, index) => item(`x-${index}`, 'Çok uzun adlı bir hareket')));
    assert.equal(long.length, 280);
    assert.ok(long.endsWith('…'));
  });
});
