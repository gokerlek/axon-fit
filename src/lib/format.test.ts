import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDay, formatDayShort, formatNumber, formatRecent, formatSignedWithUnit, formatWithUnit, todayIn } from './format.ts';

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

describe('yakın an', () => {
  // İstanbul'da 25 Eylül 2026 15:00 (UTC+3).
  const now = new Date('2026-09-25T12:00:00Z');
  const tz = 'Europe/Istanbul';

  test('bir saatten yakını dakikayla', () => {
    assert.equal(formatRecent('2026-09-25T11:59:40Z', tz, now), 'az önce');
    assert.equal(formatRecent('2026-09-25T12:00:30Z', tz, now), 'az önce'); // saat kayması: ileride
    assert.equal(formatRecent('2026-09-25T11:55:00Z', tz, now), '5 dakika önce');
    assert.equal(formatRecent('2026-09-25T11:00:01Z', tz, now), '59 dakika önce');
  });

  test('bugün ve dün uygulamanın saat dilimine göre', () => {
    assert.equal(formatRecent('2026-09-25T08:05:00Z', tz, now), 'bugün 11:05');
    // UTC'de 24 Eylül 21:30, İstanbul'da 25 Eylül 00:30: bugün.
    assert.equal(formatRecent('2026-09-24T21:30:00Z', tz, now), 'bugün 00:30');
    assert.equal(formatRecent('2026-09-24T20:59:00Z', tz, now), 'dün 23:59');
    assert.equal(formatRecent('2026-09-23T21:00:00Z', tz, now), 'dün 00:00');
  });

  test('daha eskisi tam tarih ve saat', () => {
    assert.equal(formatRecent('2026-09-23T20:59:00Z', tz, now), '23 Eylül 2026 23:59');
  });
});
