import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { EditButton } from '@/components/edit-button';
import { TemplateMuscleMap } from '@/components/muscle-map/template-muscle-map';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { readAppConfig } from '@/lib/config';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { formatDate, formatNumber } from '@/lib/format';
import { requirePt } from '@/lib/guards';
import { exerciseSetWeights } from '@/lib/muscles';
import { TEMPLATE_ID_PATTERN } from '@/lib/schemas/template';
import { templateMuscleLoad, templateSummary } from '@/lib/template-plan';
import { readTemplateFile } from '@/lib/templates';
import { InvalidTemplateAlert } from '../invalid-template-alert';
import { TemplateSequence } from '../template-sequence';

const LOAD_DESCRIPTION =
  'Kas başına çalışma seti: hedef 1, yardımcı 0,5, dengeleyici 0,25 sayılır; ısınma ve soğuma hareketleri sayılmaz.';

/** Şablon detayı — yalnız gösterim; tek eylem "Düzenle" (SPEC §6). */
export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePt();
  const { id } = await params;
  if (!TEMPLATE_ID_PATTERN.test(id)) notFound();
  const [file, exercises, devices, config] = await Promise.all([readTemplateFile(id), listExercises(), listDevices(), readAppConfig()]);
  if (!file) notFound();

  if (!file.template) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          crumbs={[{ label: 'Şablonlar', href: '/dashboard/templates' }, { label: file.name ?? file.id }]}
          title={file.name ?? file.id}
          description="Bu şablon dosyası okunamadı."
          actions={<EditButton href={`/dashboard/templates/${id}/edit`} />}
        />
        <InvalidTemplateAlert id={id} problem={file.problem} />
      </div>
    );
  }

  const template = file.template;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const { load } = templateMuscleLoad(template, byId, exerciseSetWeights);
  const summary = templateSummary(template, byId);
  const counted = Object.values(load).some((value) => value > 0);

  const groupParts = [
    summary.groups.superset ? `${summary.groups.superset} süperset` : null,
    summary.groups.circuit ? `${summary.groups.circuit} devre` : null,
    summary.groups.complex ? `${summary.groups.complex} kompleks` : null,
  ].filter(Boolean);

  const rows: [string, React.ReactNode][] = [
    ['Hareket', `${formatNumber(summary.rows)}${groupParts.length ? ` (${groupParts.join(', ')})` : ''}`],
    ['Çalışma seti', formatNumber(summary.workingSets)],
    ['Tahmini süre', `≈ ${formatNumber(summary.minutes)} dk`],
    [
      'Cihazlar',
      summary.deviceIds.length > 0 ? (
        <span className="flex flex-wrap gap-x-1">
          {summary.deviceIds.map((deviceId, index) => {
            const device = deviceById.get(deviceId);
            const comma = index < summary.deviceIds.length - 1 ? ',' : '';
            return device ? (
              <span key={deviceId}>
                <Link href={`/dashboard/devices/${device.id}`} className="underline underline-offset-4">
                  {device.name}
                </Link>
                {comma}
              </span>
            ) : (
              <span key={deviceId} className="text-muted-foreground">
                Silinmiş cihaz{comma}
              </span>
            );
          })}
        </span>
      ) : (
        <span className="text-muted-foreground">Cihazsız</span>
      ),
    ],
    ['Isınma', 'Antrenmanda hesaplanır: halterle bileşik hareket, kas grubunun ilk hareketi, 40 kg ve üstü.'],
    ['Oluşturuldu', formatDate(template.createdAt, config.timeZone)],
    ['Güncellendi', formatDate(template.updatedAt, config.timeZone)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: 'Şablonlar', href: '/dashboard/templates' }, { label: template.name }]}
        title={template.name}
        description={template.description || undefined}
        actions={<EditButton href={`/dashboard/templates/${template.id}/edit`} />}
      />

      {summary.missingRowIds.length > 0 ? (
        <Alert>
          <WarningCircle weight="fill" />
          <AlertTitle>{summary.missingRowIds.length} hareket kütüphanede bulunamadı</AlertTitle>
          <AlertDescription>
            Silinmiş bir egzersize bağlı; haritaya ve sayılara girmez. Şablonu düzenleyip değiştir ya da kaldır.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Solda şablonun kas haritası, sağda özeti; hareketler altta tam genişlikte. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kas yükü</CardTitle>
            <CardDescription>{LOAD_DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent>
            {counted ? (
              <TemplateMuscleMap variant="full" bodyClassName="h-72" load={load} />
            ) : (
              <p className="text-sm text-muted-foreground">Bu şablonda sayılan kas yükü yok (ısınma, soğuma ya da kardiyo).</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Özet</CardTitle>
            <CardDescription>Tahmini süre ısınma setleri hariç.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Table>
              <TableBody>
                {rows.map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell className="w-32 align-top text-muted-foreground">{label}</TableCell>
                    <TableCell className="whitespace-normal tabular-nums">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hareketler</CardTitle>
          <CardDescription>Antrenman bu sırayla yapılır; gruptakiler arka arkaya, dinlenme turun sonunda.</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateSequence template={template} exercises={byId} devices={deviceById} />
        </CardContent>
      </Card>
    </div>
  );
}
