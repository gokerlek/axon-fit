import { accessState, type AccessState } from './client-status.ts';
import { formatDayShort, formatNumber, formatSignedWithUnit, todayIn } from './format.ts';
import { SIDE_LABELS } from './measurement-log.ts';
import { measurementAlerts, type LineKey } from './measurement-trends.ts';
import { MEASUREMENT_UNIT_LABELS, MEASUREMENTS, type MeasurementId } from './measurements.ts';
import { activeItem, type OwnIndex } from './own-program-index.ts';
import { currentPhaseOf, phaseStatus } from './program-plan.ts';
import { parseProposals, pendingProposals } from './proposals.ts';
import { stallCounts } from './recommend.ts';
import type { Client, Invite } from './schemas/client.ts';
import type { MeasurementEntry } from './schemas/health.ts';
import type { Program } from './schemas/program.ts';
import type { SessionIndex } from './schemas/session.ts';
import { addDays, effectiveSchedule, isoWeekdayOf, normalizeWeekdays, scheduleSince } from './training-days.ts';
import { shortDayText } from './workout-summary.ts';

/**
 * Genel bakış'ın "Dikkat gerektirenler"i (tasarım §2.11, §8 satır 12; SPEC §6) — saf. Danışan başına, PT'nin
 * bir şey yapması gerekebilecek durumlar, aciliyete göre:
 * - **kaçan antrenman günü:** seçili gün geçti, o gün antrenman yok (§2.11; son 7 gün, bugün hariç);
 * - **ilerlemeyen hareket:** öneri motoru üst üste en az 2 antrenman ağırlığı artırmadı (bir önceki antrenman
 *   hedefin altında kaldı: planın gerekçesi `hold` ya da `decrease`) ya da son 2 haftada tıkanma hafifletmesi
 *   (`deload`: üst üste 3 tıkanma) oldu **[sentez]**: motor 3 tıkanmada hafifletir (`DELOAD_AFTER_FAILED`),
 *   2'de PT'nin bir şey değiştirmek için hâlâ vakti vardır. Tıkanma sayılmayanlar motorla aynı (`stallCounts`:
 *   Tanışma ve ayar seansı); eksik, hafif ve yoklamayla hafifletilmiş antrenman seriyi ne artırır ne keser;
 *   "bir defalık" hareket sayılmaz. Hareket son 3 haftada yapılmadıysa (programdan kalkmış olabilir) sayılmaz;
 * - **evre geçişi:** şu anki evrenin süresi doldu, sonraki evre var (`phaseStatus` → `due`);
 * - **bekleyen öneriler** (`proposals.json`);
 * - **ölçümde gerileme:** 4 haftalık eğilim (`measurementAlerts`), yalnız onay sürdükçe (çağıran onayı denetler);
 * - **davet:** danışan henüz giriş yapmadı (davet yok, bekliyor, süresi doldu, kilitlendi).
 *
 * İki adım: `attentionFactsOf` danışanın dosyalarından küçük bir özet çıkarır (Genel bakış'ın danışan başına
 * önbelleğinde durur, bildirimlerle aynı yazımlarda düşer: `notices-store.ts`); zamana bağlı kararlar (kaçan
 * gün, evrenin bitişi, davetin süresi, pencereler) sayfa her açıldığında `attentionItems` ile verilir. Önbellek
 * bayat sunulsa da bugünün kararı bugüne göredir. Yalnız aktif danışanlar; arşivdeki ve duraklatılmış danışanda
 * madde yok.
 */

export const ATTENTION_TUNING = {
  /** Kaçan antrenman günleri: bugünden bu kadar gün geriye (bugün hariç). */
  missedLookbackDays: 7,
  /** "İlerlemiyor": üst üste bu kadar antrenman ağırlık artmadı **[sentez]**. */
  stallStreak: 2,
  /** Tıkanma hafifletmesi bu kadar gün içindeyse **[sentez]**. */
  deloadDays: 14,
  /** Serinin son antrenmanı bundan eskiyse (hareket artık yapılmıyor) sayılmaz **[sentez]**. */
  stallRecentDays: 21,
  /** Ölçüm eğiliminin son ölçümü bundan eskiyse sayılmaz (`measurementAlerts`'in 4 haftası). */
  measurementDays: 28,
  /** Özette tutulan antrenman günleri (kaçan gün penceresinden geniş). */
  sessionDaysKept: 35,
} as const;

export const ATTENTION_KINDS = ['missed', 'stalled', 'phase', 'proposals', 'measurement', 'invite'] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const ATTENTION_LABELS: Record<AttentionKind, string> = {
  missed: 'Kaçan gün',
  stalled: 'İlerleme',
  phase: 'Evre',
  proposals: 'Öneri',
  measurement: 'Ölçüm',
  invite: 'Davet',
};

/**
 * Aciliyet (büyük önce) **[sentez]**: birden çok kaçan antrenman günü danışanın koptuğunu gösterebilir; bekleyen
 * öneri danışanı PT'nin kararına bekletir; hafifletmeye düşen ya da gerileyen hareket ve süresi dolan evre
 * programda bir karar ister; tek kaçan gün, ilerlemeyen hareket ve ölçüm eğilimi izlenir; davet PT'nin işidir
 * ama acil değildir (kilitli ya da süresi dolmuş davet danışanı dışarıda bırakır).
 */
export const ATTENTION_URGENCY = {
  missedMany: 90,
  proposals: 75,
  deload: 70,
  declining: 65,
  phase: 65,
  missedOne: 60,
  inviteBlocked: 55,
  stalled: 50,
  measurement: 45,
  inviteNone: 35,
  invitePending: 25,
} as const;

/** Bir hareketin tıkanma serisi (index'ten). */
export type StallFact = {
  exerciseId: string;
  /** Üst üste "aynı ağırlık" ya da "azalt" planı: o kadar antrenmandır ağırlık artmadı. */
  streak: number;
  /** Serideki planlardan biri azaltma (`decrease`: bir önceki antrenmanda bütün setler kaçtı). */
  declining: boolean;
  /** Serinin (yoksa hareketin) son antrenmanının günü. */
  lastDate: string;
  /** Son tıkanma hafifletmesinin günü. */
  deloadDate?: string;
};

export type MeasurementDecline = { id: MeasurementId; key: LineKey; change: number; lastDate: string };

/** Danışanın özeti (önbellekte): kararlar sayfa açılınca `attentionItems`'ta. */
export type AttentionFacts = {
  active: boolean;
  access: AccessState;
  /** Kullanılmamış davetin son kullanma anı. */
  inviteExpiresAt?: string;
  /**
   * Geçerli antrenman günleri ve sayılmaya başladığı an: programın kurulduğu, günlerin son değiştiği (PT'nin
   * değişikliği, danışanın katmanı ya da katmanın kalkması), danışanın ilk girişi ve durumunun son değiştiği
   * (duraklatılıp yeniden açılma) anların en yenisi.
   */
  schedule: { weekdays: number[]; since: string } | null;
  /** Antrenman yapılan günler (bitmiş, yarım ya da hiç bitirilmemiş), yakın geçmiş. */
  sessionDays: string[];
  stalls: StallFact[];
  /**
   * Evre sürüyor ve sonrası var: bitiş anı gelince geçiş önerilir. `own`: danışan o sırada kendi programıyla
   * çalışıyor (adı; `docs/design/kendi-program.md` §4): madde bunu söyler.
   */
  phase: { name: string; next: string; endsAt: string; own?: string } | null;
  proposals: { count: number; at: string; text?: string } | null;
  measurements: MeasurementDecline[];
};

/* --- özet --- */

const STALL_REASONS = new Set(['hold', 'decrease']);
/** Seriyi ne artıran ne kesen gerekçeler: eksik, hafif ilk kez, yoklamayla hafifletilmiş, ağrı kuralı, ara. */
const NEUTRAL_REASONS = new Set(['incomplete', 'lighter_retry', 'lighten', 'pain_hold', 'pain_reduce', 'pain_reduce_unavailable', 'paused']);

function rowTime(row: { startedAt?: string | undefined; date: string }): number {
  const at = Date.parse(row.startedAt ?? `${row.date}T00:00:00.000Z`);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * Hareketlerin tıkanma serileri: bitmiş antrenmanlar eskiden yeniye, satır (yoksa hareket) başına. Aynı hareket
 * iki satırda yapılıyorsa en kötüsü. `rowIds` verilirse yalnız o satırlar (programda hâlâ duranlar).
 */
export function exerciseStalls(index: Pick<SessionIndex, 'items'>, options: { rowIds?: ReadonlySet<string> } = {}): StallFact[] {
  const rows = index.items.filter((row) => row.finishedAt).sort((a, b) => rowTime(a) - rowTime(b));
  const groups = new Map<string, { exerciseId: string; items: { date: string; reason?: string | undefined; stage?: string | undefined; skip: boolean }[] }>();
  for (const row of rows) {
    for (const item of row.exercises) {
      if (options.rowIds && (!item.rowId || !options.rowIds.has(item.rowId))) continue;
      const key = `${item.exerciseId}|${item.rowId ?? ''}`;
      const group = groups.get(key) ?? { exerciseId: item.exerciseId, items: [] };
      group.items.push({ date: row.date, reason: item.reason, stage: item.stage, skip: Boolean(item.oneOff || item.lighter) });
      groups.set(key, group);
    }
  }
  const byExercise = new Map<string, StallFact>();
  for (const { exerciseId, items } of groups.values()) {
    let streak = 0;
    let declining = false;
    let lastDate: string | undefined;
    for (let position = items.length - 1; position >= 0; position -= 1) {
      const item = items[position]!;
      if (item.skip || !item.reason || !stallCounts(item) || NEUTRAL_REASONS.has(item.reason)) continue;
      if (!STALL_REASONS.has(item.reason)) break;
      streak += 1;
      lastDate ??= item.date;
      if (item.reason === 'decrease') declining = true;
    }
    const deload = [...items].reverse().find((item) => !item.skip && item.reason === 'deload' && stallCounts(item));
    const fact: StallFact = {
      exerciseId,
      streak,
      declining,
      lastDate: lastDate ?? items.at(-1)?.date ?? '',
      ...(deload ? { deloadDate: deload.date } : {}),
    };
    const previous = byExercise.get(exerciseId);
    if (!previous || stallRank(fact) > stallRank(previous)) byExercise.set(exerciseId, fact);
  }
  return [...byExercise.values()].filter((fact) => fact.streak >= ATTENTION_TUNING.stallStreak || fact.deloadDate);
}

function stallRank(fact: StallFact): number {
  return (fact.deloadDate ? 1000 : 0) + (fact.declining ? 100 : 0) + fact.streak;
}

/** Ölçümdeki gerilemeler (4 haftalık eğilim) ve her çizginin son ölçüm günü. */
export function measurementDeclines(entries: readonly MeasurementEntry[]): MeasurementDecline[] {
  const latest = entries.reduce((max, entry) => (entry.date > max ? entry.date : max), '');
  if (!latest) return [];
  return measurementAlerts(entries, latest)
    .filter((alert) => alert.kind === 'declining')
    .map((alert) => ({
      id: alert.id,
      key: alert.key,
      change: alert.change,
      lastDate: entries
        .filter((entry) => entry.id === alert.id && (entry.side ?? 'value') === alert.key)
        .reduce((max, entry) => (entry.date > max ? entry.date : max), ''),
    }));
}

/** İki andan yenisi (biri yoksa öteki). */
function later(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * Danışanın dosyalarından özet. `index` onarılmış index (`readIndex`: başlanıp hiç bitirilmemiş antrenmanlar da
 * satırdır, o gün kaçan sayılmaz), `proposals` ham dosya, `measurements` yalnız ölçüm onayı sürüyorsa (yoksa
 * null). `now` davetin durumu, evre ve pencereler için. `own`: kendi programların index'i (seçim): kalıcı seçim
 * kendi programsa günler onun (index satırından), pencere seçimin anından da sonra başlar (`docs/design/kendi-program.md`
 * §3.2, §4); PT'nin programına dönüşün anı da pencereyi açar.
 */
export function attentionFactsOf(input: {
  client: Pick<Client, 'status' | 'access' | 'statusChangedAt'>;
  invite: Invite | null;
  index: Pick<SessionIndex, 'items'> | null;
  program: Program | null;
  proposals: unknown;
  measurements: readonly MeasurementEntry[] | null;
  now: Date;
  own?: OwnIndex | null | undefined;
}): AttentionFacts {
  const { client, program, now } = input;
  const access = accessState(client.access, input.invite, now);
  const invite = input.invite && !input.invite.used ? input.invite : null;
  const selected = activeItem(input.own);
  const activeAt = input.own?.active?.at;

  let schedule: AttentionFacts['schedule'] = null;
  if (selected) {
    // Kendi program: günleri index satırında; pencere programın kurulduğu, günlerin değiştiği ve seçildiği andan sonra.
    const since = later(scheduleSince({ createdAt: selected.createdAt, schedule: { weekdays: selected.weekdays, at: selected.weekdaysAt } }, client), activeAt);
    if (selected.weekdays.length > 0 && since) schedule = { weekdays: normalizeWeekdays(selected.weekdays), since };
  } else if (program) {
    const days = effectiveSchedule(program);
    // Günler programdan, günlerin son değişmesinden, ilk girişten, duraklatmadan dönüşten ve PT'nin programına dönüşten önce sayılmaz (Bugün'ün şeridiyle aynı kural).
    const since = later(scheduleSince(program, client), activeAt);
    if (days.weekdays.length > 0 && since) schedule = { weekdays: days.weekdays, since };
  }

  const keepFrom = new Date(now.getTime() - ATTENTION_TUNING.sessionDaysKept * 86_400_000).toISOString().slice(0, 10);
  const sessionDays = [...new Set((input.index?.items ?? []).map((row) => row.date).filter((date) => date >= keepFrom))].sort();

  let phase: AttentionFacts['phase'] = null;
  const current = program?.phased ? currentPhaseOf(program) : null;
  const next = current ? program?.phases[current.index + 1] : undefined;
  if (program && current && next) {
    const status = phaseStatus(program, now);
    if (status.kind === 'running' || status.kind === 'due') {
      phase = { name: current.phase.name, next: next.name, endsAt: status.endsAt, ...(selected ? { own: selected.name } : {}) };
    }
  }

  const pending = pendingProposals(parseProposals(input.proposals));
  const newest = pending.reduce<(typeof pending)[number] | undefined>((best, item) => (!best || Date.parse(item.at) > Date.parse(best.at) ? item : best), undefined);
  const proposals = newest ? { count: pending.length, at: newest.at, ...(pending.length === 1 ? { text: newest.text } : {}) } : null;

  const rowIds = program ? new Set(program.phases.flatMap((item) => item.days.flatMap((day) => day.blocks.flatMap((block) => block.rows.map((row) => row.id))))) : undefined;

  return {
    active: client.status === 'active',
    access,
    ...(invite ? { inviteExpiresAt: invite.expiresAt } : {}),
    schedule,
    sessionDays,
    stalls: input.index ? exerciseStalls(input.index, rowIds ? { rowIds } : {}) : [],
    phase,
    proposals,
    measurements: input.measurements ? measurementDeclines(input.measurements) : [],
  };
}

/* --- kararlar --- */

export type AttentionTarget = 'client' | 'sessions' | 'program' | 'measurements' | 'invite';
export type AttentionItem = { key: string; kind: AttentionKind; urgency: number; text: string; target: AttentionTarget };

/**
 * Kaçan antrenman günleri (§2.11): son `lookbackDays` gün (bugün hariç), seçili hafta günü, o gün antrenman
 * yok. `since` günü ve öncesi sayılmaz: program (ya da danışanın ilk girişi) o gün olduysa danışan yetişemeyebilirdi.
 */
export function missedTrainingDays(input: {
  weekdays: readonly number[];
  sessionDays: Iterable<string>;
  today: string;
  since?: string | undefined;
  lookbackDays?: number;
}): string[] {
  const selected = new Set(normalizeWeekdays(input.weekdays));
  const done = new Set(input.sessionDays);
  const missed: string[] = [];
  for (let offset = input.lookbackDays ?? ATTENTION_TUNING.missedLookbackDays; offset >= 1; offset -= 1) {
    const day = addDays(input.today, -offset);
    if (input.since && day <= input.since) continue;
    if (selected.has(isoWeekdayOf(day)) && !done.has(day)) missed.push(day);
  }
  return missed;
}

/** Davetin durumu şimdi: bekleyen davetin süresi özetten sonra dolmuş olabilir. */
function accessNow(facts: Pick<AttentionFacts, 'access' | 'inviteExpiresAt'>, now: Date): AccessState {
  if (facts.access === 'pending' && facts.inviteExpiresAt && Date.parse(facts.inviteExpiresAt) <= now.getTime()) return 'expired';
  return facts.access;
}

function inviteItem(access: AccessState, expiresAt: string | undefined, timeZone: string): AttentionItem | null {
  const item = (urgency: number, text: string): AttentionItem => ({ key: `invite:${access}`, kind: 'invite', urgency, text, target: 'invite' });
  switch (access) {
    case 'none':
      return item(ATTENTION_URGENCY.inviteNone, 'Henüz davet edilmedi: kare kod üretilmedi');
    case 'pending':
      return item(
        ATTENTION_URGENCY.invitePending,
        expiresAt ? `Davet kullanılmadı · son kullanma ${formatDayShort(todayIn(timeZone, new Date(expiresAt)))}` : 'Davet kullanılmadı',
      );
    case 'expired':
      return item(ATTENTION_URGENCY.inviteBlocked, 'Davetin süresi doldu: yeni kare kod gerekli');
    case 'locked':
      return item(ATTENTION_URGENCY.inviteBlocked, 'Davet kilitlendi (çok sayıda yanlış kod): yeni kare kod gerekli');
    default:
      return null;
  }
}

/** En çok bu kadar hareket adı yazılır, gerisi "+n hareket". */
const STALL_NAMES = 3;

function stallItem(stalls: readonly StallFact[], today: string, titleOf: (exerciseId: string) => string): AttentionItem | null {
  const deloadFrom = addDays(today, -ATTENTION_TUNING.deloadDays);
  const recentFrom = addDays(today, -ATTENTION_TUNING.stallRecentDays);
  const phrases: { urgency: number; text: string }[] = [];
  for (const fact of stalls) {
    const title = titleOf(fact.exerciseId);
    if (fact.deloadDate && fact.deloadDate >= deloadFrom) {
      phrases.push({ urgency: ATTENTION_URGENCY.deload, text: `${title} hafifletildi (üst üste tıkandı)` });
    } else if (fact.streak >= ATTENTION_TUNING.stallStreak && fact.lastDate >= recentFrom) {
      phrases.push(
        fact.declining
          ? { urgency: ATTENTION_URGENCY.declining, text: `${title} geriliyor (${formatNumber(fact.streak)} antrenmandır hedefin altında)` }
          : { urgency: ATTENTION_URGENCY.stalled, text: `${title} ${formatNumber(fact.streak)} antrenmandır aynı ağırlıkta` },
      );
    }
  }
  if (phrases.length === 0) return null;
  phrases.sort((a, b) => b.urgency - a.urgency || a.text.localeCompare(b.text, 'tr'));
  const more = phrases.length - STALL_NAMES;
  const text = phrases.slice(0, STALL_NAMES).map((phrase) => phrase.text).join(' · ') + (more > 0 ? ` · +${formatNumber(more)} hareket` : '');
  return { key: 'stalled', kind: 'stalled', urgency: phrases[0]!.urgency, text, target: 'sessions' };
}

function measurementItem(declines: readonly MeasurementDecline[], today: string): AttentionItem | null {
  const from = addDays(today, -ATTENTION_TUNING.measurementDays);
  const parts = declines
    .filter((decline) => decline.lastDate >= from)
    .map((decline) => {
      const def = MEASUREMENTS[decline.id];
      const side = decline.key === 'value' ? '' : ` (${SIDE_LABELS[decline.key].toLocaleLowerCase('tr')})`;
      return `${def.label}${side} ${formatSignedWithUnit(Math.round(decline.change * 10) / 10, MEASUREMENT_UNIT_LABELS[def.unit])}`;
    });
  if (parts.length === 0) return null;
  return { key: 'measurement', kind: 'measurement', urgency: ATTENTION_URGENCY.measurement, text: `4 haftalık eğilimde gerileme: ${parts.join(' · ')}`, target: 'measurements' };
}

/** Danışanın maddeleri, şimdiye göre; aciliyet sırasıyla. `titleOf`: egzersizin kütüphanedeki adı. */
export function attentionItems(
  facts: AttentionFacts,
  ctx: { now: Date; timeZone: string; titleOf: (exerciseId: string) => string },
): AttentionItem[] {
  if (!facts.active) return [];
  const today = todayIn(ctx.timeZone, ctx.now);
  const items: AttentionItem[] = [];

  const access = accessNow(facts, ctx.now);
  const invite = inviteItem(access, facts.inviteExpiresAt, ctx.timeZone);
  if (invite) items.push(invite);
  const joined = access === 'joined' || access === 'used';

  if (joined && facts.schedule) {
    const missed = missedTrainingDays({
      weekdays: facts.schedule.weekdays,
      sessionDays: facts.sessionDays,
      today,
      since: todayIn(ctx.timeZone, new Date(facts.schedule.since)),
    });
    if (missed.length > 0) {
      const days = missed.map(shortDayText).join(', ');
      items.push({
        key: 'missed',
        kind: 'missed',
        urgency: missed.length > 1 ? ATTENTION_URGENCY.missedMany : ATTENTION_URGENCY.missedOne,
        text:
          missed.length > 1
            ? `Son ${formatNumber(ATTENTION_TUNING.missedLookbackDays)} günde ${formatNumber(missed.length)} antrenman günü kaçtı: ${days}`
            : `Antrenman günü kaçtı: ${days}`,
        target: 'sessions',
      });
    }
  }

  const stalls = stallItem(facts.stalls, today, ctx.titleOf);
  if (stalls) items.push(stalls);

  if (facts.phase && Date.parse(facts.phase.endsAt) <= ctx.now.getTime()) {
    items.push({
      key: 'phase',
      kind: 'phase',
      urgency: ATTENTION_URGENCY.phase,
      text: facts.phase.own
        ? `Danışan ${facts.phase.own} ile çalışıyor · '${facts.phase.name}' evresinin süresi doldu`
        : `'${facts.phase.name}' evresinin süresi doldu; sıradaki evre '${facts.phase.next}'`,
      target: 'program',
    });
  }

  if (facts.proposals) {
    items.push({
      key: 'proposals',
      kind: 'proposals',
      urgency: ATTENTION_URGENCY.proposals,
      text: facts.proposals.text ? `Öneri onay bekliyor: ${facts.proposals.text}` : `${formatNumber(facts.proposals.count)} öneri onay bekliyor`,
      target: 'program',
    });
  }

  const measurement = measurementItem(facts.measurements, today);
  if (measurement) items.push(measurement);

  return items.sort((a, b) => b.urgency - a.urgency || ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind));
}

/** Genel bakış listesinin uzunluğu. */
export const ATTENTION_FEED_LIMIT = 15;

export type AttentionFeedItem = AttentionItem & { clientId: string; clientName: string };

/**
 * Bütün danışanların maddeleri tek listede: aciliyet, sonra danışanın adı. `total` listede görünmeyenler dahil,
 * `clients` maddesi olan danışan sayısı.
 */
export function attentionFeed(
  clients: readonly { id: string; name: string; facts: AttentionFacts | null | undefined }[],
  ctx: { now: Date; timeZone: string; titleOf: (exerciseId: string) => string },
  limit = ATTENTION_FEED_LIMIT,
): { items: AttentionFeedItem[]; total: number; clients: number } {
  const all = clients.flatMap((client) =>
    client.facts ? attentionItems(client.facts, ctx).map((item) => ({ ...item, clientId: client.id, clientName: client.name })) : [],
  );
  all.sort(
    (a, b) =>
      b.urgency - a.urgency ||
      a.clientName.localeCompare(b.clientName, 'tr') ||
      a.clientId.localeCompare(b.clientId) ||
      ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind),
  );
  return { items: all.slice(0, limit), total: all.length, clients: new Set(all.map((item) => item.clientId)).size };
}
