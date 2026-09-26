import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  experienceFloor,
  EXPOSURE_TUNING,
  exposureOf,
  exposuresOf,
  lowerStage,
  maxStage,
  stageAtLeast,
  stageOf,
  type Stage,
} from './exposure.ts';
import type { SessionIndex, SessionIndexExercise, SessionIndexRow } from './schemas/session.ts';

const NOW = new Date('2026-09-26T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

let counter = 0;

/** Bitmiş antrenmanın index satırı: `daysAgo` gün önce, verilen hareketlerle. */
function row(daysAgo: number, exercises: Partial<SessionIndexExercise>[] = [{}], extra: Partial<SessionIndexRow> = {}): SessionIndexRow {
  counter += 1;
  const startedAt = new Date(NOW.getTime() - daysAgo * DAY).toISOString();
  const id = `s_${counter.toString(36).padStart(8, '0')}`;
  return {
    id,
    sha: '0'.repeat(40),
    path: `sessions/${id}.json`,
    date: startedAt.slice(0, 10),
    startedAt,
    finishedAt: new Date(NOW.getTime() - daysAgo * DAY + 45 * 60_000).toISOString(),
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: 3,
    water: 0,
    exercises: exercises.map((item) => ({ exerciseId: 'back-squat', sets: 3, full: true, ...item })),
    notices: [],
    ...extra,
  };
}

function index(...items: SessionIndexRow[]): SessionIndex {
  return { version: 1, items, deleted: [] };
}

/** `n` antrenman, `spanDays` güne eşit aralıkla yayılmış; en yenisi `lastDaysAgo` gün önce. */
function spread(n: number, spanDays: number, lastDaysAgo = 1, item: Partial<SessionIndexExercise> = {}): SessionIndexRow[] {
  return Array.from({ length: n }, (_, i) => row(lastDaysAgo + (n === 1 ? 0 : (spanDays * (n - 1 - i)) / (n - 1)), [item]));
}

describe('aşama tablosu (§5.2, sırayla ilk tutan)', () => {
  const cases: { name: string; sessions: number; weeks: number; deloads: number; stage: Stage }[] = [
    { name: 'hiç seans yok → Tanışma', sessions: 0, weeks: 0, deloads: 0, stage: 'intro' },
    { name: 'sessions ≤ 3 → Tanışma', sessions: 3, weeks: 2, deloads: 0, stage: 'intro' },
    { name: '3 seans 10 haftaya yayılmış → Tanışma (koşullar çakışsa da ilk satır)', sessions: 3, weeks: 10, deloads: 2, stage: 'intro' },
    { name: '4 seans → Başlangıç', sessions: 4, weeks: 1, deloads: 0, stage: 'novice' },
    { name: '15 seans, 7,9 hafta, 1 hafifletme → Başlangıç (sınırın altı)', sessions: 15, weeks: 7.9, deloads: 1, stage: 'novice' },
    { name: '16 seans → Orta', sessions: 16, weeks: 4, deloads: 0, stage: 'intermediate' },
    { name: '8 hafta → Orta', sessions: 5, weeks: 8, deloads: 0, stage: 'intermediate' },
    { name: '2 hafifletme → Orta', sessions: 6, weeks: 3, deloads: 2, stage: 'intermediate' },
    { name: '52 hafta ve 40 seans → İleri', sessions: 40, weeks: 52, deloads: 0, stage: 'advanced' },
    { name: '52 hafta, 39 seans → Orta (seyrek hareket yıl dolunca İleri sayılmaz)', sessions: 39, weeks: 60, deloads: 0, stage: 'intermediate' },
    { name: '51,9 hafta, 80 seans → Orta', sessions: 80, weeks: 51.9, deloads: 0, stage: 'intermediate' },
  ];
  for (const item of cases) {
    test(item.name, () => {
      assert.equal(stageOf(item), item.stage);
    });
  }

  test('eşikler tek yerde, çağıran başkasını verebilir (açık soru 14: "2 hafifletme" PT ayarı)', () => {
    assert.equal(EXPOSURE_TUNING.intermediateDeloads, 2);
    assert.equal(stageOf({ sessions: 6, weeks: 3, deloads: 2 }, { ...EXPOSURE_TUNING, intermediateDeloads: 3 }), 'novice');
  });
});

describe('sayım (index satırlarından)', () => {
  test('geçmiş yoksa Tanışma, ara yok, Tanışma 4 seans (0–3 bitmiş)', () => {
    const exposure = exposureOf('back-squat', index(), NOW);
    assert.deepEqual(
      { sessions: exposure.sessions, weeks: exposure.weeks, gapDays: exposure.gapDays, stage: exposure.stage, calibrate: exposure.calibrate },
      { sessions: 0, weeks: 0, gapDays: null, stage: 'intro', calibrate: false },
    );
    assert.equal(exposure.introLength, 4);
    assert.equal(exposure.firstAt, null);
  });

  test('yalnız bitmiş, tam yük setli, "bir defalık" olmayan kayıt sayılır; aynı antrenmanda iki kez bir sayılır', () => {
    const items = index(
      row(10),
      row(8, [{}, { rowId: 'r_bbbbbb' }]), // aynı hareket iki satırda: bir seans
      row(6, [{ full: false }]), // yalnız yüzdeli set (piramit tepeye varmadı)
      row(5, [{ oneOff: true }]),
      row(4, [{ exerciseId: 'bench-press' }]),
      row(1, [{}], { finishedAt: undefined }), // etkin antrenman
    );
    const exposure = exposureOf('back-squat', items, NOW);
    assert.equal(exposure.sessions, 2);
    assert.equal(exposure.firstAt, new Date(NOW.getTime() - 10 * DAY).toISOString());
    assert.equal(exposure.lastAt, new Date(NOW.getTime() - 8 * DAY).toISOString());
    assert.ok(Math.abs(exposure.weeks - 10 / 7) < 1e-9);
    assert.ok(Math.abs((exposure.gapDays ?? 0) - 8) < 1e-9);
  });

  test('hafifletme sayımı yalnız `deload`; Tanışma\'da planlanan, `decrease`, ayar seansı ve "bir defalık" sayılmaz', () => {
    const items = index(
      row(20, [{ reason: 'deload', stage: 'novice' }]),
      row(18, [{ reason: 'deload' }]), // eski satır: aşama yok, sayılır
      row(16, [{ reason: 'deload', stage: 'intro' }]),
      row(14, [{ reason: 'decrease', stage: 'novice' }]),
      row(12, [{ reason: 'calibrate', stage: 'novice' }]),
      row(10, [{ reason: 'deload', oneOff: true }]),
    );
    const exposure = exposureOf('back-squat', items, NOW);
    assert.equal(exposure.deloads, 2);
    assert.equal(exposure.lastDeloadAt, new Date(NOW.getTime() - 18 * DAY).toISOString());
  });

  test('tek kötü seans aşama atlatmaz: 5 seans + bir `decrease` Başlangıç\'ta kalır', () => {
    const items = index(...spread(4, 12, 3), row(1, [{ reason: 'decrease', stage: 'novice' }]));
    assert.equal(exposureOf('back-squat', items, NOW).stage, 'novice');
  });

  test('uçtan: 16 seans 5 haftada → Orta; 40 seans 53 haftada → İleri', () => {
    assert.equal(exposureOf('back-squat', index(...spread(16, 35)), NOW).stage, 'intermediate');
    assert.equal(exposureOf('back-squat', index(...spread(40, 53 * 7)), NOW).stage, 'advanced');
  });

  test('hareketler kimliğe göre ayrı ayrı', () => {
    const items = index(...spread(5, 20), row(2, [{ exerciseId: 'bench-press' }]));
    const map = exposuresOf(['back-squat', 'bench-press', 'back-squat'], items, NOW);
    assert.equal(map.size, 2);
    assert.equal(map.get('back-squat')?.stage, 'novice');
    assert.equal(map.get('bench-press')?.stage, 'intro');
  });
});

describe('ara (§5.2: gapDays ≥ 28 → bir aşama iner, dönüşteki ilk seans ayar)', () => {
  test('27,9 gün: ara yok', () => {
    const exposure = exposureOf('back-squat', index(...spread(6, 20, 27.9)), NOW);
    assert.equal(exposure.calibrate, false);
    assert.equal(exposure.stage, 'novice');
  });

  test('28 gün: ayar seansı, Başlangıç → Tanışma', () => {
    const exposure = exposureOf('back-squat', index(...spread(6, 20, 28)), NOW);
    assert.equal(exposure.calibrate, true);
    assert.equal(exposure.base, 'novice');
    assert.equal(exposure.stage, 'intro');
  });

  test('Orta → Başlangıç; Tanışma en alttır', () => {
    assert.equal(exposureOf('back-squat', index(...spread(16, 40, 30)), NOW).stage, 'novice');
    const intro = exposureOf('back-squat', index(...spread(2, 5, 40)), NOW);
    assert.equal(intro.calibrate, true);
    assert.equal(intro.stage, 'intro');
  });

  test('ayar seansından sonraki karar da inik aşamada (`returning`); bir seans sonra normal', () => {
    const before = spread(16, 40, 35);
    const back = exposureOf('back-squat', index(...before, row(2)), NOW);
    assert.equal(back.calibrate, false);
    assert.equal(back.returning, true);
    assert.equal(back.stage, 'novice');
    const later = exposureOf('back-squat', index(...before, row(4), row(1)), NOW);
    assert.equal(later.returning, false);
    assert.equal(later.stage, 'intermediate');
  });

  test('ara eşiği ayarlanabilir', () => {
    assert.equal(exposureOf('back-squat', index(...spread(6, 20, 21)), NOW, { tuning: { ...EXPOSURE_TUNING, gapDays: 21 } }).calibrate, true);
  });
});

describe('genel deneyim tabanı (açık soru 4)', () => {
  test('yeni ya da girilmemiş: taban yok', () => {
    assert.equal(experienceFloor(undefined), null);
    assert.equal(experienceFloor('new'), null);
    assert.equal(exposureOf('back-squat', index(row(3)), NOW, { experience: 'new' }).stage, 'intro');
  });

  test('6 ay+: Tanışma tek seans (yalnız ayar), sonra en az Başlangıç', () => {
    const none = exposureOf('back-squat', index(), NOW, { experience: 'six_months' });
    assert.equal(none.stage, 'intro');
    assert.equal(none.introLength, 1);
    assert.equal(exposureOf('back-squat', index(row(3)), NOW, { experience: 'six_months' }).stage, 'novice');
    assert.equal(exposureOf('back-squat', index(...spread(16, 40)), NOW, { experience: 'six_months' }).stage, 'intermediate');
  });

  test('1 yıl+: Tanışma tek seans, sonra en az Orta; İleri tabanın üstünde kalır', () => {
    assert.equal(exposureOf('back-squat', index(), NOW, { experience: 'one_year' }).stage, 'intro');
    assert.equal(exposureOf('back-squat', index(row(3)), NOW, { experience: 'one_year' }).stage, 'intermediate');
    assert.equal(exposureOf('back-squat', index(...spread(40, 53 * 7)), NOW, { experience: 'one_year' }).stage, 'advanced');
  });

  test('taban ve ara birlikte: önce taban, sonra bir iner', () => {
    const exposure = exposureOf('back-squat', index(row(30)), NOW, { experience: 'one_year' });
    assert.equal(exposure.calibrate, true);
    assert.equal(exposure.stage, 'novice');
  });
});

describe('aşama yardımcıları', () => {
  test('sıra: Tanışma < Başlangıç < Orta < İleri', () => {
    assert.equal(maxStage('novice', 'intermediate'), 'intermediate');
    assert.equal(maxStage('advanced', 'intermediate'), 'advanced');
    assert.equal(lowerStage('advanced'), 'intermediate');
    assert.equal(lowerStage('intro'), 'intro');
    assert.equal(stageAtLeast('intermediate', 'intermediate'), true);
    assert.equal(stageAtLeast('novice', 'intermediate'), false);
  });
});
