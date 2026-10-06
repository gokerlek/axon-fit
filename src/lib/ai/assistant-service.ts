import 'server-only';
import { randomBytes } from 'node:crypto';
import { coachDeps } from './coach-service';
import { coachingKey } from './coach-keys';
import { interpretGoal } from './assistant-gemini';
import { ownLibrary, ownGuard } from '@/lib/own-programs-store';
import { saveOwnProgram } from '@/lib/own-program-files';
import { saveResponse } from '@/lib/own-program-routes';
import { sessionRepo } from '@/lib/session-files';
import type { CoachDeps } from './coach-routes';
import type { AssistantDeps } from './assistant-routes';
export function assistantDeps(session: CoachDeps['session'], base?: CoachDeps): AssistantDeps {
  return { ...(base ?? coachDeps(session)), ownId: () => `op_${randomBytes(4).toString('hex')}`,
    interpret: async (id, role, text) => {
      const { key } = await coachingKey(id, role);
      if (!key) throw new Error('Gemini bağlantısı yok. Seçimleri elle yapabilirsin.');
      return interpretGoal(key, text);
    },
    saveOwn: async (client, draft, body) => {
      const [{ library, ctx }, guard] = await Promise.all([ownLibrary(), ownGuard(client)]);
      if (body.phases.some(p => p.days.some(d => d.blocks.some(b => b.rows.some(r => r.deviceId && !library.deviceIds.has(r.deviceId)))))) return { status: 400, body: { error: 'Seçilen cihaz artık kütüphanede yok. Başka cihaz seç.' } };
      return saveResponse(await saveOwnProgram(sessionRepo(client.id), { id: draft.programId, body, by: 'client', library, ctx, guard, now: new Date(), shareOnCreate: true }), 'client');
    },
  };
}
