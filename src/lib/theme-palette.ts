import * as v from 'valibot';
import { readableOn, contrastRatio } from './color.ts';

export const COLOR_GROUPS = [
  { label: 'Yüzeyler ve yazılar', tokens: { background: 'Sayfa zemini', foreground: 'Ana yazı', card: 'Kart zemini', 'card-foreground': 'Kart yazısı', popover: 'Açılır pencere', 'popover-foreground': 'Pencere yazısı', muted: 'Silik zemin', 'muted-foreground': 'İkincil yazı' } },
  { label: 'Butonlar ve seçimler', tokens: { primary: 'Ana renk', 'primary-foreground': 'Buton yazısı', 'primary-text': 'Vurgulu yazı', 'primary-strong': 'Seçili öğe', 'primary-strong-foreground': 'Seçili öğe yazısı', secondary: 'İkincil buton', 'secondary-foreground': 'İkincil buton yazısı', accent: 'Üzerine gelme zemini', 'accent-foreground': 'Üzerine gelme yazısı' } },
  { label: 'Çizgiler ve durumlar', tokens: { border: 'Kenarlık', input: 'Alan kenarlığı', ring: 'Odak halkası', success: 'Başarı', warning: 'Uyarı', destructive: 'Hata', 'destructive-text': 'Hata yazısı' } },
  { label: 'Grafikler', tokens: { 'chart-1': 'Grafik 1', 'chart-2': 'Grafik 2', 'chart-3': 'Grafik 3', 'chart-4': 'Grafik 4', 'chart-5': 'Grafik 5' } },
  { label: 'Menü', tokens: { sidebar: 'Menü zemini', 'sidebar-foreground': 'Menü yazısı', 'sidebar-primary': 'Menü ana rengi', 'sidebar-primary-foreground': 'Menü ana renk yazısı', 'sidebar-accent': 'Menü seçimi', 'sidebar-accent-foreground': 'Menü seçim yazısı', 'sidebar-border': 'Menü kenarlığı', 'sidebar-ring': 'Menü odağı' } },
] as const;
export const TOKEN_KEYS = COLOR_GROUPS.flatMap(g => Object.keys(g.tokens));
const colorsSchema = v.partial(v.object(Object.fromEntries(TOKEN_KEYS.map(key => [key, v.pipe(v.string(), v.regex(/^#[\da-f]{6}$/i, 'Renk #RRGGBB biçiminde olmalı.'))]))));
export const paletteSchema = v.object({ name: v.picklist(['volt', 'ocean', 'forest', 'violet', 'ember', 'slate', 'custom']), base: v.optional(v.picklist(['volt', 'ocean', 'forest', 'violet', 'ember', 'slate'])), light: colorsSchema, dark: colorsSchema });
export type Palette = v.InferOutput<typeof paletteSchema>;
export type ColorMode = 'light' | 'dark';

function colors(dark: boolean, primary: string, background: string, card: string, muted: string): Record<string, string> {
  const fg = dark ? '#f4f6fa' : '#18202c';
  const line = dark ? '#485363' : '#c4ccd5';
  const secondaryText = dark ? '#b6c0ce' : '#515b6a';
  return {
    background, foreground: fg, card, 'card-foreground': fg, popover: card, 'popover-foreground': fg,
    muted, 'muted-foreground': secondaryText, secondary: muted, 'secondary-foreground': fg,
    accent: muted, 'accent-foreground': fg, primary, 'primary-foreground': readableOn(primary),
    'primary-text': primary, 'primary-strong': primary, 'primary-strong-foreground': readableOn(primary),
    border: line, input: line, ring: fg, success: dark ? '#6ee7b7' : '#047857', warning: dark ? '#fcd34d' : '#92400e',
    destructive: dark ? '#fda4af' : '#be123c', 'destructive-text': dark ? '#fda4af' : '#be123c',
    'chart-1': primary, 'chart-2': dark ? '#67e8f9' : '#0e7490', 'chart-3': dark ? '#c4b5fd' : '#7c3aed', 'chart-4': dark ? '#fcd34d' : '#a16207', 'chart-5': dark ? '#fda4af' : '#be123c',
    sidebar: card, 'sidebar-foreground': fg, 'sidebar-primary': primary, 'sidebar-primary-foreground': readableOn(primary), 'sidebar-accent': muted, 'sidebar-accent-foreground': fg, 'sidebar-border': line, 'sidebar-ring': fg,
  };
}
export const THEME_PRESETS: { label: string; description: string; palette: Palette }[] = [
  { label: 'Volt', description: 'Canlı yeşil · Kömür', palette: { name: 'volt', light: colors(false, '#426600', '#fafbf7', '#ffffff', '#edf0e5'), dark: colors(true, '#a3e635', '#141711', '#20261b', '#2b3325') } },
  { label: 'Ocean', description: 'Mavi · Gece laciverti', palette: { name: 'ocean', light: colors(false, '#1d4ed8', '#f3f7fc', '#ffffff', '#e7eef8'), dark: colors(true, '#60a5fa', '#0c1424', '#152238', '#22324a') } },
  { label: 'Forest', description: 'Zümrüt · Orman', palette: { name: 'forest', light: colors(false, '#047857', '#f3f8f5', '#ffffff', '#e3eee8'), dark: colors(true, '#6ee7b7', '#0d1916', '#172b24', '#243b32') } },
  { label: 'Violet', description: 'Mor · Mürekkep', palette: { name: 'violet', light: colors(false, '#6d28d9', '#f8f5fc', '#ffffff', '#eee7f6'), dark: colors(true, '#c4b5fd', '#171221', '#261e35', '#352944') } },
  { label: 'Ember', description: 'Bakır · Sıcak taş', palette: { name: 'ember', light: colors(false, '#9a3412', '#fbf6f0', '#fffdf9', '#f1e7dc'), dark: colors(true, '#fdba74', '#1d1511', '#2d211b', '#403027') } },
  { label: 'Slate', description: 'Gri · Sade kontrast', palette: { name: 'slate', light: colors(false, '#334155', '#f7f8fa', '#ffffff', '#e9edf2'), dark: colors(true, '#cbd5e1', '#13171d', '#20262f', '#303946') } },
];

/** Whitelisted property names and HEX-only values also make server-rendered CSS safe. */
export function paletteCss(palette?: Palette | null): string {
  if (!palette) return '';
  const parsed = v.safeParse(paletteSchema, palette);
  if (!parsed.success) return '';
  return (['light', 'dark'] as const).map(mode => {
    const declarations = TOKEN_KEYS.flatMap(key => parsed.output[mode][key] ? [`--${key}:${parsed.output[mode][key]}`] : []);
    return `html${mode === 'dark' ? '.dark' : ':not(.dark)'}{${declarations.join(';')}}`;
  }).join('\n');
}

export function contrastWarnings(colors: Record<string, string | undefined>): string[] {
  const pairs: [string, string, string][] = [['foreground', 'background', 'Ana yazı'], ['card-foreground', 'card', 'Kart yazısı'], ['popover-foreground', 'popover', 'Pencere yazısı'], ['muted-foreground', 'muted', 'İkincil yazı'], ['primary-foreground', 'primary', 'Buton yazısı'], ['primary-text', 'background', 'Vurgulu yazı'], ['secondary-foreground', 'secondary', 'İkincil buton yazısı'], ['accent-foreground', 'accent', 'Seçim yazısı'], ['sidebar-foreground', 'sidebar', 'Menü yazısı']];
  return pairs.flatMap(([fg, bg, label]) => colors[fg] && colors[bg] && contrastRatio(colors[fg]!, colors[bg]!) < 4.5 ? [label] : []);
}
