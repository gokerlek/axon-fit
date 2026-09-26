import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ToleranceResult } from './check-in.ts';
import { HEALTH_CONSENT_VERSION, type Client, type HealthField } from './schemas/client.ts';
import type { HealthCheckIn, HealthRecord } from './schemas/health.ts';
import type { SessionDoc, SessionIndexRow } from './schemas/session.ts';
import {
  adjustDay,
  AFTER_DELAY_MS,
  AFTER_WINDOW_MS,
  afterCandidate,
  afterPromptOf,
  afterState,
  allowedCheckIn,
  canBegin,
  checkContextOf,
  checkParts,
  combineTolerance,
  completeReadiness,
  cr10Text,
  evaluateStart,
  isFreshStart,
  isLowReadiness,
  latestReadinessScore,
  LOW_READINESS,
  readinessScore,
  rowTolerance,
  startCheckInBody,
  withCheckIn,
  withLighter,
  type CheckContext,
  type StartOutcome,
} from './session-check.ts';
import { at, sessionDoc, sessionEntry, singleBlock, workingSet } from './testing/session-fixtures.ts';
import { dayWithBlocks, workoutDay } from './testing/workout-fixtures.ts';

const TODAY = '2026-09-26';

function client(fields: HealthField[], consent: HealthField[] | null = fields): Pick<Client, 'modules' | 'consents'> {
  return {
    modules: { health: { enabled: fields.length > 0, fields } },
    consents: consent ? { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: consent, at: '2026-09-20T10:00:00.000Z' } } : {},
  };
}

function context(extra: Partial<CheckContext> = {}): CheckContext {
  return { today: TODAY, parts: { readiness: true, pain: true }, mode: 'pain_free', history: [], previous: null, painRows: [], ...extra };
}

function record(checkIns: HealthCheckIn[], extra: Partial<HealthRecord> = {}): HealthRecord {
  return { conditions: [], checkIns, measurements: [], movementScreens: [], ...extra };
}

/** `daysAgo` gün önce biten antrenman: Bench (r_aaaaaa) `kg` ile `reps`. */
let counter = 0;
function finished(daysAgo: number, reps: number[], kg = 60, rowId = 'r_aaaaaa'): SessionDoc {
  counter += 1;
  const start = Date.parse('2026-09-26T15:00:00.000Z') - daysAgo * 86_400_000;
  const id = `s_${counter.toString(36).padStart(8, '0')}`;
  return sessionDoc({
    id,
    status: 'finished',
    date: new Date(start).toISOString().slice(0, 10),
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(start + 50 * 60_000).toISOString(),
    entries: [
      sessionEntry(`e_${id.slice(2, 8)}`, {
        rowId,
        status: 'done',
        sets: reps.map((value, index) =>
          workingSet(`st_${id.slice(2, 8)}${index}0`, index, {
            at: new Date(start + (index + 1) * 60_000).toISOString(),
            setIndex: index,
            kg,
            reps: value,
            target: { min: 8, max: 10 },
            plannedSetCount: reps.length,
          }),
        ),
      }),
    ],
  });
}

/** Karar: hiçbir kural bozulmadıysa boş. */
function outcome(extra: Partial<StartOutcome> = {}): StartOutcome {
  return { score: null, low: false, today: null, previous: null, previousRows: [], painRows: [], stop: false, ...extra };
}
const hold = (code: 'high_irritability' | 'pain_rising_weekly' = 'high_irritability'): ToleranceResult => ({ action: 'hold', reasons: [{ code, action: 'hold', message: '' }] });
const reduce = (code: 'not_back_to_baseline' | 'peak_over_ceiling' = 'not_back_to_baseline'): ToleranceResult => ({ action: 'reduce', reasons: [{ code, action: 'reduce', message: '' }] });

describe('hazır oluşluk puanı (v1 formülü, 20–100; < 60 düşük)', () => {
  const rows: [string, [number, number, number, number], number, boolean][] = [
    ['hepsi en kötü', [1, 1, 1, 1], 20, true],
    ['hepsi en iyi', [5, 5, 5, 5], 100, false],
    ['sınır: 3·3·3·3 = 60 düşük değil', [3, 3, 3, 3], 60, false],
    ['sınırın altı: 59 yok, 55 düşük', [3, 3, 3, 2], 55, true],
    ['iyi uyku, yüksek stres', [5, 4, 4, 1], 70, false],
  ];
  for (const [name, [sleep, energy, soreness, stress], score, low] of rows) {
    test(name, () => {
      assert.equal(readinessScore({ sleep, energy, soreness, stress }), score);
      assert.equal(isLowReadiness(score), low);
    });
  }

  test('v1 ile aynı: v1\'de ağrı ve stresin 5\'i en kötüydü → (uyku + enerji + (6 − ağrı) + (6 − stres)) × 5', () => {
    for (const [sleep, energy, v1Soreness, v1Stress] of [[4, 2, 5, 1], [1, 5, 2, 3], [3, 3, 4, 4]] as const) {
      const v1 = (sleep + energy + (6 - v1Soreness) + (6 - v1Stress)) * 5;
      assert.equal(readinessScore({ sleep, energy, soreness: 6 - v1Soreness, stress: 6 - v1Stress }), v1);
    }
    assert.equal(LOW_READINESS, 60);
  });

  test('yarım cevaptan puan yok', () => {
    assert.equal(completeReadiness({ sleep: 4, energy: 4, soreness: 4 }), null);
    assert.equal(completeReadiness(undefined), null);
    assert.deepEqual(completeReadiness({ sleep: 4, energy: 4, soreness: 4, stress: 4 }), { sleep: 4, energy: 4, soreness: 4, stress: 4 });
  });

  test('son puan (§5.6 koşul 3): en yeni tarih, aynı günde listede sonraki; hazır oluşluksuz kayıt atlanır', () => {
    const r = (sleep: 1 | 2 | 3 | 4 | 5) => ({ sleep, energy: 3, soreness: 3, stress: 3 });
    assert.equal(
      latestReadinessScore([
        { date: '2026-09-25', readiness: r(5) },
        { date: '2026-09-26', readiness: r(1) },
        { date: '2026-09-26', readiness: r(2) },
        { date: '2026-09-27' },
        { date: '2026-09-20', readiness: r(4) },
      ]),
      55,
    );
    assert.equal(latestReadinessScore([{ date: '2026-09-26' }]), undefined);
  });
});

describe('CR-10 (Borg; Foster uyarlaması, Haddad 2017)', () => {
  const rows: [number, string][] = [
    [0, '0 · Dinlenme'],
    [1, '1 · Çok çok kolay'],
    [4, '4 · Biraz zor'],
    [5, '5 · Zor'],
    [6, '6 · Zor ile çok zor arası'],
    [7, '7 · Çok zor'],
    [8, '8 · Çok zor ile maksimal arası'],
    [9, '9 · Çok zor ile maksimal arası'],
    [10, '10 · Maksimal'],
  ];
  for (const [value, text] of rows) test(`${value} → ${text}`, () => assert.equal(cr10Text(value), text));
});

describe('onay: hangi sorular (canRecordHealth)', () => {
  const rows: [string, Pick<Client, 'modules' | 'consents'>, { readiness: boolean; pain: boolean }][] = [
    ['modül kapalı', client([]), { readiness: false, pain: false }],
    ['hazır oluşluk ve ağrı onaylı', client(['conditions', 'readiness', 'check_in']), { readiness: true, pain: true }],
    ['yalnız hazır oluşluk seçili', client(['readiness']), { readiness: true, pain: false }],
    ['yalnız ağrı takibi seçili', client(['check_in']), { readiness: false, pain: true }],
    ['onay yok', client(['readiness', 'check_in'], null), { readiness: false, pain: false }],
    ['onay eksik (modül genişledi)', client(['readiness', 'check_in'], ['readiness']), { readiness: false, pain: false }],
  ];
  for (const [name, item, parts] of rows) test(name, () => assert.deepEqual(checkParts(item), parts));
});

describe('antrenman başının girdisi (health.json)', () => {
  const pain = { readiness: true, pain: true };
  test('ağrı takibi yoksa ağrı geçmişi işlenmez; tavan kayıttan', () => {
    const file = record([{ date: '2026-09-25', painBaseline: 3, sessionId: 's_aaaaaaaa', painPeak: 5 }], { toleranceMode: 'pain_monitoring' });
    const result = checkContextOf({ parts: { readiness: true, pain: false }, record: file, today: TODAY });
    assert.deepEqual([result.history, result.previous, result.painRows, result.mode], [[], null, [], 'pain_monitoring']);
    assert.equal(checkContextOf({ parts: pain, record: null, today: TODAY }).mode, 'pain_free');
  });

  test('haftalık kural için son 14 gün (13 gün önce var, 14 gün önce ve yarın yok)', () => {
    const file = record([
      { date: '2026-09-13', painBaseline: 1 },
      { date: '2026-09-12', painBaseline: 9 },
      { date: '2026-09-27', painBaseline: 9 },
      { date: '2026-09-20' },
      { date: TODAY, painBaseline: 2 },
    ]);
    assert.deepEqual(checkContextOf({ parts: pain, record: file, today: TODAY }).history, [
      { date: '2026-09-13', painBaseline: 1 },
      { date: TODAY, painBaseline: 2 },
    ]);
  });

  test('ağrılı hareketler: son 7 gün, ağrıyla geçilenler ve adı verilenler (6 gün önce var, 7 gün önce yok)', () => {
    const file = record([
      { date: '2026-09-20', skippedRows: [{ rowId: 'r_aaaaaa', reason: 'pain' }], painRows: ['r_bbbbbb'] },
      { date: '2026-09-19', painRows: ['r_cccccc'] },
      { date: '2026-09-25', painRows: ['r_aaaaaa'] },
    ]);
    assert.deepEqual(checkContextOf({ parts: pain, record: file, today: TODAY }).painRows, ['r_aaaaaa', 'r_bbbbbb']);
  });

  test('önceki antrenman: 7 gün içinde antrenmana bağlı en yeni yoklama; ağrı yoksa sorulmaz', () => {
    const painful = record([
      { date: '2026-09-22', sessionId: 's_aaaaaaaa', painPeak: 6, painRows: ['r_aaaaaa'] },
      { date: '2026-09-24', sessionId: 's_bbbbbbbb', painPeak: 4 },
      { date: '2026-09-25', painBaseline: 5 }, // antrenmana bağlı değil (yük yok günü)
    ]);
    assert.deepEqual(checkContextOf({ parts: pain, record: painful, today: TODAY }).previous, { date: '2026-09-24', painPeak: 4, rows: [] });
    const calm = record([...painful.checkIns, { date: TODAY, sessionId: 's_cccccccc', painBaseline: 0, painPeak: 0 }]);
    assert.equal(checkContextOf({ parts: pain, record: calm, today: TODAY }).previous, null);
    const old = record([{ date: '2026-09-19', sessionId: 's_aaaaaaaa', painPeak: 8 }]);
    assert.equal(checkContextOf({ parts: pain, record: old, today: TODAY }).previous, null);
    const baselineOnly = record([{ date: '2026-09-25', sessionId: 's_aaaaaaaa', painBaseline: 2 }]);
    assert.deepEqual(checkContextOf({ parts: pain, record: baselineOnly, today: TODAY }).previous, { date: '2026-09-25', rows: [] });
  });
});

describe('"Başla" ne zaman açılır', () => {
  const full = { sleep: 3, energy: 3, soreness: 3, stress: 3 };
  const rows: [string, { readiness: boolean; pain: boolean }, Parameters<typeof canBegin>[1], boolean][] = [
    ['hazır oluşluk: dördü de cevaplı', { readiness: true, pain: false }, { readiness: full }, true],
    ['hazır oluşluk: biri eksik', { readiness: true, pain: false }, { readiness: { ...full, stress: undefined } }, false],
    ['ağrı: kırmızı bayrak cevaplı ("hiçbiri" de cevap)', { readiness: false, pain: true }, { redFlag: 'none' }, true],
    ['ağrı: kırmızı bayrak cevapsız', { readiness: false, pain: true }, { painBaseline: 2 }, false],
    ['ikisi: ikisi de gerekli', { readiness: true, pain: true }, { readiness: full }, false],
    ['ikisi: tamam', { readiness: true, pain: true }, { readiness: full, redFlag: 'none' }, true],
  ];
  for (const [name, parts, answers, open] of rows) test(name, () => assert.equal(canBegin(parts, answers), open));
});

describe('karar (SPEC §7.5 ağrı izleme kuralı; tasarım §2.2)', () => {
  const low = { sleep: 2, energy: 3, soreness: 3, stress: 3 } as const;
  test('hazır oluşluk: 55 → "hafifletelim mi?"; 60 → sorulmaz; ağrı takibi yoksa ağrı kararı yok', () => {
    const readinessOnly = context({ parts: { readiness: true, pain: false } });
    assert.deepEqual(evaluateStart({ context: readinessOnly, answers: { readiness: low } }), outcome({ score: 55, low: true }));
    const ok = evaluateStart({ context: readinessOnly, answers: { readiness: { ...low, sleep: 3 } } });
    assert.deepEqual([ok.score, ok.low, ok.today], [60, false, null]);
  });

  const rows: { name: string; ctx?: Partial<CheckContext>; answers: Parameters<typeof evaluateStart>[0]['answers']; today: string; previous: string | null; stop: boolean }[] = [
    { name: 'her şey yolunda', answers: { redFlag: 'none', painBaseline: 2 }, today: 'progress', previous: null, stop: false },
    { name: 'kırmızı bayrak → yük yok, antrenman başlamaz', answers: { redFlag: 'night_pain' }, today: 'stop', previous: null, stop: true },
    { name: 'kola/bacağa yayılıyor → yük yok', answers: { redFlag: 'none', symptomDirection: 'peripheralizing' }, today: 'stop', previous: null, stop: true },
    { name: 'merkeze toplanıyor iyi haber', answers: { redFlag: 'none', symptomDirection: 'centralizing' }, today: 'progress', previous: null, stop: false },
    { name: 'kolay tetikleniyor → artış yok', answers: { redFlag: 'none', irritability: 'high' }, today: 'hold', previous: null, stop: false },
    {
      name: 'haftalık ortalama ≥ 2 puan arttı (NPRS en küçük anlamlı fark) → artış yok',
      ctx: { history: [{ date: '2026-09-15', painBaseline: 1 }, { date: '2026-09-17', painBaseline: 1 }, { date: '2026-09-23', painBaseline: 3 }] },
      answers: { redFlag: 'none', painBaseline: 3 },
      today: 'hold',
      previous: null,
      stop: false,
    },
    {
      name: 'haftalık artış 1,5 puan: gürültü',
      ctx: { history: [{ date: '2026-09-15', painBaseline: 1 }, { date: '2026-09-23', painBaseline: 2 }] },
      answers: { redFlag: 'none', painBaseline: 3 },
      today: 'progress',
      previous: null,
      stop: false,
    },
    { name: 'önceki antrenmanın ağrısı ertesi sabah geçmedi → %15 aşağı', ctx: { previous: { date: '2026-09-24', rows: [] } }, answers: { redFlag: 'none', returnedToBaseline: false }, today: 'progress', previous: 'reduce', stop: false },
    { name: 'geçti → azaltma yok', ctx: { previous: { date: '2026-09-24', rows: [] } }, answers: { redFlag: 'none', returnedToBaseline: true }, today: 'progress', previous: null, stop: false },
    { name: 'önceki tepe 4/10, ağrısız mod (tavan 3) → azalt', ctx: { previous: { date: '2026-09-24', painPeak: 4, rows: [] } }, answers: { redFlag: 'none' }, today: 'progress', previous: 'reduce', stop: false },
    { name: 'önceki tepe 3/10 = tavan → azaltma yok', ctx: { previous: { date: '2026-09-24', painPeak: 3, rows: [] } }, answers: { redFlag: 'none' }, today: 'progress', previous: null, stop: false },
    { name: 'önceki tepe 5/10, ağrı izleme modu (tavan 5) → azaltma yok', ctx: { mode: 'pain_monitoring', previous: { date: '2026-09-24', painPeak: 5, rows: [] } }, answers: { redFlag: 'none' }, today: 'progress', previous: null, stop: false },
    { name: 'önceki tepe 6/10, ağrı izleme modu → azalt', ctx: { mode: 'pain_monitoring', previous: { date: '2026-09-24', painPeak: 6, rows: [] } }, answers: { redFlag: 'none' }, today: 'progress', previous: 'reduce', stop: false },
    { name: 'önceki antrenman yoksa "geçti mi" cevabı sayılmaz', answers: { redFlag: 'none', returnedToBaseline: false }, today: 'progress', previous: null, stop: false },
  ];
  for (const row of rows) {
    test(row.name, () => {
      const result = evaluateStart({ context: context(row.ctx), answers: row.answers });
      assert.equal(result.today?.action, row.today);
      assert.equal(result.previous?.action ?? null, row.previous);
      assert.equal(result.stop, row.stop);
    });
  }

  test('ağrılı hareketler ve önceki antrenmanın hareketleri karara taşınır', () => {
    const result = evaluateStart({ context: context({ painRows: ['r_bbbbbb'], previous: { date: '2026-09-24', painPeak: 7, rows: ['r_aaaaaa'] } }), answers: { redFlag: 'none' } });
    assert.deepEqual([result.painRows, result.previousRows], [['r_bbbbbb'], ['r_aaaaaa']]);
  });
});

describe('satırın kararı (hareket başına)', () => {
  test('bugünün durumu hepsine; önceki antrenmanın ağrısı adı verilen harekete, ad yoksa hepsine; ağrılı harekette artış yok', () => {
    const named = outcome({ today: hold(), previous: reduce(), previousRows: ['r_aaaaaa'], painRows: ['r_bbbbbb'] });
    assert.equal(rowTolerance(named, 'r_aaaaaa').action, 'reduce');
    assert.deepEqual(rowTolerance(named, 'r_bbbbbb').reasons.map((reason) => reason.code), ['high_irritability', 'painful_exercise']);
    assert.equal(rowTolerance(named, 'r_cccccc').action, 'hold');
    const all = outcome({ previous: reduce('peak_over_ceiling') });
    assert.equal(rowTolerance(all, 'r_cccccc').action, 'reduce');
    assert.equal(rowTolerance(outcome({ painRows: ['r_aaaaaa'] }), 'r_cccccc').action, 'progress');
  });

  test('en ağır karar kazanır, gerekçelerin hepsi kalır', () => {
    const result = combineTolerance([hold(), null, reduce(), hold('pain_rising_weekly')]);
    assert.equal(result.action, 'reduce');
    assert.deepEqual(result.reasons.map((reason) => reason.code), ['not_back_to_baseline', 'high_irritability', 'pain_rising_weekly']);
    assert.deepEqual(combineTolerance([null, null]), { action: 'progress', reasons: [] });
  });
});

describe('bugünün planı (yalnız bugün; seans dosyasına nötr gerekçe)', () => {
  // Geçen sefer 60 kg × 10 · 10 · 10 → motor 62,5 kg'a çıkarır (Bench, halter 2,5 kg, bar 20 kg).
  const day = () => workoutDay({ history: [finished(3, [10, 10, 10])] });
  const top = (result: ReturnType<typeof adjustDay>, rowId = 'r_aaaaaa') => {
    const plan = result.day.rows[rowId]?.plan;
    return plan ? { top: plan.topWeightKg, reason: plan.reason, sets: plan.sets.map((set) => [set.weightKg, set.target]) } : null;
  };

  test('başlangıç: motor 62,5 kg, 3 set', () => {
    const plan = day().rows.r_aaaaaa?.plan;
    assert.deepEqual([plan?.reason, plan?.topWeightKg, plan?.sets.length], ['increase', 62.5, 3]);
  });

  test('hafifletme (hazır oluşluk): 62,5 × 0,85 = 53,1 → 52,5 kg, son set düşer; gerekçe `lighten`', () => {
    const result = adjustDay(day(), { outcome: outcome({ score: 55, low: true }), lighten: true, mode: 'pain_free' });
    assert.deepEqual(top(result), { top: 52.5, reason: 'lighten', sets: [[52.5, 8], [52.5, 8]] });
    assert.deepEqual([result.lighter, result.adjustReason], [true, 'readiness']);
    const why = result.day.rows.r_aaaaaa?.why;
    assert.equal(why?.tone, 'down');
    assert.equal(why?.chip, 'Hafif gün · −10 kg');
    assert.match(why?.detail ?? '', /62,5 kg yerine 52,5 kg, 3 set yerine 2/);
  });

  test('"Planı koru": hiçbir şey değişmez (aynı nesne)', () => {
    const input = day();
    const result = adjustDay(input, { outcome: outcome({ score: 55, low: true }), lighten: false, mode: 'pain_free' });
    assert.equal(result.day, input);
    assert.deepEqual([result.lighter, result.adjustReason, result.changed], [false, undefined, []]);
  });

  test('ağrı → artış yok: son ağırlık 60 kg ve geçen seferki tekrarlar (aralığa kırpılı); gerekçe `hold`', () => {
    const result = adjustDay(day(), { outcome: outcome({ today: hold() }), lighten: false, mode: 'pain_free' });
    assert.deepEqual(top(result), { top: 60, reason: 'hold', sets: [[60, 10], [60, 10], [60, 10]] });
    assert.deepEqual([result.lighter, result.adjustReason], [false, undefined]);
    assert.deepEqual([result.day.rows.r_aaaaaa?.why?.tone, result.day.rows.r_aaaaaa?.why?.chip], ['hold', 'Ağrı · aynı ağırlık']);
    assert.match(result.day.rows.r_aaaaaa?.why?.detail ?? '', /^Ağrın kolay tetikleniyor\. Bugün artış yok: 60 kg ile kal\.$/);
  });

  test('ağrı → %15 aşağı son yapılandan: 60 × 0,85 = 51 → 50 kg, aralığın altı; gerekçe `decrease` (motorda kalır)', () => {
    const result = adjustDay(day(), { outcome: outcome({ previous: reduce() }), lighten: false, mode: 'pain_free' });
    assert.deepEqual(top(result), { top: 50, reason: 'decrease', sets: [[50, 8], [50, 8], [50, 8]] });
    assert.deepEqual([result.lighter, result.adjustReason], [true, 'pain']);
    assert.equal(result.day.rows.r_aaaaaa?.why?.chip, 'Ağrı · −10 kg');
    assert.match(result.day.rows.r_aaaaaa?.why?.detail ?? '', /son yaptığın 60 kg yerine 50 kg/);
  });

  test('önceki antrenmanda ağrı yapan hareket adıyla: yalnız o azalır', () => {
    const result = adjustDay(day(), { outcome: outcome({ previous: reduce('peak_over_ceiling'), previousRows: ['r_bbbbbb'] }), lighten: false, mode: 'pain_free' });
    assert.equal(top(result)?.reason, 'increase');
    assert.equal(top(result, 'r_bbbbbb')?.reason, 'decrease');
    assert.deepEqual(result.changed, ['r_bbbbbb']);
    assert.match(result.day.rows.r_bbbbbb?.why?.detail ?? '', /^Geçen antrenmanda ağrın tavanı \(3\/10\) aştı\./);
  });

  test('ağrılı hareket (son 7 gün): yalnız onda artış yok', () => {
    const result = adjustDay(day(), { outcome: outcome({ painRows: ['r_aaaaaa'] }), lighten: false, mode: 'pain_free' });
    assert.deepEqual([top(result)?.top, top(result)?.reason], [60, 'hold']);
    assert.deepEqual(result.changed, ['r_aaaaaa']);
    assert.match(result.day.rows.r_aaaaaa?.why?.detail ?? '', /^Bu hareket son günlerde ağrı yaptı\./);
  });

  test('azaltma + hafifletme: daha hafif ağırlık (50) ve hafifletmenin set sayısı; gerekçe `decrease`, neden ağrı', () => {
    const result = adjustDay(day(), { outcome: outcome({ score: 50, low: true, previous: reduce() }), lighten: true, mode: 'pain_free' });
    assert.deepEqual(top(result), { top: 50, reason: 'decrease', sets: [[50, 8], [50, 8]] });
    assert.deepEqual([result.lighter, result.adjustReason], [true, 'pain']);
  });

  test('artış yok + hafifletme: 52,5 kg (hafifletme), geçen seferki tekrarlar, 2 set; gerekçe `lighten`', () => {
    const result = adjustDay(day(), { outcome: outcome({ score: 50, low: true, today: hold() }), lighten: true, mode: 'pain_free' });
    assert.deepEqual(top(result), { top: 52.5, reason: 'lighten', sets: [[52.5, 10], [52.5, 10]] });
    assert.equal(result.adjustReason, 'readiness');
    assert.match(result.day.rows.r_aaaaaa?.why?.detail ?? '', /Ağrın kolay tetikleniyor: bugün artış yok\./);
  });

  test('en hafif ayarda azaltma olmaz: 20 kg bar, aralığın altı; gerekçe `hold`, "tekrarı azalt"', () => {
    const atBar = workoutDay({ history: [finished(3, [7, 7, 7], 20)] });
    const result = adjustDay(atBar, { outcome: outcome({ previous: reduce() }), lighten: false, mode: 'pain_free' });
    assert.deepEqual(top(result), { top: 20, reason: 'hold', sets: [[20, 8], [20, 8], [20, 8]] });
    assert.deepEqual([result.day.rows.r_aaaaaa?.why?.chip, result.lighter], ['Ağrı · tekrarı azalt', false]);
  });

  test('yoklamanın değiştirdiği satır işaretlenir: antrenman içinde "kolay ve tepede" adımı yok', () => {
    const pain = adjustDay(day(), { outcome: outcome({ today: hold() }), lighten: false, mode: 'pain_free' });
    assert.equal(pain.day.rows.r_aaaaaa?.adjusted, 'pain');
    const light = adjustDay(day(), { outcome: outcome({ score: 40, low: true }), lighten: true, mode: 'pain_free' });
    assert.equal(light.day.rows.r_aaaaaa?.adjusted, 'readiness');
    assert.equal(day().rows.r_aaaaaa?.adjusted, undefined);
  });

  test('süreli harekette azaltılacak ağırlık yok: aralığın altı, "süreyi azalt"', () => {
    const input = dayWithBlocks([{ id: 'b_aaaaaa', kind: 'single', restSeconds: 60, rows: [{ id: 'r_aaaaaa', exerciseId: 'plank', sets: [{ min: 30, max: 60 }, { min: 30, max: 60 }] }] }]);
    const result = adjustDay(input, { outcome: outcome({ previous: reduce() }), lighten: false, mode: 'pain_free' });
    assert.deepEqual(result.day.rows.r_aaaaaa?.plan.sets.map((set) => set.target), [30, 30]);
    assert.equal(result.day.rows.r_aaaaaa?.why?.chip, 'Ağrı · süreyi azalt');
    assert.match(result.day.rows.r_aaaaaa?.why?.detail ?? '', /Bu harekette azaltılacak ağırlık yok/);
  });

  test('yük yok (kırmızı bayrak): plan değişmez, antrenman başlamaz', () => {
    const input = day();
    const result = adjustDay(input, { outcome: outcome({ stop: true, today: { action: 'stop', reasons: [] } }), lighten: true, mode: 'pain_free' });
    assert.equal(result.day, input);
  });

  test('hafifletmenin değiştirmediği satır (2 setli vücut ağırlığı) olduğu gibi kalır: gerekçe ve motor aynı', () => {
    const input = dayWithBlocks([{ id: 'b_aaaaaa', kind: 'single', restSeconds: 60, rows: [{ id: 'r_aaaaaa', exerciseId: 'push-up', sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }] }] }]);
    const result = adjustDay(input, { outcome: outcome({ score: 40, low: true }), lighten: true, mode: 'pain_free' });
    assert.equal(result.day, input);
    assert.equal(result.lighter, false);
  });

  test('ısınma yeni en hafif çalışma setinin altında kalır', () => {
    const input = workoutDay({ history: [finished(3, [10, 10, 10], 80)] });
    assert.ok((input.rows.r_aaaaaa?.warmups ?? []).length > 0);
    const result = adjustDay(input, { outcome: outcome({ score: 40, low: true }), lighten: true, mode: 'pain_free' });
    const lightest = Math.min(...(result.day.rows.r_aaaaaa?.plan.sets.map((set) => set.weightKg) ?? [0]));
    assert.ok((result.day.rows.r_aaaaaa?.warmups ?? []).every((warmup) => warmup.kg < lightest));
  });

  test('planın set seçimi ve AMRAP\'ı korunur: tıkanma hafifletmesinin AMRAP\'sız seti AMRAP\'a dönmez', () => {
    const blocks = [{ id: 'b_aaaaaa', kind: 'single', restSeconds: 90, rows: [{ id: 'r_aaaaaa', exerciseId: 'bench-press', sets: [{ min: 8, max: 10, amrap: true }, { min: 8, max: 10 }, { min: 8, max: 10 }, { min: 8, max: 10 }] }] }];
    const stalled = dayWithBlocks(blocks, [finished(9, [7, 7, 7, 7]), finished(6, [7, 7, 7, 7]), finished(3, [7, 7, 7, 7])]);
    assert.deepEqual([stalled.rows.r_aaaaaa?.plan.reason, stalled.rows.r_aaaaaa?.plan.sets.map((set) => set.amrap)], ['deload', [false, false, false]]);
    const lightened = adjustDay(stalled, { outcome: outcome({ score: 40, low: true }), lighten: true, mode: 'pain_free' }).day.rows.r_aaaaaa?.plan;
    assert.deepEqual(lightened?.sets.map((set) => [set.setIndex, set.amrap]), [[0, false], [1, false]]);
    const reduced = adjustDay(stalled, { outcome: outcome({ previous: reduce() }), lighten: false, mode: 'pain_free' }).day.rows.r_aaaaaa?.plan;
    assert.deepEqual(reduced?.sets.map((set) => [set.setIndex, set.amrap, set.target]), [[0, false, 8], [1, false, 8], [2, false, 8]]);
  });

  test('zaten hafif plan (tıkanma hafifletmesi) ağırlığını ve gerekçesini korur, yalnız set düşer', () => {
    const blocks = [singleBlock('b_aaaaaa', 'r_aaaaaa', 4)];
    const stalled = dayWithBlocks(blocks, [finished(9, [7, 7, 7, 7]), finished(6, [7, 7, 7, 7]), finished(3, [7, 7, 7, 7])]);
    const before = stalled.rows.r_aaaaaa?.plan;
    assert.equal(before?.reason, 'deload');
    const result = adjustDay(stalled, { outcome: outcome({ score: 40, low: true }), lighten: true, mode: 'pain_free' });
    const after = result.day.rows.r_aaaaaa?.plan;
    assert.deepEqual([after?.reason, after?.topWeightKg, after?.sets.length], ['deload', before?.topWeightKg, (before?.sets.length ?? 0) - 1]);
  });

  test('set artışı önerisi (§5.6): hazır oluşluk düşükse ("Planı koru" da) hiç, planı inen satırda bugün yok', () => {
    const suggested = () => ({
      ...day(),
      setIncrease: [
        { rowId: 'r_aaaaaa', from: 3, to: 4, why: 'a' },
        { rowId: 'r_bbbbbb', from: 2, to: 3, why: 'b' },
      ],
    });
    const kept = adjustDay(suggested(), { outcome: outcome({ score: 55, low: true }), lighten: false, mode: 'pain_free' });
    assert.deepEqual([kept.day.setIncrease, kept.changed], [[], []]);
    const painful = adjustDay(suggested(), { outcome: outcome({ previous: reduce('peak_over_ceiling'), previousRows: ['r_bbbbbb'] }), lighten: false, mode: 'pain_free' });
    assert.deepEqual(painful.day.setIncrease?.map((item) => item.rowId), ['r_aaaaaa']);
    const fine = suggested();
    assert.equal(adjustDay(fine, { outcome: outcome({ score: 80 }), lighten: false, mode: 'pain_free' }).day, fine);
  });
});

describe('seans dosyası: nötr işaret', () => {
  test('hafifletme işareti ve PT\'ye `lighter` bildirimi bir kez', () => {
    const doc = withLighter(sessionDoc(), at(0));
    assert.equal(doc.adjust, 'lighter');
    assert.deepEqual(withLighter(doc, at(5)).notices, [{ kind: 'lighter', at: at(0) }]);
  });

  test('yoklama yalnız başlangıçta: set kaydı ya da hafifletme varsa açılmaz', () => {
    assert.equal(isFreshStart(sessionDoc()), true);
    assert.equal(isFreshStart(sessionDoc({ entries: [sessionEntry('e_aaaaaa')] })), true);
    assert.equal(isFreshStart(sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 1)] })] })), false);
    assert.equal(isFreshStart(sessionDoc({ adjust: 'lighter' })), false);
  });
});

describe('yazım: yalnız onaylı parçalar, yalnız health.json', () => {
  const full = { sleep: 4, energy: 2, soreness: 3, stress: 3 };
  test('gövde: onaylı parçaların cevapları; yarım hazır oluşluk yazılmaz; yazılacak yoksa null', () => {
    assert.deepEqual(
      startCheckInBody({ parts: { readiness: true, pain: true }, answers: { readiness: full, painBaseline: 2, redFlag: 'none', irritability: 'low' }, sessionId: 's_aaaaaaaa', adjustReason: 'readiness' }),
      { sessionId: 's_aaaaaaaa', readiness: full, painBaseline: 2, irritability: 'low', redFlag: 'none', adjustReason: 'readiness' },
    );
    assert.deepEqual(startCheckInBody({ parts: { readiness: false, pain: true }, answers: { readiness: full, redFlag: 'night_pain' } }), { redFlag: 'night_pain' });
    assert.equal(startCheckInBody({ parts: { readiness: true, pain: false }, answers: { readiness: { sleep: 3 }, redFlag: 'none' }, sessionId: 's_aaaaaaaa' }), null);
  });

  test('sunucu onayın kapsamadığı alanları atar; hiçbiri kalmazsa null', () => {
    const body = { sessionId: 's_aaaaaaaa', readiness: full, painPeak: 4, painRows: ['r_aaaaaa'], adjustReason: 'pain' as const };
    assert.deepEqual(allowedCheckIn(client(['readiness']), body), { sessionId: 's_aaaaaaaa', readiness: full });
    assert.deepEqual(allowedCheckIn(client(['check_in']), body), { sessionId: 's_aaaaaaaa', painPeak: 4, painRows: ['r_aaaaaa'], adjustReason: 'pain' });
    assert.deepEqual(allowedCheckIn(client(['readiness']), { readiness: full, adjustReason: 'readiness' }), { readiness: full, adjustReason: 'readiness' });
    assert.equal(allowedCheckIn(client([]), body), null);
    assert.equal(allowedCheckIn(client(['readiness', 'check_in'], null), body), null);
  });

  test('aynı antrenmanın kaydına biner (tarih korunur, bitişin ayrıntısı kalır); bağsız kayıt günle; değişiklik yoksa aynı nesne', () => {
    const base = record([{ date: '2026-09-25', sessionId: 's_aaaaaaaa', readiness: full, skippedRows: [{ rowId: 'r_aaaaaa', reason: 'pain' }] }]);
    const merged = withCheckIn(base, { date: TODAY, entry: { sessionId: 's_aaaaaaaa', painPeak: 5 } });
    assert.deepEqual(merged.checkIns, [{ date: '2026-09-25', sessionId: 's_aaaaaaaa', readiness: full, skippedRows: [{ rowId: 'r_aaaaaa', reason: 'pain' }], painPeak: 5 }]);
    assert.equal(withCheckIn(merged, { date: TODAY, entry: { sessionId: 's_aaaaaaaa', painPeak: 5 } }), merged);
    const other = withCheckIn(merged, { date: TODAY, entry: { sessionId: 's_bbbbbbbb', redFlag: 'none' } });
    assert.equal(other.checkIns.length, 2);
    const loose = withCheckIn(other, { date: TODAY, entry: { redFlag: 'night_pain' } });
    const again = withCheckIn(loose, { date: TODAY, entry: { redFlag: 'new_trauma' } });
    assert.deepEqual(again.checkIns.at(-1), { date: TODAY, redFlag: 'new_trauma' });
    assert.equal(again.checkIns.length, 3);
  });
});

describe('antrenman sonrası kart (§2.9: 10 dk – 24 saat, CR-10)', () => {
  const NOW = new Date('2026-09-26T18:00:00.000Z');
  const row = (id: string, finishedAt: string | undefined): SessionIndexRow => ({
    id,
    sha: '0'.repeat(40),
    path: `sessions/${id}.json`,
    date: TODAY,
    ...(finishedAt ? { finishedAt } : {}),
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: 3,
    water: 0,
    exercises: [],
    notices: [],
  });
  const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

  test('aday: son 24 saatte biten en yeni; etkin ve gelecekteki sayılmaz', () => {
    const items = [row('s_aaaaaaaa', minutesAgo(300)), row('s_bbbbbbbb', minutesAgo(30)), row('s_cccccccc', undefined), row('s_dddddddd', minutesAgo(-5))];
    assert.equal(afterCandidate({ items }, NOW)?.id, 's_bbbbbbbb');
    assert.equal(afterCandidate({ items: [row('s_aaaaaaaa', minutesAgo(24 * 60 + 1))] }, NOW), null);
    assert.equal(afterCandidate({ items: [row('s_aaaaaaaa', minutesAgo(24 * 60))] }, NOW)?.id, 's_aaaaaaaa');
  });

  test('kart: süre önceden dolu, hareketler (satırı olan, set yapılan, bir kez); zorluk varsa ya da bitmemişse yok', () => {
    const doc = sessionDoc({
      status: 'finished',
      startedAt: at(0),
      finishedAt: at(52),
      entries: [
        sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', title: 'Bench Press', sets: [workingSet('st_aaaaaaaa', 2)] }),
        sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', title: 'Leg Press', sets: [] }),
        sessionEntry('e_cccccc', { title: 'Eklenen', added: true, sets: [workingSet('st_cccccccc', 5)] }),
      ],
    });
    assert.deepEqual(afterPromptOf(doc), {
      sessionId: doc.id,
      dayName: 'Gün A',
      finishedAt: at(52),
      durationMin: 52,
      exercises: [{ rowId: 'r_aaaaaa', title: 'Bench Press' }],
    });
    assert.equal(afterPromptOf({ ...doc, effort: { sessionRpe: 6, updatedAt: at(70) } }), null);
    assert.equal(afterPromptOf({ ...doc, effort: { durationMin: 40, updatedAt: at(70) } })?.durationMin, 40);
    assert.equal(afterPromptOf(sessionDoc()), null);
  });

  test('zamanlama: 9:59 erken (kalan süreyle), 10 dk açık, 24 saat açık, sonrası geçti', () => {
    const finishedAt = NOW.toISOString();
    assert.deepEqual(afterState(finishedAt, NOW.getTime() + AFTER_DELAY_MS - 1000), { state: 'early', inMs: 1000 });
    assert.deepEqual(afterState(finishedAt, NOW.getTime() + AFTER_DELAY_MS), { state: 'due' });
    assert.deepEqual(afterState(finishedAt, NOW.getTime() + AFTER_WINDOW_MS), { state: 'due' });
    assert.deepEqual(afterState(finishedAt, NOW.getTime() + AFTER_WINDOW_MS + 1), { state: 'expired' });
    assert.equal(AFTER_DELAY_MS, 10 * 60_000);
  });
});
