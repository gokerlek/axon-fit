'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowUpRight, CheckCircle, Bell } from '@phosphor-icons/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { WaterGlass } from '@/components/water-glass';

export function AppearancePreview({ appName }: { appName: string }) {
  const [water, setWater] = useState(3);
  return (
    <section aria-label="Canlı tema önizlemesi" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">Canlı önizleme</h2><p className="mt-1 text-sm text-muted-foreground">Renk, tema ve köşeleri gerçek bileşenlerde dene.</p></div>
        <Badge variant="outline" className="shrink-0">Örnek içerik</Badge>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar className="size-12 rounded-lg"><AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xl font-semibold">{(appName.trim() || 'P').charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0"><CardTitle className="truncate">{appName || 'Uygulama adı'}</CardTitle><CardDescription className="mt-1">Bugün kendin için bir adım daha.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">SIRADAKİ ANTRENMAN</p><p className="mt-1 text-lg font-semibold">Üst vücut · Gün A</p><p className="mt-1 text-sm text-muted-foreground">6 hareket · 18 set · ≈ 45 dk</p></div><Badge>Hazırsın</Badge></div>
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => toast.info('Antrenman kartı', { description: 'Bu kart tema önizlemesinin bir parçası.' })}>Antrenmana başla <ArrowUpRight /></Button><Button type="button" variant="outline" onClick={() => toast('Geçmiş', { description: 'Tamamlanan antrenmanlar burada görünür.' })}>Geçmiş</Button></div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader><CardTitle>Bu hafta</CardTitle><CardDescription>Planına adım adım.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p><span className="text-3xl font-semibold tabular-nums">3</span><span className="text-muted-foreground"> / 4 antrenman</span></p>
            <Progress value={75} aria-label="Haftalık antrenman ilerlemesi" />
            <p className="flex items-center gap-2 text-sm text-primary"><CheckCircle className="size-4" />Bir antrenman kaldı</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Yeni rekor</CardTitle><CardDescription>Halter Bench Press</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3"><p className="text-3xl font-semibold tabular-nums">62,5 <span className="text-sm font-normal text-muted-foreground">kg × 8</span></p><Badge className="w-fit"><ArrowUpRight /> +2,5 kg</Badge><p className="text-sm text-muted-foreground">Bir önceki en iyi set: 60 kg</p></CardContent>
        </Card>
      </div>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><p className="font-medium">Danışan görünümü</p><Badge variant="secondary">Aktif</Badge></div>
          <div className="flex items-center gap-3"><Avatar><AvatarFallback>DA</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="font-medium">Deniz A.</p><p className="text-sm text-muted-foreground">Son antrenman bugün · 42 dk</p></div><span className="text-sm font-medium text-primary">12 antrenman</span></div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="flex items-center gap-3">
          <WaterGlass count={water} />
          <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground">Su · bugün</p><p className="mt-1 text-2xl font-semibold tabular-nums">{water} <span className="text-sm font-normal text-muted-foreground">bardak</span></p></div>
          <Button type="button" variant="outline" className="h-11 border-sky-500/40 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300" onClick={() => setWater((value) => value + 1)} aria-label="Su animasyonunu dene">+1</Button>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-4 text-primary" />Bildirimler</CardTitle><CardDescription>Seçtiğin renkle ekranda nasıl göründüğünü dene.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => toast.success('Program kaydedildi', { description: 'Danışanın güncel programını görebilir.', id: 'theme-preview', action: { label: 'Tamam', onClick: () => undefined } })}>Başarılı bildirim</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => toast.info('Antrenman zamanı', { description: 'Gün A seni bekliyor.', id: 'theme-preview' })}>Bilgi</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => toast.error('Kayıt tamamlanamadı', { description: 'Bağlantını kontrol edip tekrar dene.', id: 'theme-preview' })}>Hata</Button>
        </CardContent>
      </Card>
    </section>
  );
}
