import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_CONSENT_VERSION, type Client, type Invite } from '../../../lib/schemas/client.ts';
import { clientsSummary, clientWork } from './client-work.ts';

const simdi = new Date('2026-09-26T10:00:00.000Z');
const katilim = { joinedAt: '2026-09-01T10:00:00.000Z', lastJoinAt: '2026-09-01T10:00:00.000Z' };

const danisan = (extra: Partial<Pick<Client, 'status' | 'access' | 'modules' | 'consents'>> = {}) => ({
  status: 'active' as const,
  access: { version: 1 },
  modules: { health: { enabled: false, fields: [] } },
  consents: {},
  ...extra,
});

const davet = (extra: Partial<Invite> = {}): Invite => ({
  codeHash: 'ab',
  createdAt: '2026-09-25T10:00:00.000Z',
  expiresAt: '2026-10-02T10:00:00.000Z',
  used: false,
  attempts: 0,
  ...extra,
});

describe('danışan listesindeki durum', () => {
  test('giriş durumu davetten ve katılımdan', () => {
    assert.equal(clientWork(danisan(), null, simdi).access, 'none');
    assert.equal(clientWork(danisan(), davet(), simdi).access, 'pending');
    assert.equal(clientWork(danisan(), davet({ expiresAt: '2026-09-20T10:00:00.000Z' }), simdi).access, 'expired');
    assert.equal(clientWork(danisan({ access: { version: 1, ...katilim } }), null, simdi).access, 'joined');
  });

  test('sağlık rozeti yalnız bir şey beklenirken; takip açık ya da kapalıysa yok', () => {
    const bekliyor = danisan({ modules: { health: { enabled: true, fields: ['measurements'] } } });
    assert.deepEqual(clientWork(bekliyor, null, simdi).healthWork, { label: 'Sağlık onayı bekliyor', tone: 'waiting' });
    const acik = danisan({
      access: { version: 1, ...katilim },
      modules: { health: { enabled: true, fields: ['measurements'], enabledAt: '2026-08-01T10:00:00.000Z' } },
      consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['measurements'], at: '2026-09-01T10:00:00.000Z' } },
    });
    assert.equal(clientWork(acik, null, simdi).healthWork, null);
    assert.equal(clientWork(danisan(), null, simdi).healthWork, null);
    const reddetti = danisan({
      access: { version: 1, ...katilim },
      modules: { health: { enabled: true, fields: ['measurements'] } },
      consents: { health: { granted: false, version: HEALTH_CONSENT_VERSION, fields: [], at: '2026-09-01T10:00:00.000Z' } },
    });
    assert.deepEqual(clientWork(reddetti, null, simdi).healthWork, { label: 'Sağlık onayı verilmedi', tone: 'info' });
  });

  test('arşivdeki danışanda iş yok', () => {
    const arsiv = danisan({ status: 'archived', modules: { health: { enabled: true, fields: ['measurements'] } } });
    assert.equal(clientWork(arsiv, null, simdi).healthWork, null);
  });

  test('başlık özeti yalnız aktif danışanlardaki bekleyen işleri sayar', () => {
    const satir = (client: ReturnType<typeof danisan>, invite: Invite | null = null) => ({
      status: client.status,
      work: clientWork(client, invite, simdi),
    });
    const satirlar = [
      satir(danisan(), davet()),
      satir(danisan({ modules: { health: { enabled: true, fields: ['measurements'] } } })),
      satir(danisan({ access: { version: 1, ...katilim } })),
      satir(danisan({ status: 'paused' })),
      { status: 'active' as const, work: null },
    ];
    assert.equal(clientsSummary(satirlar), '5 danışan · 4 aktif · 2 henüz giriş yapmadı · 1 sağlık onayı bekliyor');
    assert.equal(clientsSummary([]), '0 danışan · 0 aktif');
  });
});
