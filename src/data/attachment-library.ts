import type { Attachment } from '@/lib/schemas/attachment';

/**
 * Hazır aparat havuzu — pakette gelir, PT'nin repo'suna yazılmaz.
 *
 * Aparatlar cihazlardan bağımsız bir havuzdur: cihaz hangilerinin takılabildiğini
 * kimlikle seçer, egzersiz hangisiyle yapıldığını söyler. PT kendi aparatını ekler
 * ya da hazır birinin adını/fotoğrafını değiştirirse kendi sürümü repo'suna yazılır.
 */
export const ATTACHMENT_LIBRARY: readonly Attachment[] = [
  { id: 'duz-bar', name: 'Düz bar' },
  { id: 'lat-bari', name: 'Lat barı' },
  { id: 'genis-cekis-bari', name: 'Geniş çekiş barı' },
  { id: 'v-bar-ucgen', name: 'V bar (üçgen)' },
  { id: 'halat', name: 'Halat' },
  { id: 'tek-el-tutamagi', name: 'Tek el tutamağı' },
  { id: 'ez-bar-aparati', name: 'EZ bar aparatı' },
  { id: 'ayak-bilekligi', name: 'Ayak bilekliği' },
  { id: 'mag-tutamagi', name: 'MAG tutamağı' },
];
