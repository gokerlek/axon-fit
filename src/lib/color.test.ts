import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import { appConfigSchema, defaultConfig } from './schemas/config.ts';
import {
  accentTints,
  adjacentSurfaces,
  brandShade,
  brandStyle,
  composite,
  contrastRatio,
  defaultBrandShade,
  hexToOklch,
  minContrast,
  mixOklab,
  oklchToHex,
  readableOn,
  relativeLuminance,
  textSurfaces,
  THEME_TOKENS,
  tokenHex,
  type Oklch,
  type Theme,
} from './color.ts';

/** Hazır palet (src/lib/schemas/setup.ts); `null` = temanın kendi rengi. */
const PRESETS: readonly [string, string | null][] = [
  ['Tema', null],
  ['Nane', '#7DF9C7'],
  ['Gökyüzü', '#38BDF8'],
  ['Lavanta', '#A78BFA'],
  ['Gül', '#FB7185'],
  ['Kehribar', '#FBBF24'],
  ['Turuncu', '#F97316'],
  ['Grafit', '#71717A'],
];
/** Listeden çıkan eski hazır renk; kaydetmiş kurulumlar hâlâ kullanıyor olabilir. */
const LEGACY_KIREC = '#E5E5E5';
const THEMES: readonly Theme[] = ['light', 'dark'];

const accentOf = (hex: string | null, theme: Theme) => hex ?? tokenHex(theme, 'primary');
const shadeOf = (hex: string | null, theme: Theme) => (hex ? brandShade(hex, theme) : defaultBrandShade(theme));
const round = (n: number) => Math.round(n * 100) / 100;

// ─── globals.css okuyucu ─────────────────────────────────────────────────

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Seçicisi tam olarak verilenlerden biri olan blokların bildirimleri (sonraki kazanır). */
function declarations(selectors: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, selector = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.includes(selector.replace(/\s+/g, ' ').trim())) continue;
    for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  }
  return out;
}

const cssTokens: Record<Theme, Record<string, string>> = {
  light: declarations([':root', ':root, [data-brand]']),
  dark: declarations(['.dark', '.dark, .dark [data-brand]']),
};

function parseOklch(value: string): Oklch {
  const match = value.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)/);
  assert.ok(match, `oklch değil: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** `var(--brand-…, #hex)` ya da `var(--brand, oklch(…))` içindeki varsayılan. */
function fallbackOf(value: string): string {
  const match = value.match(/^var\(--[\w-]+, (.+)\)$/);
  assert.ok(match, `var(…, varsayılan) değil: ${value}`);
  return match[1] ?? '';
}

const cssHex = (theme: Theme, name: string) => oklchToHex(parseOklch(cssTokens[theme][name] ?? ''));

// ─── Temel hesaplar ──────────────────────────────────────────────────────

describe('WCAG kontrastı', () => {
  test('bilinen değerler', () => {
    assert.equal(round(contrastRatio('#000000', '#ffffff')), 21);
    assert.equal(round(contrastRatio('#ffffff', '#ffffff')), 1);
    assert.equal(round(contrastRatio('#767676', '#ffffff')), 4.54);
    assert.equal(round(relativeLuminance('#ffffff')), 1);
  });

  test('vurgunun üstündeki yazı okunur olanı seçer', () => {
    assert.equal(readableOn('#9ae600'), '#0a0a0a');
    assert.equal(readableOn('#1e3a8a'), '#fafafa');
  });

  test('saydam katman sRGB kanallarında karışır (tarayıcı gibi)', () => {
    assert.equal(composite('#000000', '#ffffff', 0.5), '#808080');
    assert.equal(composite('#ff0000', '#ffffff', 0), '#ffffff');
  });
});

describe('OKLCH ↔ sRGB', () => {
  test('gidiş-dönüş aynı rengi verir', () => {
    for (const hex of ['#9ae600', '#7df9c7', '#38bdf8', '#a78bfa', '#fb7185', '#fbbf24', '#f97316', '#e5e5e5', '#123456', '#000000', '#ffffff']) {
      assert.equal(oklchToHex(hexToOklch(hex), 'map'), hex);
    }
  });

  test('tema token\'ları beklenen sRGB değerleri', () => {
    assert.equal(tokenHex('light', 'primary'), '#9ae600');
    assert.equal(tokenHex('dark', 'primary'), '#7ccf00');
    assert.equal(tokenHex('light', 'muted'), '#f5f5f5');
    assert.equal(tokenHex('dark', 'card'), '#171717');
  });

  test('sRGB dışı renk "map" ile tonunu koruyarak sığar', () => {
    const [, , hue] = hexToOklch(oklchToHex([0.5, 0.4, 140], 'map'));
    assert.ok(Math.abs(hue - 140) < 2, `ton kaydı: ${hue}`);
  });

  test('color-mix(in oklab) uçları', () => {
    assert.equal(mixOklab('#9ae600', '#ffffff', 1), '#9ae600');
    assert.equal(mixOklab('#9ae600', '#ffffff', 0), '#ffffff');
  });
});

// ─── globals.css ile eşleşme ─────────────────────────────────────────────

describe('globals.css', () => {
  test('color.ts THEME_TOKENS globals.css ile aynı', () => {
    const names: Record<keyof (typeof THEME_TOKENS)['light'], string> = {
      background: '--background',
      foreground: '--foreground',
      card: '--card',
      popover: '--popover',
      primary: '--primary',
      primaryForeground: '--primary-foreground',
      secondary: '--secondary',
      muted: '--muted',
      accent: '--accent',
      border: '--border',
      input: '--input',
    };
    for (const theme of THEMES) {
      for (const [key, name] of Object.entries(names) as [keyof typeof names, string][]) {
        const raw = cssTokens[theme][name] ?? '';
        const value = raw.startsWith('var(') ? fallbackOf(raw) : raw;
        assert.deepEqual(parseOklch(value), [...THEME_TOKENS[theme][key]], `${theme} ${name}`);
      }
    }
  });

  test('varsayılan vurgunun türevleri (PT renk seçmediyse) türetmeyle aynı', () => {
    for (const theme of THEMES) {
      const shade = defaultBrandShade(theme);
      const tokens = cssTokens[theme];
      assert.equal(fallbackOf(tokens['--primary-text'] ?? ''), shade.text, `${theme} --primary-text`);
      assert.equal(fallbackOf(tokens['--primary-strong'] ?? ''), shade.strong, `${theme} --primary-strong`);
      assert.equal(fallbackOf(tokens['--primary-strong-foreground'] ?? ''), shade.strongForeground, `${theme} --primary-strong-foreground`);
    }
  });

  test('varsayılan vurgunun üstündeki yazı (--primary-foreground) ≥4,5:1, iki temada', () => {
    for (const theme of THEMES) {
      const ratio = contrastRatio(tokenHex(theme, 'primary'), tokenHex(theme, 'primaryForeground'));
      assert.ok(ratio >= 4.5, `${theme}: ${round(ratio)}`);
    }
  });

  test('satır içi --brand-* değişkenleri globals.css\'te karşılanıyor', () => {
    const style = brandStyle('#fb7185');
    const used = new Set([...css.matchAll(/var\((--brand[\w-]*)/g)].map((m) => m[1]));
    for (const name of Object.keys(style)) assert.ok(used.has(name), `${name} globals.css'te okunmuyor`);
  });

  test('odak halkası %50 saydamlıkta bile bütün yüzeylerden ≥3:1 (ring-ring/50)', () => {
    for (const theme of THEMES) {
      const ring = cssHex(theme, '--ring');
      for (const surface of textSurfaces(theme)) {
        const ratio = contrastRatio(composite(ring, surface, 0.5), surface);
        assert.ok(ratio >= 3, `${theme} ${ring}/50 üstünde ${surface}: ${round(ratio)}`);
      }
    }
  });

  test('yıkıcı yazı (text-destructive) yüzeylerde ve kendi tonlu zemininde ≥4,5:1', () => {
    // Düğme ve rozet: duruşta açıkta /10, koyuda /20 (her yüzeyde); üstüne gelince /20, /30
    // (düğmenin durduğu arka plan ve kartta).
    const rest: Record<Theme, number> = { light: 0.1, dark: 0.2 };
    const hover: Record<Theme, number> = { light: 0.2, dark: 0.3 };
    for (const theme of THEMES) {
      const text = cssHex(theme, '--destructive-text');
      const fill = cssHex(theme, '--destructive');
      const surfaces = textSurfaces(theme);
      const backgrounds = [
        ...surfaces,
        ...surfaces.map((s) => composite(fill, s, rest[theme])),
        ...[tokenHex(theme, 'background'), tokenHex(theme, 'card')].map((s) => composite(fill, s, hover[theme])),
      ];
      assert.ok(minContrast(text, backgrounds) >= 4.5, `${theme}: ${round(minContrast(text, backgrounds))}`);
    }
  });

  test('yıkıcı zemin (bg-destructive) değişmedi', () => {
    assert.deepEqual(parseOklch(cssTokens.light['--destructive'] ?? ''), [0.577, 0.245, 27.325]);
    assert.deepEqual(parseOklch(cssTokens.dark['--destructive'] ?? ''), [0.704, 0.191, 22.216]);
  });

  test('soluk yazı (muted-foreground) muted ve %10 tonlu zeminlerde ≥4,5:1', () => {
    for (const theme of THEMES) {
      const text = cssHex(theme, '--muted-foreground');
      const surfaces = textSurfaces(theme);
      const accents = PRESETS.map(([, hex]) => accentOf(hex, theme));
      const backgrounds = [
        ...surfaces,
        ...accents.map((accent) => composite(accent, surfaces[0] ?? '', 0.1)),
        composite(cssHex(theme, '--destructive'), surfaces[0] ?? '', 0.1),
      ];
      assert.ok(minContrast(text, backgrounds) >= 4.5, `${theme}: ${round(minContrast(text, backgrounds))}`);
    }
  });

  test('olumlu durum (success) yazı olarak da ≥4,5:1', () => {
    for (const theme of THEMES) {
      const success = cssHex(theme, '--success');
      assert.ok(minContrast(success, textSurfaces(theme)) >= 4.5, `${theme}: ${round(minContrast(success, textSurfaces(theme)))}`);
    }
  });
});

// ─── Vurgu türevleri: varsayılan + 7 hazır renk ─────────────────────────

/**
 * Beklenen türevler ve oranlar. "önce" = vurgunun kendisi yüzey üstünde (en kötü yüzey);
 * "yazı" = --primary-text (yüzeyler + %15 vurgu tonlu hâlleri); "seçili" = --primary-strong
 * komşulardan; "seçili yazı" = --primary-strong-foreground üstünde.
 */
const TABLE: Record<Theme, Record<string, { text: string; strong: string; fg: string; before: number; after: number; strongRatio: number; fgRatio: number }>> = {
  light: {
    Tema: { text: '#4e7700', strong: '#609100', fg: '#0a0a0a', before: 1.4, after: 4.82, strongRatio: 3.01, fgRatio: 5.23 },
    Nane: { text: '#007d5a', strong: '#00956c', fg: '#0a0a0a', before: 1.18, after: 4.68, strongRatio: 3.02, fgRatio: 5.2 },
    Gökyüzü: { text: '#00719a', strong: '#008cbf', fg: '#0a0a0a', before: 1.95, after: 4.99, strongRatio: 3.03, fgRatio: 5.19 },
    Lavanta: { text: '#7354be', strong: '#8e71dd', fg: '#0a0a0a', before: 2.48, after: 5.11, strongRatio: 3, fgRatio: 5.24 },
    Gül: { text: '#ba344f', strong: '#dc556b', fg: '#0a0a0a', before: 2.45, after: 5.17, strongRatio: 3, fgRatio: 5.24 },
    Kehribar: { text: '#896600', strong: '#a77c00', fg: '#0a0a0a', before: 1.52, after: 4.82, strongRatio: 3.02, fgRatio: 5.21 },
    Turuncu: { text: '#aa4a00', strong: '#d85f00', fg: '#0a0a0a', before: 2.55, after: 5.18, strongRatio: 3, fgRatio: 5.24 },
    Grafit: { text: '#63636c', strong: '#71717a', fg: '#fafafa', before: 4.4, after: 5.41, strongRatio: 3.84, fgRatio: 4.63 },
  },
  dark: {
    Tema: { text: '#7ccf00', strong: '#7ccf00', fg: '#0a0a0a', before: 7.65, after: 7.65, strongRatio: 5.84, fgRatio: 10.17 },
    Nane: { text: '#7df9c7', strong: '#7df9c7', fg: '#0a0a0a', before: 11.52, after: 11.52, strongRatio: 8.8, fgRatio: 15.32 },
    Gökyüzü: { text: '#38bdf8', strong: '#38bdf8', fg: '#0a0a0a', before: 6.95, after: 6.95, strongRatio: 5.31, fgRatio: 9.24 },
    Lavanta: { text: '#ab90ff', strong: '#a78bfa', fg: '#0a0a0a', before: 5.47, after: 5.79, strongRatio: 4.18, fgRatio: 7.27 },
    Gül: { text: '#fe7387', strong: '#fb7185', fg: '#0a0a0a', before: 5.53, after: 5.69, strongRatio: 4.23, fgRatio: 7.36 },
    Kehribar: { text: '#fbbf24', strong: '#fbbf24', fg: '#0a0a0a', before: 8.92, after: 8.92, strongRatio: 6.81, fgRatio: 11.86 },
    Turuncu: { text: '#fe781f', strong: '#f97316', fg: '#0a0a0a', before: 5.31, after: 5.62, strongRatio: 4.06, fgRatio: 7.06 },
    Grafit: { text: '#9899a2', strong: '#82838c', fg: '#0a0a0a', before: 3.08, after: 5.26, strongRatio: 3.02, fgRatio: 5.26 },
  },
};

describe('hazır palet', () => {
  test('testteki liste src/lib/schemas/setup.ts ile aynı', () => {
    const source = readFileSync(new URL('./schemas/setup.ts', import.meta.url), 'utf8');
    const listed = [...source.matchAll(/\{ value: (null|'#[0-9A-Fa-f]{6}'), label: '([^']+)' \}/g)].map(
      ([, value = '', label = '']) => [label, value === 'null' ? null : value.slice(1, -1)],
    );
    assert.deepEqual(listed, PRESETS);
  });

  test('düğme zemini (bg-primary): koyu temada her hazır renk, açık temada Grafit yüzeylerden ≥3:1', () => {
    for (const [name, hex] of PRESETS) {
      if (!hex) continue;
      const ratio = minContrast(hex, textSurfaces('dark'));
      assert.ok(ratio >= 3, `${name} koyu: ${round(ratio)}`);
    }
    // Kireç'in yerine gelme sebebi: açık temada da düğme beyazdan ayrılır.
    assert.ok(minContrast('#71717A', textSurfaces('light')) >= 3);
  });

  test('eski "Kireç" kaydı bozulmaz: şema kabul eder, türevleri güvenceleri sağlar', () => {
    const parsed = v.safeParse(appConfigSchema, { ...defaultConfig, accent: LEGACY_KIREC });
    assert.ok(parsed.success);
    assert.equal(parsed.output.accent, LEGACY_KIREC);
    for (const theme of THEMES) {
      const shade = brandShade(LEGACY_KIREC, theme);
      assert.ok(minContrast(shade.text, textSurfaces(theme)) >= 4.5, theme);
      assert.ok(minContrast(shade.strong, adjacentSurfaces(theme)) >= 3, theme);
    }
    const style = brandStyle(LEGACY_KIREC);
    assert.equal(style['--brand'], LEGACY_KIREC);
  });

  test('biçimi bozuk renk şemadan geçmez (config-update.ts o zaman varsayılan ayarla açar)', () => {
    assert.equal(v.safeParse(appConfigSchema, { ...defaultConfig, accent: 'kireç' }).success, false);
  });
});

describe('vurgu türevleri (varsayılan + 7 hazır renk)', () => {
  for (const theme of THEMES) {
    for (const [name, hex] of PRESETS) {
      test(`${theme} · ${name}`, () => {
        const accent = accentOf(hex, theme);
        const shade = shadeOf(hex, theme);
        const expected = TABLE[theme][name];
        assert.ok(expected);
        assert.deepEqual(
          {
            text: shade.text,
            strong: shade.strong,
            fg: shade.strongForeground,
            before: round(minContrast(accent, textSurfaces(theme))),
            after: round(minContrast(shade.text, textSurfaces(theme))),
            strongRatio: round(minContrast(shade.strong, adjacentSurfaces(theme))),
            fgRatio: round(contrastRatio(shade.strong, shade.strongForeground)),
          },
          expected,
        );
      });
    }
  }
});

// ─── Güvenceler: PT hangi rengi seçerse seçsin ──────────────────────────

/** Tekrarlanabilir sözde rastgele renkler (mulberry32). */
function randomColors(count: number, seed = 2026): string[] {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => `#${Math.floor(next() * 0xffffff).toString(16).padStart(6, '0')}`);
}

const ALL_ACCENTS = [...PRESETS.map(([, hex]) => hex).filter((hex): hex is string => hex !== null), LEGACY_KIREC, ...randomColors(300), '#000000', '#ffffff', '#ffff00', '#0000ff'];

describe('her renk için güvenceler', () => {
  for (const theme of THEMES) {
    test(`${theme}: --primary-text yüzeylerde ve %15 vurgu tonlu zeminlerde ≥4,5:1`, () => {
      for (const accent of ALL_ACCENTS) {
        const { text } = brandShade(accent, theme);
        const ratio = minContrast(text, [...textSurfaces(theme), ...accentTints(accent, theme)]);
        assert.ok(ratio >= 4.5, `${accent} → ${text}: ${round(ratio)}`);
      }
    });

    test(`${theme}: --primary-strong komşulardan ≥3:1, üstündeki yazı ≥4,5:1`, () => {
      for (const accent of ALL_ACCENTS) {
        const { strong, strongForeground } = brandShade(accent, theme);
        assert.ok(minContrast(strong, adjacentSurfaces(theme)) >= 3, `${accent} → ${strong}`);
        assert.ok(contrastRatio(strong, strongForeground) >= 4.5, `${accent} → ${strong} / ${strongForeground}`);
      }
    });

    test(`${theme}: vurgu zemin olarak (bg-primary) üstündeki yazıyla ≥4,5:1`, () => {
      for (const accent of ALL_ACCENTS) {
        assert.ok(contrastRatio(accent, readableOn(accent)) >= 4.5, accent);
      }
    });
  }

  test('yeterli renk olduğu gibi kalır; ton korunur', () => {
    // Lacivert açık temada zaten okunur: değişmez.
    assert.equal(brandShade('#1e3a8a', 'light').text, '#1e3a8a');
    // Koyulaştırılan renk tonunu korur.
    const [, , before] = hexToOklch('#fb7185');
    const [, , after] = hexToOklch(brandShade('#fb7185', 'light').text);
    assert.ok(Math.abs(before - after) < 3, `${before} → ${after}`);
  });

  test('brandStyle: renk seçilmediyse bütün değişkenler sıfırlanır', () => {
    const reset = brandStyle(null);
    assert.ok(Object.values(reset).every((value) => value === 'initial'));
    assert.deepEqual(Object.keys(reset).sort(), Object.keys(brandStyle('#38bdf8')).sort());
    assert.equal(brandStyle('#38bdf8')['--brand-text-light'], brandShade('#38bdf8', 'light').text);
  });
});

// ─── Kas haritası ────────────────────────────────────────────────────────

describe('kas haritası renkleri', () => {
  const EMPTY_SHARE: Record<Theme, number> = { light: 0.08, dark: 0.12 };
  const LEVEL_SHARE = { secondary: 0.45, stabilizer: 0.2 };

  test('globals.css karışım oranları testteki ile aynı', () => {
    assert.match(css, /--muscle-empty: color-mix\(in oklab, var\(--foreground\) 8%, var\(--card\)\)/);
    assert.match(css, /--muscle-empty: color-mix\(in oklab, var\(--foreground\) 12%, var\(--card\)\)/);
    assert.match(css, /--muscle-secondary: color-mix\(in oklab, var\(--muscle-target\) 45%, var\(--muscle-empty\)\)/);
    assert.match(css, /--muscle-stabilizer: color-mix\(in oklab, var\(--muscle-target\) 20%, var\(--muscle-empty\)\)/);
  });

  for (const theme of THEMES) {
    test(`${theme}: hedef boş kastan ≥3:1; sıra boş < dengeleyici < yardımcı < hedef`, () => {
      const card = tokenHex(theme, 'card');
      const empty = mixOklab(tokenHex(theme, 'foreground'), card, EMPTY_SHARE[theme]);
      for (const accent of ALL_ACCENTS) {
        const target = brandShade(accent, theme).strong;
        assert.ok(contrastRatio(target, empty) >= 3, `${accent}: hedef ${target} / boş ${empty}`);
        const secondary = mixOklab(target, empty, LEVEL_SHARE.secondary);
        const stabilizer = mixOklab(target, empty, LEVEL_SHARE.stabilizer);
        // Yüzeyden uzaklık (kontrast) sırayla artar.
        const steps = [empty, stabilizer, secondary, target].map((color) => contrastRatio(color, card));
        for (let i = 1; i < steps.length; i++) {
          assert.ok((steps[i] ?? 0) > (steps[i - 1] ?? 0), `${accent}: ${steps.map(round).join(' < ')}`);
        }
      }
    });
  }
});
