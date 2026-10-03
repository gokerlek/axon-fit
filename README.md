# Axon Fit

Antrenörlerin danışanlarını, antrenman programlarını ve gelişimlerini tek yerden takip etmesi için mobil odaklı bir web uygulaması.

Antrenör programı hazırlar ve danışanını davet eder. Danışan telefonundan antrenmanını açar, setlerini kaydeder ve ilerlemesini görür. Ayrı bir veritabanı servisi kurulmaz: uygulama verileri antrenörün GitHub hesabındaki **özel repolarda** JSON olarak saklanır.

> **Bir kurulum = bir antrenör.** Bu sürüm, herkesin aynı sitede GitHub ile kaydolup ayrı antrenör hesabı açtığı bir SaaS değildir. Yönetici girişi yalnız `GITHUB_OWNER` kullanıcısına açıktır. Başka bir antrenör kendi GitHub hesabı, Vercel projesi ve veri repolarıyla ayrı kurulum yapar. Danışanların GitHub hesabı gerekmez.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgokerlek%2Faxon-fit)

Env olmadan ilk yayın `/install` sihirbazını açar. Sihirbaz bu kopyanın içinde çalışır: kendi GitHub tokenını ve OAuth App bilgilerini gir, callback adresini al, rastgele oturum anahtarıyla `.env` ayarlarını hazırla. Son adımda kendi geçici Vercel tokenınla ayarları otomatik Production ortamına yazıp yeni yayın başlat; bu token saklanmaz. İstersen .env çıktısını manuel aktarabilirsin. **Ortak kurulum servisi, Vercel entegrasyonu, geliştiricinin anahtarı veya DB gerekmez.** [Adım adım bağımsız kurulum](docs/INSTALLER.md).

Gemini anahtarını kurulumda atladıysan sonradan **Ayarlar → Yapay zekâ ve Gemini anahtarı** ekranından ekleyebilirsin. Panelde girilen anahtar kendi özel veri reposunda şifrelenerek saklanır; Vercel tokenı veya yeniden deployment gerekmez.

Geliştiricinin reposuna yalnız isteğe bağlı sürüm kontrolü/güncellemede bağlanılır; mevcut uygulama kullanımı bu bağlantıya bağlı değildir. PT panelindeki Ayarlar → Uygulama sürümü kararlı sürümleri kontrol eder. Güncelleme kod değişikliklerinin üzerine yazılacağını açıkça onaylatır, önce yedek alır ve yalnız ayrı kod reposunu günceller. [Otomatik ve manuel güncelleme](docs/UPDATES.md).

## Neler yapar?

- **Danışan yönetimi:** danışan oluşturma, davet/erişim yönetimi, profil ve takip ekranları.
- **Program hazırlama:** egzersiz kütüphanesi, şablonlar, fazlar, set/tekrar/yük ve dinlenme ayarları; danışanın kendi programları.
- **Antrenman takibi:** günlük plan, set kaydı, dinlenme sayacı, seans özeti ve geçmiş.
- **Gelişim:** ölçümler, antrenman istatistikleri ve kişisel rekorlar.
- **Sağlık ve hareket takibi:** onaya bağlı ağrı bildirimleri, kısıtlar, hareket taramaları ve program düzenlerken ilgili uyarılar. Bu takip özellikleri tanı veya tedavi hizmeti sunmaz.
- **Görünüm:** isim/logo, altı hazır tema, açık/koyu mod, özel renkler ve canlı önizleme.
- **Telefon kullanımı:** ana ekrana ekleme ve bağımsız uygulama görünümü. Tam çevrimdışı çalışma desteklenmez; veri işlemleri internet gerektirir.

## Nasıl çalışır?

```text
Telefon / tarayıcı
        │ HTTPS
        ▼
Next.js uygulaması (Vercel)
        │ Sunucu tarafında GitHub API
        ├── axon-fit-data       → özel: ayarlar, kütüphane, danışan kimlik listesi
        ├── client-<kimlik-1>   → özel: danışan profili ve takip kayıtları
        └── client-<kimlik-2>   → özel: diğer danışanın verileri

axon-fit                       → uygulamanın kaynak kodu (bu repo)
```

`GITHUB_TOKEN` uygulama çalışırken yalnız sunucuda kullanılır. Tarayıcı GitHub veri repolarına doğrudan bağlanmaz. PT kendi veri tokenını Vercel Production ortamına Secret olarak ekler; GitHub OAuth girişte yalnız kimliği doğrular. Kurulum sihirbazındaki sırlar açık sekmede hazırlanır; otomatik aktarımda yalnız kendi uygulamanın sunucusundan kendi Vercel projenine gönderilir. Manuel .env çıktısı sunucuya gönderilmez. Danışanlar uygulamanın davet akışıyla erişir.

**`APP_REPO` kod reposundan farklı ve private olmalıdır.** Örneğin kod `axon-fit`, veri `axon-fit-data`. Veri reposunu önceden oluşturman gerekmez; ilk kurulum kaydında uygulama oluşturur. Var olan repo kullanılıyorsa private olmalı ve fork olmamalıdır. Danışan repoları da uygulama tarafından oluşturulur.

## Gerekenler

- Kendi kişisel GitHub hesabın.
- Vercel hesabı ve GitHub bağlantısı (yayına almak için).
- Yerel geliştirme için **Node.js 22+** ve npm. Tekrarlanabilir kurulum için `npm ci` kullan.
- GitHub erişim token'ı, GitHub OAuth App bilgileri ve oturum sırrı.
- İsteğe bağlı yedek e-posta girişi için Resend hesabı.

## 1. GitHub veri erişim token'ını oluştur

[GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens) bölümünden bu uygulamaya özel, süreli bir **classic personal access token** oluştur.

Gerekli kapsamlar:

| Kapsam | Neden gerekli? |
| --- | --- |
| `repo` | Özel veri repolarını oluşturmak, okumak ve güncellemek. |
| `delete_repo` | Uygulamadaki danışan silme akışında danışanın veri reposunu silmek. |

Token'ı `GITHUB_TOKEN` olarak kullan. Token'ın sahibi ile `GITHUB_OWNER` aynı kişisel hesap olmalıdır; uygulama repoları bu hesap altında oluşturur. Classic token bu kapsamlarla hesabındaki diğer repolara da erişebilir; yalnız bu uygulama için üret ve paylaşma. Hesap ayrımı istiyorsan uygulamayı ayrı bir GitHub hesabıyla kur.

GitHub girişinde oluşan OAuth token'ı bu token'ın yerine geçmez. Token süresi dolunca yeni token'ı ortam değişkenine yazıp yeniden deploy et.

Kaynak: [GitHub repository API ve token kapsamları](https://docs.github.com/en/rest/repos/repos).

## 2. GitHub ile giriş için OAuth App oluştur

[GitHub → Settings → Developer settings → OAuth Apps → New OAuth App](https://github.com/settings/applications/new) sayfasını aç.

Yerelde denemek için:

| Alan | Değer |
| --- | --- |
| Application name | `Axon Fit Local` |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/github/callback` |

Oluşan **Client ID** değerini `GITHUB_CLIENT_ID` olarak kaydet. **Generate a new client secret** ile üretilen değeri `GITHUB_CLIENT_SECRET` olarak kaydet.

Canlı site için ayrı bir OAuth App kullan. Homepage URL canlı siten; callback ise `https://SENIN-ALAN-ADIN/api/auth/github/callback` olmalı. Alan adı değişirse OAuth ayarını da güncelle. Rastgele Vercel Preview adresleri için canlı OAuth ayarının çalışacağını varsayma.

## 3. Ortam değişkenlerini hazırla

Örnek dosya: [`.env.example`](.env.example).

| Değişken | Nereden alınır / ne yazılır? | Gerekli mi? |
| --- | --- | --- |
| `GITHUB_OWNER` | GitHub kullanıcı adın; ör. `gokerlek`. URL veya e-posta yazma. | Evet |
| `APP_REPO` | Ayrı özel veri reposunun adı; ör. `axon-fit-data`. | Evet |
| `GITHUB_TOKEN` | 1. adımda oluşturduğun kişisel token. | Evet |
| `GITHUB_CLIENT_ID` | 2. adımdaki OAuth App Client ID. | GitHub girişi için |
| `GITHUB_CLIENT_SECRET` | Aynı OAuth App'in client secret değeri. | GitHub girişi için |
| `AUTH_SECRET` | Aşağıdaki komutla ürettiğin rastgele sır. En az 32 bayt. | Evet |
| `PT_EMAIL` | Yedek e-posta girişini kullanacak antrenör adresi. | E-posta girişi için |
| `RESEND_API_KEY` | Resend hesabından alınan API anahtarı. | İsteğe bağlı |
| `RESEND_FROM` | Resend'de doğrulanmış alan adından gönderici; ör. `Axon Fit <giris@alanadin.com>`. | Özel e-posta göndericisi için |

```bash
openssl rand -base64 32
```

Çıktıyı `AUTH_SECRET` yap. Bu sırrı değiştirirsen mevcut oturumlar geçersiz olur. Değişkenlere `NEXT_PUBLIC_` öneki ekleme; bunlar sunucu ayarlarıdır. `.env.local` Git'e gönderilmez.

### İsteğe bağlı e-posta girişi

[Resend](https://resend.com) hesabında API anahtarı oluştur, `PT_EMAIL` ve `RESEND_API_KEY` değerlerini doldur. Kendi göndericin için alan adını doğrulayıp `RESEND_FROM` ekle. Kodun varsayılan göndericisi `onboarding@resend.dev` test göndericisidir; üretim göndericisi olarak kendi doğrulanmış alan adını kullan. Resend kullanılmayacaksa bu alanları boş bırak; e-posta giriş yolu kapanır.

## 4. Yerelde çalıştır

```bash
git clone https://github.com/gokerlek/axon-fit.git
cd axon-fit
npm ci
cp .env.example .env.local
```

`.env.local` dosyasını yukarıdaki bilgilerle doldur, ardından:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) adresini aç. GitHub ile giriş yap ve ilk kurulum ekranında ad, tema ve görünümü kaydet. Ekranlarda görünen varsayılan adı burada **Axon Fit** veya kendi markan olarak değiştirebilirsin. Bazı iç dosya/paket adları projenin önceki adı olan `PulseCoach` olarak durur; kurulum için bunları değiştirmek gerekmez.

OAuth olmadan yalnız yerelde arayüz geliştirmek için `http://localhost:3000/api/dev/login` geliştirme girişi vardır. Bu uç üretimde 404 döner. Geliştirme girişi veri katmanını taklit etmez: yazma işlemleri tanımladığın GitHub repolarına gider. Yerel testleri ayrı veri reposu/hesabıyla yap.

## 5. Vercel'e yayınla

1. [Vercel New Project](https://vercel.com/new) sayfasından GitHub'daki `axon-fit` reposunu **Import** et. Başka antrenör kuruyorsa önce kendi hesabına fork almalı.
2. Framework **Next.js**, Root Directory repo kökü (`./`), Node.js **22.x** seç.
3. Install Command `npm ci`; Build Command için burada doğrulanan `npm run build -- --webpack` kullan. Output Directory alanını Next.js varsayılanında bırak. Projenin normal `npm run build` komutu Turbopack kullanır; Webpack alternatifidir.
4. Environment Variables bölümüne 3. adımdaki değerleri **Production** ortamı için ekle. `.env.local` dosyasını yükleme veya repoya koyma.
5. Canlı OAuth App'in Client ID/Secret değerlerini kullan. Henüz alan adın belli değilse ilk deploy sonrası verilen kalıcı proje alan adını OAuth App'in Homepage ve callback alanlarına yaz. İlk deploy'da da geçerli giriş bilgileri tanımlı olmalı.
6. **Deploy** et. Ortam değişkenlerini sonradan değiştirdiysen **Redeploy** yap.
7. Canlı adresi aç, `GITHUB_OWNER` hesabıyla GitHub girişi yap ve kurulum ekranını kaydet. Uygulama özel veri reposunu hazırlar.
8. İlk danışanını oluştur; danışan detayındaki davet bağlantısını/QR kodunu kullanarak telefonundan erişimi dene.

Kaynaklar: [Vercel GitHub bağlantısı](https://vercel.com/docs/git/vercel-for-github), [ortam değişkenleri](https://vercel.com/docs/environment-variables).

**Güncellemeler:** Vercel'e bağlanan üretim dalına push geldiğinde yeni deploy tetiklenir. Uygulama kodunu güncellemek için danışanları veya veri repolarını silmen gerekmez. Aynı `GITHUB_OWNER` ve `APP_REPO` değerleri mevcut verilere bağlanır. Yeni `APP_REPO` adı yeni bir uygulama veri alanı açar; eski verileri otomatik taşımaz.

## Telefona ekleme

- **Android / Chrome:** canlı HTTPS adresini aç → tarayıcı menüsü → *Uygulamayı yükle* veya *Ana ekrana ekle*. Tarayıcının sunduğu yükleme seçeneğini tamamla; simgeden açınca adres çubuğu olmadan bağımsız görünüm kullanılır.
- **iPhone / Safari:** siteyi aç → Paylaş → *Ana Ekrana Ekle*.

Normal bir tarayıcı sekmesinden açıldığında adres çubuğu görünmesi beklenir. Ana ekrana eklemek uygulamayı çevrimdışı hale getirmez.

## Geliştirme ve doğrulama

```bash
npm run typecheck
npm run lint
npm test
npm run build -- --webpack
npm start
```

`npm start`, başarılı üretim derlemesinden sonra çalışır. Next.js / React sürümleri için `package-lock.json` esas alınır.

| Konum | İçerik |
| --- | --- |
| `src/app/dashboard` | Antrenör paneli |
| `src/app/me` | Danışan ekranları ve antrenman akışı |
| `src/app/api` | Kimlik, veri ve işlem uçları |
| `src/lib/github` | GitHub veri erişimi |
| `src/lib/schemas` | Paylaşılan doğrulama şemaları |
| `src/components` | Ortak arayüz bileşenleri |
| `docs/SPEC.md` | Ayrıntılı ürün ve veri modeli |
| `docs/design` | Özellik tasarımları ve doğrulama notları |

## Sık karşılaşılan sorunlar

| Belirti | Kontrol |
| --- | --- |
| GitHub girişinden sonra erişim yok | Giriş yaptığın kullanıcı `GITHUB_OWNER` ile aynı mı? |
| OAuth callback hatası | Protokol, alan adı ve `/api/auth/github/callback` yolu doğru mu? Yerel/canlı Client ID'ler karışmış mı? |
| Veri reposu açık/fork uyarısı | `APP_REPO` kod reposundan farklı, private ve fork olmayan bir repo olmalı. |
| GitHub 401 / 403 / 404 | Token süresi, sahibi, izinleri ve repo adlarını kontrol et; private repoda erişim eksikliği 404 de verebilir. |
| Ortam değişkenini değiştirdim, etkilenmedi | Vercel'de doğru ortamı seçip yeniden deploy et. |
| Telefonda localhost açılmıyor | Telefonun localhost'u bilgisayarın değildir; canlı HTTPS adresini kullan. |
| Veri talepleri sınıra takılıyor | GitHub API kota/erişim durumunu kontrol et; sistem GitHub kullanılabilirliğine bağlıdır. |

Danışan silme işlemi danışanın veri reposunu da siler; temizlik veya deploy hazırlığı için bu işlemi kullanma. Veri repolarını public yapma ve danışan verilerini bu kaynak kod reposuna kopyalama.
