# Fitness ürün değerlendirmesi

5 Ekim 2026 · `feature/ai-fitness-coach` çalışma ağacı. Kaynak kod incelemesi; bütün ürünün veya gerçek cihaz ölçümlerinin kabul testi değildir. Aşağıdaki kalan maddeler bu raporla uygulanmış sayılmaz.

## Öncelikli düzeltmeler

| Öncelik | Bulgu | Etki ve önerilen aksiyon | Kaynak |
| --- | --- | --- | --- |
| Yüksek | Tahmini 1RM için iki ayrı kural var. `epley` 12 üzerindeki tekrarları dışlıyor; `oneRepMax` 12'ye kırpıyor. | Aynı set grafikte ve rekor bildiriminde farklı değerlendirilebilir. Geçerli tekrar aralığı ve formülü tek modülde birleştir; index yalnız ağırlık başına en yüksek tekrarı tuttuğu için gerekiyorsa geçmiş özetini de değiştir. Tahmini değer, ölçülmüş maksimum olarak sunulmasın. | `src/lib/personal-records.ts`, `src/lib/session-records.ts` |
| Yüksek | Efor cevabı yoksa set otomatik `good` oluyor. | Eksik bilgi, olumlu bilgi gibi öneri motoruna giriyor. `unknown` durumunu koru; kullanıcının cevaplamadığı setin yük artırma kararına katkısını açık ve temkinli tanımla. | `src/lib/session-results.ts:toSetResults` |
| Orta | Süre, başlangıç ile bitiş arasındaki tüm zamanı sayıyor. | Seans açık bırakıldığında saatlerce antrenman yapılmış gibi istatistik oluşabiliyor. Aktif süre/ara verme mekanizması ekle veya mevcut sayıyı açıkça “geçen süre” olarak adlandır. Test danışanında 3 setlik kaydın 11 sa 12 dk görünmesi bu davranışı doğruladı. | `src/lib/session-index.ts:indexRowOf`, `src/lib/workout-summary.ts`, PT Antrenmanlar ekranı |
| Orta | Haftalık hedef tek bir güncel değer olarak bütün geçmişe uygulanıyor. | Hedef değişince geçmiş seri ve rozet tarihleri yeniden değişebilir. Haftanın hedefini tarihli olarak sakla; kazanılmış başarı ile güncel hedefe göre karşılaştırmayı ayır. | `src/lib/progress.ts:weeklyStreak`, `achievementsOf` |

## Tamamlanmamış ürün işleri ve sınırlar

- **Antrenman sırasında esneklik:** hareket değiştirme, hareket/set/tur ekleme ve başka harekete geçme mevcut. İlk çalışma setinden sonra hareket değiştirme kısıtlı; sürükleyerek sıra düzenleme ve tamamlanan setleri koruyarak bütün programı değiştirme ayrı işler. Bunlar mevcut “şimdi yap / atla” akışından farklıdır. Kaynak: `src/lib/workout-flow.ts`, `src/app/me/antrenman/workout-screen.tsx`.
- **AI koç ve sohbet:** Kayıt özetli sohbet, PT onaylı katalog taslağı, sürekli sohbet düğmesi, isteğe bağlı danışan anahtarı ve mesaj tercihleri ilk sürüm olarak eklendi. Tam kişisel dönemleme, ölçüm isteme döngüsü ve klinik karar motoru tamamlanmadı; gerçek sağlayıcı testi ayrıca gerekir. Kaynak: `src/lib/ai/`, `src/app/api/settings/gemini/route.ts`, `docs/AI-FITNESS-COACH-DESIGN.md`.
- **Kamera ölçümü:** sayısal 2D ölçüm, yönlendirme ve kayıt akışı var; gerçek cihazlarda doğruluk/tekrar edilebilirlik kabul testi bekliyor. Perspektif, kamera hizası ve görünürlük ölçümü etkileyebilir. Bu değerler tek başına klinik tanı veya otomatik düzeltici program onayı olarak kullanılmamalı. Kaynak: `docs/CAMERA-MEASUREMENT-RESEARCH.md`, `docs/AI-FITNESS-COACH-REVIEW.md`, `src/lib/pose/`.
- **Gelişim dili:** tonaj, toplam tekrar ve set artışı yapılan iş miktarını gösterir; kas büyümesini veya hareket kalitesini tek başına kanıtlamaz. Performans, devamlılık ve kullanıcı hedefleri ayrı yorumlanmalı; dinlenme/azaltılmış çalışma başarısızlık olarak sunulmamalı. Yeni bildirimler bu ayrımı kullanıyor.
- **Takvim kapsamı:** şu an kaydedilen geçmiş antrenman günlerini gösteriyor. Gelecek planlanan günler, erteleme ve hatırlatmalar ayrıca tasarlanmalı; boş gün “kaçırılan antrenman” sayılmıyor.

## Bu çalışma ile kapatılan eksikler

- “Önceki” set bilgisi aynı gün/program satırı yerine **aynı egzersiz ve cihazın en son bitmiş kaydından** geliyor. Reçete motorunun program bağlamı korunuyor.
- Set kaydedildiğinde kişisel rekor anlık bildirilir. İlk kayıt referanstır; eşit sonuç ve ısınma seti rekor değildir. Farklı cihazların kiloları karıştırılmaz.
- Önceki seansa göre tonaj/set/toplam tekrar artışı ayrı bildirilir; kişisel güç rekoru olarak etiketlenmez. Bildirimler aynı tür için seans içinde tekrarlanmaz; yerel tekrar koruması yeniden açılışta korunur.
- Danışanın Geçmiş ve PT'nin Antrenmanlar ekranlarına aylık takvim eklendi. Ay değiştirilebilir; gün seçilip kayda gidilebilir; aynı gün birden fazla seans desteklenir.

## Kontrol kapsamı

Saf hesaplama ve yerel kayıt testleri; typecheck, lint ve üretim derlemesi. Takvim test danışanında masaüstü ve 390 px mobil görünümde kontrol edildi. Rekor bildirim sunumu sentetik verilerle, sunucuya antrenman kaydı yazmadan kontrol edildi. Gerçek danışan verileri değiştirilmedi; kamera doğruluğu ve canlı Vercel dağıtımı bu kontrolde doğrulanmadı.
