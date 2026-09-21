'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MUSCLE_LABELS } from '@/lib/schemas/exercise';
import type { BodyMuscle, MuscleIntensity } from '@/lib/muscles';
import { cn } from '@/lib/utils';
import { BACK_PATHS, FRONT_PATHS, VIEWBOX, type MusclePath } from './paths';
import { muscleOfPath } from './regions';

export type MuscleSide = 'front' | 'back';

const SIDES: readonly MuscleSide[] = ['front', 'back'];
const SIDE_LABELS: Record<MuscleSide, string> = { front: 'Ön', back: 'Arka' };

type SideShape = {
  /** Grubu olmayan parçalar (baş, el, ayak…): yalnız siluet. */
  neutral: MusclePath[];
  /** Kas → o görünümdeki parçaları (sol ve sağ birlikte). */
  groups: [BodyMuscle, MusclePath[]][];
};

function shape(paths: readonly MusclePath[]): SideShape {
  const neutral: MusclePath[] = [];
  const groups = new Map<BodyMuscle, MusclePath[]>();
  for (const path of paths) {
    const muscle = muscleOfPath(path.id);
    if (!muscle) neutral.push(path);
    else groups.set(muscle, [...(groups.get(muscle) ?? []), path]);
  }
  return { neutral, groups: [...groups] };
}

// Parçalar modül yüklenirken bir kez gruplanır.
const SHAPES: Record<MuscleSide, SideShape> = { front: shape(FRONT_PATHS), back: shape(BACK_PATHS) };

/** Yoğunluk 0–1 → dolgu saydamlığı. En düşük yoğunluk da boş kastan ayırt edilsin diye 0.3'ten başlar. */
function fillOpacity(level: number) {
  return 0.3 + 0.7 * Math.min(1, level);
}

type MuscleMapProps = {
  /** Kasın ne kadar çalıştığı (0–1). Ör. hedef 1, yardımcı 0.3, ya da haftalık set yükü. */
  intensity?: MuscleIntensity;
  /** Seçili kaslar (süzgeç). Tam renkle çizilir. */
  selected?: readonly BodyMuscle[];
  /** Verilirse kaslar tıklanabilir olur (klavyeyle de). */
  onToggle?: (muscle: BodyMuscle) => void;
  /** Kas başına sayı; alt satırda yazar. Sayısı 0 olan kas soluk ve tıklanamaz. */
  counts?: Partial<Record<BodyMuscle, number>>;
  /** Üstüne gelinen kasın alt satırdaki açıklaması. Varsayılan: ad (+ sayı). */
  describe?: (muscle: BodyMuscle) => React.ReactNode;
  /** Hiçbir kasın üstünde değilken alt satır. */
  hint?: React.ReactNode;
  /** `flip`: tek gövde, ön/arka çevrilir. `split`: ön ve arka yan yana. */
  layout?: 'flip' | 'split';
  /** Görünen yüz (kontrollü). Verilmezse bileşen kendi tutar. */
  side?: MuscleSide;
  defaultSide?: MuscleSide;
  onSideChange?: (side: MuscleSide) => void;
  /** Gövde çiziminin yüksekliği; genişlik orana göre çıkar. Ör. `h-64 lg:h-96`. */
  bodyClassName?: string;
  /** Ekran okuyucu için haritanın adı. */
  label: string;
  className?: string;
};

/**
 * Kas haritası: ön ve arka gövde üzerinde kaslarımızı (24 kas) gösterir.
 *
 * Veri çekmez; neyin yanacağını tamamen dışarıdan alır. Aynı bileşen egzersiz
 * detayında (çalışan kaslar), listede (süzgeç) ve ileride program kapsamında
 * (yük ısı haritası) kullanılır. Renkler tema tokenlarından: PT'nin vurgu rengi
 * haritaya da yansır.
 */
export function MuscleMap({
  intensity,
  selected = [],
  onToggle,
  counts,
  describe,
  hint,
  layout = 'flip',
  side: sideProp,
  defaultSide = 'front',
  onSideChange,
  bodyClassName = 'h-72',
  label,
  className,
}: MuscleMapProps) {
  const [ownSide, setOwnSide] = useState<MuscleSide>(defaultSide);
  const [hovered, setHovered] = useState<BodyMuscle | null>(null);
  const side = sideProp ?? ownSide;

  function changeSide(next: MuscleSide) {
    setOwnSide(next);
    onSideChange?.(next);
  }

  const describeMuscle =
    describe ??
    ((muscle: BodyMuscle) => (counts ? `${MUSCLE_LABELS[muscle]} · ${counts[muscle] ?? 0} egzersiz` : MUSCLE_LABELS[muscle]));

  const body = (face: MuscleSide) => (
    <Body
      side={face}
      label={layout === 'flip' ? label : `${label} — ${SIDE_LABELS[face]}`}
      intensity={intensity}
      selected={selected}
      counts={counts}
      onToggle={onToggle}
      highlighted={hovered}
      onHighlight={setHovered}
    />
  );

  // Seçim öbür yüzdeyse düğmede nokta çıkar; çevirmeden de görülsün.
  const selectedOn = (face: MuscleSide) =>
    SHAPES[face].groups.some(([muscle]) => selected.includes(muscle));

  return (
    <figure className={cn('flex flex-col items-center gap-3', className)}>
      {layout === 'flip' ? (
        <div className={cn('relative aspect-[35/93] perspective-distant', bodyClassName)}>
          <motion.div
            className="absolute inset-0 transform-3d"
            initial={false}
            animate={{ rotateY: side === 'back' ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 16 }}>
            <div className="absolute inset-0 backface-hidden" inert={side !== 'front'}>
              {body('front')}
            </div>
            <div className="absolute inset-0 rotate-y-180 backface-hidden" inert={side !== 'back'}>
              {body('back')}
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex items-end justify-center gap-6">
          {SIDES.map((face) => (
            <div key={face} className="flex flex-col items-center gap-1.5">
              <div className={cn('aspect-[35/93]', bodyClassName)}>{body(face)}</div>
              <span className="text-xs text-muted-foreground">{SIDE_LABELS[face]}</span>
            </div>
          ))}
        </div>
      )}

      <figcaption className="min-h-5 text-center text-sm text-muted-foreground">
        {hovered ? <span className="text-foreground">{describeMuscle(hovered)}</span> : hint}
      </figcaption>

      {layout === 'flip' ? (
        <ToggleGroup
          variant="outline"
          size="lg"
          spacing={0}
          value={[side]}
          onValueChange={(value) => {
            const next = value[0] as MuscleSide | undefined;
            if (next) changeSide(next);
          }}
          aria-label="Görünüm">
          {SIDES.map((face) => (
            <ToggleGroupItem key={face} value={face} className="px-5">
              {SIDE_LABELS[face]}
              {face !== side && selectedOn(face) ? (
                <>
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                  <span className="sr-only">(seçili kas var)</span>
                </>
              ) : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
    </figure>
  );
}

type BodyProps = {
  side: MuscleSide;
  label: string;
  intensity?: MuscleIntensity;
  selected: readonly BodyMuscle[];
  counts?: Partial<Record<BodyMuscle, number>>;
  onToggle?: (muscle: BodyMuscle) => void;
  highlighted: BodyMuscle | null;
  onHighlight: (muscle: BodyMuscle | null) => void;
};

/** Dokunma toleransı: boşluğa düşen dokunuşta bu yarıçaplarda (px) en yakın kas aranır. */
const TOLERANCE_RADII = [6, 12, 18];
const TOLERANCE_SAMPLES = 12;

/**
 * Dokunulan noktanın çevresinde en çok rastlanan seçilebilir kas.
 * Ekran koordinatıyla çalışır; arka yüzün 3B dönüşü hesabı bozmaz.
 */
function nearestMuscle(x: number, y: number, svg: SVGSVGElement): BodyMuscle | null {
  for (const radius of TOLERANCE_RADII) {
    const hits = new Map<BodyMuscle, number>();
    for (let i = 0; i < TOLERANCE_SAMPLES; i++) {
      const angle = (i / TOLERANCE_SAMPLES) * Math.PI * 2;
      const element = document.elementFromPoint(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
      const group = element?.closest<SVGGElement>('[data-clickable]');
      const muscle = group && svg.contains(group) ? (group.dataset.muscle as BodyMuscle) : null;
      if (muscle) hits.set(muscle, (hits.get(muscle) ?? 0) + 1);
    }
    let best: BodyMuscle | null = null;
    for (const [muscle, count] of hits) if (!best || count > (hits.get(best) ?? 0)) best = muscle;
    if (best) return best;
  }
  return null;
}

/** Tek yüzün SVG'si. Her kas bir `g`; sol ve sağ birlikte yanar. */
function Body({ side, label, intensity, selected, counts, onToggle, highlighted, onHighlight }: BodyProps) {
  const { neutral, groups } = SHAPES[side];
  const interactive = Boolean(onToggle);

  return (
    <svg
      viewBox={VIEWBOX[side]}
      className="size-full overflow-visible stroke-card [-webkit-tap-highlight-color:transparent]"
      strokeWidth={0.12}
      strokeLinejoin="round"
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      onClick={
        interactive
          ? (event) => {
              // Kasın üstüne düşen dokunuşu kasın kendisi karşılar. Boşluğa ya da
              // kas olmayan parçaya (dirsek, omurga…) düşerse en yakın kas seçilir.
              if ((event.target as Element).closest('[data-muscle]')) return;
              const muscle = nearestMuscle(event.clientX, event.clientY, event.currentTarget);
              if (!muscle) return;
              onHighlight(muscle);
              onToggle?.(muscle);
            }
          : undefined
      }>
      <g className="fill-foreground/10" aria-hidden>
        {neutral.map((path) => (
          <path key={path.id} d={path.d} />
        ))}
      </g>

      {groups.map(([muscle, paths]) => {
        const isSelected = selected.includes(muscle);
        const level = isSelected ? 1 : (intensity?.[muscle] ?? 0);
        const disabled = interactive && counts !== undefined && !counts[muscle];
        const clickable = interactive && !disabled;
        const isHighlighted = highlighted === muscle;
        const count = counts?.[muscle];

        return (
          <g
            key={muscle}
            data-muscle={muscle}
            data-clickable={clickable || undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={interactive ? isSelected : undefined}
            aria-disabled={disabled || undefined}
            aria-label={interactive ? `${MUSCLE_LABELS[muscle]}${count === undefined ? '' : `, ${count} egzersiz`}` : undefined}
            className={cn(
              'outline-none transition-[fill,fill-opacity,stroke,stroke-width] duration-200',
              level > 0 ? 'fill-primary' : disabled ? 'fill-foreground/10' : 'fill-foreground/20',
              isHighlighted && level === 0 && !disabled && 'fill-foreground/35',
              isHighlighted && 'stroke-foreground [stroke-width:0.3]',
              clickable && 'cursor-pointer',
            )}
            style={level > 0 ? { fillOpacity: fillOpacity(level) } : undefined}
            onPointerEnter={() => onHighlight(muscle)}
            onPointerLeave={(event) => {
              // Dokunmatikte parmak kalkınca da "leave" gelir; son dokunulan kas alt satırda kalsın.
              if (event.pointerType === 'mouse') onHighlight(null);
            }}
            onFocus={() => onHighlight(muscle)}
            onBlur={() => onHighlight(null)}
            onClick={clickable ? () => onToggle?.(muscle) : undefined}
            onKeyDown={
              clickable
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggle?.(muscle);
                    }
                  }
                : undefined
            }>
            {paths.map((path) => (
              <path key={path.id} d={path.d} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
