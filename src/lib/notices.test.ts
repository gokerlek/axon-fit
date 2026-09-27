import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientNotices,
  isUnread,
  noticeFeed,
  ownProgramNotices,
  programNotices,
  proposalNotices,
  sessionHealthOf,
  sessionNotices,
  type ClientDigest,
  type PtNotice,
} from './notices.ts';
import { ownIndexItemOf, type OwnIndex } from './own-program-index.ts';
import type { SessionIndex, SessionIndexRow } from './schemas/session.ts';
import { OWN_ID, ownProgram } from './testing/own-fixtures.ts';

const NOW = new Date('2026-09-26T16:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function row(id: string, finishedDaysAgo: number | null, overrides: Partial<SessionIndexRow> = {}): SessionIndexRow {
  return {
    id,
    sha: 'a'.repeat(40),
    path: `sessions/${id}.json`,
    date: '2026-09-20',
    startedAt: ago((finishedDaysAgo ?? 0) + 0.05),
    ...(finishedDaysAgo !== null ? { finishedAt: ago(finishedDaysAgo) } : {}),
    dayId: 'd_cccccc',
    dayName: 'Gün C',
    otherDay: false,
    unfinished: false,
    volumeKg: 0,
    sets: 0,
    water: 0,
    exercises: [],
    notices: [],
    ...overrides,
  };
}

const index = (...items: SessionIndexRow[]): SessionIndex => ({ version: 1, items, deleted: [] });
const texts = (notices: readonly PtNotice[]) => notices.map((notice) => `${notice.kind}: ${notice.text}`);

describe('PT bildirimleri: antrenmanlardan', () => {
  test('başka gün, yarım (12/17 set), aşırı yük (hareket başına), hafifletildi', () => {
    const notices = sessionNotices(
      index(
        row('s_aaaaaaaa', 1, { otherDay: true, plannedDayName: 'Gün B', notices: ['other_day'] }),
        row('s_bbbbbbbb', 2, { dayName: 'Gün A', unfinished: true, notices: ['unfinished'], progress: { done: 12, planned: 17 } }),
        row('s_cccccccc', 3, {
          notices: ['overload'],
          overloads: [
            { title: 'Bench Press', kg: 85, plannedKg: 62.5 },
            { title: 'Squat', kg: 120 },
          ],
        }),
        row('s_dddddddd', 4, { dayName: 'Gün A', notices: ['lighter'] }),
      ),
      0,
    );
    assert.deepEqual(texts(notices), [
      'other_day: Gün B yerine Gün C yapıldı',
      'unfinished: Gün A yarım bırakıldı (12/17 set)',
      'overload: Bench Press 85 kg (hedef 62,5)',
      'overload: Squat 120 kg',
      'lighter: Gün A hafifletildi',
    ]);
    assert.equal(new Set(notices.map((notice) => notice.key)).size, notices.length, 'anahtarlar benzersiz');
  });

  test('ayrıntısı olmayan eski satır: genel metin; bitmemiş ve pencere dışı antrenman bildirim üretmez', () => {
    const notices = sessionNotices(
      index(
        row('s_aaaaaaaa', 1, { otherDay: true, notices: ['other_day', 'unfinished', 'overload'] }),
        row('s_bbbbbbbb', null, { unfinished: true, notices: ['unfinished'] }),
        row('s_cccccccc', 30, { unfinished: true, notices: ['unfinished'] }),
      ),
      NOW.getTime() - 14 * DAY,
    );
    assert.deepEqual(texts(notices), [
      'other_day: Başka gün seçildi: Gün C',
      'unfinished: Gün C yarım bırakıldı',
      'overload: Gün C: hedefin çok üzerinde set onaylandı',
    ]);
  });

  test('sağlık ayrıntısı yalnız verildiyse: ağrıyla geçilen hareketler, hafifletmenin nedeni', () => {
    const notices = sessionNotices(index(row('s_aaaaaaaa', 1, { dayName: 'Gün A', notices: ['lighter'] })), 0, [
      { sessionId: 's_aaaaaaaa', painSkips: 2, adjustReason: 'readiness' },
    ]);
    assert.deepEqual(texts(notices), ['lighter: Gün A hafifletildi (hazır oluşluk)', 'pain: Gün A: ağrı nedeniyle 2 hareket geçildi']);
  });

  test('health.json süzülür: ağrı yalnız ağrı takibi onayıyla, hazır oluşluk nedeni yalnız onun onayıyla', () => {
    const raw = {
      checkIns: [
        { date: '2026-09-25', sessionId: 's_aaaaaaaa', skippedRows: [{ rowId: 'r_aaaaaa', reason: 'pain' }], adjustReason: 'readiness' },
        { date: '2026-09-24', readiness: { sleep: 3 } },
        { date: '2026-09-23', sessionId: 's_bbbbbbbb', adjustReason: 'pain' },
      ],
    };
    assert.deepEqual(sessionHealthOf(raw, { pain: true, readiness: true }), [
      { sessionId: 's_aaaaaaaa', painSkips: 1, adjustReason: 'readiness' },
      { sessionId: 's_bbbbbbbb', painSkips: 0, adjustReason: 'pain' },
    ]);
    assert.deepEqual(sessionHealthOf(raw, { pain: false, readiness: true }), [{ sessionId: 's_aaaaaaaa', painSkips: 0, adjustReason: 'readiness' }]);
    assert.deepEqual(sessionHealthOf(raw, { pain: false, readiness: false }), []);
    assert.deepEqual(sessionHealthOf('bozuk', { pain: true, readiness: true }), []);
  });
});

describe('PT bildirimleri: program ve öneriler', () => {
  test('program geçmişinin yalnız danışan kayıtları, pencere içinde', () => {
    const log = [
      { at: ago(1), revision: 7, kind: 'client' as const, changes: [{ text: 'Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt' }] },
      { at: ago(2), revision: 7, kind: 'edit' as const, changes: [{ text: 'Haftada 2 → 3 gün' }] },
      { at: ago(3), revision: 6, kind: 'client' as const, changes: [{ scope: 'Gün A', text: 'Şınav 3×8–12 → 3×10–14' }, { text: 'Ek' }] },
      { at: ago(40), revision: 5, kind: 'client' as const, changes: [{ text: 'Eski' }] },
    ];
    const notices = programNotices(log, NOW.getTime() - 14 * DAY);
    assert.deepEqual(texts(notices), ['program: Antrenman günleri: Pzt, Çar, Cum → Sal, Per, Cmt', 'program: Gün A: Şınav 3×8–12 → 3×10–14 · Ek']);
    assert.ok(notices.every((notice) => notice.target === 'program'));
  });

  test('bekleyen öneriler tek bildirim, en yeni önerinin anında; bilinmeyen tür de sayılır; bozuk dosya boş', () => {
    const raw = {
      version: 1,
      items: [
        { id: 'pr_aaaaaa', at: ago(2), kind: 'sets', status: 'pending' },
        { id: 'pr_bbbbbb', at: ago(1), kind: 'algo_sets', status: 'pending' },
        { id: 'pr_cccccc', at: ago(0.5), kind: 'target', status: 'approved' },
      ],
    };
    assert.deepEqual(proposalNotices(raw), [{ key: `proposal:${ago(1)}`, kind: 'proposal', at: ago(1), text: '2 değişiklik önerisi bekliyor', target: 'program' }]);
    assert.deepEqual(proposalNotices(null), []);
    assert.deepEqual(proposalNotices({ items: 'x' }), []);
    const one = { items: [{ id: 'pr_aaaaaa', at: ago(2), kind: 'sets', status: 'pending', text: 'Leg Press 3 → 4 set' }] };
    assert.equal(proposalNotices(one)[0]?.text, 'Öneri: Leg Press 3 → 4 set');
  });

  test('danışanın bildirimleri en yeniden eskiye, sınırlı', () => {
    const notices = clientNotices({
      index: index(row('s_aaaaaaaa', 3, { unfinished: true, notices: ['unfinished'] }), row('s_bbbbbbbb', 1, { otherDay: true, notices: ['other_day'] })),
      log: [{ at: ago(2), kind: 'client', changes: [{ text: 'Antrenman günleri: Sal' }] }],
      proposals: null,
      now: NOW,
    });
    assert.deepEqual(
      notices.map((notice) => notice.kind),
      ['other_day', 'program', 'unfinished'],
    );
    assert.equal(clientNotices({ index: index(row('s_aaaaaaaa', 1, { otherDay: true, unfinished: true, notices: ['other_day', 'unfinished'] })), log: [], proposals: null, now: NOW, limit: 1 }).length, 1);
    assert.deepEqual(clientNotices({ index: null, log: [], proposals: null, now: NOW }), []);
  });
});

describe('PT bildirimleri: okundu ve Genel bakış listesi', () => {
  test('inbox.seenAt\'ten yeni olan okunmamış; hiç okunmadıysa hepsi', () => {
    assert.equal(isUnread({ at: ago(1) }, undefined), true);
    assert.equal(isUnread({ at: ago(1) }, ago(2)), true);
    assert.equal(isUnread({ at: ago(2) }, ago(1)), false);
    assert.equal(isUnread({ at: ago(1) }, ago(1)), false);
  });

  test('bütün danışanlar tek listede, en yeniden eskiye; okunmamış sayısı listeden taşanları da sayar', () => {
    const notice = (key: string, days: number): PtNotice => ({ key, kind: 'unfinished', at: ago(days), text: key, target: 'client' });
    const digests: ClientDigest[] = [
      { id: 'c_aaaaaaaa', name: 'Ayşe', seenAt: ago(2.5), notices: [notice('a1', 1), notice('a2', 3)] },
      { id: 'c_bbbbbbbb', name: 'Mehmet', notices: [notice('b1', 2), notice('b2', 4)] },
      { id: 'c_cccccccc', name: 'Zeynep', seenAt: ago(0), notices: [notice('c1', 0.5)] },
    ];
    const feed = noticeFeed(digests, 3);
    assert.deepEqual(
      feed.items.map((item) => [item.key, item.clientName, item.unread]),
      [
        ['c1', 'Zeynep', false],
        ['a1', 'Ayşe', true],
        ['b1', 'Mehmet', true],
      ],
    );
    assert.equal(feed.unread, 3, 'a1, b1 ve listeye girmeyen b2');
    assert.deepEqual(feed.unreadClients, ['c_aaaaaaaa', 'c_bbbbbbbb']);
  });
});

describe('PT bildirimleri: kendi programlar (kendi-program.md §7.1)', () => {
  const since = NOW.getTime() - 14 * DAY;
  const evde = ownIndexItemOf(ownProgram({ shared: { at: ago(3) } }), 'a'.repeat(40));
  const tatil = ownIndexItemOf(ownProgram({ id: 'op_tatil001', name: 'Tatil' }), 'b'.repeat(40));
  const index = (overrides: Partial<OwnIndex> = {}): OwnIndex => ({ version: 1, items: [evde, tatil], events: [], ...overrides });

  test('seçim, paylaşım, kapatma ve silme olayları', () => {
    const texts = (own: OwnIndex) => ownProgramNotices(own, since).map((notice) => notice.text).sort();
    assert.deepEqual(texts(index({ active: { programId: 'op_tatil001', at: ago(1) } })), ["Bugün'ün programı: Tatil", 'Paylaştı: Evde']);
    assert.deepEqual(texts(index({ active: { programId: null, at: ago(1) } })), ['Antrenörün programına döndü', 'Paylaştı: Evde']);
    assert.deepEqual(
      texts(index({ events: [{ kind: 'unshared', id: OWN_ID, name: 'Evde', at: ago(2) }, { kind: 'deleted', id: 'op_eski0001', name: 'Eski', at: ago(20) }] })),
      ['Paylaştı: Evde', 'Paylaşımı kapattı: Evde'].sort(),
    );
    assert.deepEqual(ownProgramNotices(index({ active: { programId: OWN_ID, at: ago(30) } }), since).map((notice) => notice.kind), ['own_program']);
  });

  test('paylaşılmış programda danışanın düzenlemesi ve bitişi; PT\'nin kaydı ve günler bildirilmez', () => {
    const logs = new Map([
      [
        OWN_ID,
        [
          { at: ago(1), revision: 3, kind: 'client' as const, sessionId: 's_k2m9x4qa', changes: [{ scope: 'Gün A', text: 'Goblet Squat 3 → 4 set' }] },
          { at: ago(2), revision: 2, kind: 'edit' as const, by: 'pt' as const, changes: [{ text: 'PT değiştirdi' }] },
          { at: ago(2), revision: 2, kind: 'client' as const, changes: [{ text: 'Antrenman günleri: Sal, Per' }] },
          { at: ago(4), revision: 2, kind: 'edit' as const, changes: [{ scope: 'Gün B', text: 'Plank eklendi' }] },
        ],
      ],
      ['op_tatil001', [{ at: ago(1), revision: 2, kind: 'edit' as const, changes: [{ text: 'paylaşılmamış' }] }]],
    ]);
    const texts = ownProgramNotices(index(), since, logs).map((notice) => notice.text);
    assert.deepEqual(texts.filter((text) => text.startsWith('Evde')), ['Evde · Gün A: Goblet Squat 3 → 4 set', 'Evde · Gün B: Plank eklendi']);
    assert.equal(texts.some((text) => text.includes('paylaşılmamış') || text.includes('PT değiştirdi') || text.includes('günleri')), false);
    const all = clientNotices({ index: null, log: [], proposals: null, own: { index: index(), logs }, now: NOW });
    assert.ok(all.some((notice) => notice.kind === 'own_program' && notice.target === 'program'));
  });
});

describe('kısıt bildirimleri (kisit-tarama.md §3.6)', () => {
  test('yalnız danışan satırları, pencere içinde; hedef Kısıtlar', () => {
    const log = [
      { at: ago(1), by: 'client' as const, id: 'k_aaaaaa', kind: 'reported', text: 'Sol diz bildirildi (orta)' },
      { at: ago(2), by: 'pt' as const, id: 'k_aaaaaa', kind: 'confirmed', text: 'Sol diz onaylandı' },
      { at: ago(20), by: 'client' as const, id: 'k_bbbbbb', kind: 'worsened', text: 'Bel: orta → şiddetli (danışan)' },
    ];
    const notices = clientNotices({ index: null, log: [], proposals: null, constraintLog: log, now: NOW });
    assert.deepEqual(
      notices.map((notice) => [notice.kind, notice.text, notice.target]),
      [['constraint', 'Sol diz bildirildi (orta)', 'constraints']],
    );
    assert.deepEqual(clientNotices({ index: null, log: [], proposals: null, now: NOW }), []);
  });
});
