import type { COACH_PAGES } from './coach-contract.ts';
export function coachPage(pathname: string): typeof COACH_PAGES[number] {
  if (/measurements|olcum|screening/.test(pathname)) return 'measurements';
  if (/antrenman|sessions|gecmis/.test(pathname)) return 'workout';
  if (/ilerleme/.test(pathname)) return 'progress';
  if (/program/.test(pathname)) return 'program';
  if (/settings|ayarlar/.test(pathname)) return 'settings';
  if (/templates|exercises|devices/.test(pathname)) return 'library';
  if (/constraints|saglik/.test(pathname)) return 'health';
  return 'overview';
}
export function coachClientOf(pathname: string) { return /^\/dashboard\/clients\/(c_[a-z0-9]{6,24})(?:\/|$)/.exec(pathname)?.[1] ?? null; }
export const COACH_PAGE_LABELS = { overview: 'Genel görünüm', program: 'Program', measurements: 'Ölçümler', workout: 'Antrenman', progress: 'İlerleme', settings: 'Ayarlar', library: 'Kütüphane', health: 'Sağlık' };
