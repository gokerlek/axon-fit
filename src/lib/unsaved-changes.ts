import * as v from 'valibot';

/**
 * Kaydedilmemiş değişiklikler (tasarım PT kararı 16): düzenleyicinin yerel taslağı ve sayfadan
 * çıkışı tutan bağlantı süzgeci. Saf mantık; tarayıcı ve depolama erişimi
 * `src/components/block-editor/editor-draft.tsx` ile `src/components/unsaved-changes-guard.tsx`'te.
 *
 * Taslak yalnız bu tarayıcıda durur (localStorage, görüntüleyen başına kolaylık): GitHub'a
 * hiçbir şey gitmez, danışan görmez. Açık Kaydet yine tek yayın yoludur.
 */

/** Bütün taslak anahtarlarının öneki (PT çıkış yapınca hepsi silinir). */
export const DRAFT_PREFIX = 'pulsecoach.draft.';
export const DRAFT_VERSION = 1;

/** Şablon: düzenlemede kimliğiyle, yeni şablonda `new`. */
export function templateDraftKey(id: string | null): string {
  return `${DRAFT_PREFIX}template.${id ?? 'new'}`;
}

/** Program: danışan başına tek anahtar (oluşturma ve düzenleme ortak). */
export function programDraftKey(clientId: string): string {
  return `${DRAFT_PREFIX}program.${clientId}`;
}

/** Taslağın dayandığı sürüm: şablonda dosyanın sha'sı, programda revision; yenide null. */
export type DraftBase = string | number | null;

export const TEMPLATE_DRAFT_BASE = v.nullable(v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/)));
export const PROGRAM_DRAFT_BASE = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)));

export type EditorDraft<TBase extends DraftBase = DraftBase> = {
  version: typeof DRAFT_VERSION;
  base: TBase;
  savedAt: string;
  /** Formun bütün girdisi (`getInput(form)`). */
  input: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isNaNumber = (value: unknown) => typeof value === 'number' && Number.isNaN(value);

/**
 * Taslağı yazılacak metne çevirir. Boş sayı kutusu (`undefined`) ve çözülemeyen giriş (NaN)
 * `null` olur: anahtar kaybolmasın, okurken yine boş kutu olsun.
 */
export function serializeDraft(draft: EditorDraft): string {
  return JSON.stringify(draft, (_key, value: unknown) => (value === undefined || isNaNumber(value) ? null : value));
}

/** `null` → `undefined`, anahtar kalır (formun boş alanı). `__proto__` anahtarı alınmaz. */
function restoreEmpty(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(restoreEmpty);
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) if (key !== '__proto__') result[key] = restoreEmpty(item);
    return result;
  }
  return value;
}

/**
 * Taslak formun girdisi mi: yapı ve türler şemaya uymalı (düzenleyici bozuk veriyle açılmasın).
 * Kural ihlalleri (kısa ad, boş gün, aralık dışı sayı) sayılmaz: yarım kalmış iş bunları
 * taşıyabilir, Kaydet'te form söyler. Boş ya da çözülemeyen sayı kutusu da formun kendi hâlidir.
 */
export function fitsForm(schema: v.GenericSchema, input: unknown): boolean {
  if (!isRecord(input)) return false;
  try {
    const result = v.safeParse(schema, input);
    return (
      result.success ||
      result.issues.every(
        (issue) => issue.kind === 'validation' || (issue.type === 'number' && (issue.input === undefined || isNaNumber(issue.input))),
      )
    );
  } catch {
    return false;
  }
}

/**
 * Depodan okunan taslak (güvenilmez yerel veri): biçim sürümü, dayandığı sürüm, tarih ve
 * formun şeması tutmazsa null (taslak atılır).
 */
export function parseDraft<TBase extends DraftBase>(
  raw: string | null,
  formSchema: v.GenericSchema,
  baseSchema: v.GenericSchema<unknown, TBase>,
): EditorDraft<TBase> | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== DRAFT_VERSION) return null;
  if (typeof data.savedAt !== 'string' || Number.isNaN(Date.parse(data.savedAt))) return null;
  const base = v.safeParse(baseSchema, data.base);
  if (!base.success) return null;
  const input = restoreEmpty(data.input);
  if (!fitsForm(formSchema, input)) return null;
  return { version: DRAFT_VERSION, base: base.output, savedAt: data.savedAt, input };
}

/** Karşılaştırma biçimi: anahtarlar sıralı; boş değerler (undefined, null, NaN) yok sayılır. */
function normalize(value: unknown): unknown {
  if (value === null || value === undefined || isNaNumber(value)) return undefined;
  if (Array.isArray(value)) return value.map((item) => normalize(item) ?? null);
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = key === '__proto__' ? undefined : normalize(value[key]);
      if (item !== undefined) result[key] = item;
    }
    return result;
  }
  return value;
}

/** Taslak yüklenen hâlden farklı mı (aynıysa sunulacak bir şey yok). */
export function draftDiffers(draftInput: unknown, loadedInput: unknown): boolean {
  return JSON.stringify(normalize(draftInput)) !== JSON.stringify(normalize(loadedInput));
}

/**
 * Taslak o arada kaydedilmiş bir sürümün üstüne mi: kayıtta bir sürüm varken taslağınki ondan
 * farklıysa. O zaman taslağa devam edilirse kayıt taslağın sürümüyle gider ve sunucu 412 ile
 * çakışma uyarısını çıkarır. Kayıtta sürüm yoksa (oluşturma) çakışacak bir şey de yoktur.
 */
export function draftConflict(draftBase: DraftBase, currentBase: DraftBase): boolean {
  return currentBase !== null && draftBase !== currentBase;
}

/** Bir bağlantı tıklaması, DOM'dan bağımsız. */
export type LinkClick = {
  /** `<a>`'nın `href` özniteliği; yoksa null (bağlantı değil). */
  href: string | null;
  target: string | null;
  download: boolean;
  /** 0 = sol tuş (klavyede Enter da 0). */
  button: number;
  /** Ctrl/⌘/Shift/Alt basılı: yeni sekme, pencere ya da indirme; tarayıcıya bırakılır. */
  modified: boolean;
  /** Şu anki adres (`location.href`). */
  location: string;
};

/**
 * Tıklama bu sayfadan uygulamanın başka bir sayfasına götürüyorsa gidilecek yol
 * (`/dashboard/…?…#…`), götürmüyorsa null. Yeni sekme (`target`), indirme, değiştirici tuşlu ya
 * da orta tık, `mailto:` gibi şemalar, başka site (tam sayfa geçişi, tarayıcının çıkış uyarısı
 * tutar), yalnız çapa (#) ve aynı adres null'dır; düzenleyicinin içindeki "Yeni sekmede aç" da.
 */
export function leaveHref(click: LinkClick): string | null {
  if (click.href === null || click.button !== 0 || click.modified || click.download) return null;
  if (click.target && click.target !== '_self') return null;
  let here: URL;
  let url: URL;
  try {
    here = new URL(click.location);
    url = new URL(click.href, here);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
