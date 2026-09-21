/** Türkçe sayı biçimi: ondalık virgül (2,5 kg), binlik nokta. Sunucu ve istemci ortak. */
const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return number.format(value);
}

export function formatKg(value: number): string {
  return `${number.format(value)} kg`;
}
