# Bağımsız kurulum ve güncelleme planı

Kapsam: kendi repo/Vercel kopyasıyla bağımsız kurulum; geliştiriciye ait tek bağlantı isteğe bağlı sürüm kontrolü/güncelleme. DB ve merkezi kurulum servisi yok. AI sohbeti ayrı aşama.

- [x] Ortak Vercel Integration, servis modu, public servis config'i, bootstrap grant/token ve callback akışlarını kaldır.
- [x] Eksik env kapısı ve mevcut manuel kurulumları koru; OAuth yalnız normal owner girişi olsun.
- [x] Yerel dört adımlı sihirbaz: tokenla otomatik GitHub hesabı, Vercel’den kod reposu, otomatik main/veri alanı, OAuth App callback'i, opsiyonel Gemini, benzersiz AUTH_SECRET ve .env çıktısı.
- [x] Kalıcı Vercel tokenı/localStorage/cookie/DB yok; otomatik aktarım sadece kendi server'ı ve kendi Vercel projesi arasında. Input/secret/newline/env enjeksiyonunu doğrula.
- [x] Kendi Vercel tokenıyla otomatik Production env + Git deployment; proje/owner/scope ve overwrite kapıları, güvenli deployment retry. Manuel alternatif ve salt okunur hazır olma kontrolü.
- [x] Görünüm atla, başarı ekranı; isteğe bağlı PT-only update UI/API ve backup/fast-forward workflow.
- [x] README ve bağımsız kurulum/güncelleme belgelerini son yapıya göre yaz.
- [x] Son type/lint/test/build ve masaüstü/mobil sihirbaz QA'sı.
- [ ] Boş test PT hesabında gerçek GitHub OAuth, private veri repo'su ve Vercel Production güncellemesi. Bu kontrol kaynak kod doğrulamasından ayrıdır; geliştiricinin ortak servisi gerektirmez.
