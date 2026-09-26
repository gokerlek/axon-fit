import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { sessionDocSchema, type SessionDoc, type SessionEntry, type StoredSession } from './schemas/session.ts';
import { canonicalJson, mergeAll, mergeSessions, normalizeSession, sameSessionData, tombstoneOf, withDeletions } from './session-merge.ts';
import { at, sessionDoc, sessionEntry, W1, W2, workingSet } from './testing/session-fixtures.ts';

const docOf = (session: StoredSession) => session as SessionDoc;
const setsOf = (session: StoredSession) => docOf(session).entries.flatMap((entry) => entry.sets);

describe('birleştirme: kurallar', () => {
  test('aynı setin iki hâli: düzeltmesi yeni olan kazanır, sıra önemsiz', () => {
    const base = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3)] })] });
    const edited = sessionDoc({
      entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3, { reps: 9, editedAt: at(5), by: W2 })] })],
    });
    assert.equal(setsOf(mergeSessions(base, edited))[0]?.reps, 9);
    assert.equal(setsOf(mergeSessions(edited, base))[0]?.reps, 9);
    // `at` düzeltmede değişmez: setin yapıldığı an.
    assert.equal(setsOf(mergeSessions(base, edited))[0]?.at, at(3));
  });

  test('düzeltme anı eşitse yazan cihaz belirler (deterministik)', () => {
    const a = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3, { reps: 8, editedAt: at(5), by: W1 })] })] });
    const b = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3, { reps: 7, editedAt: at(5), by: W2 })] })] });
    assert.equal(setsOf(mergeSessions(a, b))[0]?.reps, 7);
    assert.equal(setsOf(mergeSessions(b, a))[0]?.reps, 7);
  });

  test('silinen set geri gelmez: geç gelen eski anlık görüntü onu taşısa da', () => {
    const old = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3), workingSet('st_bbbbbbbb', 5)] })] });
    const deleted = withDeletions(old, { setIds: ['st_aaaaaaaa'] });
    for (const merged of [mergeSessions(deleted, old), mergeSessions(old, deleted)]) {
      assert.deepEqual(setsOf(merged).map((set) => set.id), ['st_bbbbbbbb']);
      assert.deepEqual(docOf(merged).deletedSetIds, ['st_aaaaaaaa']);
    }
  });

  test('silinen hareket setleriyle birlikte kalkar ve geri gelmez', () => {
    const old = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3)] }), sessionEntry('e_bbbbbb')] });
    const deleted = withDeletions(old, { entryIds: ['e_aaaaaa'] });
    const later = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_cccccccc', 9)] })] });
    const merged = mergeAll([later, deleted, old]);
    assert.deepEqual(docOf(merged).entries.map((entry) => entry.id), ['e_bbbbbb']);
  });

  test('hareketin alanları setlerden ayrı: biri durumu, öteki seti yazsa ikisi de kalır', () => {
    const skipped = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { status: 'skipped', skip: { moved: true }, updatedAt: at(8), by: W2 })] });
    const withSet = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3)] })] });
    const merged = docOf(mergeSessions(withSet, skipped)).entries[0] as SessionEntry;
    assert.equal(merged.status, 'skipped');
    assert.equal(merged.sets.length, 1);
  });

  test('su: dokunuşlar kimlikle birleşir; "Geri al" (−1) kalıcıdır', () => {
    const phone = sessionDoc({ waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(2) }, { id: 'wt_bbbbbbbb', d: -1, at: at(3) }] });
    const stale = sessionDoc({ waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(2) }, { id: 'wt_cccccccc', d: 1, at: at(4) }] });
    const merged = docOf(mergeSessions(stale, phone));
    assert.equal(merged.waterTaps.reduce((sum, tap) => sum + tap.d, 0), 1);
    assert.equal(merged.waterTaps.length, 3);
  });

  test('durum yalnız ileri: bitmiş etkinle birleşince bitmiş kalır; iz dosyası her şeyi yener', () => {
    const active = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3)] })] });
    const finished = sessionDoc({ status: 'finished', finishedAt: at(50) });
    const merged = docOf(mergeSessions(active, finished));
    assert.equal(merged.status, 'finished');
    assert.equal(merged.finishedAt, at(50));
    assert.equal(setsOf(merged).length, 1);

    const stone = tombstoneOf('s_k2m9x4qa', new Date(at(60)));
    const earlier = tombstoneOf('s_k2m9x4qa', new Date(at(55)));
    assert.deepEqual(mergeAll([active, stone, finished, earlier]), earlier);
  });

  test('oturum düzeyindeki kayıtlar son yazanla; hareketler sıra kaydına göre dizilir', () => {
    const a = sessionDoc({
      entries: [sessionEntry('e_aaaaaa'), sessionEntry('e_bbbbbb')],
      order: { value: ['e_aaaaaa', 'e_bbbbbb'], updatedAt: at(1), by: W1 },
      rotation: { value: 'keep', updatedAt: at(9), by: W1 },
    });
    const b = sessionDoc({
      entries: [sessionEntry('e_aaaaaa'), sessionEntry('e_bbbbbb')],
      order: { value: ['e_bbbbbb', 'e_aaaaaa'], updatedAt: at(4), by: W2 },
      rotation: { value: 'advance', updatedAt: at(2), by: W2 },
    });
    const merged = docOf(mergeSessions(a, b));
    assert.deepEqual(merged.entries.map((entry) => entry.id), ['e_bbbbbb', 'e_aaaaaa']);
    assert.equal(merged.rotation?.value, 'keep');
  });

  test('başlangıç ve tarih en erkeni; hafifletme işareti kalır; bildirimler tekilleşir', () => {
    const a = sessionDoc({ startedAt: at(2), notices: [{ kind: 'overload', at: at(5) }] });
    const b = sessionDoc({ startedAt: at(0), adjust: 'lighter', notices: [{ kind: 'overload', at: at(5) }, { kind: 'other_day', at: at(0) }] });
    const merged = docOf(mergeSessions(a, b));
    assert.equal(merged.startedAt, at(0));
    assert.equal(merged.adjust, 'lighter');
    assert.deepEqual(merged.notices.map((notice) => notice.kind), ['other_day', 'overload']);
  });

  test('bildirimin ayrıntısı (yarım: yapılan/planlanan set) birleşimde kalır; iki hâli varsa sonuç sıradan bağımsız', () => {
    const a = sessionDoc({ notices: [{ kind: 'unfinished', at: at(50), done: 12, planned: 17 }] });
    const b = sessionDoc({ notices: [{ kind: 'unfinished', at: at(50) }] });
    const c = sessionDoc({ notices: [{ kind: 'unfinished', at: at(50), done: 13, planned: 17 }] });
    assert.deepEqual(docOf(mergeSessions(a, b)).notices, [{ kind: 'unfinished', at: at(50), done: 12, planned: 17 }]);
    assert.deepEqual(docOf(mergeSessions(b, a)).notices, docOf(mergeSessions(a, b)).notices);
    assert.deepEqual(docOf(mergeAll([a, b, c])).notices, docOf(mergeAll([c, b, a])).notices);
  });

  test('yazan cihaz değişiklik sayılmaz; farklı antrenmanlar birleşmez', () => {
    assert.equal(sameSessionData(sessionDoc({ writer: W1 }), sessionDoc({ writer: W2 })), true);
    assert.equal(sameSessionData(sessionDoc(), sessionDoc({ waterTaps: [{ id: 'wt_aaaaaaaa', d: 1, at: at(1) }] })), false);
    assert.throws(() => mergeSessions(sessionDoc(), sessionDoc({ id: 's_bbbbbbbb' })));
  });

  test('kanonik: alan sırası ve boş alanlar sonucu değiştirmez', () => {
    const doc = sessionDoc({ entries: [sessionEntry('e_aaaaaa', { sets: [workingSet('st_aaaaaaaa', 3)] })] });
    const shuffled = JSON.parse(JSON.stringify(doc, Object.keys(doc).reverse())) as SessionDoc;
    assert.equal(canonicalJson(normalizeSession(doc)), canonicalJson(normalizeSession({ ...shuffled, ...doc })));
    assert.equal(JSON.stringify(normalizeSession(doc)), JSON.stringify(normalizeSession(normalizeSession(doc))));
  });
});

/* --- özellik testleri --- */

/** Tohumlu rastgele (mulberry32): hata çıkarsa aynı tohumla yeniden üretilir. */
function rng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
  };
}

const pad = (n: number, width: number) => n.toString(36).padStart(width, '0');

/**
 * Birkaç cihaz aynı antrenmanı yerelde değiştirir (set ekle, düzelt, sil; hareketin durumu; su; sıra;
 * rotasyon; zorluk; bitir) ve arada birbirine eşitlenir. Her değişiklikten sonra sunucuya gidebilecek
 * bir anlık görüntü alınır. Saat bazen aynı kalır (eşitlik bozma denensin).
 */
function simulate(seed: number, options: { devices?: number; steps?: number; tombstone?: boolean } = {}) {
  const random = rng(seed);
  const writers = ['w_aaaaaa', 'w_bbbbbb', 'w_cccccc'].slice(0, options.devices ?? 3);
  let clock = 0;
  let ids = 0;
  const tick = () => {
    if (random.next() < 0.8) clock += 1;
    return at(clock);
  };
  const entries = ['e_000001', 'e_000002', 'e_000003'];
  const start = sessionDoc({ entries: entries.map((id) => sessionEntry(id)) });
  const devices = writers.map((writer) => ({ writer, doc: { ...start, writer } as SessionDoc }));
  const snapshots: StoredSession[] = [start];

  for (let step = 0; step < (options.steps ?? 40); step++) {
    const device = random.pick(devices);
    const doc = device.doc;
    const by = device.writer;
    const live = doc.entries;
    const entry = live.length > 0 ? random.pick(live) : undefined;
    const sets = live.flatMap((item) => item.sets);
    const op = random.int(10);
    let next: SessionDoc = doc;
    if (op <= 2 && entry) {
      const set = workingSet(`st_${pad(++ids, 8)}`, 0, { at: tick(), by, kg: 40 + random.int(5) * 2.5, reps: 5 + random.int(6) });
      next = { ...doc, entries: live.map((item) => (item === entry ? { ...item, sets: [...item.sets, set] } : item)) };
    } else if (op === 3 && sets.length > 0) {
      const target = random.pick(sets);
      next = {
        ...doc,
        entries: live.map((item) => ({
          ...item,
          sets: item.sets.map((set) => (set === target ? { ...set, reps: random.int(12), editedAt: tick(), by } : set)),
        })),
      };
    } else if (op === 4 && sets.length > 0) {
      next = withDeletions(doc, { setIds: [random.pick(sets).id] });
    } else if (op === 5 && entry && random.next() < 0.3) {
      next = withDeletions(doc, { entryIds: [entry.id] });
    } else if (op === 5 && entry) {
      const status = random.pick(['pending', 'done', 'partial', 'skipped'] as const);
      next = { ...doc, entries: live.map((item) => (item === entry ? { ...item, status, skip: { moved: random.next() < 0.5 }, updatedAt: tick(), by } : item)) };
    } else if (op === 6) {
      next = { ...doc, waterTaps: [...doc.waterTaps, { id: `wt_${pad(++ids, 8)}`, d: random.next() < 0.7 ? 1 : -1, at: tick() }] };
    } else if (op === 7) {
      next = { ...doc, order: { value: random.shuffle(entries), updatedAt: tick(), by } };
    } else if (op === 8) {
      next = random.next() < 0.5
        ? { ...doc, rotation: { value: random.pick(['advance', 'keep'] as const), updatedAt: tick(), by } }
        : { ...doc, effort: { sessionRpe: random.int(11), updatedAt: tick(), by } };
    } else if (op === 9 && random.next() < 0.2) {
      next = { ...doc, status: 'finished', finishedAt: tick() };
    } else {
      // Eşitleme: başka bir cihazın belgesini birleştir (dedikodu).
      const other = random.pick(devices);
      next = docOf(mergeSessions(doc, other.doc));
    }
    device.doc = { ...next, writer: by };
    snapshots.push(device.doc);
  }
  if (options.tombstone) snapshots.splice(random.int(snapshots.length), 0, tombstoneOf(start.id, new Date(at(clock + 1))));
  return { random, snapshots, devices };
}

describe('birleştirme: özellikler (rastgele sıralar, tekrarlar, silmeler)', () => {
  const seeds = Array.from({ length: 60 }, (_, index) => 1000 + index * 7919);

  test('değişmeli, birleşmeli, idempotent', () => {
    for (const seed of seeds) {
      const { random, snapshots } = simulate(seed);
      for (let round = 0; round < 20; round++) {
        const a = random.pick(snapshots);
        const b = random.pick(snapshots);
        const c = random.pick(snapshots);
        assert.deepEqual(mergeSessions(a, b), mergeSessions(b, a), `tohum ${seed}: değişme`);
        assert.deepEqual(mergeSessions(mergeSessions(a, b), c), mergeSessions(a, mergeSessions(b, c)), `tohum ${seed}: birleşme`);
        assert.deepEqual(mergeSessions(a, a), normalizeSession(a), `tohum ${seed}: idempotent`);
        assert.deepEqual(mergeSessions(mergeSessions(a, b), b), mergeSessions(a, b), `tohum ${seed}: aynı belge iki kez`);
      }
    }
  });

  test('sunucu hangi sırayla ve kaç kez alırsa alsın aynı belgeye varır', () => {
    for (const seed of seeds) {
      const { random, snapshots } = simulate(seed, { tombstone: seed % 5 === 0 });
      const expected = mergeAll(snapshots);
      for (let round = 0; round < 8; round++) {
        // Rastgele sıra + rastgele tekrarlar (keepalive'ın eski anlık görüntüsü, yeniden gönderim).
        const arrivals = random.shuffle([...snapshots, ...snapshots.filter(() => random.next() < 0.3)]);
        const server = arrivals.slice(1).reduce((acc, snapshot) => mergeSessions(acc, snapshot), arrivals[0] as StoredSession);
        assert.deepEqual(server, expected, `tohum ${seed}, tur ${round}`);
      }
      if (seed % 5 === 0) assert.equal(expected.status, 'deleted');
    }
  });

  test('cihazlar birbirine eşitlenince aynı belgeye yakınsar', () => {
    for (const seed of seeds) {
      const { devices } = simulate(seed);
      // Herkes herkesin son hâlini alır.
      const all = mergeAll(devices.map((device) => device.doc));
      for (const device of devices) {
        const synced = devices.reduce<StoredSession>((acc, other) => mergeSessions(acc, other.doc), device.doc);
        assert.equal(sameSessionData(synced, all), true, `tohum ${seed}`);
      }
    }
  });

  test('silinen kimlik hiçbir birleşimde görünmez; sonuç şemaya uyar', () => {
    let rich = 0;
    for (const seed of seeds) {
      const { snapshots } = simulate(seed, { steps: 60 });
      const merged = docOf(mergeAll(snapshots));
      if (merged.deletedSetIds.length > 0 && setsOf(merged).length > 0 && merged.waterTaps.length > 0) rich += 1;
      const deletedSets = new Set(merged.deletedSetIds);
      const deletedEntries = new Set(merged.deletedEntryIds);
      for (const entry of merged.entries) {
        assert.equal(deletedEntries.has(entry.id), false, `tohum ${seed}: silinen hareket döndü`);
        for (const set of entry.sets) assert.equal(deletedSets.has(set.id), false, `tohum ${seed}: silinen set döndü`);
      }
      const parsed = v.safeParse(sessionDocSchema, merged);
      assert.equal(parsed.success, true, `tohum ${seed}: ${parsed.issues?.[0]?.message}`);
      // Bitmiş bir anlık görüntü varsa sonuç da bitmiştir.
      if (snapshots.some((snapshot) => snapshot.status === 'finished')) assert.equal(merged.status, 'finished');
    }
    // Benzetim boş belgelerle geçmesin: tohumların çoğunda set, silme ve su birlikte var.
    assert.ok(rich >= seeds.length / 2, `yalnız ${rich} tohumda zengin belge`);
  });
});
