import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiffContext } from './program-diff.ts';
import { programIdSource, type ProgramPhase, type ProgramState } from './program-plan.ts';
import {
  applyProposal,
  clientOutcomes,
  decideProposal,
  isFaded,
  parseProposals,
  pendingProposals,
  planApproval,
  serializeProposals,
  upsertProposals,
  type Proposal,
  type ProposalInput,
} from './proposals.ts';
import type { SetSpec } from './set-plan.ts';
import type { PlanExercise } from './template-plan.ts';

const sets = (count: number, min: number, max: number): SetSpec[] => Array.from({ length: count }, () => ({ min, max }));

/** Belirlenimli "rastgelelik": her çağrıda farklı baytlar. */
function sequence(from = 0) {
  let n = from;
  return (size: number) => Uint8Array.from({ length: size }, () => (n++ * 7) % 252);
}

function input(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    at: '2026-09-26T16:00:00.000Z',
    sessionId: 's_k2m9x4qa',
    dayId: 'd_aaaaaa',
    rowId: 'r_bbbbbb',
    exerciseId: 'leg-press',
    title: 'Leg Press',
    kind: 'sets',
    from: 3,
    to: 4,
    text: 'Leg Press 3 → 4 set',
    why: '2 antrenmandır 4 set yapıldı',
    ...over,
  };
}

function program(): { phases: ProgramPhase[] } {
  return {
    phases: [
      {
        id: 'p_aaaaaa',
        name: 'Evre 1',
        days: [
          {
            id: 'd_aaaaaa',
            name: 'Gün A',
            blocks: [
              { id: 'b_aaaaaa', kind: 'single', restSeconds: 60, rows: [{ id: 'r_aaaaaa', exerciseId: 'push-up', sets: sets(3, 8, 12) }] },
              { id: 'b_bbbbbb', kind: 'single', restSeconds: 90, rows: [{ id: 'r_bbbbbb', exerciseId: 'leg-press', sets: sets(3, 10, 12), deviceId: 'kizak' }] },
              {
                id: 'b_cccccc',
                kind: 'superset',
                restSeconds: 90,
                rows: [
                  { id: 'r_cccccc', exerciseId: 'face-pull', sets: sets(3, 12, 15) },
                  { id: 'r_dddddd', exerciseId: 'curl', sets: sets(3, 10, 12) },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function proposal(over: Partial<Proposal> = {}): Proposal {
  return { ...input(), id: 'pr_aaaaaa', status: 'pending', ...over } as Proposal;
}

const rowOf = (phases: ProgramPhase[], rowId: string) =>
  phases.flatMap((phase) => phase.days.flatMap((day) => day.blocks.flatMap((block) => block.rows))).find((row) => row.id === rowId);

describe('proposals.json: okuma ve yazma', () => {
  test('tanınmayan kayıt atılmaz, aynen yazılır; dosya yoksa boş', () => {
    const raw = { version: 1, items: [proposal(), { id: 'pr_zzzzzz', kind: 'gelecekte', status: 'pending', at: '2026-09-26T16:00:00.000Z' }] };
    const file = parseProposals(raw);
    assert.equal(file.items.length, 1);
    assert.equal(file.unknown.length, 1);
    assert.deepEqual(serializeProposals(file).items.length, 2);
    assert.deepEqual(parseProposals(null), { version: 1, items: [], unknown: [] });
  });

  test('upsert: yeni öneri kimlik alır, aynı seansın yeniden denenmesi çoğaltmaz', () => {
    const first = upsertProposals(parseProposals(null), [input()], sequence());
    assert.equal(first.file.items.length, 1);
    assert.match(first.file.items[0]?.id ?? '', /^pr_[a-z0-9]{6}$/);
    assert.equal(first.file.items[0]?.status, 'pending');
    const again = upsertProposals(first.file, [input()], sequence(50));
    assert.equal(again.changed, false);
    assert.equal(again.file.items.length, 1);
    assert.deepEqual(again.ids, first.ids);
  });

  test('aynı satıra aynı türde bekleyen öneri yenisiyle güncellenir (kimlik aynı); başka tür ayrı öneri', () => {
    const first = upsertProposals(parseProposals(null), [input()], sequence());
    const next = upsertProposals(first.file, [input({ sessionId: 's_bbbbbbbb', to: 5, text: 'Leg Press 3 → 5 set' })], sequence(50));
    assert.equal(next.file.items.length, 1);
    assert.equal(next.file.items[0]?.id, first.file.items[0]?.id);
    assert.equal(next.file.items[0]?.to, 5);
    const other = upsertProposals(next.file, [input({ kind: 'remove', from: undefined, to: undefined, text: 'Leg Press: çıkar ya da değiştir' })], sequence(80));
    assert.equal(other.file.items.length, 2);
  });

  test('set sayısında danışanın ve motorun önerisi tek kart: hangisi sonra gelirse bekleyeni günceller', () => {
    const algo = (over: Partial<ProposalInput> = {}) =>
      input({ kind: 'algo_sets', sessionId: 's_bbbbbbbb', text: 'Leg Press: 3 → 4 set', why: '4 haftadır bu harekette; son 2 haftada ilerliyor.', ...over });
    for (const [first, second] of [[input(), algo()], [algo({ sessionId: 's_k2m9x4qa' }), input({ sessionId: 's_bbbbbbbb' })]] as const) {
      const one = upsertProposals(parseProposals(null), [first], sequence());
      const two = upsertProposals(one.file, [second], sequence(50));
      assert.equal(two.file.items.length, 1);
      assert.equal(two.file.items[0]?.id, one.file.items[0]?.id);
      assert.equal(two.file.items[0]?.kind, second.kind);
      assert.deepEqual(two.ids, one.ids);
      // Aynı seansın yeniden denemesi yine aynı kart.
      assert.equal(upsertProposals(two.file, [second], sequence(80)).changed, false);
    }
    // Karar verilmişse yeni öneri ayrı kart.
    const first = upsertProposals(parseProposals(null), [input()], sequence());
    const decided = decideProposal(first.file, first.file.items[0]?.id ?? '', { status: 'declined', at: new Date('2026-09-27T10:00:00.000Z') });
    assert.ok(decided);
    assert.equal(upsertProposals(decided, [algo()], sequence(50)).file.items.length, 2);
  });

  test('karar verilmiş öneri yeniden denemede değişmez; yeni seansın önerisi yeni kayıt olur', () => {
    const first = upsertProposals(parseProposals(null), [input()], sequence());
    const id = first.file.items[0]?.id ?? '';
    const decided = decideProposal(first.file, id, { status: 'declined', at: new Date('2026-09-27T10:00:00.000Z'), note: '  Şimdilik 3 set  ' });
    assert.ok(decided);
    assert.equal(decided.items[0]?.ptNote, 'Şimdilik 3 set');
    assert.equal(upsertProposals(decided, [input()], sequence(50)).changed, false);
    const later = upsertProposals(decided, [input({ sessionId: 's_bbbbbbbb' })], sequence(50));
    assert.equal(later.file.items.length, 2);
    assert.equal(decideProposal(decided, id, { status: 'approved', at: new Date() }), null);
  });

  test('bekleyenler en yeniden eskiye; 30 günden eskisi soluk; danışanın kararları 14 gün', () => {
    const file = parseProposals({
      version: 1,
      items: [
        proposal({ id: 'pr_aaaaaa', at: '2026-08-01T10:00:00.000Z' }),
        proposal({ id: 'pr_bbbbbb', at: '2026-09-25T10:00:00.000Z', rowId: 'r_aaaaaa' }),
        proposal({ id: 'pr_cccccc', status: 'approved', decidedAt: '2026-09-26T09:00:00.000Z', rowId: 'r_cccccc' }),
        proposal({ id: 'pr_dddddd', status: 'declined', decidedAt: '2026-09-01T09:00:00.000Z', rowId: 'r_dddddd' }),
      ],
    });
    const now = new Date('2026-09-26T12:00:00.000Z');
    assert.deepEqual(pendingProposals(file).map((item) => item.id), ['pr_bbbbbb', 'pr_aaaaaa']);
    assert.equal(isFaded({ at: '2026-08-01T10:00:00.000Z' }, now), true);
    assert.equal(isFaded({ at: '2026-09-25T10:00:00.000Z' }, now), false);
    const outcomes = clientOutcomes(file, now);
    assert.deepEqual(outcomes.decided.map((item) => item.id), ['pr_cccccc']);
    assert.equal(outcomes.pending.length, 2);
  });
});

describe('onay: öneriyi programa uygulamak', () => {
  const ids = () => programIdSource(program().phases, sequence());

  test('set sayısı: resizeSets; satırın set sayısı değiştiyse uygulanmaz', () => {
    const result = applyProposal(program(), proposal(), ids());
    assert.equal(result.status, 'applied');
    if (result.status === 'applied') assert.deepEqual(rowOf(result.phases, 'r_bbbbbb')?.sets, sets(4, 10, 12));
    assert.deepEqual(applyProposal(program(), proposal({ from: 4, to: 5 }), ids()), { status: 'stale', reason: 'Satır o arada değişti.' });
    assert.equal(applyProposal(program(), proposal({ kind: 'algo_sets' }), ids()).status, 'applied');
  });

  test('satır o arada silindiyse: stale', () => {
    assert.deepEqual(applyProposal(program(), proposal({ rowId: 'r_zzzzzz' }), ids()), { status: 'stale', reason: 'Bu hareket programda artık yok.' });
  });

  test('hedef: geçerli setler (danışanın hedefi dahil) from\'a eşitse setler yenisi olur', () => {
    const target = proposal({ kind: 'target', rowId: 'r_aaaaaa', exerciseId: 'push-up', from: undefined, to: undefined, target: { from: sets(3, 10, 14), to: sets(3, 12, 16) } });
    const withTarget = { ...program(), clientTargets: { r_aaaaaa: { sets: sets(3, 10, 14), baseSets: sets(3, 8, 12), at: '2026-09-20T10:00:00.000Z' } } };
    const result = applyProposal(withTarget, target, ids());
    assert.equal(result.status, 'applied');
    if (result.status === 'applied') assert.deepEqual(rowOf(result.phases, 'r_aaaaaa')?.sets, sets(3, 12, 16));
    assert.equal(applyProposal(program(), target, ids()).status, 'stale');
  });

  test('muadil: hareket değişir, cihaz egzersizinkine döner; kayıt türü farklıysa setler öneriden', () => {
    const swap = proposal({ kind: 'swap', from: undefined, to: undefined, swap: { exerciseId: 'hack-squat', title: 'Hack Squat' } });
    const result = applyProposal(program(), swap, ids());
    assert.equal(result.status, 'applied');
    if (result.status === 'applied') assert.deepEqual(rowOf(result.phases, 'r_bbbbbb'), { id: 'r_bbbbbb', exerciseId: 'hack-squat', sets: sets(3, 10, 12) });
    const timed = applyProposal(program(), { ...swap, swap: { exerciseId: 'wall-sit', title: 'Wall Sit', sets: sets(3, 30, 45) } }, ids());
    if (timed.status === 'applied') assert.deepEqual(rowOf(timed.phases, 'r_bbbbbb')?.sets, sets(3, 30, 45));
    assert.equal(applyProposal(program(), { ...swap, exerciseId: 'squat' }, ids()).status, 'stale');
  });

  test('çıkarma: tek hareketlik blok düşer; süperset tek harekete iner; günün tek hareketi çıkarılamaz', () => {
    const removed = applyProposal(program(), proposal({ kind: 'remove' }), ids());
    assert.equal(removed.status, 'applied');
    if (removed.status === 'applied') assert.deepEqual(removed.phases[0]?.days[0]?.blocks.map((block) => block.id), ['b_aaaaaa', 'b_cccccc']);
    const member = applyProposal(program(), proposal({ kind: 'remove', rowId: 'r_dddddd', exerciseId: 'curl' }), ids());
    if (member.status === 'applied') {
      const block = member.phases[0]?.days[0]?.blocks[2];
      assert.equal(block?.kind, 'single');
      assert.deepEqual(block?.rows.map((row) => row.id), ['r_cccccc']);
    }
    const lonely = { phases: [{ id: 'p_aaaaaa', name: 'Evre 1', days: [{ id: 'd_aaaaaa', name: 'Gün A', blocks: [program().phases[0]?.days[0]?.blocks[1]] }] }] } as { phases: ProgramPhase[] };
    assert.deepEqual(applyProposal(lonely, proposal({ kind: 'remove' }), ids()), { status: 'stale', reason: 'Günün tek hareketi; çıkarılamaz.' });
  });

  test('ekleme: günün sonuna yeni kimlikli tek hareketlik blok; gün yoksa stale', () => {
    const add = proposal({ kind: 'add', rowId: undefined, exerciseId: 'plank', from: undefined, to: undefined, add: { sets: sets(2, 30, 45), restSeconds: 45 } });
    const result = applyProposal(program(), add, ids());
    assert.equal(result.status, 'applied');
    if (result.status === 'applied') {
      const block = result.phases[0]?.days[0]?.blocks.at(-1);
      assert.equal(block?.kind, 'single');
      assert.equal(block?.restSeconds, 45);
      assert.match(block?.id ?? '', /^b_[a-z0-9]{6}$/);
      assert.deepEqual(block?.rows[0]?.sets, sets(2, 30, 45));
      assert.equal(block?.rows[0]?.exerciseId, 'plank');
    }
    assert.equal(applyProposal(program(), { ...add, dayId: 'd_zzzzzz' }, ids()).status, 'stale');
  });
});

describe('onay: kayıt yolu', () => {
  const titles: Record<string, string> = { 'push-up': 'Şınav', 'leg-press': 'Leg Press', 'face-pull': 'Face Pull', curl: 'Curl', plank: 'Plank' };
  const exercises = new Map<string, PlanExercise>(
    Object.entries(titles).map(([id, title]) => [
      id,
      { id, title, category: 'compound', trackingType: id === 'plank' ? 'duration' : 'weight_reps', equipment: 'machine', primaryMuscles: [], secondaryMuscles: [] },
    ]),
  );
  const ctx: DiffContext = { exercises: new Map([...exercises].map(([id, item]) => [id, { title: item.title, trackingType: item.trackingType }])), devices: new Map([['kizak', { name: 'Kızak' }]]) };
  const library = { exercises, deviceIds: new Set(['kizak']) };
  const now = new Date('2026-09-27T10:00:00.000Z');
  const stored = (): ProgramState => ({
    version: 2,
    phased: false,
    revision: 4,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    phases: program().phases,
    current: { phaseId: 'p_aaaaaa', startedAt: '2026-09-01T10:00:00.000Z' },
    rotation: { lastDayId: 'd_aaaaaa', lastCompletedAt: '2026-09-26T16:00:00.000Z' },
    log: [],
  });
  const file = () => parseProposals({ version: 1, items: [proposal()] });

  test('uygula: fark yazılır, revision +1, kayıt "Düzenlendi" + danışanın önerisi; öneri onaylandı', () => {
    const plan = planApproval({ program: stored(), file: file(), id: 'pr_aaaaaa', library, ctx, now, random: sequence() });
    assert.equal(plan.status, 'approved');
    if (plan.status !== 'approved') return;
    assert.equal(plan.revision, 5);
    assert.equal(plan.program?.revision, 5);
    assert.deepEqual(plan.program?.rotation, stored().rotation);
    assert.deepEqual(plan.program?.log[0]?.kind, 'edit');
    assert.deepEqual(
      plan.program?.log[0]?.changes.map((change) => change.text),
      ['Leg Press 3×10–12 → 4×10–12', 'Danışanın önerisi: Leg Press 3 → 4 set'],
    );
    assert.deepEqual(
      [plan.proposals.items[0]?.status, plan.proposals.items[0]?.decidedAt, plan.proposals.items[0]?.revision],
      ['approved', now.toISOString(), 5],
    );
  });

  test('set artışı danışanın hedefini korur: geçerli setler büyür, hedef programa alınır', () => {
    const at = '2026-09-25T10:00:00.000Z';
    const program: ProgramState = { ...stored(), clientTargets: { r_aaaaaa: { sets: sets(3, 10, 14), baseSets: sets(3, 8, 12), at } } };
    const pushUp = proposal({ rowId: 'r_aaaaaa', exerciseId: 'push-up', title: 'Şınav', text: 'Şınav 3 → 4 set' });
    const plan = planApproval({ program, file: parseProposals({ version: 1, items: [pushUp] }), id: 'pr_aaaaaa', library, ctx, now, random: sequence() });
    assert.equal(plan.status, 'approved');
    if (plan.status !== 'approved' || !plan.program) return;
    assert.deepEqual(rowOf(plan.program.phases, 'r_aaaaaa')?.sets, sets(4, 10, 14));
    assert.equal(plan.program.clientTargets, undefined);
    const texts = plan.changes.map((change) => change.text);
    assert.ok(texts.includes('Şınav: danışanın hedefi programa alındı'), texts.join(' | '));
    assert.ok(texts.includes('Şınav 3×8–12 → 4×10–14'), texts.join(' | '));
  });

  test('satır o arada değişti: program değişmez, öneri stale', () => {
    const plan = planApproval({ program: stored(), file: parseProposals({ version: 1, items: [proposal({ from: 4, to: 5 })] }), id: 'pr_aaaaaa', library, ctx, now });
    assert.equal(plan.status, 'stale');
    if (plan.status === 'stale') {
      assert.equal(plan.reason, 'Satır o arada değişti.');
      assert.equal(plan.proposals.items[0]?.status, 'stale');
    }
  });

  test('kütüphanede olmayan hareket eklenmez: stale', () => {
    const add = proposal({ kind: 'add', rowId: undefined, exerciseId: 'yok-boyle', from: undefined, to: undefined, add: { sets: sets(2, 8, 10), restSeconds: 60 } });
    const plan = planApproval({ program: stored(), file: parseProposals({ version: 1, items: [add] }), id: 'pr_aaaaaa', library, ctx, now, random: sequence() });
    assert.deepEqual(plan.status === 'stale' ? plan.reason : plan.status, 'Hareket kütüphanede yok.');
  });

  test('karara bağlanmış ya da olmayan öneri', () => {
    assert.equal(planApproval({ program: stored(), file: file(), id: 'pr_zzzzzz', library, ctx, now }).status, 'missing');
    const declined = parseProposals({ version: 1, items: [proposal({ status: 'declined', decidedAt: now.toISOString() })] });
    assert.equal(planApproval({ program: stored(), file: declined, id: 'pr_aaaaaa', library, ctx, now }).status, 'decided');
  });
});
