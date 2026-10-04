# Kurulum doğrulaması — v0.1.2

Tarih: 4 Ekim 2026. Amaç: yazılım bilgisi olmayan PT'nin kendi GitHub/Vercel hesabıyla bağımsız kurulumunda gizli teknik adımlar bırakmamak.

## Doğrulananlar

- Gerekli env değerleri boşken standart `npm run build` Production derlemesi başarılı. Temel paketlerdeki `latest` sürümleri lockfile'daki mevcut sürümlere sabitlendi; `npm ci` önerilir. Standart build Webpack kullanır, eski Webpack cache'i otomatik temizlenir.
- 2.227 test başarılı; typecheck ve lint başarılı. Kurulum testleri gerçek hesap veya danışan verisine yazmaz.
- Production derlemesinin yerel simülasyonunda dört sihirbaz adımı tarayıcıda geçildi: boş GitHub anahtarı engellendi, OAuth adresleri mevcut hosttan üretildi, Gemini atlandı, otomatik yayın simülasyonu ve manuel aktarım yönergeleri açıldı.
- Eksik `.github/workflows/axon-update.yml` dosyası uygulamanın paketlenmiş kopyasından hazırlanır. Vercel repo bilgileri varsa GitHub bağlantısı sırasında hem otomatik hem manuel yol için çalışır. Var olan workflow ezilmez; owner/izin hatası aktarımı durdurur.
- Client ID/Secret doğrulaması GitHub'ın token ucuna bilerek geçersiz bir kod gönderir; gerçek kullanıcı authorization code'u kullanılmaz. Mevcut yerel OAuth çiftinin canlı GitHub sorgusu başarılı. Yanlış çift ve callback mismatch yanıtları test edildi; sırlar hata mesajına eklenmez.
- Otomatik aktarım yalnız sunucunun kendi Vercel proje kimliğini kullanır. Yanlış hesap, kod repo bağlantısı veya Production dalı env yazımından önce reddedilir.
- Kısmi env yazımında aynı bilgilerle yeniden deneme yalnız eksik anahtarları tamamlar; önceki sırlar korunur. Tüm anahtarlar (girildiyse Gemini dahil) geri okunmadan deployment başlatılmaz. Başarısız deployment tekrar denenebilir.
- Test PT'nin mevcut güncellemesi canlı Vercel'de doğrulandı: `gokerzafer/fit`, Production Ready, `Axon update v0.1.1` commit'i `fb1299cea3363725848e23d9b0a832ce4e9c3479`. Bu gözlem mevcut kurulumun güncelleme akışını kanıtlar; yeni hesap kurulumunu kanıtlamaz.

## Kullanıcıda kalan adımlar

README'deki Deploy with Vercel düğmesiyle kopyasını oluşturmak, kendi GitHub PAT/OAuth App ve geçici Vercel tokenını oluşturup sihirbaza kopyalamak. Kod yazması, YAML hazırlaması, dal/repo adı seçmesi, oturum sırrı üretmesi veya DB kurması gerekmez. OAuth App'e hazır callback adresini doğru kopyalamalıdır. GitHub hesabında Actions bir hesap/kurum politikasıyla kapalıysa hesap sahibi etkinleştirmelidir; uygulama politikayı değiştirmez.

## Doğrulama sınırı

Tamamen yeni bir PT hesabında Deploy with Vercel → gerçek tokenlar → env aktarımı → yeni deployment → GitHub giriş → ilk private veri reposu oluşturma zinciri bu denetimde baştan sona canlı çalıştırılmadı. Yerel simülasyon dış hesaplara yazmaz; sağlayıcı testleri canlı kuruluma eşdeğer değildir. OAuth probu Client ID/Secret çiftini kontrol eder; callback kaydının doğruluğu gerçek girişle ayrıca doğrulanmalıdır. Hesap politikaları, kota, ağ kesintisi ve sağlayıcı izinleri nedeniyle sıfır hata garantisi verilmez.

Gerçek danışan verisine yazılmadı; yeni hesap testi ayrı, boş bir test hesabı/veri reposuyla yapılmalıdır.
