# PulseCoach v2 — Spec

Tek antrenörlük (PT), GitHub'ı veritabanı olarak kullanan, mobil öncelikli web uygulaması.
Her PT uygulamayı kendi GitHub hesabına kurar, kendi adresinde yayınlar, kendi adını ve logosunu verir.

**Durum:** onay bekliyor · **Güncelleme:** 2026-09-20

---

## 1. Kararlar

| Konu | Karar |
|---|---|
| Dağıtım | PT kendi özel GitHub repo'sunu oluşturur, Vercel'de yayınlar |
| Veritabanı | GitHub. JSON dosyaları, yazma Octokit ile commit |
| Veri yerleşimi | **Danışan başına ayrı özel repo** (`client-<id>`), PT'nin kişisel hesabında |
| Barındırma | Vercel ücretsiz plan (ticari kullanım yok) |
| Görseller | Başta uygulama repo'sunda; Cloudflare R2 sonra opsiyonel |
| PT girişi | **GitHub ile giriş (OAuth)** — tek yöntem. Kimlik kontrolü: giren kişi repoların sahibi mi |
| Danışan girişi | Kare kod + PT'nin bizzat verdiği tek kullanımlık kod. GitHub hesabı gerekmez |
| Sağlık verisi | PT danışanı açarken kişi bazında karar verir; danışan ayrıca onaylar |
| Marka | Uygulama adı, logo, renk, tema PT'ye ait (beyaz etiket) |
| Kullanıcı sayısı | 1 PT + ~10–30 danışan. Çoklu PT kapsam dışı |
| Platform | Web (mobil öncelikli), PWA. Mağaza yayını yok |
| Arayüz | **shadcn + Base UI** (`base-nova`, preset `b3QvsSZhg`), Tailwind v4, Phosphor ikonları, Outfit + Geist Mono. Renkler temanın `globals.css`'inden; özel renk sistemi yazılmaz |

npm'de boşta: `pulsecoach`, `create-pulsecoach`, `@pulsecoach/app`.

---

## 2. Kurulum akışı (PT ne yapacak)

1. `npx create-pulsecoach` → kişisel hesabında özel bir uygulama repo'su oluşur.
2. Vercel'e bağlar. Ayarlar:
   - `GITHUB_TOKEN` — repo oluşturma/silme yetkisi olan token (§9.2'deki uyarı)
   - `GITHUB_OWNER` — GitHub kullanıcı adı
   - `APP_REPO` — uygulama repo'sunun adı
   - `PT_EMAIL` — uygulamaya girebilecek tek yönetici adresi
   - `AUTH_SECRET` — oturum çerezlerini imzalamak için
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub ile giriş (OAuth uygulaması; token'ı ürettiği ekranın hemen yanında, 2 dakika)
   - `RESEND_API_KEY` — **isteğe bağlı** yedek giriş (e-posta kodu). Girilmezse e-posta yolu kapalıdır.
3. Yayınlanır, PT girer, kurulum sihirbazı açılır (§10): ad, logo, renk, tema.
4. Güncelleme: `pulsecoach` paketinin sürümü yükseltilir, Vercel yeniden yayınlar. Danışan verisine dokunulmaz.

**Uygulama kodu npm paketinde, veri repo'larda.**

---

## 3. Veri yerleşimi

İki tür repo var: **uygulama repo'su** (kişisel veri yok) ve **danışan başına bir repo**.

### Uygulama repo'su — kişisel veri YOK

```
pulsecoach.config.json         uygulama adı, logo yolu, vurgu rengi, tema, saat dilimi
data/
  exercises.json               PT'nin kendi egzersizleri (hazır kütüphane pakette gelir)
  templates/<id>.json          antrenman şablonları
  clients.json                 YALNIZ kimlik ve durum: [{ "id": "c_8f3k", "status": "active" }]
media/
  brand/logo.png               PT'nin logosu
  exercises/<dosya>            egzersiz görselleri
```

`clients.json` bilerek çıplak: isim, e-posta, not **hiçbir koşulda** buraya yazılmaz. Bir kez yazılırsa danışanı silmek için bu repo'nun geçmişini yeniden yazmak gerekir ve modelin bütün avantajı kaybolur.

### `client-<id>` — o danışana ait her şey (ayrı özel repo)

```
client.json                    isim, program ataması, modüller, onaylar, bağlantı izinleri
invite.json                    davet kodunun özeti, süresi, kullanıldı bilgisi
sessions/<tarih>-<id>.json     tamamlanmış antrenman (her biri yeni dosya)
health.json                    yalnız sağlık modülü açık ve onaylıysa oluşur
```

**Repo adında isim geçmez** (`client-c8f3k`): repo adları silindikten sonra da denetim kayıtlarında kalabiliyor.

**Neden ayrı repo:** danışan "verilerimi sil" dediğinde repo silinir; 90 gün geri alma penceresinden sonra tamamen gider. Başka hiçbir verinin geçmişine dokunulmaz.

**Neden her antrenman ayrı dosya:** aynı dosyaya eşzamanlı yazma olmaz, çakışma riski sıfıra iner, geçmiş doğal olarak birikir.

---

## 4. Veri şekilleri (özet)

**`client-<id>` içinde `client.json`**
```jsonc
{
  "id": "c_8f3k",
  "name": "Ahmet Yılmaz",
  "createdAt": "2026-09-20T10:00:00Z",
  "status": "active",                  // active | paused | archived
  "program": { "templateId": "t_altvucut", "assignedAt": "..." },
  "modules": {
    "health": {                        // PT danışanı açarken seçer
      "enabled": true,
      "fields": ["readiness", "pain", "measurements"],
      "enabledBy": "pt",
      "enabledAt": "..."
    }
  },
  "consents": {
    "health": { "granted": true, "version": "2026-09", "at": "..." }
  },
  "visibleTo": ["c_2m1x"]              // bağlantı verilen diğer danışanlar (yalnız kimlik)
}
```

**`client-<id>` içinde `sessions/2026-09-20-s_91.json`**
```jsonc
{
  "id": "s_91", "date": "2026-09-20", "templateId": "t_altvucut",
  "startedAt": "...", "finishedAt": "...",
  "entries": [
    { "exerciseId": "squat", "sets": [ { "kg": 80, "reps": 8, "rpe": 7 } ] }
  ],
  "notes": "", "water": 3
}
```

**`health.json`** — yalnız modül açık ve danışan onaylamışsa yazılır. Kapalıysa dosya hiç oluşmaz.

---

## 5. Kimlik doğrulama

**PT: GitHub ile giriş.** "GitHub ile devam et" → GitHub yetki ekranı → dönüşte sunucu, giren kullanıcının **`GITHUB_OWNER` ile aynı kişi olduğunu** doğrular; değilse oturum açılmaz. Kullanıcı tablosu yok, şifre yok.

Neden GitHub: PT zaten tanım gereği GitHub kullanıcısı (repoların sahibi o). Yeni hesap açması gereken hiçbir servis yok ve yetki kontrolü tam olarak doğru şeye bakıyor — "bu repoların sahibi mi".

**Yedek yol (varsayılan kapalı):** PT isterse `RESEND_API_KEY` girip e-posta kodu yöntemini açabilir. Amacı tek: OAuth ayarı yanlış girilirse kendi uygulamasına giremez hale gelmemek. Anahtar yoksa bu yol hiç görünmez.

**Danışan (QR davet):**
1. PT "danışan ekle" der, isim girer, sağlık modülünü açıp kapatır.
2. Sunucu `client-<id>` repo'sunu açar, 8 haneli kod üretir; repo'ya **sadece kodun özeti (SHA-256)**, son kullanma tarihi ve `used: false` yazılır.
3. PT'ye QR çıkar: `https://<adres>/katil?c=<id>&k=<kod>`. Kimlik bağlantıda taşınır ki sunucu hangi repo'ya bakacağını bilsin.
4. Danışan QR'ı açar. Sunucu kodu doğrular, `used: true` yapar ve tarayıcıya **imzalı, httpOnly oturum çerezi** yazar (30 gün, her girişte tazelenir).
5. Kod tek kullanımlıktır. Danışan kaybederse PT yeni QR üretir, eski kod anında geçersiz olur.

Kodun kendisi hiçbir yerde saklanmaz; `localStorage`'da yalnızca "hangi danışanım" bilgisi tutulur, yetki her zaman çerezdedir.

**Kural:** girişten sonra sunucu yetkiyi **oturum çerezinden** okur, adresteki kimlikten değil. Danışan adrese başka bir kimlik yazarsa sunucu reddeder. Danışanın kendi telefonunda oturumu açık bırakması kendi tercihidir; her ekranda "oturumu kapat" düğmesi vardır ve PT istediği an erişimi iptal edip yeni QR üretebilir.

---

## 6. Ekranlar ve cihaz odağı

| Alan | Birincil cihaz | Düzen |
|---|---|---|
| **Danışan** (`/me`) | Telefon | Tek sütun, alt menü, antrenman ekranı büyük dokunma hedefleriyle |
| **PT — oluşturma** (`/dashboard`) | **Masaüstü** | Kenar menü, çok sütunlu ekranlar; telefonda da çalışır |
| **PT — salonda** | Telefon | Şu an antrenman yapanlar (canlı), bugünün planı, hızlı not |

Oluşturma işi (şablon kurmak, program atamak, birkaç danışanı yan yana görmek) büyük ekranda çok daha verimli; PT ekranları masaüstü için tasarlanır. Salondayken kullanılacak kısımlar telefonda öne çıkar.

**Arayüz kuralları:**
- **Ortalı, sabit genişlikli sayfa.** Her PT sayfası aynı ortalı içerik sütununda durur (`max-w-5xl`). Bileşenler bu genişliğe göre yerleşir: masaüstünde yan yana (formlar iki sütun, ayarlarda sağda kaydırınca yerinde kalan önizleme), telefonda alt alta.
- **Her şey shadcn bileşeni.** Yerleşim dahil: kartlar `Card`, arama `InputGroup`, boş durum `Empty`, uyarılar `Alert`, yükleniyor `Spinner`, sayfa yolu `Breadcrumb`. Elle yazılmış düğme/rol yok (istisnalar: React Bits'ten uyarlanan dock ve kas haritasının SVG'si).
- **Detay ve oluşturma ekranları sayfadır, modal değildir.** Kendi adresi olur, geri tuşuyla dönülür (`/…/new`, `/…/[id]`, `/…/[id]/edit`). Diyalog yalnız kısa onaylar içindir (ör. silme).
- **Üst çubuk yok.** Sağ üstte kullanıcı menüsü (avatar): görünüm ayarları ve çıkış burada. Dock yalnız gezinme içindir.
- Bağlantı olarak çizilen düğmelerde `nativeButton={false}` (Base UI, gerçek `<button>` olmayanı böyle bilmeli).
- Sayılar Türkçe biçimde: `2,5 kg` (`src/lib/format.ts`).
- **Kaslar:** 24 kas + kardiyo, haritadaki bölgelerle bire bir (sol ve sağ birlikte): üst göğüs, göğüs · ön/yan/arka omuz · üst trapez, orta sırt, kanat, bel · biceps, triceps, ön kol · karın, yan karın, serratus · kalça, yan kalça, kalça fleksörü, ön bacak, iç bacak, arka bacak, baldır, kaval · boyun. Formda ve özetlerde bölgelere göre gruplanır (`MUSCLE_GROUPS`). İlk sürümün 12'li grubundan kalan kayıtlar okunurken yenisine çevrilir.
- **Kas haritası** (`src/components/muscle-map`): ön/arka gövde, kasları gösterir. Veri çekmez, neyin yanacağını dışarıdan alır (`intensity` 0–1, `selected`, `onToggle`, `counts`); `flip` (tek gövde, `motion` ile çevrilir) ya da `split` (yan yana). Egzersiz listesinde süzgeç (`?muscle=chest,back`), egzersiz detayında çalışan kaslar; ileride program kapsamı ve haftalık yük ısı haritası. SVG yolları body-muscles'tan (Apache-2.0, LICENSE ve NOTICE klasörde).

**PT:** giriş · danışan listesi + detayı yan yana · antrenman şablonu düzenleyici (kütüphaneden sürükle-bırak) · egzersiz kütüphanesi · davet QR ekranı · canlı görünüm · ayarlar (marka, yönetim işlemleri).

**Danışan:** kodla giriş · bugünün antrenmanı · antrenman ekranı (set kaydı, dinlenme sayacı, su sayacı, sürükle-bırak) · antrenmanlarım (kendi şablonları, serbest antrenman) · geçmiş · profil · bağlantılar.

**Sağlık modülü açıksa ek olarak:** antrenman öncesi kısa hazır oluşluk sorusu, ağrı bölgesi, vücut ölçümleri. Kapalıysa bu ekranlar hiç görünmez, hiçbir kayıt tutulmaz.

---

## 7. Antrenman sırasında yazma davranışı — set başına, canlı

**Her set bitince bir commit.** Danışan başına ayrı repo olduğu için o repo'nun commit geçmişi doğrudan antrenman günlüğüdür: `Set 3/4 · Bench Press · 80 kg × 8`, dakikası dakikasına.

- **Ekran beklemez:** set kaydı önce telefonda tutulur, yazma arka planda kuyruğa girer.
- **Çevrimdışı güvenli:** salonda çekim yoksa kuyruk birikir, bağlantı gelince sırayla gönderilir. Telefon kapansa da kayıt kaybolmaz.
- **Tek dosya, sırayla:** her antrenman tek bir oturum dosyasıdır (`sessions/<tarih>-<id>.json`); yalnız o danışanın kuyruğu yazar, sırayla — çakışma olmaz.
- **PT canlı görür:** PT ekranında açık olan antrenman 10 sn'de bir tazelenir; genel görünüm (şu an kimler çalışıyor) daha seyrek. Yalnız ekrandaki veri çekilir.

**Sınır (GitHub):** içerik yazan istekler için dakikada 80, saatte 500 üst sınırı var. Set başına bir yazmayla bu, **aynı saat içinde ~20 tam antrenman** demek. 10-30 danışanlı bir antrenörde aynı saatte 3-8 kişi çalışır; pay rahat ama izlenecek sayı budur.

---

## 8. v1'den taşınacaklar

Tasarım dili, ekran akışları, Türkçe metinler, antrenman ekranı mantığı (set kaydı, dinlenme sayacı, su sayacı, sürükle-bırak), 1RM ve hacim hesapları, hazır oluşluk skoru ve deload mantığı (sağlık modülü açıkken), hazır antrenman şablonları.

**Taşınmayacaklar:** Postgres şeması, satır seviyesi güvenlik, Neon, Better Auth sunucusu, docker ortamı, polling altyapısı, e2e script'leri. v1 repo'su arşiv olarak kalır.

---

## 9. Bilinen riskler ve sınırlar

1. **GitHub token tarayıcıya inmez.** Bütün GitHub çağrıları sunucu tarafında yapılır.
2. **Token geniş yetkilidir — modelin bedeli budur.** *(Açık araştırma: GitHub App kullanılırsa bu token kısa ömürlü ve dar kapsamlı hâle gelebilir. GitHub App'in kişisel hesapta repo oluşturup oluşturamadığı doğrulanmadı; doğrulanırsa §9.2 büyük ölçüde kapanır.)* Repo oluşturup silebilmesi için hesap seviyesinde yönetici yetkisi gerekiyor; sızarsa aynı hesaptaki başka repolar da risk altında. Alınan önlemler:
   - Uygulama kodu **yalnız `client-` ile başlayan repolara** dokunur; bu kural veri katmanında tek noktada zorunludur, bir hata başka repoyu silemez.
   - Silme iki adımlıdır: PT danışanın adını yazarak doğrular.
   - Token yalnız bu iş için üretilir, süreli olur ve sadece Vercel ortam değişkenlerinde durur.
   - İleride daralmak isterse: danışan repoları ücretsiz bir GitHub organizasyonuna taşınabilir, token o organizasyona kısılır. Veri taşınır, kod değişmez.
3. **Repolar özel olmalı.** Oluşturma çağrısında `private: true` zorunlu; testlerle sabitlenir.
4. **Sağlık verisi özel nitelikli kişisel veridir (KVKK).** PT'nin modülü açması yetmez: danışan ilk girişte açıkça onaylar, istediğinde geri çeker. Onay yoksa kayıt tutulmaz.
5. **Silme.** Repo silinir; 90 gün boyunca yalnız hesap sahibi geri alabilir, sonra tamamen gider. Aynı işlemde diğer danışanların repo'sundaki bağlantı kayıtları ve uygulama repo'sundaki kimlik satırı da temizlenir.
6. **GitHub veritabanı değil:** yazma gecikmesi yarım saniye civarı, saatte 5.000 istek sınırı var, eşzamanlı yazma çakışabilir (yeniden deneme ile çözülür). Bu ölçekte sorun değil; çok PT'li bir servise dönüşürse mimari değişmeli.
7. **Danışan listesi N repo okuması ister** (30 danışan → 30 istek). Sunucu tarafı ETag önbelleğiyle tek seferlik maliyete iner.
8. **Vercel ücretsiz plan ticari kullanıma kapalı.** Danışanlardan ücret alınmaya başlanırsa ücretli plana geçmek ya da Cloudflare'e taşımak gerekir.

---

## 10. Marka ve tema düzenleyici

Uygulama beyaz etiketli: paketin adı `pulsecoach`, yayınlanan kurulumun adını ve görünümünü PT belirler.

**Temel tema:** shadcn preset'inin `globals.css`'i (Base UI, `base-nova`). Bütün bileşenler aynı CSS değişkenlerini okur; bu yüzden tema düzenleyici birkaç değişkeni değiştirerek bütün uygulamayı tutarlı biçimde değiştirebilir.

**Şu an düzenlenebilenler:** uygulama adı · logo · ana renk (`--primary`; "Tema" seçeneği temanın kendi koyu/açık rengini korur) · köşe yuvarlaklığı (`--radius`: keskin / hafif / yuvarlak / yumuşak) · varsayılan tema (koyu / açık / sistem).

**Kontrast:** PT hangi rengi seçerse seçsin üzerindeki yazı rengi kontrasta göre hesaplanır (açık renkte koyu, koyu renkte açık yazı).

**Yol haritası (web):** tema düzenleyicide uygulamanın bütün ekranları yan yana gösterilecek; her değişiklik hepsine anında yansıyacak, "Kaydet" denince seçim kalıcı olacak.

**Saklanma:** `pulsecoach.config.json` ve `media/brand/logo.<uzantı>`, uygulama repo'sunda.

---

## 11. Yönetim işleri ve repo'ya bağlı AI

**Uygulama içinde düğme olacaklar:** danışanı arşivle · danışanı ve verisini kalıcı sil · erişimi iptal et ve yeni QR üret · veriyi dışa aktar (JSON) · sağlık modülünü aç/kapat · bağlantı ver/kaldır · yedek indir (tüm repolar).

**Silme neden AI'a bırakılmıyor:** silme, repo silmenin yanında diğer repolardaki bağlantı kayıtlarını ve kimlik satırını temizlemeyi de gerektiriyor. Düğmeye basınca doğru çalışması gereken bir iş.

**AI bağlantısı — şu kurallarla:**
1. AI doğrudan ana dala yazmaz, **PR açar**; PT telefonundan onaylar.
2. Repo'da JSON şeması ve doğrulama script'i durur, PR'da otomatik çalışır.
3. Danışanların yazdığı metinler (isim, not) AI'ın okuduğu dosyalara giriyor; bu metinlerin içindeki cümleler talimat sayılmaz.

**Uygulama içi asistan** (PT kendi API anahtarıyla) v1 kapsamında değil.

---

## 12. Yol haritası

| Faz | İçerik |
|---|---|
| 0 | Proje iskeleti, tasarım tokenları, PT girişi |
| 1 | Kurulum sihirbazı (ad, logo, renk, tema) + GitHub veri katmanı (repo koruma kuralı dahil) |
| 2 | Egzersiz kütüphanesi ✓ · PT kabuğu (dock + sağ üstte kullanıcı menüsü) ✓ · kas haritası (süzgeç + detay) ✓ |
| 3 | Danışan ekleme (repo açma), sağlık modülü seçimi, QR davet, danışan girişi |
| 4 | Antrenman şablonu düzenleyici · antrenman ekranı (**set başına canlı yazma**, çevrimdışı kuyruk) · PT canlı görünüm · geçmiş |
| 5 | Sağlık modülü ekranları, onay akışı |
| 6 | Yönetim işlemleri (silme, dışa aktarma, yedek), JSON şeması + doğrulama, AI için PR kuralı |
| 7 | Bağlantılar (danışanların birbirini görmesi) |
| 8 | npm paketi, `create-pulsecoach`, kurulum rehberi |
