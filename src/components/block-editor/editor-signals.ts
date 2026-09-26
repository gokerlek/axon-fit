/**
 * Düzenleyicinin görünürlük ve duyuru kararları (saf; testler Node'un kendi test aracıyla çalışır).
 *
 * - Yüzen Kaydet (tasarım kararı 17): her genişlikte, kaydedilecek bir şey varken ve başlıktaki Kaydet
 *   çizili ama ekranın görünen yerinde değilken. Başlıktaki Kaydet odaktaysa çıkmaz: o sırada başlıktaki
 *   `inert` olur, odak kaybolurdu. Seçim modunda başlıkta Kaydet çizili değil: çıkmaz.
 * - Tek canlı bölge: "Geri al" toast'u çıkan değişikliğin cümlesini toast'un kendi canlı bölgesi
 *   (sonner) okur; düzenleyicinin `aria-live` paragrafı yalnız toast'suz duyuruları (taşıma, ret
 *   nedenleri, seçim modu, "Geri alındı") yazar. Böylece hiçbir cümle iki kez okunmaz.
 */

export type FloatingSaveState = {
  /** Kaydedilecek bir şey var (değişiklik, kayıt sürüyor ya da oluşturma sayfası). */
  saveable: boolean;
  /** Başlıktaki Kaydet çizili (seçim modunda ve değişiklik yokken değil). */
  headerMounted: boolean;
  /** Başlıktaki Kaydet ekranın görünen yerinde değil (dock'un kapladığı alt pay dahil). */
  headerOffscreen: boolean;
  /** Odak başlıktaki Kaydet'te. */
  headerFocused: boolean;
};

export function floatingSaveShown(state: FloatingSaveState): boolean {
  return state.saveable && state.headerMounted && state.headerOffscreen && !state.headerFocused;
}

/** Değişikliğin cümlesi hangi canlı bölgede okunur: "Geri al" toast'u varsa onunkinde, yoksa düzenleyicininkinde. */
export function announcementRegion(withUndoToast: boolean): 'toast' | 'editor' {
  return withUndoToast ? 'toast' : 'editor';
}
