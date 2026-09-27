'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COLOR_GROUPS, THEME_PRESETS, contrastWarnings, type Palette, type ColorMode } from '@/lib/theme-palette';

function ColorField({ token, label, value, onChange }: {token: string; label: string; value: string; onChange: (color: string) => void}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : value;
  const invalid = !/^#[\da-f]{6}$/i.test(shown);
  return <div className="space-y-1.5">
    <label htmlFor={`hex-${token}`} className="text-xs font-medium">{label}</label>
    <div className="flex items-center gap-2">
      <input aria-label={`${label} rengi`} type="color" value={value} onChange={e => { setDraft(e.target.value); onChange(e.target.value); }} className="h-11 w-11 shrink-0 cursor-pointer rounded-md border bg-background p-1" />
      <Input id={`hex-${token}`} value={shown} aria-invalid={invalid} maxLength={7} spellCheck={false} onFocus={() => { setDraft(value); setFocused(true); }} onBlur={() => setFocused(false)} onChange={e => { setDraft(e.target.value); if (/^#[\da-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} className="h-11 min-w-0 font-mono text-xs" />
    </div>
    {invalid && <p className="text-xs text-destructive">#RRGGBB biçiminde yaz. Geçerli son renk korunur.</p>}
  </div>;
}

export function PaletteEditor({ value, onChange, onMode }: {value?: Palette | null; onChange: (value: Palette | null) => void; onMode: (mode: ColorMode) => void}) {
  const { resolvedTheme } = useTheme();
  const mode: ColorMode = resolvedTheme === 'light' ? 'light' : 'dark';
  const [base, setBase] = useState<NonNullable<Palette['base']>>(value?.name && value.name !== 'custom' ? value.name : value?.base ?? 'volt');
  const palette = value ?? THEME_PRESETS[0]!.palette;
  const defaults = THEME_PRESETS.find(p => p.palette.name === base)?.palette ?? THEME_PRESETS[0]!.palette;
  const colors = { ...defaults[mode], ...palette[mode] };
  const warnings = contrastWarnings(colors);
  return <section className="space-y-4" aria-label="Tema paleti">
    <div><h3 className="font-medium">Tema seç</h3><p className="mt-1 text-sm text-muted-foreground">Altı hazır palet. Her biri açık ve koyu görünüm içerir.</p></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {THEME_PRESETS.map(p => <button key={p.palette.name} type="button" aria-pressed={value?.name === p.palette.name} onClick={() => { setBase(p.palette.name as NonNullable<Palette['base']>); onChange(p.palette); }} className="overflow-hidden rounded-lg border p-2 text-left transition-colors hover:border-foreground aria-pressed:ring-2 aria-pressed:ring-primary">
        <span className="mb-2 grid h-14 grid-cols-2 overflow-hidden rounded-md" aria-hidden>
          {(['light', 'dark'] as const).map(m => <span key={m} className="flex flex-col justify-center gap-1.5 px-2" style={{background: p.palette[m].background}}><span className="h-2 w-3/4 rounded" style={{background: p.palette[m].primary}}/><span className="h-3 rounded border" style={{background: p.palette[m].card, borderColor: p.palette[m].border}}/></span>)}
        </span>
        <span className="block text-sm font-medium">{p.label}{value?.name === p.palette.name ? ' ✓' : ''}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{p.description}</span>
      </button>)}
    </div>
    <Button type="button" variant="outline" className="h-11 w-full" aria-pressed={value?.name === 'custom'} onClick={() => onChange({...palette, name: 'custom', base})}>Özel tema{value?.name === 'custom' ? ' ✓' : ''}</Button>
    {!value && <p className="text-xs text-muted-foreground">Mevcut görünüm korunuyor. Bir palet seçerek başlayabilirsin.</p>}
    <details className="rounded-lg border p-3" open={value?.name === 'custom' || undefined}>
      <summary className="cursor-pointer py-1 text-sm font-medium">Gelişmiş renk ayarları</summary>
      <p className="my-3 text-xs text-muted-foreground">Bir rengi değiştirince Özel tema oluşur. Açık ve koyu renkler ayrı saklanır.</p>
      <div className="mb-4 flex gap-2" role="group" aria-label="Düzenlenecek görünüm">
        {(['light', 'dark'] as const).map(m => <Button key={m} type="button" variant={mode === m ? 'default' : 'outline'} className="h-11 flex-1" aria-pressed={mode === m} onClick={() => {onMode(m);}}>{m === 'light' ? 'Açık renkler' : 'Koyu renkler'}</Button>)}
      </div>
      {warnings.length > 0 && <p role="status" className="mb-4 rounded-md border p-3 text-xs" style={{background: "#fffbeb", color: "#78350f", borderColor: "#d97706"}}>Okunabilirlik düşük: {warnings.join(', ')}. Yazı ile zemin arasında daha fazla kontrast seç.</p>}
      <div className="space-y-3">
        {COLOR_GROUPS.map((group, index) => <details key={group.label} open={index === 0} className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{group.label}</summary><div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.entries(group.tokens).map(([token, label]) => <ColorField key={`${mode}-${token}`} token={token} label={label} value={colors[token] ?? '#000000'} onChange={color => onChange({...palette, name: 'custom', base, [mode]: {...colors, [token]: color}})} />)}
        </div></details>)}
      </div>
      <Button type="button" variant="outline" className="mt-4 h-11 w-full" onClick={() => onChange({...palette, name: 'custom', base, [mode]: {...defaults[mode]}})}>{mode === 'light' ? 'Açık' : 'Koyu'} renkleri sıfırla ({THEME_PRESETS.find(p => p.palette.name === base)?.label})</Button>
    </details>
    <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => onChange(null)}>Eski görünümü kullan</Button>
  </section>;
}
