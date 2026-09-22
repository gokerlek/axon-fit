'use client';

import Link from 'next/link';
import { GearSix, SignOut, User } from '@phosphor-icons/react';
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

/**
 * Sağ üstteki kullanıcı menüsü: ayarlar ve çıkış burada (üst çubuk yok, SPEC §6).
 * Avatar GitHub profil resmi; yüklenmezse kişi ikonu.
 */
export function UserMenu({ login, appName }: { login: string; appName: string }) {
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Tam yenileme: istemcideki önbellek ve oturumla ilgili her şey temizlensin.
    window.location.href = '/login';
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Hesap menüsü"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
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
          <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
            <GearSix />
            Görünüm ayarları
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <SignOut />
          Çıkış yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
