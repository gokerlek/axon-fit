import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { conditionLabel, parseCondition } from '@/lib/conditions';
import { DEEP_MUSCLE_LABELS, isDeepMuscle } from '@/lib/deep-muscles';
import {
  AXIAL_LOAD_LABELS,
  CONTRACTION_TYPE_LABELS,
  JOINT_WINDOW_LABELS,
  KINETIC_CHAIN_LABELS,
  LOAD_VECTOR_LABELS,
  RESISTANCE_PROFILE_LABELS,
  SHEAR_LEVEL_LABELS,
  SPINAL_ALIGNMENT_LABELS,
} from '@/lib/exercise-filter';
import type { Exercise } from '@/lib/schemas/exercise';

/**
 * Medikal etiketler — yalnız gösterir; değiştirmek için "Düzenle".
 *
 * Etiket yoksa kart bunu açıkça söyler: süzgeç etiketsiz hareketi değerlendiremez,
 * sessizce "uygun" saymaz.
 */
export function MedicalCard({ exercise }: { exercise: Exercise }) {
  const rows: [string, string][] = [
    ...(exercise.kineticChain ? ([['Kinetik zincir', KINETIC_CHAIN_LABELS[exercise.kineticChain]]] as [string, string][]) : []),
    ...(exercise.axialLoading ? ([['Eksenel yük', AXIAL_LOAD_LABELS[exercise.axialLoading]]] as [string, string][]) : []),
    ...(exercise.shearForce ? ([['Kesme kuvveti', SHEAR_LEVEL_LABELS[exercise.shearForce]]] as [string, string][]) : []),
    ...(exercise.spinalAlignment ? ([['Omurga hizası', SPINAL_ALIGNMENT_LABELS[exercise.spinalAlignment]]] as [string, string][]) : []),
    ...(exercise.loadVector ? ([['Yük vektörü', LOAD_VECTOR_LABELS[exercise.loadVector]]] as [string, string][]) : []),
    ...(exercise.contractionType ? ([['Kasılma tipi', CONTRACTION_TYPE_LABELS[exercise.contractionType]]] as [string, string][]) : []),
    ...(exercise.resistanceProfile ? ([['Direnç profili', RESISTANCE_PROFILE_LABELS[exercise.resistanceProfile]]] as [string, string][]) : []),
    ...(exercise.internalRotationUnderLoad ? ([['Yük altında iç rotasyon', 'Var']] as [string, string][]) : []),
  ];

  const windows = exercise.jointWindows ?? [];
  const activation = (exercise.activationTargets ?? []).filter(isDeepMuscle);
  const avoid = exercise.contraindications ?? [];
  const safe = exercise.safeFor ?? [];
  const empty = rows.length === 0 && windows.length === 0 && activation.length === 0 && avoid.length === 0 && safe.length === 0;

  const names = (list: readonly string[]) =>
    list.map((value) => {
      const parsed = parseCondition(value);
      return { key: value, label: parsed ? conditionLabel(parsed) : value };
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medikal etiketler</CardTitle>
        <CardDescription>
          {empty
            ? 'Bu hareket etiketlenmemiş: sakatlık süzgeci onu değerlendiremez, “uygun” da saymaz.'
            : 'Sakatlık süzgeci bunlara bakar. Değiştirmek için “Düzenle”.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {empty ? (
          <p className="text-muted-foreground">
            <Link href={`/dashboard/exercises/${exercise.id}/edit`} className="underline underline-offset-4">
              Düzenle
            </Link>{' '}
            diyerek kinetik zincir, eksenel yük ve omurga hizası gibi alanları doldurabilirsin.
          </p>
        ) : null}

        {rows.length > 0 ? (
          <Table>
            <TableBody>
              {rows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell className="w-44 text-muted-foreground">{label}</TableCell>
                  <TableCell className="whitespace-normal">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {windows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">Kritik açı pencereleri</span>
            <div className="flex flex-wrap gap-1.5">
              {windows.map((window) => (
                <Badge key={window} variant="secondary">
                  {JOINT_WINDOW_LABELS[window]}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {activation.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">Aktivasyon hedefleri (derin kaslar)</span>
            <div className="flex flex-wrap gap-1.5">
              {activation.map((muscle) => (
                <Badge key={muscle} variant="outline">
                  {DEEP_MUSCLE_LABELS[muscle]}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {avoid.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">Şu kısıtlarda yaptırma</span>
            <div className="flex flex-wrap gap-1.5">
              {names(avoid).map((item) => (
                <Badge key={item.key} variant="destructive">
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {safe.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">Şu kısıtlarda sorun yok</span>
            <div className="flex flex-wrap gap-1.5">
              {names(safe).map((item) => (
                <Badge key={item.key} variant="secondary">
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
