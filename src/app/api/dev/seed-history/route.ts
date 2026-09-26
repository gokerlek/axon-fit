import { NextResponse } from 'next/server';
import { originGuard } from '@/lib/client-auth-routes';
import { canRecordHealth } from '@/lib/client-status';
import { listClients, readClient } from '@/lib/clients';
import { readAppConfig } from '@/lib/config';
import { DEMO_DEFAULT_WEEKS, DEMO_MAX_WEEKS, generateDemoHistory } from '@/lib/demo-history';
import { DEMO_CLIENT_PREFIX, demoSeedGate, isDemoClientName, parseSeedRequest, seedDemoHistory, type SeedResult } from '@/lib/demo-seed';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { GithubError } from '@/lib/github/client';
import { readProgramFile } from '@/lib/programs';
import { readPtSession } from '@/lib/session';
import { sessionRepo } from '@/lib/session-files';
import { origin } from '@/lib/urls';

/**
 * YALNIZ GELİŞTİRME: bir deneme danışanına geçmişe dönük antrenman geçmişi yazar (SPEC §13), grafikler ve
 * PT ekranları gerçek veri beklemeden gözden geçirilebilsin diye.
 *
 * Üretimde bu uç YOKTUR — `NODE_ENV === 'production'` iken 404 döner (`/api/dev/login` gibi). PT oturumu
 * ister ve yalnız adı "Test " ile başlayan danışana yazar (`demoSeedGate`); gerçek danışanın repo'suna
 * hiçbir koşulda dokunmaz. Kararlar ve yazım `demo-seed.ts`'te (test edilir), geçmişin kendisi
 * `demo-history.ts`'te.
 *
 * - `GET`: küçük yardım sayfası: deneme danışanları ve "Geçmiş üret" formu.
 * - `POST` (JSON ya da form): `{ clientId, weeks?, seed? }` → tek commit; yeniden çalıştırmak yalnız deneme
 *   kayıtlarını değiştirir. Form gönderiminde sonuç sayfası, JSON'da sonuç nesnesi.
 */

const production = () => process.env.NODE_ENV === 'production';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem;color:#111;background:#fff}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}}
form{display:grid;gap:.5rem;margin:1rem 0;padding:1rem;border:1px solid #8884;border-radius:.5rem}label{display:grid;gap:.25rem}input,select,button{font:inherit;min-height:44px;padding:0 .5rem}code{font-size:.9em}</style>
</head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

function blocked(status: number, error: string, form: boolean): NextResponse {
  if (production()) return new NextResponse(null, { status: 404 });
  return form ? page('Deneme geçmişi', `<p>${escapeHtml(error)}</p><p><a href="/api/dev/seed-history">Geri dön</a></p>`, status) : NextResponse.json({ error }, { status });
}

export async function GET() {
  if (production()) return new NextResponse(null, { status: 404 });
  const gate = demoSeedGate({ production: false, pt: (await readPtSession())?.role === 'pt' });
  if (!gate.ok) return blocked(gate.status, gate.error, true);

  const clients = await listClients();
  const eligible = clients.flatMap((item) => (item.ok && isDemoClientName(item.client.name) ? [item.client] : []));
  const others = clients.length - eligible.length;
  const options = eligible.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join('');
  const form = eligible.length
    ? `<form method="post">
<label>Danışan<select name="clientId" required>${options}</select></label>
<label>Hafta (1–${DEMO_MAX_WEEKS})<input name="weeks" type="number" min="1" max="${DEMO_MAX_WEEKS}" value="${DEMO_DEFAULT_WEEKS}"></label>
<label>Tohum (aynı tohum, aynı geçmiş)<input name="seed" value="1" maxlength="40"></label>
<button type="submit">Geçmiş üret</button></form>`
    : `<p>Adı "${escapeHtml(DEMO_CLIENT_PREFIX)}" ile başlayan danışan yok. Önce öyle bir danışan aç ve programını yaz.</p>`;
  return page(
    'Deneme geçmişi',
    `<p>Yalnız geliştirmede. Seçilen deneme danışanının programından bugünden önceki haftalara bitmiş antrenmanlar, su ve (onay varsa) yoklamalar yazılır; tek commit. Yeniden çalıştırmak yalnız deneme kayıtlarını değiştirir.</p>
${form}
${others > 0 ? `<p>Adı "${escapeHtml(DEMO_CLIENT_PREFIX)}" ile başlamayan ${others} danışan listelenmedi: onların repo'suna yazılmaz.</p>` : ''}
<p>JSON: <code>POST /api/dev/seed-history {"clientId":"c_…","weeks":12,"seed":"1"}</code> (PT oturum çerezi ve bu sitenin <code>Origin</code> başlığıyla).</p>`,
  );
}

function resultText(result: SeedResult): string {
  const { summary } = result;
  const lines = [
    result.status === 'unchanged' ? 'Değişiklik yok: aynı geçmiş zaten yazılı.' : `Yazıldı (commit ${escapeHtml((result.commit ?? '').slice(0, 7))}).`,
    `${summary.sessions} antrenman · ${escapeHtml(summary.from)} – ${escapeHtml(summary.to)} · ${result.written} dosya yazıldı, ${result.removed} eski deneme antrenmanı silindi`,
    summary.missedWeek ? `Boş hafta: ${escapeHtml(summary.missedWeek)} haftası` : '',
    summary.stall ? `Tıkanma: ${escapeHtml(summary.stall.title)} (${escapeHtml(summary.stall.from)}'den, hafifletme ${escapeHtml(summary.stall.deload ?? 'yok')})` : 'Tıkanma yok (ağırlıklı bileşik hareket bulunamadı).',
    summary.lighter ? `Hafif gün: ${escapeHtml(summary.lighter.date)} (${summary.lighter.via === 'readiness' ? 'hazır oluşluk' : 'plandan hafif ağırlık'})` : '',
    `Geçilen hareketli antrenman: ${summary.skipped} · seans zorluğu cevapsız: ${summary.unanswered}`,
    `Su: ${summary.waterTaps} dokunuş (water.json: ${result.water === 'broken' ? 'bozuk, yazılmadı' : result.water === 'written' ? 'yazıldı' : 'değişmedi'})`,
    `Yoklama: ${result.health === 'no_consent' ? 'onay yok, health.json okunmadı' : result.health === 'broken' ? 'health.json bozuk, yazılmadı' : `${summary.checkIns} kayıt (${result.health === 'written' ? 'yazıldı' : 'değişmedi'})`}`,
  ];
  return `<ul>${lines.filter(Boolean).map((line) => `<li>${line}</li>`).join('')}</ul><p><a href="/api/dev/seed-history">Geri dön</a></p>`;
}

export async function POST(request: Request) {
  if (production()) return new NextResponse(null, { status: 404 });
  const type = request.headers.get('content-type')?.toLowerCase() ?? '';
  const form = type.startsWith('application/x-www-form-urlencoded') || type.startsWith('multipart/form-data');
  const gate = demoSeedGate({ production: false, pt: (await readPtSession())?.role === 'pt' });
  if (!gate.ok) return blocked(gate.status, gate.error, form);
  const cross = originGuard(request.headers, origin(request));
  if (cross) return blocked(cross.status, String(cross.body.error), form);

  const raw: unknown = form ? Object.fromEntries((await request.formData()).entries()) : await request.json().catch(() => null);
  const input = raw && typeof raw === 'object' ? parseSeedRequest(raw as Record<string, unknown>) : null;
  if (!input) return blocked(400, 'İstek geçersiz: clientId (c_…), weeks (1–52), seed.', form);

  try {
    const stored = await readClient(input.clientId);
    const clientGate = demoSeedGate({ production: false, pt: true, client: stored?.client ?? null });
    if (!clientGate.ok || !stored) return blocked(clientGate.ok ? 404 : clientGate.status, clientGate.ok ? 'Danışan bulunamadı.' : clientGate.error, form);
    const client = stored.client;

    const programFile = await readProgramFile(client.id);
    if (!programFile?.program) return blocked(409, programFile ? `Program okunamıyor: ${programFile.problem}` : 'Danışanın programı yok; önce program yaz.', form);
    const [exercises, devices, config] = await Promise.all([listExercises(), listDevices(), readAppConfig()]);
    const history = generateDemoHistory({
      program: programFile.program,
      exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])),
      devices: new Map(devices.map((device) => [device.id, device])),
      client,
      now: new Date(),
      timeZone: config.timeZone,
      weeks: input.weeks,
      seed: input.seed,
    });
    if (history.sessions.length === 0) return blocked(409, 'Üretilecek antrenman yok: programın şu anki evresinde kütüphanede olan hareket yok.', form);

    const result = await seedDemoHistory(sessionRepo(client.id), history, {
      health: canRecordHealth(client, 'readiness') || canRecordHealth(client, 'check_in'),
    });
    console.error(`[deneme] ${client.id}: ${result.status}, ${history.sessions.length} antrenman`);
    return form ? page('Deneme geçmişi', resultText(result)) : NextResponse.json(result);
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    console.error(`[deneme] ${input.clientId}: ${error instanceof Error ? error.message : String(error)}`);
    return blocked(failure?.status ?? 502, failure?.message ?? 'Deneme geçmişi yazılamadı.', form);
  }
}
