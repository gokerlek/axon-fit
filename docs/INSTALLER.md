# Bağımsız kurulum

Her PT repoyu kendi GitHub hesabına kopyalar ve kendi Vercel projesine kurar. Geliştiriciye ait kurulum servisi, ortak OAuth uygulaması, Vercel entegrasyonu, kişisel anahtar veya veritabanı gerekmez. Geliştiricinin reposuna yalnız PT istediğinde kararlı sürüm kontrolü ve güncelleme için bağlanılır. Sihirbaz kopyalanan uygulamanın içinde çalışır.

## PT'nin adımları

1. README'deki Deploy with Vercel düğmesiyle kendi kod reposunu ve Vercel projesini oluştur. İlk yayın env olmadan açılabilir. Uygulamanın **kalıcı Production adresini** aç; Preview adresini kurulum adresi olarak kullanma.
2. `/install` ekranı kod reposunu Vercel’in GitHub bağlantısından alır ve yayın dalını `main` yapar. Veri alanının adı otomatik belirlenir (`axon-fit-data`; kod reposuyla çakışırsa `axon-fit-private-data`). Kullanıcı bunları doldurmaz. Uygulama ilk görünüm kaydında özel veri reposunu otomatik oluşturur.
3. Kendi GitHub hesabında bir Classic PAT oluştur. `repo` ve `delete_repo` izinleri özel veri repolarını yönetmek için, `workflow` izni eksik güncelleme dosyasını kendi kod reposuna eklemek için kullanılır. Sihirbazdaki bağlantı bu üç seçeneği hazır işaretler. Tokenı sihirbaza yapıştır. Hesap adı bu tokenla GitHub’dan otomatik doğrulanır; Vercel bağlantısındaki hesapla eşleşmesi gerekir. Bitiş tarihi seç; süresi dolduğunda kendi Vercel ortamından yenile. Başkasının tokenı kullanılmaz. Bu adımda kod reposunun güncelleme YAML dosyası da hazırlanır; eksik dosya otomatik oluşturulur, var olan dosya korunur.
4. Kendi GitHub hesabında OAuth App aç. Production sihirbazı uygulamayı açtığın güncel domaini (değiştirilmiş vercel.app adı veya özel domain dahil) otomatik kullanıp Homepage ve `/api/auth/github/callback` adresini hazırlar; bu adresleri GitHub formuna yaz. Oluşan Client ID ve Client Secret'ı sihirbaza gir. Bu giriş uygulaması da PT'ye aittir. Client ID/Secret çifti GitHub’da doğrulanır; hatalı çiftle sonraki adıma geçilmez. Callback adresini OAuth App formuna doğru yazmak yine gerekir.
5. Gemini anahtarı isteğe bağlıdır; atlanabilir. Sonradan PT panelinde Ayarlar → Yapay zekâ ve Gemini anahtarı alanından eklenebilir veya değiştirilebilir.
6. Sihirbaz kurulum için 32 bayt rastgele veriden benzersiz AUTH_SECRET üretir. Son adımda otomatik aktarımı seç: **kendi Vercel hesabında kısa süreli bir token oluştur**, kapsam olarak bu projenin bulunduğu hesabı/team’i seç. Vercel'in Deploy düğmesi uygulamaya env yazma yetkisi vermez; bu token yalnız o yetkiyi sağlar. Geliştiricinin hesabı/tokenı veya ortak servis kullanılmaz.
7. Otomatik kur ve yayınla: bilgiler sadece kendi uygulamanın sunucusuna gönderilir. Sunucu Vercel'in kendi yayınına verdiği VERCEL_PROJECT_ID değerini kullanır; istemci başka bir proje seçemez. Vercel proje erişimi, GitHub repo/owner, PAT hesabı ve repo/delete_repo izinleri doğrulanır. Kod reposunda `.github/workflows/axon-update.yml` eksikse uygulamaya paketlenmiş hazır dosya otomatik olarak Production dalına eklenir; bunun için workflow izni doğrulanır. Mevcut dosya değiştirilmez. Dosya oluşturulamazsa env yazımı ve yayın başlatılmaz. Değerler yalnız bu projenin Production env'ine yazılır; token/secret/API anahtarları Secret olarak saklanır. Mevcut kurulum sırlarının üzerine yazılmaz. Yeni Git Production deployment başlatılır.
8. Yayın hazır olduğunda giriş ekranına geçilir. Vercel tokenı sunucu env'ine, DB'ye, çereze veya kalıcı tarayıcı depolamasına yazılmaz; başarıda formdan temizlenir. PT kurulumu bitirince Vercel hesabından tokenı iptal edebilir. Sistemin normal kullanımında Vercel tokenına ihtiyaç yoktur.
9. Yayın hazırsa GitHub ile giriş yap. Yalnız `GITHUB_OWNER` hesabı paneli açabilir. Görünümü seç veya atla; başarı ekranından danışanlarına geç.

Vercel'in hesap sahibi izni olmadan uygulama env değişkenlerini yazamaz. Otomatik yol PT'nin kendi geçici Vercel tokenını kullanır; ortak OAuth entegrasyonuna bağlanmaz. Geliştiricinin bir kere bile servis açması gerekmez.

Manuel alternatif: Vercel tokenı vermek istemeyen kişi ayarları kopyalar veya .env dosyasını indirir; kendi Vercel Settings → Environment Variables ekranına Production olarak aktarır, Secret alanlarını işaretler ve yeni yayın başlatır. Vercel kod repo bağlantısı varsa manuel yolda da YAML ilk GitHub bağlantısı adımında hazırlanır; ayrıca dosya oluşturmak gerekmez. Yerel çalışmada kod repo bağlantısı yoksa bu işlem yapılmaz. Manuel yolda son env çıktısı sunucuya gönderilmez; GitHub anahtarı ilk adımda hesabı doğrulamak için yalnız kendi uygulamanın sunucusu üzerinden GitHub’a gönderilir. Sekmeyi kapatmak/yenilemek form değerlerini kaybettirir. İndirilen dosya ve panodaki değerler sır içerir; paylaşma veya kod reposuna ekleme. Otomatik yol yalnız Production Vercel yayınında açılır; yerel/Preview ortamında manuel yol kullanılır.

Resmi yönergeler: [Vercel erişim tokenı](https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token), [Vercel sistem proje kimliği](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_id), [GitHub OAuth App oluşturma](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [Vercel ortam değişkenleri](https://vercel.com/docs/environment-variables/managing-environment-variables), [Vercel Secret değerleri](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Sorun giderme

- Env kaydı başarılı ama deployment başlatma başarısızsa "Yayını tekrar başlat" yalnız kayıtlı ayarları okuyup yeni deployment başlatır; sırları tekrar yazmaz.
- Kısmi env kaydı başarısızsa yeni deployment başlatılmaz. Aynı açık sekmede aynı bilgilerle tekrar dene: mevcut değerler korunur, yalnız eksik anahtarlar tamamlanır. Hesap, repo ve OAuth kimliği eşleşmeden devam edilmez. Tüm anahtarlar Vercel’den geri okunup görülmeden yayın başlatılmaz.
- Sistem ortam değişkenleri kapalıysa Vercel Project Settings'te otomatik sistem değişkenlerini etkinleştirip yeni Production yayını başlat. Proje kimliği formdan elle girilmez.

- Kurulum ekranı yeni yayından sonra hâlâ geliyorsa Production env anahtar adlarını kontrol et. Boş değerler, 32 bayttan kısa AUTH_SECRET veya eksik giriş yöntemi kurulumu tamamlanmış sayılmaz.
- Domaini değiştirdiysen kurulumu yeni Production adresinden aç. Sihirbaz yeni adresi esas alır; eski deployment’ın sistem değişkeni yeni domaini ezmez. Önceden oluşturulmuş OAuth App’in callback kaydı GitHub’da kendiliğinden değişmez; o kaydı bir kez güncelle.
- GitHub `redirect_uri` uyarısı veriyorsa OAuth App callback'iyle tarayıcıdaki Production domain aynı olmalı. Adresin sonu `/api/auth/github/callback` olmalı.
- GitHub'a yanlış hesapla giriş yapılırsa PT oturumu açılmaz.
- Veri repo'su açık/fork ise görünüm kaydı reddedilir. Kişisel veriyi açık kod reposuna taşıma; ayrı private repo kullan.
- Token süresi dolmuş veya iptal edilmişse PT kendi GitHub hesabından yenisini oluşturup Vercel Production Secret'ını değiştirir ve yeni yayın başlatır.
- Başka bir PT kopyanın ayarlarını değiştirirse yalnız kendi kurulumunu etkiler. Uygulama ayarları ve danışan verileri geliştiricinin reposunda tutulmaz.

## Güncellemeler

PT panelindeki Ayarlar → Uygulama sürümü isteğe bağlıdır; normal kullanım sırasında upstream sürüm kontrolü yapılmaz. Geliştiricinin reposu veya hesabı erişilemez olsa da kendi kurulumun mevcut sürümüyle çalışmaya devam eder. [Güncelleme ve manuel birleştirme](UPDATES.md).

## Yerel simülasyon

`AXON_SETUP_DEMO=1` yalnız yerel, env’siz test sunucusunda sihirbazı göstermek içindir. Ekranda açık bir simülasyon uyarısı ve örnek bilgileri doldurma düğmesi vardır. Gerçek token girilmez. GitHub doğrulama ve Vercel aktarım uçları bu modda işlem yapmaz; yayın düğmesi yalnız ne olacağını anlatır. Bu değişkeni canlı kurulumda kullanma.

## Kurulumdan sonra Gemini anahtarı

Ayarlar → Yapay zekâ ve Gemini anahtarı yalnız PT’ye açıktır. Kaydedilen anahtar PT’nin kendi private veri reposundaki `secrets/gemini.json` dosyasında AES-256-GCM ile şifrelenir; JSON, API yanıtı, log ve istemci başlangıç verisine açık anahtar konmaz. Şifreleme AUTH_SECRET ile PT/repo bağlamından türetilir. Bu yöntem yeni env veya Vercel tokenı/redeploy gerektirmez.

Panel kaydı varsa Vercel GEMINI_API_KEY değerinden önce kullanılır. Panel kaydı kaldırıldığında varsa env anahtarı yeniden kullanılır; Google’daki anahtar iptal edilmez. AUTH_SECRET değişirse paneldeki eski anahtarı yeniden kaydet. Private olmayan veya fork veri reposuna kayıt reddedilir. AI çağrıları anahtarı sunucudaki `geminiApiKey()` çözümleyicisinden almalıdır. Bu alan yalnız anahtarı saklar; Google’a doğrulama çağrısı yapmaz veya ücretli model isteği başlatmaz.
