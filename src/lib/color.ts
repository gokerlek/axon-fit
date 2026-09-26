/**
 * Renk yardımcıları — sunucu ve istemci ortak (saf fonksiyonlar).
 *
 * PT kendi ana rengini seçebildiği için hiçbir rengin kontrastı sabit değildir: açık renkte koyu,
 * koyu renkte açık yazı gerekir; açık bir vurgu beyaz zeminde yazı olarak okunmaz. Kararlar WCAG
 * bağıl parlaklığıyla verilir. Vurgudan türeyen token'lar (SPEC §10, `.omc/research/ui-fix/TOKENS.md`):
 *
 * - `--primary-text`: yüzey (arka plan, kart, muted; `bg-primary/15`'e kadar vurgu tonlu hâlleri dahil)
 *   üstünde yazı, ikon, gösterge. Vurgu yetmiyorsa açık temada koyulaştırılır, koyu temada
 *   aydınlatılır: bütün bu yüzeylerde ≥4,5:1.
 * - `--primary-strong`: seçili durum zemini. Komşu yüzey ve kenarlıklardan ≥3:1; üstündeki yazı
 *   `--primary-strong-foreground` ≥4,5:1.
 *
 * Ton ve doygunluk korunur, yalnız OKLCH açıklığı kaydırılır (sRGB dışına taşan doygunluk kırpılır).
 */

export type Theme = 'light' | 'dark';
type Rgb = readonly [number, number, number];
/** OKLCH: açıklık 0–1, doygunluk, ton (derece). */
export type Oklch = readonly [number, number, number];

// ─── sRGB ──────────────────────────────────────────────────────────────────

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** "#RRGGBB" → sRGB kanalları (0–1). */
function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(clean.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** WCAG 2.x bağıl parlaklık (eşik 0,03928, WCAG'in yazdığı gibi). */
function wcagChannel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(wcagChannel) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Yarı saydam rengin zemin üstündeki görünüşü: tarayıcılar gibi sRGB kanallarında karıştırır.
 * `bg-primary/15` ya da `ring-ring/50` gibi saydamlıklar böyle görünür.
 */
export function composite(top: string, bottom: string, alpha: number): string {
  const t = hexToRgb(top);
  const b = hexToRgb(bottom);
  return rgbToHex(t.map((c, i) => alpha * c + (1 - alpha) * (b[i] ?? 0)) as unknown as Rgb);
}

// ─── OKLab / OKLCH (Björn Ottosson) ───────────────────────────────────────

function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklchToLinear([l, c, h]: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  return oklabToLinear([l, c * Math.cos(rad), c * Math.sin(rad)]);
}

const inGamut = (rgb: Rgb) => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

export function hexToOklch(hex: string): Oklch {
  const [L, a, b] = linearToOklab(hexToRgb(hex).map(toLinear) as unknown as Rgb);
  const c = Math.hypot(a, b);
  // Gri renkte ton tanımsız: 0 kabul edilir (doygunluk zaten 0).
  const h = c < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [L, c, h];
}

/**
 * OKLCH → "#RRGGBB".
 * - `clip` (varsayılan): kanal kanal kırpar; tarayıcının sRGB ekranda `oklch()` token'larını çizdiği gibi.
 * - `map`: sRGB dışındaysa ton ve açıklık korunup doygunluk düşürülür; türetilen renkler böyle üretilir.
 */
export function oklchToHex(color: Oklch, mode: 'clip' | 'map' = 'clip'): string {
  const [l, c, h] = color;
  const lightness = Math.min(1, Math.max(0, l));
  let rgb = oklchToLinear([lightness, c, h]);
  if (mode === 'map' && !inGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear([lightness, mid, h]))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear([lightness, lo, h]);
  }
  return rgbToHex(rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as unknown as Rgb);
}

/** CSS `color-mix(in oklab, a weight, b)` karşılığı (ikisi de opak). */
export function mixOklab(a: string, b: string, weight: number): string {
  const [la, aa, ba] = linearToOklab(hexToRgb(a).map(toLinear) as unknown as Rgb);
  const [lb, ab, bb] = linearToOklab(hexToRgb(b).map(toLinear) as unknown as Rgb);
  const mix: Rgb = [la * weight + lb * (1 - weight), aa * weight + ab * (1 - weight), ba * weight + bb * (1 - weight)];
  return rgbToHex(oklabToLinear(mix).map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as unknown as Rgb);
}

// ─── Tema ────────────────────────────────────────────────────────────────

/**
 * `globals.css`'teki token'ların oklch değerleri (`color.test.ts` iki dosyanın eşleştiğini denetler).
 * Koyu temadaki kenarlık ve kutu çerçevesi yarı saydam beyazdır; kart üstündeki görünüşü kullanılır.
 */
export const THEME_TOKENS = {
  light: {
    background: [1, 0, 0],
    foreground: [0.145, 0, 0],
    card: [1, 0, 0],
    popover: [1, 0, 0],
    primary: [0.841, 0.238, 128.85],
    primaryForeground: [0.39, 0.101, 131.063],
    secondary: [0.967, 0.001, 286.375],
    muted: [0.97, 0, 0],
    accent: [0.97, 0, 0],
    border: [0.922, 0, 0],
    input: [0.922, 0, 0],
  },
  dark: {
    background: [0.145, 0, 0],
    foreground: [0.985, 0, 0],
    card: [0.205, 0, 0],
    popover: [0.205, 0, 0],
    primary: [0.768, 0.233, 130.85],
    primaryForeground: [0.39, 0.101, 131.063],
    secondary: [0.274, 0.006, 286.033],
    muted: [0.269, 0, 0],
    accent: [0.269, 0, 0],
    /** oklch(1 0 0 / 10%) ve / 15%: saydamlık ayrıca uygulanır. */
    border: [1, 0, 0],
    input: [1, 0, 0],
  },
} as const satisfies Record<Theme, Record<string, Oklch>>;

const DARK_ALPHA = { border: 0.1, input: 0.15 } as const;

export function tokenHex(theme: Theme, name: keyof (typeof THEME_TOKENS)['light']): string {
  return oklchToHex(THEME_TOKENS[theme][name]);
}

/** Yazının durabileceği yüzeyler: arka plan, kart, açılır menü, muted/accent (üstüne gelme), secondary. */
export function textSurfaces(theme: Theme): string[] {
  return (['background', 'card', 'popover', 'muted', 'accent', 'secondary'] as const).map((name) => tokenHex(theme, name));
}

/** Vurgu tonlu zeminlerin en koyusu (`bg-primary/15`, ör. dock'ta etkin öğe); `/5`–`/10` daha hafiftir. */
export const ACCENT_TINT = 0.15;

/** Yüzeylerin `bg-primary/15` ile boyanmış hâli: `--primary-text` bunların üstünde de okunur. */
export function accentTints(accent: string, theme: Theme): string[] {
  return textSurfaces(theme).map((surface) => composite(accent, surface, ACCENT_TINT));
}

/**
 * Seçili durum zemininin komşuları: yüzeyler + kenarlık ve kutu çerçevesi. Koyu temada çerçeveler
 * kartın üstündeki yarı saydam beyazdır (en açık komşu).
 */
export function adjacentSurfaces(theme: Theme): string[] {
  if (theme === 'light') return [...textSurfaces(theme), tokenHex(theme, 'border'), tokenHex(theme, 'input')];
  const card = tokenHex(theme, 'card');
  return [
    ...textSurfaces(theme),
    composite('#ffffff', card, DARK_ALPHA.border),
    composite('#ffffff', card, DARK_ALPHA.input),
    composite('#ffffff', tokenHex(theme, 'background'), DARK_ALPHA.input),
  ];
}

// ─── Türetme ─────────────────────────────────────────────────────────────

/** Vurgunun üstündeki yazı adayları (readableOn ile aynı). */
const ON_DARK = '#fafafa';
const ON_LIGHT = '#0a0a0a';

export const TEXT_MIN = 4.5;
export const NON_TEXT_MIN = 3;

export function minContrast(color: string, surfaces: readonly string[]): number {
  return Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));
}

/**
 * Ana rengin üzerine yazılacak yazı rengi: hangisi daha okunaklıysa. Orta tonlarda (bağıl parlaklık
 * ≈0,18) yumuşak siyah/beyaz 4,5:1'e yetmez; o zaman tam siyah/beyaz (her renkte ≥4,58:1).
 */
export function readableOn(hex: string): string {
  const soft = contrastRatio(hex, ON_LIGHT) >= contrastRatio(hex, ON_DARK) ? ON_LIGHT : ON_DARK;
  if (contrastRatio(hex, soft) >= TEXT_MIN) return soft;
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff';
}

/**
 * Rengi, koşul sağlanana kadar açık temada koyulaştırır, koyu temada aydınlatır (OKLCH açıklığı;
 * ton korunur). Renk zaten uygunsa olduğu gibi döner. Uç (siyah/beyaz) her zaman uygundur:
 * ikili arama hep uygun uçta durur, sonuç koşulu mutlaka sağlar.
 */
export function shiftUntil(hex: string, theme: Theme, ok: (candidate: string) => boolean): string {
  const color = hex.toLowerCase();
  if (ok(color)) return color;
  const [l, c, h] = hexToOklch(color);
  let bad = l;
  let good = theme === 'light' ? 0 : 1;
  let best = theme === 'light' ? '#000000' : '#ffffff';
  for (let i = 0; i < 32; i++) {
    const mid = (bad + good) / 2;
    const candidate = oklchToHex([mid, c, h], 'map');
    if (ok(candidate)) {
      good = mid;
      best = candidate;
    } else {
      bad = mid;
    }
  }
  return best;
}

export type BrandShade = {
  /** `--primary-text`: yüzey üstünde yazı/ikon/gösterge. */
  text: string;
  /** `--primary-strong`: seçili durum zemini. */
  strong: string;
  /** `--primary-strong-foreground`. */
  strongForeground: string;
};

const cache = new Map<string, BrandShade>();

/** Bir temada vurgudan türeyen tonlar. */
export function brandShade(accent: string, theme: Theme): BrandShade {
  const key = `${accent.toLowerCase()}:${theme}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const surfaces = [...textSurfaces(theme), ...accentTints(accent, theme)];
  const text = shiftUntil(accent, theme, (c) => minContrast(c, surfaces) >= TEXT_MIN);
  const adjacent = adjacentSurfaces(theme);
  const strong = shiftUntil(
    accent,
    theme,
    (c) => minContrast(c, adjacent) >= NON_TEXT_MIN && contrastRatio(c, readableOn(c)) >= TEXT_MIN,
  );
  const shade = { text, strong, strongForeground: readableOn(strong) };
  cache.set(key, shade);
  return shade;
}

/** Tema varsayılanı (PT renk seçmediyse): globals.css'teki `--primary` iki temada farklıdır. */
export function defaultBrandShade(theme: Theme): BrandShade {
  return brandShade(tokenHex(theme, 'primary'), theme);
}

const BRAND_VARS = [
  '--brand',
  '--brand-foreground',
  '--brand-text-light',
  '--brand-text-dark',
  '--brand-strong-light',
  '--brand-strong-dark',
  '--brand-strong-foreground-light',
  '--brand-strong-foreground-dark',
] as const;

/**
 * PT'nin vurgusu için satır içi CSS değişkenleri (`<html>` ve ayarlardaki önizleme kutusu).
 * `globals.css` bunları `--primary`, `--primary-text`… token'larına temaya göre dağıtır. `null`
 * (temanın kendi rengi) bütün değişkenleri `initial` yapar: yukarıdan gelen PT rengi düşer,
 * token'lar `globals.css`'teki varsayılana döner. Öğede `data-brand` olmalı (kök `<html>` hariç).
 */
export function brandStyle(accent: string | null): Record<string, string> {
  if (!accent) {
    return Object.fromEntries(BRAND_VARS.map((name) => [name, 'initial']));
  }
  const light = brandShade(accent, 'light');
  const dark = brandShade(accent, 'dark');
  return {
    '--brand': accent,
    '--brand-foreground': readableOn(accent),
    '--brand-text-light': light.text,
    '--brand-text-dark': dark.text,
    '--brand-strong-light': light.strong,
    '--brand-strong-dark': dark.strong,
    '--brand-strong-foreground-light': light.strongForeground,
    '--brand-strong-foreground-dark': dark.strongForeground,
  };
}
