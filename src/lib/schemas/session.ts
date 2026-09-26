import * as v from 'valibot';
import { EFFORTS } from '../progression.ts';
import { DAY_ID_PATTERN, PHASE_ID_PATTERN } from '../program-plan.ts';
import { BLOCK_ID_PATTERN, ROW_ID_PATTERN, TEMPLATE_LIMITS } from '../template-plan.ts';
import { setSpecSchema } from './template.ts';

/**
 * Antrenman kaydı (seans) şeması — sunucu ve telefon ortak (SPEC §4, tasarım `docs/design/antrenman-ekrani.md` §4.2).
 *
 * Bir antrenman danışan repo'sunda tek dosyadır: `sessions/<id>.json`. Yol yalnız kimlikten kurulur;
 * tarih dosyanın içindedir (sunucu ilk yazımda koyar). Dosya ilk sette oluşur (`active`), bitişte
 * `finished` olur; silinince değersiz bir iz dosyasına döner (`deleted`, `sessionTombstoneSchema`).
 *
 * Birleştirme (`session-merge.ts`) için her değişen parça kendi saatini taşır: set `editedAt ?? at`,
 * hareket (entry) `updatedAt`, oturum düzeyindeki kayıtlar (`order`, `rotation`, `effort`) kendi
 * `updatedAt`'ini; eşitlikte yazan cihaz (`by`). Silinen set ve hareketlerin kimlikleri kalıcı iz
 * listelerindedir (`deletedSetIds`, `deletedEntryIds`): geç gelen bir yazma silineni geri getiremez.
 * Su bir dokunuş listesidir (`waterTaps`; "Geri al" bir −1 dokunuşu).
 *
 * Sağlık verisi bu dosyaya girmez (SPEC §4): ağrıyla geçilen hareket `skip.reason: "other"`,
 * hafifletme yalnız nötr `adjust: "lighter"`; ayrıntı `health.json`'da, onay varken.
 *
 * Birimler: `kg` cihazda seçilen ağırlık (makara oranı uygulanmaz, SPEC §7.3), `reps` ve `seconds` tam
 * sayı, zamanlar ISO. Node'un test aracı doğrudan çalıştırdığı için içe aktarmalar göreli ve `.ts`'li.
 */

export const SESSION_ID_PATTERN = /^s_[a-z0-9]{8}$/;
export const ENTRY_ID_PATTERN = /^e_[a-z0-9]{6}$/;
export const SET_ID_PATTERN = /^st_[a-z0-9]{8}$/;
export const WATER_TAP_ID_PATTERN = /^wt_[a-z0-9]{8}$/;
/** Yazan cihaz: telefon ilk açılışta üretir, seansa `writer` ve kayıtlara `by` olarak girer. */
export const WRITER_ID_PATTERN = /^w_[a-z0-9]{6}$/;

/** Kimlik uzunlukları (`randomId`): `s_` + 8, `e_` + 6, `st_` + 8, `wt_` + 8, `w_` + 6. */
export const SESSION_ID_LENGTHS = { s: 8, e: 6, st: 8, wt: 8, w: 6 } as const;

export const SESSIONS_DIR = 'sessions';
export const SESSIONS_INDEX_PATH = 'sessions-index.json';

/** Dosya yolu yalnız kimlikten: telefonun tarihinden ya da saat diliminden yol kurulmaz. */
export function sessionPath(id: string): string {
  return `${SESSIONS_DIR}/${id}.json`;
}

/** `sessions/s_xxxxxxxx.json` → kimlik; başka bir dosyaysa null. */
export function sessionIdOfPath(path: string): string | null {
  const match = path.match(/^sessions\/(s_[a-z0-9]{8})\.json$/);
  return match?.[1] ?? null;
}

export const SESSION_LIMITS = {
  /** Günün satırları (40) + sonradan eklenen hareketler. */
  entries: 60,
  /** Bir harekette ısınma + çalışma + fazladan setler. */
  setsPerEntry: 40,
  deletedSetIds: 2000,
  deletedEntryIds: 200,
  waterTaps: 500,
  notices: 50,
  title: 120,
  dayName: 60,
  setupNote: TEMPLATE_LIMITS.note,
  kg: 1000,
  reps: 1000,
  seconds: 36_000,
  plannedSets: TEMPLATE_LIMITS.sets,
} as const;

export const SESSION_STATUSES = ['active', 'finished', 'deleted'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const ENTRY_STATUSES = ['pending', 'done', 'partial', 'skipped'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Geçme nedeni (yalnız bitişte, isteğe bağlı). Ağrı burada yok: `other` yazılır, ayrıntı `health.json`'da. */
export const SKIP_REASONS = ['busy', 'no_equipment', 'no_time', 'tired', 'other'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const ROTATION_CHOICES = ['advance', 'keep'] as const;
export type RotationChoice = (typeof ROTATION_CHOICES)[number];

/** PT'ye türetilen bildirimler (§4.6); nötr: `lighter` ağrı ya da hazır oluşluk demez. */
export const NOTICE_KINDS = ['other_day', 'program_update', 'proposal', 'overload', 'unfinished', 'lighter'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

const id = (pattern: RegExp, message: string) => v.pipe(v.string(), v.regex(pattern, message));
export const sessionIdSchema = id(SESSION_ID_PATTERN, 'Antrenman kimliği geçersiz.');
export const entryIdSchema = id(ENTRY_ID_PATTERN, 'Hareket kaydı kimliği geçersiz.');
export const setIdSchema = id(SET_ID_PATTERN, 'Set kimliği geçersiz.');
export const writerIdSchema = id(WRITER_ID_PATTERN, 'Cihaz kimliği geçersiz.');
const tapIdSchema = id(WATER_TAP_ID_PATTERN, 'Su kaydı kimliği geçersiz.');
const rowIdSchema = id(ROW_ID_PATTERN, 'Satır kimliği geçersiz.');
const blockIdSchema = id(BLOCK_ID_PATTERN, 'Blok kimliği geçersiz.');
/** Egzersiz ve cihaz kimlikleriyle aynı biçim. */
const slugSchema = v.pipe(v.string(), v.regex(/^[a-z0-9-]{2,60}$/, 'Kimlik yalnız küçük harf, rakam ve tire içerebilir.'));
/** Öneri gerekçesi ve aşama: motorun yeni değerleri (`confirm_increase`, `calibrate`, aşamalar) eski şemayı bozmasın. */
const codeSchema = v.pipe(v.string(), v.regex(/^[a-z_]{1,32}$/));

const timestamp = v.pipe(v.string(), v.isoTimestamp('Zaman ISO biçiminde olmalı.'));
const isoDate = v.pipe(v.string(), v.isoDate('Tarih YYYY-AA-GG olmalı.'));
const int = (min: number, max: number) => v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const kg = v.pipe(v.number(), v.minValue(0), v.maxValue(SESSION_LIMITS.kg));

/** Oturum düzeyinde, son yazanın kazandığı değer: saat ve (eşitlikte) yazan cihaz. */
const register = <T extends v.GenericSchema>(value: T) =>
  v.object({ value, updatedAt: timestamp, by: v.optional(writerIdSchema) });

export const sessionSetSchema = v.pipe(
  v.object({
    id: setIdSchema,
    type: v.picklist(['warmup', 'working'] as const),
    /** Satırın kaçıncı seti (0'dan; fazladan setlerde planın arkasından sürer). Isınmada ısınmanın sırası. */
    setIndex: v.optional(int(0, SESSION_LIMITS.setsPerEntry)),
    /** Vücut ağırlığında isteğe bağlı ek yük; süreli harekette aletin ağırlığı. */
    kg: v.optional(kg),
    reps: v.optional(int(0, SESSION_LIMITS.reps)),
    seconds: v.optional(int(0, SESSION_LIMITS.seconds)),
    /** Yoksa motor `good` sayar. `fail` yalnız eski kayıtlarda. */
    effort: v.optional(v.picklist(EFFORTS)),
    /** O günkü hedef (aralık, yük yüzdesi, AMRAP): motor kaydı bununla değerlendirir. */
    target: v.optional(setSpecSchema),
    topWeightKg: v.optional(kg),
    plannedSetCount: v.optional(int(0, SESSION_LIMITS.plannedSets)),
    plannedKg: v.optional(kg),
    /** "Hedefin çok üzerindesin" onaylandı: PT'ye bildirilir. */
    overload: v.optional(v.boolean()),
    /** Plandan fazla ("+ Set ekle"): karara girmez (SPEC §7.1). */
    extra: v.optional(v.boolean()),
    /** Setin yapıldığı an; düzeltmede değişmez. */
    at: timestamp,
    /** Son düzeltme; birleştirme `editedAt ?? at` ile. */
    editedAt: v.optional(timestamp),
    by: v.optional(writerIdSchema),
  }),
  v.check((set) => (set.reps === undefined) !== (set.seconds === undefined), 'Sette ya tekrar ya süre olmalı.'),
);
export type SessionSet = v.InferOutput<typeof sessionSetSchema>;

export const sessionEntrySchema = v.object({
  id: entryIdSchema,
  /** Programdaki satır; plan dışı eklenen ya da muadille değiştirilen harekette yok. */
  rowId: v.optional(rowIdSchema),
  blockId: v.optional(blockIdSchema),
  exerciseId: slugSchema,
  /** Adın o günkü hâli: kütüphaneden silinse de geçmiş okunur. */
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(SESSION_LIMITS.title)),
  /** SPEC §7.3: ağırlık geçmişi cihaza göre. */
  deviceId: v.optional(slugSchema),
  status: v.picklist(ENTRY_STATUSES),
  /** `moved`: sona alındı (hâlâ yapılacak); `status: skipped` ile Geçilenler'de. */
  skip: v.optional(v.object({ reason: v.optional(v.picklist(SKIP_REASONS)), moved: v.boolean() })),
  /** "Değiştir" ile gelen muadil: yerini aldığı satır. */
  swappedFrom: v.optional(rowIdSchema),
  /** "Hareket ekle": yalnız bu seansa. */
  added: v.optional(v.boolean()),
  /** Eklenen harekette planlanan çalışma seti (plan satırı olmadığı için). */
  plannedSets: v.optional(int(1, SESSION_LIMITS.plannedSets)),
  /** O günkü planın özeti: üst ağırlık, gerekçe, aşama. */
  plan: v.optional(v.object({ topWeightKg: v.optional(kg), reason: v.optional(codeSchema), stage: v.optional(codeSchema) })),
  setupNote: v.optional(v.pipe(v.string(), v.maxLength(SESSION_LIMITS.setupNote))),
  /** Danışan açıkça "Bir defalık" dedi: motor bu hareketi o seansta yok sayar (§6.2). */
  oneOff: v.optional(v.boolean()),
  /** Plandan hafif, programa yazılmadı (§5.5). */
  lighter: v.optional(v.boolean()),
  /** Hareket düzeyindeki alanların (setler hariç) son yazımı. */
  updatedAt: timestamp,
  by: v.optional(writerIdSchema),
  sets: v.pipe(v.array(sessionSetSchema), v.maxLength(SESSION_LIMITS.setsPerEntry)),
});
export type SessionEntry = v.InferOutput<typeof sessionEntrySchema>;

export const waterTapSchema = v.object({ id: tapIdSchema, d: v.picklist([1, -1] as const), at: timestamp });
export type WaterTap = v.InferOutput<typeof waterTapSchema>;

/**
 * PT'ye bildirim. Yarım antrenmanda (`unfinished`) yapılan ve planlanan çalışma seti de yazılır ("Gün A
 * yarım bırakıldı (12/17 set)"); öteki türlerin ayrıntısı belgenin kendisinden türetilir (`indexRowOf`).
 */
export const sessionNoticeSchema = v.object({
  kind: v.picklist(NOTICE_KINDS),
  at: timestamp,
  done: v.optional(int(0, SESSION_LIMITS.entries * SESSION_LIMITS.setsPerEntry)),
  planned: v.optional(int(0, SESSION_LIMITS.entries * SESSION_LIMITS.setsPerEntry)),
});
export type SessionNotice = v.InferOutput<typeof sessionNoticeSchema>;

export const sessionEffortSchema = v.object({
  /** CR-10, bitişten ~10 dk sonra. */
  sessionRpe: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10))),
  durationMin: v.optional(int(1, 600)),
  updatedAt: timestamp,
  by: v.optional(writerIdSchema),
});
export type SessionEffortRecord = v.InferOutput<typeof sessionEffortSchema>;

export const sessionProgramSchema = v.object({
  revision: int(1, Number.MAX_SAFE_INTEGER),
  phaseId: v.optional(id(PHASE_ID_PATTERN, 'Evre kimliği geçersiz.')),
  dayId: id(DAY_ID_PATTERN, 'Gün kimliği geçersiz.'),
  dayName: v.pipe(v.string(), v.minLength(1), v.maxLength(SESSION_LIMITS.dayName)),
  /** Sıradaki gündü; `dayId`'den farklıysa danışan başka gün seçti (`other_day`). */
  plannedDayId: v.optional(id(DAY_ID_PATTERN, 'Gün kimliği geçersiz.')),
  /** Sıradaki günün o günkü adı: PT'nin bildirimi ("Gün B yerine Gün C yapıldı"). */
  plannedDayName: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(SESSION_LIMITS.dayName))),
});
export type SessionProgram = v.InferOutput<typeof sessionProgramSchema>;

function uniqueIds(doc: { entries: readonly { id: string; sets: readonly { id: string }[] }[] }): boolean {
  const entries = new Set<string>();
  const sets = new Set<string>();
  for (const entry of doc.entries) {
    if (entries.has(entry.id)) return false;
    entries.add(entry.id);
    for (const set of entry.sets) {
      if (sets.has(set.id)) return false;
      sets.add(set.id);
    }
  }
  return true;
}

/** Etkin ya da bitmiş antrenman. */
export const sessionDocSchema = v.pipe(
  v.object({
    version: v.literal(1),
    id: sessionIdSchema,
    status: v.picklist(['active', 'finished'] as const),
    /** Başlangıç günü (uygulamanın saat diliminde); sunucu ilk yazımda koyar. */
    date: isoDate,
    startedAt: timestamp,
    /** Yalnız bitmişte. */
    finishedAt: v.optional(timestamp),
    program: v.optional(sessionProgramSchema),
    /** Bitişte rotasyon: sıradaki güne geç ya da aynı gün sırada kalsın. */
    rotation: v.optional(register(v.picklist(ROTATION_CHOICES))),
    /** Nötr hafifletme işareti; nedeni `health.json`'da. */
    adjust: v.optional(v.literal('lighter')),
    /** Son yazan cihaz; değişiklik karşılaştırmasına girmez. */
    writer: writerIdSchema,
    /** Hareketlerin yapılış sırası ("sona al", "şimdi yap"). */
    order: v.optional(register(v.pipe(v.array(entryIdSchema), v.maxLength(SESSION_LIMITS.entries)))),
    entries: v.pipe(v.array(sessionEntrySchema), v.maxLength(SESSION_LIMITS.entries)),
    deletedSetIds: v.pipe(v.array(setIdSchema), v.maxLength(SESSION_LIMITS.deletedSetIds)),
    deletedEntryIds: v.pipe(v.array(entryIdSchema), v.maxLength(SESSION_LIMITS.deletedEntryIds)),
    waterTaps: v.pipe(v.array(waterTapSchema), v.maxLength(SESSION_LIMITS.waterTaps)),
    notices: v.pipe(v.array(sessionNoticeSchema), v.maxLength(SESSION_LIMITS.notices)),
    effort: v.optional(sessionEffortSchema),
  }),
  v.check((doc) => (doc.status === 'finished') === (doc.finishedAt !== undefined), 'Bitiş anı yalnız bitmiş antrenmanda olur.'),
  v.check((doc) => uniqueIds(doc), 'Aynı kimlik iki kez kullanılmış.'),
);
export type SessionDoc = v.InferOutput<typeof sessionDocSchema>;

/** Silinmiş antrenmanın iz dosyası: değer yok. Sonraki yazmalar 410 alır, dosya dirilemez. */
export const sessionTombstoneSchema = v.object({
  version: v.literal(1),
  id: sessionIdSchema,
  status: v.literal('deleted'),
  deletedAt: timestamp,
});
export type SessionTombstone = v.InferOutput<typeof sessionTombstoneSchema>;

export type StoredSession = SessionDoc | SessionTombstone;

export function isTombstone(session: StoredSession): session is SessionTombstone {
  return session.status === 'deleted';
}

/** Depodaki dosya: iz dosyası ya da antrenman. Şemaya uymuyorsa null (çağıran bozuk sayar). */
export function parseStoredSession(raw: unknown): StoredSession | null {
  const status = typeof raw === 'object' && raw !== null && 'status' in raw ? raw.status : undefined;
  const parsed = status === 'deleted' ? v.safeParse(sessionTombstoneSchema, raw) : v.safeParse(sessionDocSchema, raw);
  return parsed.success ? parsed.output : null;
}

/* --- sessions-index.json --- */

export const sessionIndexExerciseSchema = v.object({
  exerciseId: slugSchema,
  rowId: v.optional(rowIdSchema),
  deviceId: v.optional(slugSchema),
  /** Tam yük çalışma setlerinin en ağırı (ağırlıksızda yok). */
  topKg: v.optional(kg),
  /** Çalışma seti sayısı. */
  sets: int(0, SESSION_LIMITS.setsPerEntry),
  /** En az bir tam yük çalışma seti var (deneyim sayımı, §5.2). */
  full: v.boolean(),
  reason: v.optional(codeSchema),
  stage: v.optional(codeSchema),
  oneOff: v.optional(v.literal(true)),
  lighter: v.optional(v.literal(true)),
});
export type SessionIndexExercise = v.InferOutput<typeof sessionIndexExerciseSchema>;

export const sessionIndexRowSchema = v.object({
  id: sessionIdSchema,
  /** Dosyanın blob `sha`'sı: onarım bununla karşılaştırır. */
  sha: v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/)),
  path: v.string(),
  date: isoDate,
  startedAt: v.optional(timestamp),
  /** Yoksa antrenman hâlâ etkin (yarım). */
  finishedAt: v.optional(timestamp),
  dayId: v.optional(id(DAY_ID_PATTERN, 'Gün kimliği geçersiz.')),
  dayName: v.optional(v.pipe(v.string(), v.maxLength(SESSION_LIMITS.dayName))),
  otherDay: v.boolean(),
  unfinished: v.boolean(),
  durationMin: v.optional(int(0, 24 * 60)),
  volumeKg: v.pipe(v.number(), v.minValue(0)),
  sets: int(0, SESSION_LIMITS.entries * SESSION_LIMITS.setsPerEntry),
  /** Rekor sayısı (özet hesabı gelince; §2.8). */
  prs: v.optional(int(0, 1000)),
  water: int(0, SESSION_LIMITS.waterTaps),
  exercises: v.array(sessionIndexExerciseSchema),
  notices: v.array(v.picklist(NOTICE_KINDS)),
  /** Başka gün seçildiyse sıradaki günün adı (bildirim metni). */
  plannedDayName: v.optional(v.pipe(v.string(), v.maxLength(SESSION_LIMITS.dayName))),
  /** Yarım antrenmanda yapılan ve planlanan çalışma seti (bildirim metni). */
  progress: v.optional(
    v.object({ done: int(0, SESSION_LIMITS.entries * SESSION_LIMITS.setsPerEntry), planned: int(0, SESSION_LIMITS.entries * SESSION_LIMITS.setsPerEntry) }),
  ),
  /** Onaylanmış aşırı yük: hareket başına en ağır set ve planın ağırlığı ("Bench Press 85 kg (hedef 62,5)"). */
  overloads: v.optional(
    v.pipe(
      v.array(v.object({ title: v.pipe(v.string(), v.maxLength(SESSION_LIMITS.title)), kg, plannedKg: v.optional(kg) })),
      v.maxLength(SESSION_LIMITS.entries),
    ),
  ),
});
export type SessionIndexRow = v.InferOutput<typeof sessionIndexRowSchema>;

export const sessionIndexDeletedSchema = v.object({ id: sessionIdSchema, at: timestamp });
export type SessionIndexDeleted = v.InferOutput<typeof sessionIndexDeletedSchema>;

export type SessionIndex = { version: 1; items: SessionIndexRow[]; deleted: SessionIndexDeleted[] };

export function emptySessionIndex(): SessionIndex {
  return { version: 1, items: [], deleted: [] };
}

/**
 * Index türetilmiş veridir: satır satır okunur, uymayan satır düşer (dosyasından yeniden kurulur,
 * `session-index.ts`). Dosyanın kendisi okunamıyorsa boş index: bütün satırlar dosyalardan gelir.
 */
export function parseSessionIndex(raw: unknown): { index: SessionIndex; dropped: number } {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(record.items) ? record.items : [];
  const deletedRows = Array.isArray(record.deleted) ? record.deleted : [];
  const items: SessionIndexRow[] = [];
  const deleted: SessionIndexDeleted[] = [];
  let dropped = 0;
  for (const row of rows) {
    const parsed = v.safeParse(sessionIndexRowSchema, row);
    if (parsed.success) items.push(parsed.output);
    else dropped += 1;
  }
  for (const row of deletedRows) {
    const parsed = v.safeParse(sessionIndexDeletedSchema, row);
    if (parsed.success) deleted.push(parsed.output);
    else dropped += 1;
  }
  return { index: { version: 1, items, deleted }, dropped };
}

/* --- uçların gövdeleri --- */

/** Bitişte sağlık ayrıntısı: seans dosyasına girmez; onay varsa `health.json`'a (sunucu süzer). */
export const finishHealthSchema = v.object({
  skippedRows: v.optional(
    v.pipe(v.array(v.object({ rowId: rowIdSchema, reason: v.literal('pain') })), v.maxLength(SESSION_LIMITS.entries)),
  ),
  adjustReason: v.optional(v.picklist(['readiness', 'pain'] as const)),
});
export type FinishHealth = v.InferOutput<typeof finishHealthSchema>;

export const finishBodySchema = v.object({
  doc: sessionDocSchema,
  /** Hazır seçilen "Sıradaki antrenman" satırı; yoksa planın yarısı yapıldıysa `advance`. */
  rotation: v.optional(v.picklist(ROTATION_CHOICES)),
  health: v.optional(finishHealthSchema),
});
export type FinishBody = v.InferOutput<typeof finishBodySchema>;

/** Geçmişte düzeltme (§4.5, §4.7): silme, seans zorluğu, su, başka cihazda bitirilen seansa set ekleme. */
export const patchBodySchema = v.pipe(
  v.object({
    writer: writerIdSchema,
    deleteSetIds: v.optional(v.pipe(v.array(setIdSchema), v.maxLength(SESSION_LIMITS.setsPerEntry * 5))),
    deleteEntryIds: v.optional(v.pipe(v.array(entryIdSchema), v.maxLength(SESSION_LIMITS.entries))),
    /** Telefondaki hareketler ve setleri: setler kimlikle eklenir, silinenler geri gelmez. */
    addSets: v.optional(v.pipe(v.array(sessionEntrySchema), v.maxLength(SESSION_LIMITS.entries))),
    effort: v.optional(
      v.object({ sessionRpe: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10))), durationMin: v.optional(int(1, 600)) }),
    ),
    waterTaps: v.optional(v.pipe(v.array(waterTapSchema), v.maxLength(SESSION_LIMITS.waterTaps))),
  }),
  v.check(
    (body) => Boolean(body.deleteSetIds?.length || body.deleteEntryIds?.length || body.addSets?.length || body.effort || body.waterTaps?.length),
    'Değişiklik yok.',
  ),
);
export type PatchBody = v.InferOutput<typeof patchBodySchema>;
