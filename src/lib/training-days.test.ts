import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import type { ProgramLogEntry } from './program-plan.ts';
import { programSchema } from './schemas/program.ts';
import { programFile } from './testing/session-fixtures.ts';
import {
  addDays,
  applyClientSchedule,
  effectiveSchedule,
  frequencyMismatch,
  isoWeekdayOf,
  nextTrainingDate,
  normalizeWeekdays,
  ptScheduleEdit,
  relativeDayText,
  resetClientSchedule,
  todayState,
  todayStatusText,
  weekDates,
  weekdaysChangeText,
  weekdaysText,
  weekStrip,
  weekTarget,
} from './training-days.ts';

/** 26 Eylül 2026 cumartesi. */
const SATURDAY = '2026-09-26';
const NOW = new Date('2026-09-26T16:00:00.000Z');

function program(extra: Record<string, unknown> = {}) {
  const parsed = v.parse(programSchema, programFile({}, extra));
  return parsed;
}

describe('antrenman günleri: takvim', () => {
  test('ISO hafta günü, pazartesi başlayan hafta, gün ekleme', () => {
    assert.equal(isoWeekdayOf('2026-09-21'), 1);
    assert.equal(isoWeekdayOf(SATURDAY), 6);
    assert.equal(isoWeekdayOf('2026-09-27'), 7);
    assert.equal(isoWeekdayOf('1970-01-01'), 4);
    assert.deepEqual(weekDates(SATURDAY), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
    assert.equal(addDays('2026-03-28', 2), '2026-03-30', 'yaz saati geçişi günü atlatmaz');
  });

  test('günler tekilleşir, sıralanır; geçersizler düşer; kısa adlarla metin', () => {
    assert.deepEqual(normalizeWeekdays([5, 1, 3, 3, 0, 8, 2.5]), [1, 3, 5]);
    assert.equal(weekdaysText([5, 1, 3]), 'Pzt, Çar, Cum');
    assert.equal(weekdaysText([]), '');
  });

  test('gün şeridi: seçili, yapılan, kaçan (geçmiş ve yapılmamış seçili gün), bugün', () => {
    const strip = weekStrip({ today: '2026-09-24', weekdays: [1, 3, 5], doneDays: ['2026-09-21', '2026-09-22'] });
    assert.equal(strip.length, 7);
    const [mon, tue, wed, thu, fri] = strip;
    assert.deepEqual(mon, { date: '2026-09-21', weekday: 1, selected: true, done: true, missed: false, today: false });
    assert.equal(tue?.done, true, 'seçili olmayan günde yapılan antrenman da dolu');
    assert.equal(tue?.selected, false);
    assert.equal(wed?.missed, true, 'çarşamba seçiliydi, antrenman yok');
    assert.equal(thu?.today, true);
    assert.equal(fri?.missed, false, 'gelecek gün kaçmış sayılmaz');
  });
});

describe('antrenman günleri: Bugün kartının satırı', () => {
  test('sıradaki antrenman günü: bugünden sonra ilk seçili gün; bir hafta sonrası da', () => {
    assert.equal(nextTrainingDate(SATURDAY, [1, 3, 5]), '2026-09-28');
    assert.equal(nextTrainingDate('2026-09-21', [1, 3, 5]), '2026-09-23');
    assert.equal(nextTrainingDate('2026-09-21', [1]), '2026-09-28');
    assert.equal(nextTrainingDate('2026-09-21', [1], { includeToday: true }), '2026-09-21');
    assert.equal(nextTrainingDate(SATURDAY, []), null);
  });

  test('antrenman günü, dinlenme günü, bugün yapıldı, gün seçilmemiş', () => {
    const training = todayState({ today: '2026-09-23', weekdays: [1, 3, 5], doneToday: false });
    assert.deepEqual(training, { kind: 'training' });
    assert.equal(todayStatusText(training, '2026-09-23', 'Gün B'), 'Bugün antrenman günün · Gün B');

    const rest = todayState({ today: '2026-09-22', weekdays: [1, 3, 5], doneToday: false });
    assert.deepEqual(rest, { kind: 'rest', next: '2026-09-23' });
    assert.equal(todayStatusText(rest, '2026-09-22', 'Gün B'), 'Dinlenme günü · sıradaki antrenman yarın (Gün B)');
    const later = todayState({ today: SATURDAY, weekdays: [3], doneToday: false });
    assert.equal(todayStatusText(later, SATURDAY, 'Gün B'), 'Dinlenme günü · sıradaki antrenman Çarşamba (Gün B)');

    const done = todayState({ today: '2026-09-23', weekdays: [3], doneToday: true });
    assert.deepEqual(done, { kind: 'done', next: '2026-09-30' });
    assert.equal(todayStatusText(done, '2026-09-23', 'Gün C'), 'Bugünkü antrenmanını yaptın · sıradaki gelecek Çarşamba (Gün C)');

    const none = todayState({ today: SATURDAY, weekdays: [], doneToday: true });
    assert.equal(todayStatusText(none, SATURDAY, 'Gün A'), 'Sıradaki antrenman');
    assert.equal(relativeDayText('2026-09-28', SATURDAY), 'Pazartesi');
  });

  test('"bu hafta x/y": y seçili gün sayısı, yoksa sıklık; sıklıktan farklıysa uyarı', () => {
    assert.equal(weekTarget([1, 3, 5, 6], 3), 4);
    assert.equal(weekTarget([], 3), 3);
    assert.equal(weekTarget([]), null);
    assert.equal(frequencyMismatch([1, 3, 5, 6], 3), true);
    assert.equal(frequencyMismatch([1, 3, 5], 3), false);
    assert.equal(frequencyMismatch([1, 3], undefined), false);
    assert.equal(frequencyMismatch([], 3), false);
  });
});

describe('antrenman günleri: danışanın katmanı', () => {
  test('geçerli günler = danışanınki ?? PT\'ninki', () => {
    assert.deepEqual(effectiveSchedule(program()), { weekdays: [], pt: [], client: null, source: null });
    const pt = program({ schedule: { weekdays: [5, 1, 3] } });
    assert.deepEqual(effectiveSchedule(pt).weekdays, [1, 3, 5]);
    assert.equal(effectiveSchedule(pt).source, 'pt');
    const own = program({ schedule: { weekdays: [1, 3, 5] }, clientSchedule: { weekdays: [2, 4, 6], at: '2026-09-25T10:00:00.000Z' } });
    assert.deepEqual(effectiveSchedule(own), { weekdays: [2, 4, 6], pt: [1, 3, 5], client: { weekdays: [2, 4, 6], at: '2026-09-25T10:00:00.000Z' }, source: 'client' });
  });

  test('danışan değiştirir: katmana yazılır, geçmişe "client", revision ve PT\'nin günleri aynı kalır', () => {
    const before = program({ schedule: { weekdays: [1, 3, 5] } });
    const result = applyClientSchedule(before, [6, 2, 4], NOW);
    assert.ok(result);
    assert.equal(result.text, 'Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt');
    assert.deepEqual(result.program.clientSchedule, { weekdays: [2, 4, 6], at: NOW.toISOString() });
    assert.deepEqual(result.program.schedule, { weekdays: [1, 3, 5] });
    assert.equal(result.program.revision, before.revision);
    assert.equal(result.program.updatedAt, before.updatedAt);
    const entry = result.program.log[0] as ProgramLogEntry;
    assert.deepEqual(entry, { at: NOW.toISOString(), revision: before.revision, kind: 'client', changes: [{ text: 'Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt' }] });
    assert.ok(v.is(programSchema, result.program), 'şemaya uyar');
  });

  test('geçerli günlerle aynı seçim ya da boş seçim değişiklik değildir', () => {
    const pt = program({ schedule: { weekdays: [1, 3, 5] } });
    assert.equal(applyClientSchedule(pt, [5, 3, 1], NOW), null);
    assert.equal(applyClientSchedule(pt, [], NOW), null);
  });

  test('PT\'nin günlerine dönen seçim katmanı kaldırır (geçmişe yine yazılır)', () => {
    const own = program({ schedule: { weekdays: [1, 3, 5] }, clientSchedule: { weekdays: [2, 4], at: '2026-09-25T10:00:00.000Z' } });
    const result = applyClientSchedule(own, [1, 3, 5], NOW);
    assert.ok(result);
    assert.equal('clientSchedule' in result.program, false);
    assert.equal(result.text, 'Antrenman günleri: Sal, Per → Pzt, Çar, Cum');
    // Geçerli günler şimdi değişti: kaçan gün penceresi buradan başlar.
    assert.deepEqual(result.program.schedule, { weekdays: [1, 3, 5], at: NOW.toISOString() });
  });

  test('PT gün seçmediyse danışanın seçimi katman olur', () => {
    const result = applyClientSchedule(program(), [2, 4], NOW);
    assert.ok(result);
    assert.equal(result.text, 'Antrenman günleri: Sal, Per');
    assert.deepEqual(result.program.clientSchedule?.weekdays, [2, 4]);
  });

  test('"PT\'nin günlerine dön": katman silinir, revision artmaz; katman yoksa değişiklik yok', () => {
    const own = program({ schedule: { weekdays: [1, 3, 5] }, clientSchedule: { weekdays: [2, 4, 6], at: '2026-09-25T10:00:00.000Z' } });
    const result = resetClientSchedule(own, NOW);
    assert.ok(result);
    assert.equal('clientSchedule' in result.program, false);
    assert.deepEqual(result.program.schedule, { weekdays: [1, 3, 5], at: NOW.toISOString() });
    assert.equal(result.program.revision, own.revision);
    assert.equal(result.text, 'Danışanın günleri kaldırıldı (Sal, Per, Cmt); geçerli günler: Pzt, Çar, Cum');
    assert.equal(result.program.log[0]?.kind, 'edit');
    assert.equal(resetClientSchedule(program({ schedule: { weekdays: [1] } }), NOW), null);
  });
});

describe('antrenman günleri: PT\'nin kaydı', () => {
  const stored = { schedule: { weekdays: [1, 3, 5] }, clientSchedule: { weekdays: [2, 4, 6], at: '2026-09-25T10:00:00.000Z' } };
  const AT = NOW.toISOString();

  test('günleri göndermeyen (eski sekme) ya da aynı günleri gönderen kayıt katmana dokunmaz', () => {
    assert.deepEqual(ptScheduleEdit(stored, undefined, AT), { ...stored, changes: [] });
    assert.deepEqual(ptScheduleEdit(stored, [5, 3, 1], AT), { ...stored, changes: [] });
  });

  test('PT günleri değiştirince danışanın katmanı silinir (son söz PT\'nin); günlerin anı yazılır', () => {
    assert.deepEqual(ptScheduleEdit(stored, [1, 4], AT), {
      schedule: { weekdays: [1, 4], at: AT },
      clientSchedule: undefined,
      changes: ['Antrenman günleri: Pzt, Çar, Cum → Pzt, Per', 'Danışanın günleri kaldırıldı (Sal, Per, Cmt)'],
    });
    assert.deepEqual(ptScheduleEdit({}, [2], AT), { schedule: { weekdays: [2], at: AT }, clientSchedule: undefined, changes: ['Antrenman günleri: Sal'] });
    assert.deepEqual(ptScheduleEdit({ schedule: { weekdays: [2] } }, [], AT), {
      schedule: undefined,
      clientSchedule: undefined,
      changes: ['Antrenman günleri kaldırıldı (önce Sal)'],
    });
  });

  test('geçmişin cümlesi', () => {
    assert.equal(weekdaysChangeText([1, 3, 5], [2, 4, 6]), 'Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt');
  });
});
