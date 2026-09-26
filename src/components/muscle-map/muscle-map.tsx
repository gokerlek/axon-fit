'use client';

import { useId, useState } from 'react';
import { motion } from 'motion/react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MUSCLE_LABELS } from '@/lib/schemas/exercise';
import { ROLE_INTENSITY, type BodyMuscle, type MuscleIntensity, type MuscleRole } from '@/lib/muscles';
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

/**
 * Renk kodu (SPEC §6: hedef / yardımcı / dengeleyici). Renkler `globals.css`'teki `--muscle-*`
 * token'larından; hedef `--primary-strong` olduğu için PT'nin rengini izler ve boş kastan ≥3:1'dir.
 * Parlaklık sırası iki temada da boş < dengeleyici < yardımcı < hedef. Renk körlüğü için seviye
 * ayrıca desenle çizilir: hedef dolu, yardımcı çizgili, dengeleyici noktalı.
 *
 * `tone="role"`: yoğunluk seviyeye çevrilir (egzersiz detayı, form, süzgeç). Eşikler
 * `ROLE_INTENSITY` değerlerinin ortası: 1 → hedef, 0,45 → yardımcı, 0,1 → dengeleyici.
 * `tone="load"`: sürekli ton (şablon ve program yükü); boş kastan hedef rengine açıklık rampası.
 */
const TIER_PRIMARY = (ROLE_INTENSITY.primary + ROLE_INTENSITY.secondary) / 2;
const TIER_SECONDARY = (ROLE_INTENSITY.secondary + ROLE_INTENSITY.stabilizer) / 2;

export function tierOf(level: number): MuscleRole | null {
  if (level <= 0) return null;
  if (level >= TIER_PRIMARY) return 'primary';
  if (level >= TIER_SECONDARY) return 'secondary';
  return 'stabilizer';
}

export type MuscleTone = 'role' | 'load' | 'status';

/**
 * `tone="status"` (İlerleme'nin Gelişim bölümü): güç gelişiminin kararı. Belirgin gelişme tam ton, gelişme
 * orta ton, sabit gri, gerileme çizgili desen ve kalın kenar; kararı olmayan kas boş. Renk tek başına
 * bilgi taşımaz: gerileme desenle ve kenarla da ayrılır, listede ikon ve sözcükle yazılır.
 */
export type MuscleStatusTone = 'strong' | 'improved' | 'stable' | 'declined';

const STATUS_FILLS: Record<Exclude<MuscleStatusTone, 'declined'>, string> = {
  strong: 'var(--muscle-target)',
  improved: 'var(--muscle-secondary)',
  stable: 'color-mix(in oklab, var(--foreground) 30%, var(--card))',
};

function statusFill(status: MuscleStatusTone, patternId: string): string {
  return status === 'declined' ? `url(#${patternId}-declined)` : STATUS_FILLS[status];
}

/** Desen kimliği `url(#…)` içinde güvenle kullanılabilsin. */
function usePatternId() {
  return `mm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function roleFill(role: MuscleRole, patternId: string) {
  return role === 'primary' ? 'var(--muscle-target)' : `url(#${patternId}-${role})`;
}

/** Yardımcı: hedef renginde çapraz çizgiler; dengeleyici: hedef renginde noktalar (SVG kullanıcı birimi). */
const TILE = 1.5;

function MusclePatterns({ id }: { id: string }) {
  const none = { stroke: 'none' } as const;
  return (
    <defs>
      <pattern id={`${id}-secondary`} patternUnits="userSpaceOnUse" width={TILE} height={TILE} patternTransform="rotate(45)">
        <rect width={TILE} height={TILE} style={{ ...none, fill: 'var(--muscle-secondary)' }} />
        <rect width={TILE * 0.45} height={TILE} style={{ ...none, fill: 'var(--muscle-target)' }} />
      </pattern>
      <pattern id={`${id}-stabilizer`} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
        <rect width={TILE} height={TILE} style={{ ...none, fill: 'var(--muscle-stabilizer)' }} />
        <circle cx={TILE / 2} cy={TILE / 2} r={TILE * 0.26} style={{ ...none, fill: 'var(--muscle-target)' }} />
      </pattern>
      {/* Gerileme: boş kas üstünde koyu çizgiler (ters yönde; yardımcının çizgisiyle karışmasın). */}
      <pattern id={`${id}-declined`} patternUnits="userSpaceOnUse" width={TILE} height={TILE} patternTransform="rotate(-45)">
        <rect width={TILE} height={TILE} style={{ ...none, fill: 'var(--muscle-empty)' }} />
        <rect width={TILE * 0.35} height={TILE} style={{ ...none, fill: 'color-mix(in oklab, var(--foreground) 60%, var(--card))' }} />
      </pattern>
    </defs>
  );
}

/** Açıklama kutusundaki örnek: haritadaki dolgunun ve desenin aynısı. */
export function MuscleSwatch({ role, className }: { role: MuscleRole; className?: string }) {
  const id = usePatternId();
  return (
    <svg viewBox="0 0 3 3" className={cn('size-3.5 shrink-0 rounded-[3px]', className)} aria-hidden>
      <MusclePatterns id={id} />
      <rect width={3} height={3} style={{ fill: roleFill(role, id) }} />
    </svg>
  );
}

/** Gelişim açıklamasındaki örnek: haritadaki dolgunun ve desenin aynısı. */
export function MuscleStatusSwatch({ status, className }: { status: MuscleStatusTone; className?: string }) {
  const id = usePatternId();
  return (
    <svg viewBox="0 0 3 3" className={cn('size-3.5 shrink-0 rounded-[3px]', className)} aria-hidden>
      <MusclePatterns id={id} />
      <rect
        width={3}
        height={3}
        style={{ fill: statusFill(status, id) }}
        className={status === 'declined' ? 'stroke-foreground [stroke-width:0.5]' : undefined}
      />
    </svg>
  );
}

/** Bir kasın dolgusu. */
function muscleFill({
  level,
  tone,
  status,
  patternId,
  disabled,
  highlighted,
}: {
  level: number;
  tone: MuscleTone;
  status: MuscleStatusTone | undefined;
  patternId: string;
  disabled: boolean;
  highlighted: boolean;
}): string {
  if (tone === 'status') {
    if (status) return statusFill(status, patternId);
  } else if (level > 0) {
    if (tone === 'load') {
      const share = Math.round(25 + 75 * Math.min(1, level));
      return `color-mix(in oklab, var(--muscle-target) ${share}%, var(--muscle-empty))`;
    }
    return roleFill(tierOf(level) ?? 'stabilizer', patternId);
  }
  if (disabled) return 'var(--muscle-neutral)';
  if (highlighted) return 'color-mix(in oklab, var(--foreground) 22%, var(--card))';
  return 'var(--muscle-empty)';
}

type MuscleMapProps = {
  /** Kasın ne kadar çalıştığı (0–1). Ör. hedef 1, yardımcı 0,45, ya da haftalık set yükü. Rengi bu belirler. */
  intensity?: MuscleIntensity;
  /**
   * `role` (varsayılan): yoğunluk hedef/yardımcı/dengeleyici seviyesine çevrilir (dolu/çizgili/noktalı).
   * `load`: sürekli ton. `status`: güç gelişiminin kararı (`statuses`), yoğunluğa bakılmaz.
   */
  tone?: MuscleTone;
  /** `tone="status"` için kas başına karar; olmayan kas boş çizilir. */
  statuses?: Partial<Record<BodyMuscle, MuscleStatusTone>>;
  /** Seçili kaslar (süzgeç, form). `intensity`'de tonu yoksa hedef gibi (dolu) çizilir. */
  selected?: readonly BodyMuscle[];
  /** Tıklanamayan kaslar (ör. formda hedef kas); rengi yine `intensity`'den gelir. */
  disabled?: readonly BodyMuscle[];
  /** Verilirse kaslar tıklanabilir olur (klavyeyle de). */
  onToggle?: (muscle: BodyMuscle) => void;
  /** Kas başına sayı; alt satırda yazar. Sayısı 0 olan kas soluk ve tıklanamaz. */
  counts?: Partial<Record<BodyMuscle, number>>;
  /** Üstüne gelinen kasın alt satırdaki açıklaması. Varsayılan: ad (+ sayı). */
  describe?: (muscle: BodyMuscle) => React.ReactNode;
  /** Tıklanabilir kasın ekran okuyucu adı. Varsayılan: ad (+ egzersiz sayısı). */
  labelOf?: (muscle: BodyMuscle) => string;
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
  tone = 'role',
  statuses,
  selected = [],
  disabled,
  onToggle,
  counts,
  describe,
  labelOf,
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
      tone={tone}
      statuses={statuses}
      selected={selected}
      disabled={disabled}
      counts={counts}
      labelOf={labelOf}
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
                  <span className="size-1.5 rounded-full bg-primary-text" aria-hidden />
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
  tone: MuscleTone;
  statuses?: Partial<Record<BodyMuscle, MuscleStatusTone>> | undefined;
  labelOf?: ((muscle: BodyMuscle) => string) | undefined;
  selected: readonly BodyMuscle[];
  disabled?: readonly BodyMuscle[];
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
function Body({ side, label, intensity, tone, statuses, labelOf, selected, disabled: locked, counts, onToggle, highlighted, onHighlight }: BodyProps) {
  const { neutral, groups } = SHAPES[side];
  const interactive = Boolean(onToggle);
  const patternId = usePatternId();

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
      <MusclePatterns id={patternId} />
      <g style={{ fill: 'var(--muscle-neutral)' }} aria-hidden>
        {neutral.map((path) => (
          <path key={path.id} d={path.d} />
        ))}
      </g>

      {groups.map(([muscle, paths]) => {
        const isSelected = selected.includes(muscle);
        const level = intensity?.[muscle] ?? (isSelected ? 1 : 0);
        const disabled = interactive && ((counts !== undefined && !counts[muscle]) || Boolean(locked?.includes(muscle)));
        const clickable = interactive && !disabled;
        const isHighlighted = highlighted === muscle;
        const count = counts?.[muscle];
        const status = tone === 'status' ? statuses?.[muscle] : undefined;

        return (
          <g
            key={muscle}
            data-muscle={muscle}
            data-clickable={clickable || undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={interactive ? isSelected : undefined}
            aria-disabled={disabled || undefined}
            aria-label={
              interactive ? (labelOf?.(muscle) ?? `${MUSCLE_LABELS[muscle]}${count === undefined ? '' : `, ${count} egzersiz`}`) : undefined
            }
            data-tier={tone === 'role' ? (tierOf(level) ?? 'empty') : undefined}
            data-status={tone === 'status' ? (status ?? 'empty') : undefined}
            className={cn(
              'outline-none transition-[fill,stroke,stroke-width] duration-160',
              status === 'declined' && 'stroke-foreground [stroke-width:0.22]',
              isHighlighted && 'stroke-foreground [stroke-width:0.3]',
              clickable && 'cursor-pointer',
            )}
            style={{ fill: muscleFill({ level, tone, status, patternId, disabled, highlighted: isHighlighted }) }}
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
