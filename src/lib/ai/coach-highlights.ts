import type { CoachPreferences } from './coach-contract.ts';
export type CoachHighlight = { id: string; text: string };
/** Recorded events only; no body score, calorie compensation or pressure to increase load. */
export function coachHighlights(event: { id: string; date: string; dayName: string; sets: number }, prefs: CoachPreferences): CoachHighlight[] {
  return [
    ...(prefs.celebrations ? [{ id: `${event.id}:celebrate`, text: `${event.dayName} antrenmanını kaydettin. Emeğine sağlık!` }] : []),
    ...(prefs.comments ? [{ id: `${event.id}:comment`, text: `${event.date} tarihinde ${event.sets} çalışma seti kaydedilmiş. Bu, yaptıklarının özeti; daha fazla yapmak zorunda değilsin.` }] : []),
    ...(prefs.suggestions ? [{ id: `${event.id}:suggest`, text: 'Bir sonraki antrenmanda nasıl hissettiğini hazır oluşluk alanına gir; önerilen yük, izin verdiğin kayıtlarına göre ayarlanabilir. Bir hareket veya ekipman uygun değilse PT’nin değerlendirmesi için koça söyleyebilirsin.' }] : []),
  ];
}
