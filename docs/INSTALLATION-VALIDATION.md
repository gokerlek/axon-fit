# Yerel doğrulama — 3 Ekim 2026

- TypeScript ve ESLint hatasız tamamlandı.
- 2.199 test geçti. Bağımsız sihirbazda otomatik repo/main varsayılanları, token sahibinin bulunması ve yanlış hesap/eksik izinlerin reddi, adım doğrulaması, env enjeksiyonu, rastgele AUTH_SECRET, eski bootstrap değerinin kurulum kapısını aşamaması; otomatik aktarımda mevcut proje/owner/PAT izinleri, Production Secret sınıflandırması, mevcut sırların korunması ve deployment retry kontrol edildi.
- Vercel API adaptörü sahte HTTP yanıtlarıyla test edildi: team kapsamı, GitHub/Vercel tokenlarının ayrılması, tokenın env veya deployment gövdesine yazılmaması, yeni Git deployment ve güvenli hata mesajları.
- Güncellemenin gerçek shell workflow'u izole geçici yerel Git repolarıyla çalıştırıldı: sürüm kodu hazırlandı, eski workflow korundu, özel kod dosyası sürüm ağacından çıkarıldı, üretim dalı değişmedi. Bozuk tag ve değişmiş HEAD reddedildi. Hiçbir GitHub reposuna push yapılmadı.

- Tüm zorunlu env değerleri boşken Next 16.3.5 Webpack Production build geçti. Eski Webpack cache ayrı /tmp dizinine taşındı; Google Fonts indirmesi için ağ erişimi kullanıldı.
- Env’siz yerel Production sunucusunda /dashboard → /install yönlendirmesi, dört sihirbaz adımı, eksik anahtar doğrulaması, Gemini atlama, boş Vercel tokenı uyarısı ve manuel alternatif görüldü. Sahte hesap değerleri kullanıldı; dış platforma env/deployment isteği gönderilmedi. Sadeleşmiş formda repo/dal/veri alanı/kullanıcı adı soruları kaldırıldı. Açık simülasyon modunda örnek bilgileri doldurma, boş anahtar uyarısı ve gerçek istek yapmadan tamamlanma mesajı doğrulandı. 390×844 mobil görünümde yatay taşma yok (clientWidth=scrollWidth=390).

## Canlı doğrulanmayanlar

Gerçek PT hesabında GitHub OAuth, özel veri reposunun ilk oluşumu, Vercel Production env aktarımı/yeni deployment ve sürüm güncellemesi uçtan uca denenmedi. Otomatik kurulum için ortak entegrasyon kaydı veya geliştirici servisi gerekmez; PT kendi kısa süreli Vercel tokenını kullanır. Yerel testler platform üstündeki canlı doğrulamanın yerine geçmez. Boş test hesabıyla izlenecek adımlar için [kurulum](INSTALLER.md) ve [güncelleme](UPDATES.md) belgelerine bak.
