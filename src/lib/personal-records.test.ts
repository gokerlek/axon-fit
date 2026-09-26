import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { byPriority, E1RM_MAX_REPS, epley, recordKey, recordsOf, sessionMarks, type RecordSession, type RecordSet } from './personal-records.ts';

const session = (id: string, date: string, sets: RecordSet[]): RecordSession => ({ id, date, sets });
const kgReps = (kg: number, ...reps: number[]): RecordSet[] => reps.map((value) => ({ kg, reps: value }));

describe('epley (tahmini maksimum)', () => {
  // Epley 1985: kg × (1 + tekrar ÷ 30); 1 tekrarda ağırlık; 1–12 tekrar (tasarım §2.8).
  const cases: [number | undefined, number | undefined, number | null, string][] = [
    [100, 1, 100, 'tek tekrar ağırlığın kendisi'],
    [60, 8, 76, '60 × 8 → 76'],
    [62.5, 10, 83.33, '62,5 × 10 → 83,33 (0,01 kg)'],
    [100, 12, 140, 'üst sınır 12 dahil'],
    [100, 13, null, '13 tekrar tahmine girmez'],
    [100, 0, null, '0 tekrar yok'],
    [0, 5, null, '0 kg (vücut ağırlığı) yok'],
    [-5, 5, null, 'eksi ağırlık yok'],
    [60, 2.5, null, 'kesirli tekrar yok'],
    [undefined, 5, null, 'ağırlık yok'],
    [60, undefined, null, 'tekrar yok (süreli set)'],
  ];
  for (const [kg, reps, expected, name] of cases) {
    test(name, () => assert.equal(epley(kg, reps), expected));
  }

  test('sınır sabiti tasarımla aynı', () => assert.equal(E1RM_MAX_REPS, 12));
});

describe('antrenmanın rekor adayları', () => {
  test('ağırlıklı: en ağır (aynı ağırlıkta en çok tekrar), tahmini maksimum, ağırlık başına tekrar', () => {
    const marks = sessionMarks(session('s_1', '2026-09-01', [...kgReps(60, 10, 9), ...kgReps(65, 5, 6), { kg: 20, reps: 10 }]), 'weight_reps');
    assert.deepEqual(marks.find((mark) => mark.kind === 'heaviest'), { kind: 'heaviest', value: 65, kg: 65, reps: 6, sessionId: 's_1', date: '2026-09-01' });
    // 60 × 10 → 80; 65 × 6 → 78 → en iyi 60 × 10.
    assert.deepEqual(marks.find((mark) => mark.kind === 'e1rm'), { kind: 'e1rm', value: 80, kg: 60, reps: 10, sessionId: 's_1', date: '2026-09-01' });
    assert.deepEqual(
      marks.filter((mark) => mark.kind === 'reps_at_weight').map((mark) => [mark.kg, mark.reps]),
      [
        [65, 6],
        [60, 10],
        [20, 10],
      ],
    );
  });

  test('12 tekrarın üstü tahmine girmez ama en ağıra ve tekrara girer', () => {
    const marks = sessionMarks(session('s_1', '2026-09-01', kgReps(40, 15)), 'weight_reps');
    assert.equal(marks.find((mark) => mark.kind === 'e1rm'), undefined);
    assert.equal(marks.find((mark) => mark.kind === 'heaviest')?.value, 40);
  });

  test('0 tekrarlı yüklü set (kaçırılan) en ağıra girmez', () => {
    const marks = sessionMarks(session('s_1', '2026-09-01', [{ kg: 100, reps: 0 }, ...kgReps(90, 3)]), 'weight_reps');
    assert.equal(marks.find((mark) => mark.kind === 'heaviest')?.kg, 90);
  });

  test('vücut ağırlığı: en çok tekrar ve ek yükle yapıldıysa en ağır ek yük', () => {
    assert.deepEqual(
      sessionMarks(session('s_1', '2026-09-01', [{ reps: 12 }, { reps: 10 }]), 'bodyweight_reps').map((mark) => [mark.kind, mark.value]),
      [['most_reps', 12]],
    );
    assert.deepEqual(
      sessionMarks(session('s_1', '2026-09-01', [{ reps: 12 }, { kg: 10, reps: 6 }]), 'bodyweight_reps').map((mark) => [mark.kind, mark.value]),
      [
        ['heaviest', 10],
        ['most_reps', 12],
      ],
    );
  });

  test('süreli: en uzun', () => {
    assert.deepEqual(
      sessionMarks(session('s_1', '2026-09-01', [{ seconds: 45 }, { seconds: 60 }, { seconds: 50 }]), 'duration').map((mark) => [mark.kind, mark.value]),
      [['longest', 60]],
    );
  });

  test('seti olmayan antrenmanın adayı yok', () => {
    assert.deepEqual(sessionMarks(session('s_1', '2026-09-01', []), 'weight_reps'), []);
    assert.deepEqual(sessionMarks(session('s_1', '2026-09-01', []), 'duration'), []);
  });
});

describe('rekorlar', () => {
  test('ilk kayıt referanstır, rekor sayılmaz', () => {
    const { best, events } = recordsOf([session('s_1', '2026-09-01', kgReps(60, 10, 10))], 'weight_reps');
    assert.deepEqual(events, []);
    assert.deepEqual(best.map((mark) => mark.kind), ['heaviest', 'e1rm', 'reps_at_weight']);
  });

  test('eşitlik rekor değil; kesin büyük rekor, öncekiyle', () => {
    const { events } = recordsOf(
      [session('s_1', '2026-09-01', kgReps(60, 10)), session('s_2', '2026-09-04', kgReps(60, 10)), session('s_3', '2026-09-08', kgReps(62.5, 8))],
      'weight_reps',
    );
    // s_2 aynı: hiç rekor yok. s_3: daha ağır (62,5 > 60); tahmin 62,5 × 8 = 79,17 < 80 değil; 62,5 ağırlığı ilk kez → referans.
    assert.deepEqual(
      events.map((event) => [event.sessionId, event.kind, event.value, event.previous.value]),
      [['s_3', 'heaviest', 62.5, 60]],
    );
  });

  test('aynı ağırlıkta daha çok tekrar: ağırlık başına rekor ve tahmini maksimum', () => {
    const { events, best } = recordsOf(
      [session('s_1', '2026-09-01', kgReps(60, 8, 8)), session('s_2', '2026-09-04', kgReps(60, 9, 8))],
      'weight_reps',
    );
    assert.deepEqual(
      events.map((event) => [event.kind, event.value, event.previous.value]),
      [
        ['e1rm', 78, 76],
        ['reps_at_weight', 9, 8],
      ],
    );
    assert.deepEqual(best.find((mark) => mark.kind === 'reps_at_weight'), {
      kind: 'reps_at_weight',
      value: 9,
      kg: 60,
      reps: 9,
      sessionId: 's_2',
      date: '2026-09-04',
    });
  });

  test('ağırlık başına rekor her ağırlığın kendi ilk kaydıyla karşılaştırılır', () => {
    const { events } = recordsOf(
      [
        session('s_1', '2026-09-01', [...kgReps(60, 10), ...kgReps(50, 12)]),
        session('s_2', '2026-09-04', [...kgReps(60, 9), ...kgReps(50, 14)]),
      ],
      'weight_reps',
    );
    assert.deepEqual(
      events.map((event) => [event.kind, event.kg, event.reps]),
      [['reps_at_weight', 50, 14]],
    );
  });

  test('düşüşten sonra eski en iyiyi geçmeyen değer rekor değil', () => {
    const { events } = recordsOf(
      [session('s_1', '2026-09-01', kgReps(80, 5)), session('s_2', '2026-09-04', kgReps(70, 5)), session('s_3', '2026-09-08', kgReps(75, 5))],
      'weight_reps',
    );
    assert.deepEqual(events, []);
  });

  test('en iyiler: tür sırası, ağırlıkta tekrarda ağır önce', () => {
    const { best } = recordsOf([session('s_1', '2026-09-01', [...kgReps(50, 12), ...kgReps(60, 8)])], 'weight_reps');
    assert.deepEqual(
      best.map((mark) => recordKey(mark)),
      ['heaviest', 'e1rm', 'reps_at_weight:60', 'reps_at_weight:50'],
    );
  });

  test('vücut ağırlığı ve süreli', () => {
    const bodyweight = recordsOf([session('s_1', '2026-09-01', [{ reps: 10 }]), session('s_2', '2026-09-04', [{ reps: 12 }])], 'bodyweight_reps');
    assert.deepEqual(bodyweight.events.map((event) => [event.kind, event.value, event.previous.value]), [['most_reps', 12, 10]]);
    const timed = recordsOf(
      [session('s_1', '2026-09-01', [{ seconds: 45 }]), session('s_2', '2026-09-04', [{ seconds: 45 }]), session('s_3', '2026-09-08', [{ seconds: 50 }])],
      'duration',
    );
    assert.deepEqual(timed.events.map((event) => [event.sessionId, event.value]), [['s_3', 50]]);
  });

  test('ek yük sonradan eklenirse ilk yüklü set referans', () => {
    const { events } = recordsOf(
      [session('s_1', '2026-09-01', [{ reps: 10 }]), session('s_2', '2026-09-04', [{ kg: 5, reps: 8 }]), session('s_3', '2026-09-08', [{ kg: 7.5, reps: 6 }])],
      'bodyweight_reps',
    );
    assert.deepEqual(events.map((event) => [event.sessionId, event.kind, event.value]), [['s_3', 'heaviest', 7.5]]);
  });

  test('öne çıkan sırası: en ağır, tahmini maksimum, ağırlıkta tekrar (ağır önce)', () => {
    const events = [
      { kind: 'reps_at_weight' as const, kg: 50 },
      { kind: 'e1rm' as const },
      { kind: 'reps_at_weight' as const, kg: 60 },
      { kind: 'heaviest' as const, kg: 60 },
    ];
    assert.deepEqual(
      byPriority(events).map((event) => recordKey(event)),
      ['heaviest', 'e1rm', 'reps_at_weight:60', 'reps_at_weight:50'],
    );
  });
});
