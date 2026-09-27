'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { paletteCss, type Palette } from '@/lib/theme-palette';
import { brandStyle } from '@/lib/color';
import { RADIUS_OPTIONS } from '@/lib/schemas/config';
import type { SetupForm } from '@/lib/schemas/setup';

export function useAppearancePreview(initial: SetupForm, accent: string | null, radius: keyof typeof RADIUS_OPTIONS, palette?: Palette | null) {
  const { theme, setTheme } = useTheme();
  const saved = useRef(initial);
  const previousTheme = useRef<string | null>(null);
  const restoreTheme = useRef(setTheme);

  useEffect(() => {
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(brandStyle(accent))) style.setProperty(key, value);
    style.setProperty('--radius', RADIUS_OPTIONS[radius].value);
  }, [accent, radius]);

  useEffect(() => {
    const sheet = document.getElementById('app-palette');
    if (sheet) sheet.textContent = paletteCss(palette);
  }, [palette]);

  // Kaydetmeden ayrılınca denenen renkler uygulamaya sızmasın.
  useEffect(() => () => {
    const sheet = document.getElementById('app-palette');
    if (sheet) sheet.textContent = paletteCss(saved.current.palette);
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(brandStyle(saved.current.accent))) style.setProperty(key, value);
    style.setProperty('--radius', RADIUS_OPTIONS[saved.current.radius ?? 'subtle'].value);
    if (previousTheme.current !== null) restoreTheme.current(previousTheme.current);
  }, []);

  return {
    previewTheme(next: SetupForm['theme']) {
      previousTheme.current ??= theme ?? 'system';
      setTheme(next);
    },
    commit(values: SetupForm) {
      saved.current = values;
      if (previousTheme.current !== null) previousTheme.current = values.theme;
    },
  };
}
