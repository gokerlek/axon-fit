import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { careInputOf } from './constraint-filter.ts';
import { addConstraint } from './constraints.ts';
import { GithubError } from './github/errors.ts';
import { HEALTH_CONSENT_VERSION, type Client } from './schemas/client.ts';
import type { SessionDoc } from './schemas/session.ts';
import type { ClientSession } from './session-core.ts';
import { fakeSessionRepo, type FakeSessionRepo } from './testing/fake-session-repo.ts';
import { at, DAY_A, DAY_B, programFile, sessionDoc, sessionEntry, workingSet } from './testing/session-fixtures.ts';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { emptyOwnIndex, ownIndexItemOf, upsertOwnItem } from './own-program-index.ts';
import { OWN_INDEX_PATH, type OwnProgram } from './own-programs.ts';
import { OWN_DAY_A, OWN_DAY_B, OWN_ID, OWN_ROW_GOBLET, ownProgram } from './testing/own-fixtures.ts';
import { DEVICES, EXERCISES, workoutDay } from './testing/workout-fixtures.ts';
import {
  alternativesRoute,
  exercisesRoute,
  scheduleRoute,
  waterRoute,
  withRowCare,
  workoutRoute,
  type AddedRowResponse,
  type AlternativesResponse,
  type LibraryResponse,
  type ScheduleResponse,
  type WorkoutResponse,
  type WorkoutRouteDeps,
} from './workout-routes.ts';

const ORIGIN = 'https://pt.example.com';
const CLIENT: Client = {
  id: 'c_testolcm',
  name: 'Test',
  createdAt: at(-10_000),
  status: 'active',
  modules: { health: { enabled: false, fields: [] } },
  consents: {},
  access: { version: 1 },
  visibleTo: [],
};
const SESSION: ClientSession = { role: 'client', clientId: CLIENT.id, accessVersion: 1 };
/** 26 Eylül 2026 cumartesi, İstanbul 19:00. */
const NOW = new Date('2026-09-26T16:00:00.000Z');

function setup(files: Record<string, unknown> = { 'program.json': programFile() }, options: { session?: ClientSession | null; gh?: FakeSessionRepo } = {}) {
  const gh = options.gh ?? fakeSessionRepo(files);
  const logs: string[] = [];
  const deps: WorkoutRouteDeps = {
    session: options.session === undefined ? SESSION : options.session,
    loadClient: async () => CLIENT,
    repo: () => gh.repo,
    timeZone: async () => 'Europe/Istanbul',
    now: () => NOW,
    log: (message) => logs.push(message),
    catalog: async () => ({ exercises: [...EXERCISES.values()], devices: [...DEVICES.values()] }),
    familyOf: (muscle) => muscle,
    setWeights: (exercise) => ({
      ...Object.fromEntries(exercise.secondaryMuscles.map((muscle) => [muscle, 0.5])),
      ...Object.fromEntries(exercise.primaryMuscles.map((muscle) => [muscle, 1])),
    }),
  };
  return { gh, deps, logs };
}

let counter = 0;
function finished(id: string, startedAt: string, reps: number, water = 0): SessionDoc {
  const start = Date.parse(startedAt);
  return sessionDoc({
    id,
    status: 'finished',
    date: startedAt.slice(0, 10),
    startedAt,
    finishedAt: new Date(start + 45 * 60_000).toISOString(),
    waterTaps: Array.from({ length: water }, (_, index) => ({ id: `wt_${id.slice(2, 6)}${index}000`, d: 1 as const, at: startedAt })),
    entries: [
      sessionEntry(`e_${id.slice(2, 8)}`, {
        rowId: 'r_aaaaaa',
        status: 'done',
        sets: [0, 1, 2].map((index) =>
          workingSet(`st_${(++counter).toString(36).padStart(8, '0')}`, 0, { at: new Date(start + (index + 1) * 60_000).toISOString(), setIndex: index, kg: 60, reps, effort: 'good', target: { min: 8, max: 10 } }),
        ),
      }),
    ],
  });
}

const body = (result: { body: Record<string, unknown> }) => result.body as unknown as WorkoutResponse;

describe('GET /api/me/workout', () => {
  test('geçmiş yoksa: sıradaki gün, ilk kez; hafta 0, su 0, yarım antrenman yok', async () => {
    const { deps } = setup();
    const result = await workoutRoute(deps, null);
    assert.equal(result.status, 200);
    const data = body(result);
    assert.equal(data.today, '2026-09-26');
    assert.equal(data.day?.dayId, DAY_A);
    assert.equal(data.day?.rows.r_aaaaaa?.plan.reason, 'first_time');
    assert.deepEqual(data.week, { done: 0, target: null, days: [], start: '2026-09-21' });
    assert.deepEqual(data.water, { file: 0, sessions: 0 });
    assert.equal(data.active, null);
    assert.deepEqual(data.program?.days.map((day) => day.id), [DAY_A, DAY_B]);
    assert.equal(data.program?.nextDayId, DAY_A);
    // Kaçan gün penceresi programın kurulduğu günden (danışan hiç katılmamış, durumu değişmemiş).
    assert.deepEqual(data.schedule, { weekdays: [], pt: [], client: null, source: null, daysPerWeek: null, since: '2026-09-01' });
    // Bitişteki "Sıradaki antrenman" satırı için evrenin günleri planda.
    assert.deepEqual(data.day?.rotationDays, [
      { id: DAY_A, name: 'Gün A' },
      { id: DAY_B, name: 'Gün B' },
    ]);
  });

  test('antrenman günleri: "bu hafta x/y" seçili gün sayısıyla; danışanın günleri geçerli; damga değişir', async () => {
    const days = { schedule: { weekdays: [1, 3, 5] }, clientSchedule: { weekdays: [2, 4, 6, 7], at: '2026-09-25T10:00:00.000Z' } };
    const { deps } = setup({ 'program.json': programFile({}, days) });
    const data = body(await workoutRoute(deps, null));
    assert.deepEqual(data.schedule, {
      weekdays: [2, 4, 6, 7],
      pt: [1, 3, 5],
      client: { weekdays: [2, 4, 6, 7], at: '2026-09-25T10:00:00.000Z' },
      source: 'client',
      daysPerWeek: null,
      since: '2026-09-25',
    });
    // Danışan sonradan katıldıysa pencere katıldığı günden (Genel bakış'ın "Kaçan gün"üyle aynı kural).
    const joined = setup({ 'program.json': programFile({}, { schedule: { weekdays: [1, 3, 5] } }) });
    joined.deps.loadClient = async () => ({ ...CLIENT, access: { version: 1, joinedAt: '2026-09-20T21:30:00.000Z' } });
    assert.equal(body(await workoutRoute(joined.deps, null)).schedule?.since, '2026-09-21', 'saat diliminde (İstanbul 00:30)');
    assert.equal(data.week.target, 4);
    const other = body(await workoutRoute(setup({ 'program.json': programFile({}, { schedule: { weekdays: [1, 3, 5] } }) }).deps, null));
    assert.equal(other.week.target, 3);
    assert.notEqual(other.program?.stamp, data.program?.stamp, 'danışanın günleri damgaya girer');
    const rotated = body(await workoutRoute(setup({ 'program.json': programFile({ lastDayId: DAY_A, lastCompletedAt: '2026-09-25T10:00:00.000Z' }, { schedule: { weekdays: [1, 3, 5] } }) }).deps, null));
    assert.notEqual(rotated.program?.stamp, other.program?.stamp, 'rotasyon damgaya girer');
  });

  test('başka gün seçildiyse planda sıradaki günün adı; günlerin son yapıldığı gün', async () => {
    const { deps } = setup({
      'program.json': programFile(),
      'sessions/s_aaaaaaaa.json': finished('s_aaaaaaaa', '2026-09-22T15:00:00.000Z', 9),
    });
    const data = body(await workoutRoute(deps, DAY_B));
    assert.equal(data.day?.dayId, DAY_B);
    assert.equal(data.day?.plannedDayId, DAY_A);
    assert.equal(data.day?.plannedDayName, 'Gün A');
    assert.deepEqual(data.program?.days, [
      { id: DAY_A, name: 'Gün A', lastDate: '2026-09-22' },
      { id: DAY_B, name: 'Gün B' },
    ]);
  });

  test('bitmiş antrenmanlardan: plan, "Önceki", bu hafta, bugünkü su (index dosyasız da onarılır)', async () => {
    const { deps } = setup({
      'program.json': programFile(),
      'sessions/s_aaaaaaaa.json': finished('s_aaaaaaaa', '2026-09-22T15:00:00.000Z', 9),
      'sessions/s_bbbbbbbb.json': finished('s_bbbbbbbb', '2026-09-26T06:00:00.000Z', 10, 2),
      'water.json': { version: 1, taps: [{ id: 'wt_zzzzzzzz', d: 1, at: '2026-09-26T09:00:00.000Z' }] },
    });
    const data = body(await workoutRoute(deps, null));
    const row = data.day?.rows.r_aaaaaa;
    assert.equal(row?.plan.reason, 'increase');
    assert.equal(row?.plan.topWeightKg, 62.5);
    assert.deepEqual(row?.lastTime.map((item) => item.value), [10, 10, 10]);
    assert.deepEqual(data.week, { done: 2, target: null, days: ['2026-09-22', '2026-09-26'], start: '2026-09-21' });
    assert.deepEqual(data.water, { file: 1, sessions: 2 });
  });

  test('öneri katmanı: aşama ve gerekçe satırda; danışanın antrenman geçmişi taban (§5.2, açık soru 4)', async () => {
    const files = {
      'program.json': programFile(),
      'sessions/s_aaaaaaaa.json': finished('s_aaaaaaaa', '2026-09-22T15:00:00.000Z', 9),
      'sessions/s_bbbbbbbb.json': finished('s_bbbbbbbb', '2026-09-24T15:00:00.000Z', 10),
    };
    const fresh = body(await workoutRoute(setup(files).deps, null)).day?.rows.r_aaaaaa;
    assert.equal(fresh?.stage, 'intro');
    assert.equal(fresh?.plan.reason, 'increase');
    assert.equal(fresh?.why?.chip, 'Tanışma 3/4 · +2,5 kg');
    // 1 yıl+: en az Orta → 2-for-2: önceki seans tepede değildi, bir kez daha.
    const experienced = setup(files);
    experienced.deps.loadClient = async () => ({ ...CLIENT, training: { experience: 'one_year' } });
    const row = body(await workoutRoute(experienced.deps, null)).day?.rows.r_aaaaaa;
    assert.equal(row?.stage, 'intermediate');
    assert.equal(row?.plan.reason, 'confirm_increase');
    assert.equal(row?.plan.topWeightKg, 60);
    assert.deepEqual(row?.plan.sets.map((set) => set.target), [10, 10, 10]);
  });

  test('set artışı adayı (§5.6) günün planında; bu hafta verilmiş öneri ve düşük hazır oluşluk (onaylı) engeller', async () => {
    const planned = (doc: SessionDoc, reason: string): SessionDoc => ({ ...doc, entries: doc.entries.map((entry) => ({ ...entry, plan: { topWeightKg: 60, reason } })) });
    const files = {
      'program.json': programFile(),
      'sessions/s_aaaaaaaa.json': planned(finished('s_aaaaaaaa', '2026-08-27T15:00:00.000Z', 10), 'hold'),
      'sessions/s_bbbbbbbb.json': planned(finished('s_bbbbbbbb', '2026-09-09T15:00:00.000Z', 10), 'hold'),
      'sessions/s_cccccccc.json': planned(finished('s_cccccccc', '2026-09-23T15:00:00.000Z', 10), 'increase'),
    };
    const experienced = (extra: Record<string, unknown> = {}, client: Partial<Client> = {}) => {
      const result = setup({ ...files, ...extra });
      result.deps.loadClient = async () => ({ ...CLIENT, training: { experience: 'one_year' }, ...client });
      return result.deps;
    };
    const day = body(await workoutRoute(experienced(), null)).day;
    // Göğsün son 7 günü: 3 gün önceki 3 set + bugünün planı (3 + 2 set).
    assert.deepEqual(day?.setIncrease, [
      { rowId: 'r_aaaaaa', from: 3, to: 4, why: '4 haftadır bu harekette; son 2 haftada ilerliyor. Hedef kasın son 7 günde 8 seti var (önerilen ~10).' },
    ]);
    // Deneyim tabanı yoksa (Tanışma) aday yok.
    assert.equal(body(await workoutRoute(setup(files).deps, null)).day?.setIncrease, undefined);
    // Bu hafta göğse iki algoritmik öneri verildi.
    const proposal = (id: string, sessionId: string) => ({
      id,
      at: '2026-09-24T10:00:00.000Z',
      sessionId,
      dayId: DAY_B,
      rowId: 'r_cccccc',
      exerciseId: 'bench-press',
      title: 'Bench Press',
      kind: 'algo_sets',
      from: 3,
      to: 4,
      text: 'Bench Press 3 → 4 set',
      status: 'pending',
    });
    const busy = experienced({ 'proposals.json': { version: 1, items: [proposal('pr_aaaaaa', 's_dddddddd'), proposal('pr_bbbbbb', 's_eeeeeeee')] } });
    assert.equal(body(await workoutRoute(busy, null)).day?.setIncrease, undefined);
    // Sağlık onayı varken son hazır oluşluk 60'ın altı.
    const consent = {
      modules: { health: { enabled: true, fields: ['readiness' as const] } },
      consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['readiness' as const], at: '2026-09-01T10:00:00.000Z' } },
    };
    const health = { conditions: [], measurements: [], movementScreens: [], checkIns: [{ date: '2026-09-25', readiness: { sleep: 2, energy: 2, soreness: 3, stress: 3 } }] };
    assert.equal(body(await workoutRoute(experienced({ 'health.json': health }, consent), null)).day?.setIncrease, undefined);
    // Onay yoksa sağlık dosyası okunmaz, koşul atlanır.
    assert.equal(body(await workoutRoute(experienced({ 'health.json': health }), null)).day?.setIncrease?.length, 1);
  });

  test('4 haftadan uzun aradan dönüş: ayar seansı ~%90 (60 → 54 → 52,5)', async () => {
    const { deps } = setup({ 'program.json': programFile(), 'sessions/s_aaaaaaaa.json': finished('s_aaaaaaaa', '2026-08-20T15:00:00.000Z', 10) });
    const row = body(await workoutRoute(deps, null)).day?.rows.r_aaaaaa;
    assert.equal(row?.plan.reason, 'calibrate');
    assert.equal(row?.plan.topWeightKg, 52.5);
    assert.match(row?.why?.detail ?? '', /^37 gündür/);
  });

  test('sunucudaki yarım antrenman döner; gün onun günü (istenen gün önce gelir)', async () => {
    const active = sessionDoc({
      id: 's_cccccccc',
      startedAt: '2026-09-26T15:00:00.000Z',
      program: { revision: 7, dayId: DAY_B, dayName: 'Gün B' },
    });
    const { deps } = setup({ 'program.json': programFile(), 'sessions/s_cccccccc.json': active });
    const data = body(await workoutRoute(deps, null));
    assert.equal(data.active?.id, 's_cccccccc');
    assert.equal(data.day?.dayId, DAY_B);
    assert.equal(body(await workoutRoute(deps, DAY_A)).day?.dayId, DAY_A);
    assert.equal(body(await workoutRoute(deps, '../x')).day?.dayId, DAY_B);
  });

  test('program yoksa gün yok; okunamıyorsa danışana dönük metin; bozuk su dosyası sayılmaz', async () => {
    const empty = body(await workoutRoute(setup({}).deps, null));
    assert.deepEqual([empty.program, empty.day, empty.problem], [null, null, undefined]);
    const gh = fakeSessionRepo({});
    gh.putText('program.json', '{ bozuk');
    gh.putText('water.json', '{ bozuk');
    const broken = body(await workoutRoute(setup({}, { gh }).deps, null));
    assert.equal(broken.day, null);
    assert.match(broken.problem ?? '', /açılamıyor/);
    assert.equal(broken.water.file, 0);
  });

  test('oturum yoksa 401; GitHub sınırı 429 + Retry-After', async () => {
    assert.equal((await workoutRoute(setup(undefined, { session: null }).deps, null)).status, 401);
    const { deps, gh } = setup();
    gh.failNext('head', new GithubError('sınır', 403, { rateLimited: true, retryAfter: 30 }));
    const limited = await workoutRoute(deps, null);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers?.['Retry-After'], '30');
  });
});

describe('muadil ve eklenen hareketler', () => {
  test('yarım antrenmandaki muadil ve eklenen hareketin planları döner; sağlık onayı yoksa "Ağrı" yok', async () => {
    const active = sessionDoc({
      id: 's_cccccccc',
      startedAt: '2026-09-26T15:00:00.000Z',
      entries: [
        sessionEntry('e_swapxx', { swappedFrom: 'r_aaaaaa', exerciseId: 'dumbbell-press', title: 'Dumbbell Press', deviceId: 'dambil-seti' }),
        sessionEntry('e_addedx', { added: true, plannedSets: 2, exerciseId: 'push-up', title: 'Şınav' }),
      ],
    });
    const { deps } = setup({ 'program.json': programFile(), 'sessions/s_cccccccc.json': active });
    const data = body(await workoutRoute(deps, null));
    assert.deepEqual(Object.keys(data.extras).sort(), ['e_addedx:push-up', 'r_aaaaaa:dumbbell-press']);
    const swap = data.extras['r_aaaaaa:dumbbell-press'];
    assert.deepEqual([swap?.row.rowId, swap?.row.blockId, swap?.row.title, swap?.template.sets.length], ['r_aaaaaa', 'b_aaaaaa', 'Dumbbell Press', 3]);
    const added = data.extras['e_addedx:push-up'];
    assert.deepEqual([added?.row.rowId, added?.template.id, added?.template.sets.length, added?.restSeconds], ['e_addedx', 'e_addedx', 2, 120]);
    assert.deepEqual(data.health, { pain: false });
    assert.deepEqual(body(await workoutRoute(setup().deps, null)).extras, {});
  });

  test('"Değiştir": muadiller ekipmana göre (vücut ağırlığı önce), satırın set düzeniyle; bugünün hareketleri yok', async () => {
    const { deps } = setup();
    const result = await alternativesRoute(deps, DAY_A, 'r_aaaaaa');
    assert.equal(result.status, 200);
    const data = result.body as unknown as AlternativesResponse;
    assert.deepEqual(
      data.groups.map((group) => [group.label, group.options.map((option) => option.exerciseId)]),
      [
        ['Vücut ağırlığı', ['push-up']],
        ['Dambıl', ['dumbbell-press']],
      ],
    );
    const option = data.groups[1]?.options[0];
    assert.deepEqual([option?.extra.row.rowId, option?.extra.row.deviceId, option?.extra.template.sets], ['r_aaaaaa', 'dambil-seti', [{ min: 8, max: 10 }, { min: 8, max: 10 }, { min: 8, max: 10 }]]);
  });

  test('kısıtlar (kisit-tarama.md §3.4, §3.5): izinsiz yasak muadilden çıkar, satırda kart notu; onay yoksa dosya okunmaz', async () => {
    const health = addConstraint(
      { version: 2, checkIns: [], measurements: [] },
      { region: 'shoulder', side: 'right', type: 'injury', avoid: ['behind_body'], clientNote: 'Alt noktada dur.' },
      { id: 'k_aaaaaa', now: '2026-09-20T10:00:00.000Z' },
    );
    const withTags = () => ({
      exercises: [...EXERCISES.values()].map((exercise) =>
        exercise.id === 'dumbbell-press'
          ? { ...exercise, jointWindows: ['glenohumeral_extension_beyond_neutral' as const] }
          : exercise.id === 'push-up'
            ? { ...exercise, kineticChain: 'closed' as const, jointWindows: [] }
            : exercise,
      ),
      devices: [...DEVICES.values()],
    });
    const consented = (files: Record<string, unknown>) => {
      const result = setup(files);
      result.deps.catalog = async () => withTags();
      result.deps.loadClient = async () => ({
        ...CLIENT,
        modules: { health: { enabled: true, fields: ['conditions'] } },
        consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['conditions'], at: '2026-09-01T10:00:00.000Z' } },
      });
      return result;
    };
    const files = { 'program.json': programFile(), 'health.json': health };
    const alternatives = (await alternativesRoute(consented(files).deps, DAY_A, 'r_aaaaaa')).body as unknown as AlternativesResponse;
    assert.deepEqual(alternatives.groups.map((group) => group.options.map((option) => option.exerciseId)), [['push-up']]);
    const data = body(await workoutRoute(consented(files).deps, null));
    // Bench'in pencere etiketi yok: kalıp yedeği dikkat verir, not PT'nin danışana notuyla.
    assert.deepEqual(data.day?.rows.r_aaaaaa?.care, { kind: 'note', label: 'Sağ omuz', region: 'shoulder', side: 'right', note: 'Alt noktada dur.' });
    // Onay yoksa kısıtlar okunmaz: iki muadil, not yok, damga farklı.
    const plain = setup(files);
    plain.deps.catalog = async () => withTags();
    const open = (await alternativesRoute(plain.deps, DAY_A, 'r_aaaaaa')).body as unknown as AlternativesResponse;
    assert.equal(open.groups.flatMap((group) => group.options).length, 2);
    const plainDay = body(await workoutRoute(plain.deps, null));
    assert.equal(plainDay.day?.rows.r_aaaaaa?.care, undefined);
    assert.notEqual(plainDay.program?.stamp, data.program?.stamp);
    assert.ok(!plain.gh.calls.some((call) => call.includes('health.json')));
  });

  test('kısıtlar: kendi programın satırında not "antrenörün planladı" demez (own)', () => {
    const health = addConstraint(
      { version: 2, checkIns: [], measurements: [] },
      { region: 'shoulder', side: 'right', type: 'injury', avoid: ['behind_body'] },
      { id: 'k_aaaaaa', now: '2026-09-20T10:00:00.000Z' },
    );
    const input = careInputOf(health, { today: '2026-09-27', painConsent: false });
    const day = workoutDay();
    assert.equal(withRowCare(day, EXERCISES, input).rows.r_aaaaaa?.care?.own, undefined);
    assert.equal(withRowCare({ ...day, source: 'own' }, EXERCISES, input).rows.r_aaaaaa?.care?.own, true);
  });

  test('kısıtlar: "Hareket ekle" izinsiz yasağı listelemez ve eklemez (409); muadil ve eklenen satır notu taşır', async () => {
    const health = addConstraint(
      { version: 2, checkIns: [], measurements: [] },
      { region: 'shoulder', side: 'right', type: 'injury', avoid: ['behind_body'] },
      { id: 'k_aaaaaa', now: '2026-09-20T10:00:00.000Z' },
    );
    // Dumbbell Press yasak (pencere etiketi); Şınav'ın etiketi yok: kalıp yedeği dikkat verir.
    const catalog = async () => ({
      exercises: [...EXERCISES.values()].map((exercise) =>
        exercise.id === 'dumbbell-press' ? { ...exercise, jointWindows: ['glenohumeral_extension_beyond_neutral' as const] } : exercise,
      ),
      devices: [...DEVICES.values()],
    });
    const consented = (files: Record<string, unknown>) => {
      const result = setup(files);
      result.deps.catalog = catalog;
      result.deps.loadClient = async () => ({
        ...CLIENT,
        modules: { health: { enabled: true, fields: ['conditions'] } },
        consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['conditions'], at: '2026-09-01T10:00:00.000Z' } },
      });
      return result;
    };
    const files = { 'program.json': programFile(), 'health.json': health };
    const own = { kind: 'note', label: 'Sağ omuz', region: 'shoulder', side: 'right', own: true };

    const library = (await exercisesRoute(consented(files).deps, null)).body as unknown as LibraryResponse;
    assert.ok(!library.exercises.some((item) => item.id === 'dumbbell-press'), 'yasak listede yok');
    assert.equal(library.exercises.find((item) => item.id === 'push-up')?.care, 'Sağ omuz için dikkatli');
    const blocked = await exercisesRoute(consented(files).deps, 'dumbbell-press');
    assert.deepEqual([blocked.status, blocked.body.error], [409, 'Bu hareket şu an sana önerilmiyor; antrenörüne sor.']);
    const added = (await exercisesRoute(consented(files).deps, 'push-up')).body as unknown as AddedRowResponse;
    assert.deepEqual(added.extra.row.care, own);

    const alternatives = (await alternativesRoute(consented(files).deps, DAY_A, 'r_aaaaaa')).body as unknown as AlternativesResponse;
    const option = alternatives.groups.flatMap((group) => group.options).find((item) => item.exerciseId === 'push-up');
    assert.equal(option?.care, 'Sağ omuz için dikkatli');
    assert.deepEqual(option?.extra.row.care, own);

    // Yarım antrenmanın muadil ve eklenenleri yeniden açınca da notlu.
    const active = sessionDoc({
      id: 's_cccccccc',
      startedAt: '2026-09-26T15:00:00.000Z',
      entries: [
        sessionEntry('e_swapxx', { swappedFrom: 'r_aaaaaa', exerciseId: 'push-up', title: 'Şınav' }),
        sessionEntry('e_addedx', { added: true, plannedSets: 2, exerciseId: 'push-up', title: 'Şınav' }),
      ],
    });
    const data = body(await workoutRoute(consented({ ...files, 'sessions/s_cccccccc.json': active }).deps, null));
    assert.deepEqual(data.extras['r_aaaaaa:push-up']?.row.care, own);
    assert.deepEqual(data.extras['e_addedx:push-up']?.row.care, own);

    // Onay yoksa kısıt okunmaz: yasak da listede, not yok.
    const plain = setup(files);
    plain.deps.catalog = catalog;
    const open = (await exercisesRoute(plain.deps, null)).body as unknown as LibraryResponse;
    assert.ok(open.exercises.some((item) => item.id === 'dumbbell-press'));
    assert.ok(open.exercises.every((item) => item.care === undefined));
    assert.equal((await exercisesRoute(plain.deps, 'dumbbell-press')).status, 200);
    assert.ok(!plain.gh.calls.some((call) => call.includes('health.json')));
  });

  test('"Değiştir": istek geçersizse 400, satır programda yoksa 404, oturum yoksa 401', async () => {
    const { deps } = setup();
    assert.equal((await alternativesRoute(deps, DAY_A, null)).status, 400);
    assert.equal((await alternativesRoute(deps, '../x', 'r_aaaaaa')).status, 400);
    assert.equal((await alternativesRoute(deps, DAY_A, 'r_zzzzzz')).status, 404);
    assert.equal((await alternativesRoute(deps, DAY_B, 'r_aaaaaa')).status, 404);
    assert.equal((await alternativesRoute(setup(undefined, { session: null }).deps, DAY_A, 'r_aaaaaa')).status, 401);
    // Program adres parçası: `pt` PT'nin programıdır (telefon planın programını hep yollar), bozuk değer 400.
    assert.equal((await alternativesRoute(deps, DAY_A, 'r_aaaaaa', 'pt')).status, 200);
    assert.equal((await alternativesRoute(deps, DAY_A, 'r_aaaaaa', '../x')).status, 400);
    assert.equal((await exercisesRoute(deps, 'push-up', 'pt')).status, 200);
    assert.equal((await exercisesRoute(deps, 'push-up', 'op_../..')).status, 400);
  });

  test('"Hareket ekle": kütüphane ada göre; seçilenin varsayılan setleri ve dinlenmesiyle planı', async () => {
    const { deps } = setup();
    const library = (await exercisesRoute(deps, null)).body as unknown as LibraryResponse;
    assert.deepEqual(library.exercises.map((item) => item.title), ['Bench Press', 'Crunch', 'Dumbbell Press', 'Goblet Squat', 'Plank', 'Şınav']);
    const added = await exercisesRoute(deps, 'push-up');
    assert.equal(added.status, 200);
    const { extra } = added.body as unknown as AddedRowResponse;
    assert.deepEqual([extra.exerciseId, extra.row.rowId, extra.template.sets.length, extra.restSeconds, extra.row.plan.reason], ['push-up', 'push-up', 3, 120, 'first_time']);
    assert.equal((await exercisesRoute(deps, 'yok-boyle')).status, 404);
    assert.equal((await exercisesRoute(deps, '../x')).status, 400);
    assert.equal((await exercisesRoute(setup(undefined, { session: null }).deps, null)).status, 401);
  });
});

describe('POST /api/me/water', () => {
  const headers = (origin = ORIGIN, type = 'application/json') => new Headers({ origin, 'content-type': type });
  const tap = (id: string, at: string, d: 1 | -1 = 1) => ({ id, d, at });

  test('yalnız bu siteden ve JSON\'la; gövde şemadan geçer', async () => {
    const { deps, gh } = setup();
    assert.equal((await waterRoute(deps, headers('https://kotu.example'), ORIGIN, { taps: [] })).status, 403);
    assert.equal((await waterRoute(deps, headers(ORIGIN, 'text/plain'), ORIGIN, { taps: [] })).status, 415);
    assert.equal((await waterRoute(deps, headers(), ORIGIN, { taps: [] })).status, 400);
    assert.equal((await waterRoute(deps, headers(), ORIGIN, { taps: [{ id: 'x', d: 1, at: 'dün' }] })).status, 400);
    assert.equal(gh.commitCount(), 0);
  });

  test('dokunuşlar water.json\'a; aynısını yeniden göndermek yazmaz; yanıt bugünkü bardak', async () => {
    const { deps, gh } = setup();
    const taps = [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z'), tap('wt_bbbbbbbb', '2026-09-26T09:00:05.000Z')];
    const first = await waterRoute(deps, headers(), ORIGIN, { taps });
    assert.deepEqual([first.status, first.body.file], [200, 2]);
    assert.deepEqual(gh.messages(), ['Su · +2']);
    const again = await waterRoute(deps, headers(), ORIGIN, { taps });
    assert.deepEqual([again.status, again.body.file, again.body.unchanged], [200, 2, true]);
    assert.equal(gh.commitCount(), 1);
    const undo = await waterRoute(deps, headers(), ORIGIN, { taps: [tap('wt_cccccccc', '2026-09-26T09:01:00.000Z', -1)] });
    assert.equal(undo.body.file, 1);
    assert.deepEqual((gh.get('water.json') as { taps: unknown[] }).taps.length, 3);
  });

  test('çakışmada taze okuyup bir kez daha: başka sekmenin dokunuşu kaybolmaz', async () => {
    const { deps, gh } = setup();
    gh.onNext('write', () => gh.put('water.json', { version: 1, taps: [tap('wt_dddddddd', '2026-09-26T08:00:00.000Z')] }), 'water.json');
    const result = await waterRoute(deps, headers(), ORIGIN, { taps: [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z')] });
    assert.deepEqual([result.status, result.body.file], [200, 2]);
  });

  test('bozuk water.json ezilmez', async () => {
    const gh = fakeSessionRepo({});
    gh.putText('water.json', '{ bozuk');
    const { deps } = setup({}, { gh });
    const result = await waterRoute(deps, headers(), ORIGIN, { taps: [tap('wt_aaaaaaaa', '2026-09-26T09:00:00.000Z')] });
    assert.equal(result.status, 500);
    assert.equal(gh.commitCount(), 1);
  });
});

describe('POST /api/me/schedule', () => {
  const headers = (origin = ORIGIN, type = 'application/json') => new Headers({ origin, 'content-type': type });
  type RawProgram = ReturnType<typeof programFile> & { clientSchedule?: unknown; schedule?: unknown; log: { kind: string; revision: number; changes: { text: string }[] }[] };

  test('yalnız bu siteden ve JSON\'la; en az bir gün; oturum yoksa 401', async () => {
    const { deps, gh } = setup();
    assert.equal((await scheduleRoute(deps, headers('https://kotu.example'), ORIGIN, { weekdays: [1] })).status, 403);
    assert.equal((await scheduleRoute(deps, headers(ORIGIN, 'text/plain'), ORIGIN, { weekdays: [1] })).status, 415);
    assert.equal((await scheduleRoute(deps, headers(), ORIGIN, { weekdays: [] })).status, 400);
    assert.equal((await scheduleRoute(deps, headers(), ORIGIN, { weekdays: [0, 8] })).status, 400);
    assert.equal((await scheduleRoute(deps, headers(), ORIGIN, { weekdays: [1, 1] })).status, 400);
    assert.equal((await scheduleRoute(setup(undefined, { session: null }).deps, headers(), ORIGIN, { weekdays: [1] })).status, 401);
    assert.equal(gh.commitCount(), 0);
  });

  test('danışanın günleri katmana; geçmişe "client"; revision artmaz; bilinmeyen alanlar düşmez; PT\'nin bildirimi düşer', async () => {
    const { deps, gh } = setup({ 'program.json': programFile({}, { schedule: { weekdays: [1, 3, 5] }, clientTargets: { r_aaaaaa: { at: 'x' } } }) });
    const result = await scheduleRoute(deps, headers(), ORIGIN, { weekdays: [6, 2, 4] });
    assert.equal(result.status, 200);
    assert.deepEqual((result.body as { schedule: { weekdays: number[]; source: string } }).schedule.weekdays, [2, 4, 6]);
    const stored = gh.get('program.json') as RawProgram & { clientTargets?: unknown };
    assert.deepEqual(stored.clientSchedule, { weekdays: [2, 4, 6], at: NOW.toISOString() });
    assert.deepEqual(stored.schedule, { weekdays: [1, 3, 5] });
    assert.equal(stored.revision, 7);
    assert.deepEqual(stored.clientTargets, { r_aaaaaa: { at: 'x' } }, 'bilinmeyen alan korunur');
    assert.deepEqual(stored.log[0], { at: NOW.toISOString(), revision: 7, kind: 'client', changes: [{ text: 'Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt' }] });
    assert.deepEqual(gh.messages(), ['Program (danışan): Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt']);
    assert.equal(gh.noticeDrops(), 1);

    // Aynı günler: yazılmaz.
    const again = await scheduleRoute(deps, headers(), ORIGIN, { weekdays: [2, 4, 6] });
    assert.deepEqual([again.status, again.body.unchanged], [200, true]);
    assert.equal(gh.commitCount(), 1);

    // PT'nin günlerine dönen seçim katmanı kaldırır; `schedule.at` şimdi olur (kaçan gün penceresi eski ana geri açılmaz).
    const back = await scheduleRoute(deps, headers(), ORIGIN, { weekdays: [1, 3, 5] });
    const reset = gh.get('program.json') as RawProgram;
    assert.equal('clientSchedule' in reset, false);
    assert.deepEqual(reset.schedule, { weekdays: [1, 3, 5], at: NOW.toISOString() });
    assert.equal((back.body as unknown as ScheduleResponse).schedule.since, '2026-09-26');
  });

  test('çakışmada taze okuyup bir kez daha: arada yazılan rotasyon kaybolmaz', async () => {
    const { deps, gh } = setup();
    gh.onNext('write', () => gh.put('program.json', programFile({ lastDayId: DAY_A, lastCompletedAt: '2026-09-26T10:00:00.000Z' })), 'program.json');
    const result = await scheduleRoute(deps, headers(), ORIGIN, { weekdays: [2] });
    assert.equal(result.status, 200);
    const stored = gh.get('program.json') as RawProgram;
    assert.equal(stored.rotation.lastDayId, DAY_A);
    assert.deepEqual(stored.clientSchedule, { weekdays: [2], at: NOW.toISOString() });
  });

  test('program yoksa 404; okunamıyorsa yazılmaz', async () => {
    assert.equal((await scheduleRoute(setup({}).deps, headers(), ORIGIN, { weekdays: [1] })).status, 404);
    const gh = fakeSessionRepo({ 'program.json': { version: 2, bozuk: true } });
    const invalid = await scheduleRoute(setup({}, { gh }).deps, headers(), ORIGIN, { weekdays: [1] });
    assert.equal(invalid.status, 409);
    gh.putText('program.json', '{ bozuk');
    assert.equal((await scheduleRoute(setup({}, { gh }).deps, headers(), ORIGIN, { weekdays: [1] })).status, 500);
    assert.equal(gh.commitCount(), 1);
  });
});

describe('kendi programlar (kendi-program.md §3.2, §5.4)', () => {
  const OWN_PATH = `own-programs/${OWN_ID}.json`;
  const evde = ownProgram();
  const indexWith = (active?: { programId: string | null; at: string }) => ({
    ...upsertOwnItem(emptyOwnIndex(), ownIndexItemOf(evde, gitBlobSha(jsonText(evde)))),
    ...(active ? { active } : {}),
  });
  const files = (active?: { programId: string | null; at: string }) => ({ 'program.json': programFile(), [OWN_PATH]: evde, [OWN_INDEX_PATH]: indexWith(active) });
  const body = (result: Awaited<ReturnType<typeof workoutRoute>>) => result.body as unknown as WorkoutResponse;

  test('kalıcı seçim kendi programsa plan ondan; kaynak, kimlik, ad ve seçim listesi', async () => {
    const data = body(await workoutRoute(setup(files({ programId: OWN_ID, at: '2026-09-20T10:00:00.000Z' })).deps, null));
    assert.deepEqual([data.program?.source, data.program?.id, data.program?.name], ['own', OWN_ID, 'Evde']);
    assert.deepEqual([data.day?.source, data.day?.programId, data.day?.dayId], ['own', OWN_ID, OWN_DAY_A]);
    assert.deepEqual(data.selection?.choices.map((choice) => [choice.id, choice.name]), [[null, 'Antrenörünün programı'], [OWN_ID, 'Evde']]);
    assert.deepEqual([data.selection?.active, data.selection?.shown, data.selection?.oneOff], [OWN_ID, OWN_ID, false]);
    assert.match(data.program?.stamp ?? '', new RegExp(`^${OWN_ID}\\|`));
  });

  test('"Yalnız bugün": adresteki program; hiçbir şey yazılmaz', async () => {
    const { deps, gh } = setup(files());
    const data = body(await workoutRoute(deps, null, OWN_ID));
    assert.deepEqual([data.program?.source, data.selection?.oneOff, data.selection?.active], ['own', true, null]);
    const pt = body(await workoutRoute(setup(files({ programId: OWN_ID, at: '2026-09-20T10:00:00.000Z' })).deps, null, 'pt'));
    assert.deepEqual([pt.program?.source, pt.selection?.oneOff], ['pt', true]);
    assert.equal(gh.commitCount(), 0);
    // Bilinmeyen program kalıcı seçime döner.
    assert.equal(body(await workoutRoute(deps, null, 'op_yokyok01')).program?.source, 'pt');
  });

  test('yarım antrenman seçimden bağımsız kendi programıyla sürer', async () => {
    const half = sessionDoc({ program: { revision: 1, dayId: OWN_DAY_B, dayName: 'Gün B', programId: OWN_ID, programName: 'Evde' }, entries: [] });
    const { deps } = setup({ ...files({ programId: null, at: '2026-09-25T10:00:00.000Z' }), [`sessions/${half.id}.json`]: half });
    const data = body(await workoutRoute(deps, null, 'pt'));
    assert.deepEqual([data.day?.dayId, data.day?.programId, data.active?.id], [OWN_DAY_B, OWN_ID, half.id]);
  });

  test('program değiştirme önizlemesi yarım seansı değiştirmeden seçilen programı açar', async () => {
    const half = sessionDoc({ program: { revision: 1, dayId: OWN_DAY_B, dayName: 'Gün B', programId: OWN_ID, programName: 'Evde' }, entries: [] });
    const { deps, gh } = setup({ ...files(), [`sessions/${half.id}.json`]: half });
    const data = body(await workoutRoute(deps, DAY_A, 'pt', true));
    assert.equal(data.active, null);
    assert.equal(data.day?.source, 'pt');
    assert.equal(data.day?.dayId, DAY_A);
    assert.equal((await gh.repo.read(`sessions/${half.id}.json`))?.content && body(await workoutRoute(deps, null)).active?.id, half.id);
  });

  test('seçili program okunamıyorsa PT\'nin programı ve sorun', async () => {
    const gh = fakeSessionRepo(files({ programId: OWN_ID, at: '2026-09-20T10:00:00.000Z' }));
    gh.putText(OWN_PATH, '{ bozuk');
    const data = body(await workoutRoute(setup({}, { gh }).deps, null));
    assert.equal(data.program?.source, 'pt');
    assert.equal(data.selection?.problem, 'Evde şu an açılamıyor.');
  });

  test('Günlerini değiştir kendi programa (program + index tek commit); gösterilmezse kalıcı seçim', async () => {
    const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
    const { deps, gh } = setup(files({ programId: OWN_ID, at: '2026-09-20T10:00:00.000Z' }));
    const result = await scheduleRoute(deps, headers, ORIGIN, { weekdays: [2, 4] });
    assert.equal(result.status, 200);
    assert.deepEqual((gh.get(OWN_PATH) as OwnProgram).schedule?.weekdays, [2, 4]);
    assert.equal((gh.get('program.json') as { clientSchedule?: unknown }).clientSchedule, undefined, 'PT programına dokunulmaz');
    assert.deepEqual(gh.lastChanged(), [OWN_INDEX_PATH, OWN_PATH].sort());
    const pt = await scheduleRoute(deps, headers, ORIGIN, { weekdays: [1], programId: null });
    assert.equal(pt.status, 200);
    assert.deepEqual((gh.get('program.json') as { clientSchedule?: { weekdays: number[] } }).clientSchedule?.weekdays, [1]);
  });

  test('muadiller kendi programın gününden; kalıba uymayan program 400', async () => {
    const { deps } = setup(files());
    const result = await alternativesRoute(deps, OWN_DAY_A, OWN_ROW_GOBLET, OWN_ID);
    assert.equal(result.status, 200);
    assert.equal((result.body as unknown as AlternativesResponse).exerciseId, 'goblet-squat');
    assert.equal((await alternativesRoute(deps, OWN_DAY_A, OWN_ROW_GOBLET)).status, 404, 'PT programında bu gün yok');
    assert.equal((await alternativesRoute(deps, OWN_DAY_A, OWN_ROW_GOBLET, '../x')).status, 400);
  });
});
