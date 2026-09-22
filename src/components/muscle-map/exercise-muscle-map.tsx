'use client';

import { MUSCLE_LABELS, type Exercise } from '@/lib/schemas/exercise';
import { exerciseIntensity, isBodyMuscle, summarizeMuscles, type BodyMuscle } from '@/lib/muscles';
import { MuscleMap } from './muscle-map';

type ExerciseMuscleMapProps = Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'> & {
  bodyClassName?: string;
};

/**
 * Bir egzersizin çalıştırdığı kaslar: ön ve arka yan yana, hedef kaslar tam renk,
 * yardımcılar açık ton. Yalnız gösterim; tıklanmaz.
 */
export function ExerciseMuscleMap({ primaryMuscles, secondaryMuscles, bodyClassName }: ExerciseMuscleMapProps) {
  const secondary = secondaryMuscles.filter((muscle) => !primaryMuscles.includes(muscle));

  const describe = (muscle: BodyMuscle) => {
    const role = primaryMuscles.includes(muscle) ? 'hedef' : secondary.includes(muscle) ? 'yardımcı' : 'çalışmıyor';
    return `${MUSCLE_LABELS[muscle]} · ${role}`;
  };

  const worked = summarizeMuscles([...primaryMuscles, ...secondary].filter(isBodyMuscle));
  const label = worked.length > 0 ? `Çalışan kaslar: ${worked.join(', ')}` : 'Belirli bir kas grubu işaretlenmedi';

  return (
    <div className="flex flex-col items-center gap-4">
      <MuscleMap
        layout="split"
        intensity={exerciseIntensity({ primaryMuscles, secondaryMuscles })}
        describe={describe}
        bodyClassName={bodyClassName}
        label={label}
      />
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <dt className="text-muted-foreground">Hedef</dt>
          <dd>{summarizeMuscles(primaryMuscles).join(', ')}</dd>
        </div>
        {secondary.length > 0 ? (
          <div className="flex items-baseline gap-2">
            <span className="size-2.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
            <dt className="text-muted-foreground">Yardımcı</dt>
            <dd>{summarizeMuscles(secondary).join(', ')}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
