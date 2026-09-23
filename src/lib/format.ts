/** Türkçe sayı biçimi: ondalık virgül (2,5 kg), binlik nokta. Sunucu ve istemci ortak. */
const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return number.format(value);
}

export function formatKg(value: number): string {
  return `${number.format(value)} kg`;
}

/** Türkçe tarih: "23 Eylül 2026". Saat dilimi uygulama ayarından (sunucu UTC'de çalışır). */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso));
}

/** Türkçe tarih ve saat: "23 Eylül 2026 14:05". */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(new Date(iso));
}
