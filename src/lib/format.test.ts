import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDay, formatDayShort, formatNumber, formatSignedWithUnit, formatWithUnit, todayIn } from './format.ts';

describe('takvim günü', () => {
  test('gün saat dilimine göre kaymaz', () => {
    assert.equal(formatDay('2026-09-01'), '1 Eylül 2026');
    assert.equal(formatDayShort('2026-09-01'), '1 Eyl');
    assert.equal(formatDayShort('2026-09-01', true), '1 Eyl 2026');
  });

  test('bugün uygulamanın saat dilimine göre', () => {
    // UTC 22:30 İstanbul'da ertesi gün (UTC+3), New York'ta aynı gün.
    const now = new Date('2026-09-23T22:30:00Z');
    assert.equal(todayIn('Europe/Istanbul', now), '2026-09-24');
    assert.equal(todayIn('America/New_York', now), '2026-09-23');
  });

  test('sayılar Türkçe', () => {
    assert.equal(formatNumber(82.5), '82,5');
    assert.equal(formatWithUnit(82.5, 'cm'), '82,5 cm');
    assert.equal(formatWithUnit(30, '%'), '%30');
    assert.equal(formatSignedWithUnit(1.5, 'cm'), '+1,5 cm');
    assert.equal(formatSignedWithUnit(-2.3, 'sn'), '−2,3 sn');
    assert.equal(formatSignedWithUnit(-12, '%'), '−%12');
    assert.equal(formatSignedWithUnit(0, 'kg'), '±0 kg');
  });
});
