'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GearSix, House, SignOut } from '@phosphor-icons/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogoutDialog } from './logout-dialog';

/** Adın baş harfleri (en çok iki): "Gizem Gonca" → "GG". Türkçe büyük harf. */
function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '');
  return letters.join('').toLocaleUpperCase('tr') || '?';
}

/**
 * Danışanın sağ üstteki avatar menüsü (PT'ninkiyle aynı yerde): ana sayfa, ayarlar (sağlık takibi,
 * şifre) ve çıkış. Yalnız telefon: düğme ve öğeler 44 px. Çıkış onay penceresiyle.
 */
export function ClientMenu({ name, appName, hasPassword }: { name: string; appName: string; hasPassword: boolean }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Hesap menüsü"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Avatar size="lg">
            <AvatarFallback className="font-medium text-foreground">{initials(name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-foreground">{name}</span>
              <span className="font-normal text-muted-foreground">{appName}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem className="min-h-11" render={<Link href="/me" />}>
              <House />
              Programım
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" render={<Link href="/me/ayarlar" />}>
              <GearSix />
              Ayarlar
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="min-h-11" onClick={() => setLeaving(true)}>
            <SignOut />
            Çıkış yap
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LogoutDialog open={leaving} onOpenChange={setLeaving} hasPassword={hasPassword} />
    </>
  );
}
