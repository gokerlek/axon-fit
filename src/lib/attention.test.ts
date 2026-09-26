import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import {
  ATTENTION_URGENCY,
  attentionFactsOf,
  attentionFeed,
  attentionItems,
  exerciseStalls,
  missedTrainingDays,
  type AttentionFacts,
} from './attention.ts';
import type { Client, Invite } from './schemas/client.ts';
import { programSchema } from './schemas/program.ts';
import type { SessionIndexExercise, SessionIndexRow } from './schemas/session.ts';
import { programFile, singleBlock } from './testing/session-fixtures.ts';
import { applyClientSchedule, resetClientSchedule } from './training-days.ts';

// Cumartesi 26 Eylül 2026, İstanbul'da 19:00.
const NOW = new Date('2026-09-26T16:00:00.000Z');
const TZ = 'Europe/Istanbul';
const TITLES: Record<string, string> = { 'bench-press': 'Bench Press', 'leg-press': 'Leg Press', squat: 'Squat' };
const ctx = { now: NOW, timeZone: TZ, titleOf: (id: string) => TITLES[id] ?? id };

const joined: Pick<Client, 'status' | 'access'> = {
  status: 'active',
  access: { version: 1, joinedAt: '2026-09-02T09:00:00.000Z', lastJoinAt: '2026-09-02T09:00:00.000Z' },
};

let rowCount = 0;
function row(date: string, exercises: Partial<SessionIndexExercise>[] = [], finished = true): SessionIndexRow {
  rowCount += 1;
  const id = `s_${String(rowCount).padStart(8, '0')}`;
  return {
    id,
    sha: 'a'.repeat(40),
    path: `sessions/${id}.json`,
    date,
    startedAt: `${date}T08:00:00.000Z`,
    ...(finished ? { finishedAt: `${date}T09:00:00.000Z` } : {}),
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: 0,
    water: 0,
    exercises: exercises.map((item) => ({ exerciseId: 'bench-press', rowId: 'r_aaaaaa', sets: 3, full: true, ...item })),
    notices: [],
  };
}

const bench = (reason: string, extra: Partial<SessionIndexExercise> = {}) => ({ exerciseId: 'bench-press', rowId: 'r_aaaaaa', reason, ...extra });
const legPress = (reason: string) => ({ exerciseId: 'leg-press', rowId: 'r_bbbbbb', reason });

function facts(overrides: Partial<AttentionFacts> = {}): AttentionFacts {
  return {
    active: true,
    access: 'joined',
    schedule: null,
    sessionDays: [],
    stalls: [],
    phase: null,
    proposals: null,
    measurements: [],
    ...overrides,
  };
}

describe('dikkat: kaçan antrenman günü (§2.11)', () => {
  test('son 7 gün, bugün hariç: seçili gün geçti ve o gün antrenman yok', () => {
    // Pzt 21, Çar 23, Cum 25; bugün Cmt 26. Pazartesi yapıldı.
    assert.deepEqual(missedTrainingDays({ weekdays: [1, 3, 5], sessionDays: ['2026-09-21'], today: '2026-09-26' }), ['2026-09-23', '2026-09-25']);
    // Bugün seçili gün olsa da sayılmaz (gün bitmedi).
    assert.deepEqual(missedTrainingDays({ weekdays: [6], sessionDays: [], today: '2026-09-26' }), ['2026-09-19']);
    // Programın kurulduğu gün ve öncesi sayılmaz.
    assert.deepEqual(missedTrainingDays({ weekdays: [1, 3, 5], sessionDays: [], today: '2026-09-26', since: '2026-09-23' }), ['2026-09-25']);
  });

  test('madde: birden çok kaçan gün daha acil; giriş yapmamış danışanda yok', () => {
    const schedule = { weekdays: [1, 3, 5], since: '2026-09-01T10:00:00.000Z' };
    const [many] = attentionItems(facts({ schedule, sessionDays: ['2026-09-21'] }), ctx);
    assert.equal(many?.text, 'Son 7 günde 2 antrenman günü kaçtı: 23 Eyl Çar, 25 Eyl Cum');
    assert.equal(many?.urgency, ATTENTION_URGENCY.missedMany);
    assert.equal(many?.target, 'sessions');
    const [one] = attentionItems(facts({ schedule, sessionDays: ['2026-09-21', '2026-09-23'] }), ctx);
    assert.equal(one?.text, 'Antrenman günü kaçtı: 25 Eyl Cum');
    assert.equal(one?.urgency, ATTENTION_URGENCY.missedOne);
    assert.deepEqual(
      attentionItems(facts({ access: 'pending', schedule }), ctx).map((item) => item.kind),
      ['invite'],
    );
  });
});

describe('dikkat: kaçan gün penceresi (günler ya da durum değişince baştan)', () => {
  // Danışan aylardır Pzt/Çar/Cum çalışıyor; son hafta da yaptı.
  const done = { items: [row('2026-09-21'), row('2026-09-23'), row('2026-09-25')] };
  const YESTERDAY = '2026-09-25T15:00:00.000Z';
  const scheduled = (extra: Record<string, unknown>) => v.parse(programSchema, programFile({}, { createdAt: '2026-06-01T10:00:00.000Z', ...extra }));
  const missedOf = (input: { program: ReturnType<typeof scheduled>; client?: Pick<Client, 'status' | 'access' | 'statusChangedAt'>; index?: typeof done }) =>
    attentionItems(
      attentionFactsOf({ client: input.client ?? joined, invite: null, index: input.index ?? done, program: input.program, proposals: null, measurements: null, now: NOW }),
      ctx,
    ).filter((item) => item.kind === 'missed');

  test('PT dün günleri Sal/Per/Cmt yaptı: eski günlerde yapılanlar yeni günlerde kaçan sayılmaz', () => {
    assert.deepEqual(missedOf({ program: scheduled({ schedule: { weekdays: [2, 4, 6], at: YESTERDAY } }) }), []);
    // Günlerin anı yoksa (eski kayıt) pencere programdan ve girişten başlar.
    assert.deepEqual(
      missedOf({ program: scheduled({ schedule: { weekdays: [2, 4, 6] } }) }).map((item) => item.text),
      ['Son 7 günde 3 antrenman günü kaçtı: 19 Eyl Cmt, 22 Eyl Sal, 24 Eyl Per'],
    );
  });

  test('"PT\'nin günlerine dön" ve danışanın PT\'nin günlerine dönmesi pencereyi baştan başlatır', () => {
    const own = scheduled({ schedule: { weekdays: [2, 4, 6] }, clientSchedule: { weekdays: [1, 3, 5], at: '2026-08-01T10:00:00.000Z' } });
    assert.deepEqual(missedOf({ program: own }), []);
    const reset = resetClientSchedule(own, new Date(YESTERDAY));
    assert.ok(reset);
    assert.deepEqual(missedOf({ program: reset.program }), []);
    const back = applyClientSchedule(own, [2, 4, 6], new Date(YESTERDAY));
    assert.ok(back);
    assert.deepEqual(missedOf({ program: back.program }), []);
  });

  test('duraklatmadan dönüş: aradaki günler kaçan sayılmaz', () => {
    const program = scheduled({ schedule: { weekdays: [1, 3, 5] } });
    const empty = { items: [] };
    assert.equal(missedOf({ program, index: empty }).length, 1);
    assert.deepEqual(missedOf({ program, index: empty, client: { ...joined, statusChangedAt: YESTERDAY } }), []);
  });

  test('başlanıp bitirilmemiş antrenmanın günü kaçan sayılmaz (onarılmış index)', () => {
    const program = scheduled({ schedule: { weekdays: [1, 3, 5] } });
    const index = { items: [row('2026-09-21'), row('2026-09-23', [bench('hold')], false), row('2026-09-25')] };
    assert.deepEqual(missedOf({ program, index }), []);
  });
});

describe('dikkat: ilerlemeyen hareket [sentez]', () => {
  test('üst üste 2 "aynı ağırlık" planı; nötr gerekçeler seriyi kesmez, artış keser', () => {
    const stalls = exerciseStalls({
      items: [
        row('2026-09-10', [bench('hold')]),
        row('2026-09-12', [bench('increase')]),
        row('2026-09-15', [bench('hold')]),
        row('2026-09-17', [bench('incomplete')]),
        row('2026-09-19', [bench('hold')]),
        // Bitmemiş antrenman sayılmaz.
        row('2026-09-21', [bench('increase')], false),
      ],
    });
    assert.deepEqual(stalls, [{ exerciseId: 'bench-press', streak: 2, declining: false, lastDate: '2026-09-19' }]);
  });

  test('Tanışma, ayar seansı, bir defalık ve hafif hareket tıkanma sayılmaz; tek tıkanma madde değil', () => {
    const stalls = exerciseStalls({
      items: [
        row('2026-09-10', [bench('hold', { stage: 'intro' })]),
        row('2026-09-12', [bench('hold', { oneOff: true })]),
        row('2026-09-15', [bench('hold', { lighter: true })]),
        row('2026-09-19', [bench('hold')]),
      ],
    });
    assert.deepEqual(stalls, []);
  });

  test('azaltma geriliyor; tıkanma hafifletmesi ayrıca; programda olmayan satır sayılmaz', () => {
    const index = {
      items: [
        row('2026-09-14', [bench('hold'), legPress('hold')]),
        row('2026-09-18', [bench('decrease'), legPress('hold')]),
        row('2026-09-20', [legPress('deload')]),
      ],
    };
    assert.deepEqual(exerciseStalls(index), [
      { exerciseId: 'bench-press', streak: 2, declining: true, lastDate: '2026-09-18' },
      { exerciseId: 'leg-press', streak: 0, declining: false, lastDate: '2026-09-20', deloadDate: '2026-09-20' },
    ]);
    assert.deepEqual(
      exerciseStalls(index, { rowIds: new Set(['r_bbbbbb']) }).map((fact) => fact.exerciseId),
      ['leg-press'],
    );
  });

  test('madde: hafifletme ve gerileme önce, eski seri ve eski hafifletme yok', () => {
    const [item] = attentionItems(
      facts({
        stalls: [
          { exerciseId: 'squat', streak: 3, declining: false, lastDate: '2026-09-24' },
          { exerciseId: 'bench-press', streak: 2, declining: true, lastDate: '2026-09-22' },
          { exerciseId: 'leg-press', streak: 0, declining: false, lastDate: '2026-09-20', deloadDate: '2026-09-20' },
          // 3 haftadan eski seri ve 2 haftadan eski hafifletme.
          { exerciseId: 'row', streak: 4, declining: false, lastDate: '2026-09-01' },
          { exerciseId: 'curl', streak: 0, declining: false, lastDate: '2026-09-05', deloadDate: '2026-09-05' },
        ],
      }),
      ctx,
    );
    assert.equal(item?.kind, 'stalled');
    assert.equal(item?.urgency, ATTENTION_URGENCY.deload);
    assert.equal(
      item?.text,
      'Leg Press hafifletildi (üst üste tıkandı) · Bench Press geriliyor (2 antrenmandır hedefin altında) · Squat 3 antrenmandır aynı ağırlıkta',
    );
  });
});

describe('dikkat: özet', () => {
  const program = v.parse(
    programSchema,
    programFile(
      {},
      {
        phased: true,
        phases: [
          { ...programFile().phases[0], name: 'Uyum', weeks: 2 },
          { id: 'p_bbbbbb', name: 'Güç', weeks: 6, days: [{ id: 'd_dddddd', name: 'Gün D', blocks: [singleBlock('b_dddddd', 'r_dddddd')] }] },
        ],
        schedule: { weekdays: [1, 3, 5] },
      },
    ),
  );

  test('evre, öneriler ve günler; kararlar sayfa açılınca', () => {
    const proposals = {
      version: 1,
      items: [
        { id: 'pr_aaaaaa', at: '2026-09-20T10:00:00.000Z', sessionId: 's_aaaaaaaa', dayId: 'd_aaaaaa', rowId: 'r_aaaaaa', exerciseId: 'bench-press', title: 'Bench Press', kind: 'sets', from: 3, to: 4, text: 'Bench Press 3 → 4 set', status: 'pending' },
        { id: 'pr_bbbbbb', at: '2026-09-22T10:00:00.000Z', sessionId: 's_bbbbbbbb', dayId: 'd_aaaaaa', rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press', kind: 'sets', from: 2, to: 3, text: 'Leg Press 2 → 3 set', status: 'pending' },
        { id: 'pr_cccccc', at: '2026-09-23T10:00:00.000Z', sessionId: 's_cccccccc', dayId: 'd_aaaaaa', rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press', kind: 'sets', from: 2, to: 3, text: 'Leg Press 2 → 3 set', status: 'declined' },
      ],
    };
    const result = attentionFactsOf({
      client: joined,
      invite: null,
      index: { items: [row('2026-09-21', [bench('increase')]), row('2026-08-01', [bench('increase')])] },
      program,
      proposals,
      measurements: null,
      now: NOW,
    });
    assert.deepEqual(result.schedule, { weekdays: [1, 3, 5], since: '2026-09-02T09:00:00.000Z' });
    assert.deepEqual(result.sessionDays, ['2026-09-21']);
    assert.deepEqual(result.phase, { name: 'Uyum', next: 'Güç', endsAt: '2026-09-15T10:00:00.000Z' });
    assert.deepEqual(result.proposals, { count: 2, at: '2026-09-22T10:00:00.000Z' });

    const items = attentionItems(result, ctx);
    assert.deepEqual(
      items.map((item) => [item.kind, item.text]),
      [
        ['missed', 'Son 7 günde 2 antrenman günü kaçtı: 23 Eyl Çar, 25 Eyl Cum'],
        ['proposals', '2 öneri onay bekliyor'],
        ['phase', "'Uyum' evresinin süresi doldu; sıradaki evre 'Güç'"],
      ],
    );
    // Evre bitmeden madde yok.
    assert.equal(attentionItems(result, { ...ctx, now: new Date('2026-09-14T10:00:00.000Z') }).some((item) => item.kind === 'phase'), false);
  });

  test('davet: özetten sonra süresi dolan davet; arşivde ya da duraklatılmışta madde yok', () => {
    const invite: Invite = { codeHash: 'a'.repeat(64), createdAt: '2026-09-25T10:00:00.000Z', expiresAt: '2026-09-27T10:00:00.000Z', used: false, attempts: 0 };
    const pending = attentionFactsOf({ client: { status: 'active', access: { version: 1 } }, invite, index: null, program: null, proposals: null, measurements: null, now: NOW });
    assert.equal(pending.access, 'pending');
    assert.deepEqual(
      attentionItems(pending, ctx).map((item) => item.text),
      ['Davet kullanılmadı · son kullanma 27 Eyl'],
    );
    assert.deepEqual(
      attentionItems(pending, { ...ctx, now: new Date('2026-09-28T10:00:00.000Z') }).map((item) => [item.text, item.urgency]),
      [['Davetin süresi doldu: yeni kare kod gerekli', ATTENTION_URGENCY.inviteBlocked]],
    );
    const none = attentionFactsOf({ client: { status: 'paused', access: { version: 1 } }, invite: null, index: null, program: null, proposals: null, measurements: null, now: NOW });
    assert.deepEqual(attentionItems(none, ctx), []);
  });

  test('ölçüm: yalnız gerileme, son ölçümü 4 haftadan eski eğilim yok', () => {
    const week = (i: number) => new Date(Date.UTC(2026, 7, 25 + i * 7)).toISOString().slice(0, 10);
    const entries = [
      ...[11, 12, 13, 14, 15].map((value, i) => ({ date: week(i), id: 'sit_to_stand_5x' as const, value })),
      ...[92, 91.2, 90.4, 89.8, 88.6].map((value, i) => ({ date: week(i), id: 'waist_girth' as const, value })),
    ];
    const result = attentionFactsOf({ client: joined, invite: null, index: null, program: null, proposals: null, measurements: entries, now: NOW });
    assert.deepEqual(
      result.measurements.map((item) => [item.id, item.key, item.lastDate]),
      [['sit_to_stand_5x', 'value', '2026-09-22']],
    );
    const [item] = attentionItems(result, ctx);
    assert.match(item?.text ?? '', /^4 haftalık eğilimde gerileme: 5 tekrar otur-kalk \+\d+(,\d)? sn$/);
    assert.equal(item?.target, 'measurements');
    assert.deepEqual(attentionItems(result, { ...ctx, now: new Date('2026-11-01T10:00:00.000Z') }), []);
  });
});

describe('dikkat: Genel bakış listesi', () => {
  test('aciliyet, sonra ad; toplam ve danışan sayısı', () => {
    const feed = attentionFeed(
      [
        { id: 'c_bbbbbbbb', name: 'Zeynep', facts: facts({ proposals: { count: 1, at: '2026-09-25T10:00:00.000Z', text: 'Squat 3 → 4 set' } }) },
        { id: 'c_aaaaaaaa', name: 'Ahmet', facts: facts({ proposals: { count: 2, at: '2026-09-25T10:00:00.000Z' }, access: 'joined' }) },
        { id: 'c_cccccccc', name: 'Can', facts: facts({ access: 'none' }) },
        { id: 'c_dddddddd', name: 'Okunamadı', facts: null },
      ],
      ctx,
      2,
    );
    assert.deepEqual(
      feed.items.map((item) => [item.clientName, item.text]),
      [
        ['Ahmet', '2 öneri onay bekliyor'],
        ['Zeynep', 'Öneri onay bekliyor: Squat 3 → 4 set'],
      ],
    );
    assert.equal(feed.total, 3);
    assert.equal(feed.clients, 3);
  });
});
