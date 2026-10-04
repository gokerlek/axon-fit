'use client';

import Link from 'next/link';
import { ArrowsClockwise, GearSix, SignOut, Sparkle, User } from '@phosphor-icons/react';
import { discardAllDrafts } from '@/components/block-editor/editor-draft';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmLeave } from '@/components/unsaved-changes-guard';

/**
 * Sağ üstteki kullanıcı menüsü: ayarlar ve çıkış burada (üst çubuk yok, SPEC §6).
 * Avatar GitHub profil resmi; yüklenmezse kişi ikonu. Düğme 44 px (avatar 40 px), telefonda
 * menü öğeleri de 44 px.
 */
export function UserMenu({ login, appName }: { login: string; appName: string }) {
  function signOut() {
    // Kaydedilmemiş değişiklik varsa önce düzenleyicinin uyarısı: "Kal" oturumu korur, Kaydet çalışır.
    confirmLeave(async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      // Düzenleyici taslakları sayfa gerçekten kapanınca gider (aynı tarayıcıyı başkası kullanabilir); tarayıcının
      // "Ayrıl?" sorusunda kalınırsa taslak ve otomatik yazım sürer. Düzenleyicilerin pagehide yazımından sonra çalışır.
      window.addEventListener('pagehide', () => discardAllDrafts(), { once: true });
      // Tam yenileme: istemcideki önbellek ve oturumla ilgili her şey temizlensin (Next'in çıkış önerisi,
      // `preserving-ui-state` rehberi); yukarıdaki `pagehide` de ancak belge gerçekten kapanınca çalışır.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- tam yenileme bilerek
      window.location.href = '/login';
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Hesap menüsü"
        className="inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Avatar size="lg">
          <AvatarImage src={`https://github.com/${encodeURIComponent(login)}.png?size=80`} alt="" />
          <AvatarFallback>
            <User />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground">@{login}</span>
            <span className="font-normal text-muted-foreground">{appName} · antrenör</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="touch:min-h-11" render={<Link href="/dashboard/settings" />}>
            <GearSix />
            Görünüm ayarları
          </DropdownMenuItem>
          <DropdownMenuItem className="touch:min-h-11" render={<Link href="/dashboard/settings/ai" />}>
            <Sparkle />
            Yapay zekâ ayarları
          </DropdownMenuItem>
          <DropdownMenuItem className="touch:min-h-11" render={<Link href="/dashboard/settings/updates" />}>
            <ArrowsClockwise />
            Sürüm ve güncellemeler
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="touch:min-h-11" onClick={signOut}>
          <SignOut />
          Çıkış yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
