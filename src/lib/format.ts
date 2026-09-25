/** Türkçe sayı biçimi: ondalık virgül (2,5 kg), binlik nokta. Sunucu ve istemci ortak. */
const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return number.format(value);
}

export function formatKg(value: number): string {
  return `${number.format(value)} kg`;
}

/** Birimli sayı: "82,5 cm", "12,4 sn"; yüzde işareti Türkçede başa gelir: "%30". */
export function formatWithUnit(value: number, unit: string): string {
  return unit === '%' ? `%${number.format(value)}` : `${number.format(value)} ${unit}`;
}

/** İşaretli fark: "+1,5 cm", "−2,3 sn" (eksi için gerçek eksi işareti). */
export function formatSignedWithUnit(value: number, unit: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${formatWithUnit(Math.abs(value), unit)}`;
}

/** Türkçe tarih: "23 Eylül 2026". Saat dilimi uygulama ayarından (sunucu UTC'de çalışır). */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso));
}

/** Türkçe tarih ve saat: "23 Eylül 2026 14:05". */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(new Date(iso));
}

/**
 * Takvim günü ("2026-09-01" → "1 Eylül 2026"). Gün bir an değil, tarihtir: saat dilimine
 * çevrilirse batıdaki bir saat diliminde bir önceki güne kayar; bu yüzden UTC'de biçimlenir.
 */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** Kısa takvim günü, grafik ekseni için: "1 Eyl" ya da yıllar karışıyorsa "1 Eyl 2026". */
export function formatDayShort(day: string, withYear = false): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Uygulamanın saat dilimine göre bugünün takvim günü: "2026-09-24". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA biçimi YYYY-AA-GG verir; parçalardan kurmak yerel ayar farkına karşı daha sağlam.
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Yakın bir an (ör. taslağın kaydedildiği): "az önce", "5 dakika önce", "bugün 14:05",
 * "dün 14:05", daha eskisi "23 Eylül 2026 14:05". Gün sınırı uygulamanın saat dilimine göre.
 */
export function formatRecent(iso: string, timeZone: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dakika önce`;
  const day = todayIn(timeZone, at);
  const today = todayIn(timeZone, now);
  // Dün takvimden: 24 saat çıkarmak yaz saati geçişinde bir günü atlayabilirdi.
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const time = new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short', timeZone }).format(at);
  if (day === today) return `bugün ${time}`;
  if (day === yesterday) return `dün ${time}`;
  return formatDateTime(iso, timeZone);
}
