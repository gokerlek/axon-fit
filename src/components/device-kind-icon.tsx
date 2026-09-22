import {
  Barbell,
  FlowArrow,
  PersonArmsSpread,
  PersonSimpleRun,
  StackSimple,
  WaveSine,
} from '@phosphor-icons/react/dist/ssr';
import type { DeviceKind } from '@/lib/device-loads';

/** Fotoğrafı olmayan cihazın yerine türünü anlatan ikon konur. */
const KIND_ICONS: Record<DeviceKind, typeof Barbell> = {
  selectorized: StackSimple,
  cable: FlowArrow,
  plate_loaded: Barbell,
  barbell: Barbell,
  dumbbell: Barbell,
  kettlebell: Barbell,
  bodyweight: PersonArmsSpread,
  band: WaveSine,
  cardio: PersonSimpleRun,
};

export function DeviceKindIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return <Icon className={className} weight="fill" />;
}
