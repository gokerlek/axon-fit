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
| Görseller | Egzersiz görseli yok: video + kas haritası yeterli. Repo'da yalnız logo |
| Videolar | Yalnız YouTube/Vimeo bağlantısı (liste dışı da olur); dosya yükleme R2 ile gelir (Vercel isteği ~4,5 MB ile sınırlı) |
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
  devices/<id>-<özet>.<uzantı> cihaz fotoğrafları (en fazla 1 MB)
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
    { "exerciseId": "squat", "sets": [
      { "type": "warmup",  "kg": 20, "reps": 10 },
      { "type": "working", "kg": 80, "reps": 8, "effort": "good" }   // effort: easy | good | hard | fail
    ] }                                                              // süreli harekette "reps" yerine "seconds"
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
- **Üst çubuk yok.** Sağ üstte kullanıcı menüsü (avatar): görünüm ayarları ve çıkış burada. Dock yalnız gezinme içindir: Genel bakış · Danışanlar · **Antrenman**. Antrenman bölümünün içinde sekmeler: Şablonlar · Egzersizler · Cihazlar (her sekme kendi sayfası; `training-tabs.tsx`). Egzersiz ve cihaz arada bir düzenlenen başvuru kaynakları olduğu için dock'ta ayrı yer kaplamaz; şablon düzenleyicide egzersiz seçici ve satır içi cihaz değişimiyle kullanılır.
- Bağlantı olarak çizilen düğmelerde `nativeButton={false}` (Base UI, gerçek `<button>` olmayanı böyle bilmeli).
- Sayılar Türkçe biçimde: `2,5 kg` (`src/lib/format.ts`).
- **Kaslar:** 35 kas + kardiyo, kas haritasının parçalarıyla bire bir; sol ve sağ birlikte seçilir (üst/alt göğüs · ön/yan/arka omuz · üst/orta/alt trapez · üst/orta/alt kanat · bel dikleştiricileri, QL · biceps, triceps uzun/dış baş, ön kol bükücü/açıcı · üst/alt karın, yan karın, serratus · kalça, yan kalça, kalça fleksörü, ön bacak, iç bacak, arka bacak iç/dış, baldır iç/dış, soleus, kaval · boyun, ense). Kasın hareketteki payı **üç seviyede**: hedef (`primaryMuscles`, en az 1), yardımcı, dengeleyici (`stabilizerMuscles`: hareketi taşımayan ama gövdeyi sabit tutan, ör. squat'ta karın). Seviye her kas için ayrıdır, birden çok kas aynı anda hedef olabilir (thruster: ön bacak, kalça, ön omuz); bir kas yalnız bir seviyede bulunur. Haftalık yükte bir set hedefe 1, yardımcıya 0,5, dengeleyiciye 0,25 sayılır (kesirli set, `ROLE_SET_WEIGHT`). Süzgeç ve kas sayıları dengeleyiciyi saymaz. Özetlerde bütün parçaları seçili kas tek adla yazılır (`MUSCLE_FAMILIES`: üç kanat parçası → "Kanat"). Formda kaslar haritadan seçilir: dokunuş boş → hedef → yardımcı → dengeleyici → boş. Önceki sürümlerin kas adları ve tek `targetMuscle` alanı okunurken çevrilir.
- **Kas haritası** (`src/components/muscle-map`): ön/arka gövde, kasları gösterir. Veri çekmez, neyin yanacağını dışarıdan alır (`intensity` 0–1, `selected`, `onToggle`, `counts`); `flip` (tek gövde, `motion` ile çevrilir) ya da `split` (yan yana). Egzersiz listesinde süzgeç (`?muscle=chest,back`), egzersiz detayında çalışan kaslar; ileride program kapsamı ve haftalık yük ısı haritası. SVG yolları body-muscles'tan (Apache-2.0, LICENSE ve NOTICE klasörde). Kaynakta ön görünümdeki karın ve omuz parçalarının adları karışıktı (ör. "abs-upper" aslında yan karın); bu yollar alt parçalarına bölünüp anatomik yerlerine göre yeniden adlandırıldı (`paths.ts` başındaki not).

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

### 7.1 İlerleme ve öneriler (progressive overload)

Öneri motoru `src/lib/progression.ts`: saf fonksiyonlar, testleri `npm test`. Öneri her zaman öneridir; danışan ya da PT başka ağırlık girebilir.

- **Ağırlık adımı ≠ artış.** Egzersizdeki `loadStepKg` aletin en küçük sıçramasıdır (halter 2,5 · dambıl 2 · makine 5 · kablo 2,5 · kettlebell 4; ağırlıksız harekette 0), `minLoadKg` barın/aletin kendi ağırlığı. Ne kadar artacağını danışanın performansı belirler, sonuç adıma yuvarlanır.
- **Kural:** `progression = { scheme: double | linear | none, targetMin, targetMax, targetRir }`. Egzersizde yoksa türüne göre varsayılan (bileşik 6–10 · izolasyon 10–15 · vücut ağırlığı 6–12 / 8–15 · süre 30–60 sn · ısınma/soğuma ilerlemesiz). Şablondaki egzersiz satırı kuralı değiştirebilir (Faz 4).
- **Zorluk:** danışan her çalışma setinden sonra tek dokunuşla seçer: Kolay / İyi / Zor / Başaramadım (yedekte ~4 / 2 / 1 / 0 tekrar).
- **Bir sonraki antrenman (`nextSession`):** çift ilerlemede bütün setler aralığın tepesindeyse bir adım (çok kolaysa iki), tekrar hedefi alta döner; değilse aynı ağırlık, en düşük tekrar + 1. Doğrusalda her başarılı antrenmanda bir adım. Bir set hedefin altındaysa ağırlık korunur; hiçbiri ulaşmadıysa ~%5 iner (en az bir adım). Ağırlıksız harekette tekrar (+1) ya da süre (+5 sn); tepede "ağırlık ekle ya da zor varyasyon".
- **Hafifletme:** 3 antrenman üst üste tıkanırsa ağırlık %15 düşer (adıma aşağı; tabanın altına inmez), çalışma setleri üçte ikiye iner (v1 K16).
- **Aynı antrenmanda (`nextSet`):** setler aynı ağırlıkta kalır; başarısız ya da hedefin 3+ altı → ~%5 aşağı; "kolay" ve tepede → bir adım yukarı.
- **Isınma (`warmupSets`, v1 §7.8):** halterle bileşik hareket, kas grubunun ilk hareketi ve ≥ 40 kg ise boş bar × 10 + 1–3 ara set.
- **Aşırı yük (`isOverload`, v1 K14):** hedef + max(%20, 5 kg) üstü girilen set PT'ye bildirilir; reddedilmez.
- İlk sürümün `loadIncrementKg` alanı okunurken `loadStepKg`'ye çevrilir.
- **Egzersiz türleri:** bileşik, izolasyon, **kondisyon** (tüm vücut, kardiyoyla karışık: burpee, battle rope, kızak; varsayılan ilerleme süre/tekrar), ısınma, soğuma. Kondisyon hareketinde "Kardiyo" ve kaslar birlikte işaretlenir.

### 7.2 Muadiller (alternatif hareketler)

Alet doluysa, yoksa ya da danışana uygun değilse yerine ne yapılır (`src/lib/alternatives.ts`, testleri `npm test`).

- Her egzersizin **hareket kalıbı** var (`pattern`: yatay/dikey itiş, yatay/dikey çekiş, squat, kalça menteşesi, tek bacak, kalça itişi, diz açma/bükme, dirsek bükme/açma, taşıma, karın bükme/sabitleme/döndürme, kardiyo, mobilite…). Formda zorunlu.
- Muadiller elle listelenmez, **hesaplanır**: aday, kaynakla en az bir hedef kası ya da kas ailesini paylaşmalı (kardiyo kardiyoyla); güç hareketleri ile ısınma/soğuma birbirine önerilmez. Sıra: aynı kalıp → aynı hedef kas → aynı kas ailesi → bütün kas yükünün benzerliği.
- **PT sabitleyebilir** (`alternatives`: egzersiz kimlikleri, en fazla 12): detay sayfasındaki "Muadiller" kartında iğneyle; sabitlenenler en üstte "Senin seçtiklerin". Hazır egzersizde sabitlemek PT'nin sürümünü oluşturur. Form bu alana dokunmaz.
- Kart ekipmana göre gruplu, **ekipmansız grup en başta**.
- Faz 4: antrenman ekranında "Değiştir" düğmesi aynı listeyi kullanır; muadilin kendi geçmişi ve ilerlemesi vardır.

### 7.3 Cihazlar

Genel cihaz listesi (salon envanteri yok): hazır katalog pakette (`src/data/device-library.ts`, 38 cihaz), PT'nin eklediği ya da ayarını değiştirdiği cihazlar uygulama repo'sunda (`data/devices.json`, aynı kimlikte PT'ninki kazanır). Sayfalar: `/dashboard/devices` (liste, detay, ekleme, düzenleme; "Antrenman" bölümünde "Cihazlar" sekmesi).

- **Türler ve ağırlık ayarı** (`src/lib/device-loads.ts`): ağırlık bloklu makine (ilk blok, adım, en ağır blok, **ara ağırlıklar** +0,5…+5 kg — ör. +1,75 — seçilebilir, birlikte takılabilir), kablo (aynıları + **makara oranı** 1:1 / 2:1 / 3:1 / 4:1), plaka yüklemeli (kızak + en küçük artış), bar (bar + en küçük artış), dambıl/kettlebell seti (ağırlık listesi), ekipmansız istasyon, bant, kardiyo.
- **Makara:** çift makarada (2:1) blok yarı yol gider, kolda seçilenin **yarısı** hissedilir. Kayıt ve öneri cihazda seçilen ağırlıkla yapılır; gerçek direnç yalnız karşılaştırma için (`effectiveLoadKg`).
- **Öneriler cihazın ağırlıklarından:** egzersiz `deviceId` ile cihaza bağlanır; öneri motoru cihazın ayarlanabilen ağırlıklarını kullanır (ara ağırlıklar dahil; setteki boşluklar atlanır: 16 → 20). Bar ve plaka yüklemelide düzenli adım. Cihazsız egzersiz kendi `loadStepKg`/`minLoadKg`'sini kullanır.
- **Cihaza göre muadil:** `alternativeForDevice` — cihaz değişince egzersiz, o cihazla yapılan en iyi muadile geçer (PT'nin sabitledikleri önce). Egzersiz detayındaki "Cihaz değişirse" bunu gösterir; şablonda satırın cihazı değiştirilince aynısı olur (Faz 4). Muadiller kartı cihaza göre gruplu.
- **Geçmiş cihaza göre (Faz 4):** her set kaydına cihaz kimliği de yazılır; ilerleme aynı egzersizin aynı cihazdaki geçmişine bakar (farklı makinelerin kiloları birbirini tutmaz).
- **Aparatlar:** kabloda ve bazı makinelerde takılan tutamaçlar (düz bar, lat barı, geniş çekiş barı, V bar, halat, tek el tutamağı, EZ bar, ayak bilekliği). Cihazda hangilerinin olduğu seçilir; egzersiz hangisiyle yapıldığını söyler.
- **Tutuş (`src/lib/grips.ts`):** egzersizde `grip` (pronasyon / supinasyon / nötr / karışık) ve `gripWidth` (dar / omuz / geniş). Kaslar belirgin değişiyorsa ayrı egzersiz açılır (ör. "Ters Tutuş Lat Pulldown"); bu alanlar küçük farkı taşır ve muadil sıralamasında aynı tutuş öne gelir.
- **Görsel:** cihaz başına tek fotoğraf (`media/devices/<id>-<özet>.<uzantı>`, PNG/JPG/WebP, en fazla 1 MB, SVG yok). Danışan salonda makineyi tanısın diye; listede küçük, detayda büyük görünür. Egzersizlerde görsel yok (video + kas haritası yeterli).
- Cihaz silinirse bağlı egzersizler cihazsız kalır ve kendi adımlarıyla devam eder.

### 7.4 Şablonda gruplar ve kas yükü haritası (Faz 4)

- **Gruplar:** arka arkaya yapılan hareketler tek egzersiz değil, şablonda grup olarak tutulur: süperset (2 hareket), devre (3+ hareket, tur sayısıyla), kompleks (aynı ağırlıkla ara vermeden). Her hareket kendi kaslarını ve ilerleme kuralını korur; grup yalnız sırayı ve dinlenmeyi belirler.
- **Şablon haritası:** şablondaki bütün setlerin kesirli set toplamı (hedef 1 · yardımcı 0,5 · dengeleyici 0,25) kas başına hesaplanır; aynı kas birden çok harekette varsa değer toplanır.
- **Haftalık yük haritası (program ve danışan):** kas başına haftalık set toplamı kademeli renkle ve açıklama kutusuyla gösterilir — gri: 0 · açık: 1–9 (az) · vurgu rengi: 10–20 (yeterli) · uyarı rengi: 20+ (fazla). Değer girilmez, set kayıtlarından hesaplanır. Renkler tema tokenlarından (PT'nin vurgu rengi korunur).

---

## 8. v1'den taşınacaklar

Tasarım dili, ekran akışları, Türkçe metinler, antrenman ekranı mantığı (set kaydı, dinlenme sayacı, su sayacı, sürükle-bırak), 1RM ve hacim hesapları, hazır oluşluk skoru ve ona bağlı deload (sağlık modülü açıkken; performansa bağlı hafifletme, ısınma ve aşırı yük kuralı §7.1'de taşındı), hazır antrenman şablonları.

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
| 4 | Antrenman şablonu düzenleyici (gruplar: süperset/devre/kompleks, şablon kas haritası) · antrenman ekranı (**set başına canlı yazma**, çevrimdışı kuyruk, zorluk düğmeleri, §7.1 önerileri) · haftalık yük haritası · PT canlı görünüm · geçmiş |
| 5 | Sağlık modülü ekranları, onay akışı |
| 6 | Yönetim işlemleri (silme, dışa aktarma, yedek), JSON şeması + doğrulama, AI için PR kuralı |
| 7 | Bağlantılar (danışanların birbirini görmesi) |
| 8 | npm paketi, `create-pulsecoach`, kurulum rehberi |
