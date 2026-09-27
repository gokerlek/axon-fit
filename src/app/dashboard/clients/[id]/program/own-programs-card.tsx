import Link from 'next/link';
import { CaretRight, Info } from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { formatDayShort, todayIn } from '@/lib/format';
import { activeItem, type OwnIndex, type OwnIndexItem } from '@/lib/own-program-index';
import { lastDateByProgram, programLine } from '@/lib/own-program-text';
import type { SessionIndex } from '@/lib/schemas/session';

/**
 * PT'nin Program sekmesinde danışanın kendi programları (`docs/design/kendi-program.md` §4) — bütün bilgi index'ten
 * (dosya okunmaz): Bugün'ün programı kendi programken bilgi satırı, paylaşılmış programlar kartı.
 */

function dayOf(iso: string, timeZone: string): string {
  return formatDayShort(todayIn(timeZone, new Date(iso)));
}

/** "Danışan şu an kendi programıyla çalışıyor: Evde" — yalnız kalıcı seçim kendi programken. */
export function OwnActiveAlert({ clientId, index, timeZone }: { clientId: string; index: OwnIndex | null; timeZone: string }) {
  const item = activeItem(index);
  if (!item) return null;
  const at = index?.active?.at;
  return (
    <Alert>
      <Info weight="fill" />
      <AlertTitle className="pr-28">Danışan şu an kendi programıyla çalışıyor: {item.name}</AlertTitle>
      <AlertDescription>
        {[item.shared ? 'Paylaşıldı' : 'Paylaşılmadı', at ? `seçim: ${dayOf(at, timeZone)}` : null].filter(Boolean).join(' · ')}
      </AlertDescription>
      {item.shared ? (
        <AlertAction>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/clients/${clientId}/program/own/${item.id}`} />}>
            Programı aç
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/** Son değişikliği kim yaptı: PT'nin düzenlemesi danışanınkinden yeniyse "sen". */
function lastChange(item: OwnIndexItem, timeZone: string): string {
  const pt = item.ptEditedAt ? Date.parse(item.ptEditedAt) : 0;
  const client = item.clientEditedAt ? Date.parse(item.clientEditedAt) : Date.parse(item.updatedAt);
  return pt > client ? `sen · ${dayOf(item.ptEditedAt as string, timeZone)}` : `danışan · ${dayOf(item.clientEditedAt ?? item.updatedAt, timeZone)}`;
}

/** "Danışanın paylaştığı programlar (n)" — yalnız paylaşılmış program varsa. */
export function SharedProgramsCard({
  clientId,
  index,
  sessions,
  timeZone,
}: {
  clientId: string;
  index: OwnIndex | null;
  sessions: Pick<SessionIndex, 'items'> | null;
  timeZone: string;
}) {
  const shared = index?.items.filter((item) => item.shared) ?? [];
  if (shared.length === 0) return null;
  const active = activeItem(index)?.id ?? null;
  const last = sessions ? lastDateByProgram(sessions) : new Map<string, string>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Danışanın paylaştığı programlar ({shared.length})</CardTitle>
        <CardDescription>Danışanın kendi kurduğu, seninle paylaştığı programlar. Düzenleyebilirsin; değişiklik danışana bildirilir.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {shared.map((item) => {
            const lastDate = last.get(item.id);
            return (
              <li key={item.id}>
                <Item variant="outline" className="touch:min-h-11" render={<Link href={`/dashboard/clients/${clientId}/program/own/${item.id}`} />}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="break-words">
                      {item.name}
                      {active === item.id ? <Badge variant="secondary">Bugün&apos;ün programı</Badge> : null}
                    </ItemTitle>
                    <ItemDescription className="tabular-nums">
                      {programLine(item)}
                      {lastDate ? ` · son antrenman ${formatDayShort(lastDate)}` : ''}
                    </ItemDescription>
                    <ItemDescription>Son değişiklik: {lastChange(item, timeZone)}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <CaretRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
