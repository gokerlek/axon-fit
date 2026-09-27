import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { appConfigSchema, defaultConfig } from './schemas/config.ts';

test('appearance accepts and preserves separate light/dark overrides', () => {
  const palette = { name: 'custom', light: { background: '#ffffff' }, dark: { background: '#101820' } };
  const parsed = v.parse(appConfigSchema, { ...defaultConfig, palette });
  assert.deepEqual((parsed as unknown as {palette: unknown}).palette, palette);
});
test('appearance rejects CSS injection in colors', () => {
  assert.equal(v.safeParse(appConfigSchema, { ...defaultConfig, palette: { name: 'custom', light: { background: '</style><script>' }, dark: {} } }).success, false);
});

import { THEME_PRESETS, paletteCss, contrastWarnings } from './theme-palette.ts';
import { saveAppearance } from './config-update.ts';
import { setupFormSchema } from './schemas/setup.ts';

test('six presets provide readable light and dark palettes', () => {
  assert.equal(THEME_PRESETS.length, 6);
  for (const preset of THEME_PRESETS) {
    assert.deepEqual(contrastWarnings(preset.palette.light), [], `${preset.label} light`);
    assert.deepEqual(contrastWarnings(preset.palette.dark), [], `${preset.label} dark`);
  }
});
test('CSS scopes both modes and omits legacy overrides', () => {
  assert.equal(paletteCss(null), '');
  const css = paletteCss(THEME_PRESETS[1]!.palette);
  assert.match(css, /html:not\(\.dark\)\{--background:#f3f7fc/);
  assert.match(css, /html.dark\{--background:#0c1424/);
});
test('saving palette survives read validation and preserves logo', async () => {
  const base = {...defaultConfig, setupCompleted: true, logo: 'logo.png'};
  let written: unknown;
  const values = v.parse(setupFormSchema, {...base, palette: THEME_PRESETS[2]!.palette});
  await saveAppearance({read: async () => ({content: base, sha: 'fresh'}), createRepo: async () => ({created: false}), checkRepo: async () => {}, write: async (config, sha) => {assert.equal(sha, 'fresh'); written = config;}, log: () => {}}, values);
  const reloaded = v.parse(appConfigSchema, written);
  assert.deepEqual(reloaded.palette, values.palette);
  assert.equal(reloaded.logo, 'logo.png');
});
