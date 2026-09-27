# Kısıtlar ve tarama — 27 Eylül 2026 doğrulaması

Claude'un üç çalışma kopyasındaki işler mevcut `main` çalışma alanında birleştirildi. Kopyalar korundu; uzak depoya gönderilmedi.

## Tamamlanan kapsam

- Kendi programında yasaklı hareketler listeden ve aramadan gizlenir; yeni yasaklı satırlar sunucuda reddedilir. Mevcut/kopyalanan satırlar uyarıyla korunur. Kopyalama istisnası ilgili kaynak günle sınırlıdır.
- Şiddetli kötüleşme ve acil yönlendirme kırmızı ünlemle önceliklendirilir. Sonradan “Düzeldi” bildirilse bile PT inceleyene kadar şiddetli bildirim önceliği korunur.
- Faz 6: tarama rozetleri/ağrı uyarıları, tekrarlayan ağrıyla geçme sonrası bildirim kısayolu, iki tarafta ilerleme kartı, bacak boyuna göre uzanma yüzdesi, ek bölge ölçütleri.
- Özet ve antrenman sonrası kontrol kartında kendi programının adı; eski tarama ağrısının düşme kuralları; tarama taslağı testleri; lint temizliği.
- Altı araştırma kaynağı ve doğrulama kapsamları araştırma belgelerine işlendi. Kritz kaynağının tam metni erişilebilir değildi; metadata doğrulaması ile sınırlı olduğu açıkça yazıldı.

## Otomatik kontroller

- `npm test`: 2175 geçti, 0 başarısız.
- `npm run lint`: hata/uyarı yok.
- `npm run build -- --webpack`: başarılı; TypeScript ve 61 statik sayfa üretimi dahil.
- Varsayılan Turbopack derlemesi ortam kaynaklı font erişimi/alt süreç port izni hatalarıyla tamamlanamadı. Webpack sonucu varsayılan derlemenin geçtiği anlamına gelmez.
- `git diff --check`: temiz.
- Bağımsız incelemede sağlık okuma hatasında kontrolün atlanması, şiddetli bildirimin erken düşmesi ve global kopyalama istisnası düzeltildi; son incelemede engelleyici bulgu kalmadı.

## Canlı doğrulama

Yalnız Test Gelişim (`c_zmrbywaz`) kullanıldı; gerçek danışan kaydı değiştirilmedi.

- Masaüstünde kırmızı öncelik, PT programındaki tarama/kısıt rozetleri ve ilerleme kartı görüldü.
- Tarama formunda 60 cm uzanma / 90 cm bacak boyu = %66,7 gösterildi ve test danışanının 27 Eylül taramasına kaydedildi.
- 375 px mobilde kopyalanan programın “Sana önerilmiyor” uyarısı korundu; yasaklı Halter Back Squat araması sonuç vermedi. Yeni program kaydedilmedi.
- Canlı hareket kütüphanesinde yasaklı hareket yok; doğrudan eski seçimle ekleme isteği HTTP 409 döndürdü.
- Muadil API'si karışık uygunlukta “Kısıtlarına uygun olanlar önce.” döndürdü; not 375 px mobil muadil ekranında da görüldü. Bütün adaylar dikkatliyken gereksiz not üretmedi.
- Danışan ilerleme kartı görüntülendi; sayfa genişliği ve kaydırma genişliği 375 px, konsol hata/uyarı kaydı yok.
- Şablon sayfası kontrolünde tek GET görüldü; tekrarlayan istek sorunu yeniden üretilemedi.

Tekrarlayan ağrı kısayolu ve kendi program adı davranışları otomatik testlerle doğrulandı; bu iki durum için yeni tamamlanmış canlı antrenman verisi üretilmedi. Mobil antrenman kontrolünde mevcut test antrenmanının yerel hareket sırası/aktif hareketi değişti; set veya bitiş kaydı gönderilmedi.
