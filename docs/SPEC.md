# PulseCoach v2 — Spec

Tek antrenörlük (PT), GitHub'ı veritabanı olarak kullanan, mobil öncelikli web uygulaması.
Her PT uygulamayı kendi GitHub hesabına kurar, kendi adresinde yayınlar, kendi adını ve logosunu verir.

**Durum:** onay bekliyor · **Güncelleme:** 2026-09-23

---

## 1. Kararlar

| Konu | Karar |
|---|---|
| Dağıtım | PT kod repo'sunu **fork'lar**, Vercel'de yayınlar. Güncelleme GitHub'daki "Sync fork" ile gelir. npm paketi şimdilik yok |
| Veritabanı | GitHub. JSON dosyaları, yazma Octokit ile commit |
| Veri yerleşimi | Kod fork'unda **veri yok**. Veri, uygulamanın kendi açtığı özel repolarda: bir veri repo'su (`APP_REPO`) + **danışan başına ayrı özel repo** (`client-<id>`), PT'nin kişisel hesabında |
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

npm'de boşta: `pulsecoach`, `create-pulsecoach`, `@pulsecoach/app` (ileride gerekirse; bkz. §12 Faz 8).

---

## 2. Kurulum akışı (PT ne yapacak)

1. PulseCoach kod repo'sunu kendi hesabına **fork'lar**. Açık bir repo'nun fork'u GitHub'da gizli yapılamaz: fork herkese açık kalır, bu yüzden içine hiçbir veri yazılmaz.
2. Fork'u Vercel'e bağlar. Ayarlar:
   - `GITHUB_TOKEN` — repo oluşturma/silme yetkisi olan token (§9.2'deki uyarı)
   - `GITHUB_OWNER` — GitHub kullanıcı adı
   - `APP_REPO` — **veri** repo'sunun adı (ör. `pulsecoach-data`). Fork'un adından farklı olmalı; kurulum bu repo'yu özel olarak kendisi açar, var olan repo açık ya da bir fork ise durur
   - `PT_EMAIL` — uygulamaya girebilecek tek yönetici adresi
   - `AUTH_SECRET` — oturum çerezlerini imzalamak için
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub ile giriş (OAuth uygulaması; token'ı ürettiği ekranın hemen yanında, 2 dakika)
   - `RESEND_API_KEY` — **isteğe bağlı** yedek giriş (e-posta kodu). Girilmezse e-posta yolu kapalıdır.
3. Yayınlanır, PT girer, kurulum sihirbazı açılır (§10): ad, logo, renk, tema.
4. Güncelleme: GitHub'da fork'un sayfasında **"Sync fork"** → Vercel yeniden yayınlar. Veri repo'larına dokunulmaz.

**Kod fork'ta (açık olabilir), veri özel repolarda.** Kodda PT'ye özgü hiçbir şey yok: ad, renk, logo veri repo'sunda; sırlar Vercel ortam değişkenlerinde. Bu yüzden fork'u güncellemek hiçbir şeyi ezmez.

---

## 3. Veri yerleşimi

Kodun fork'u dışında iki tür repo var: **uygulama (veri) repo'su** (`APP_REPO`, kişisel veri yok) ve **danışan başına bir repo**. İkisi de özeldir ve uygulama tarafından açılır.

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
client.json                    isim, not, program ataması, modüller, onaylar, oturum kuşağı, bağlantı izinleri
invite.json                    davet kodunun anahtarlı özeti, süresi, kullanıldı bilgisi, yanlış deneme sayısı
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
  "id": "c_8f3k2m1x",                  // c_ + 8 rastgele karakter; isimden türetilmez
  "name": "Ahmet Yılmaz",
  "note": "Hedef: 5 km koşu",          // PT'nin notu; danışan görmez
  "createdAt": "2026-09-20T10:00:00Z",
  "status": "active",                  // active | paused | archived (arşivdeki giriş yapamaz)
  "program": { "templateId": "t_k2m9x4qa", "assignedAt": "..." },   // PT danışan formunda atar; şablon silinirse "silinmiş şablon" görünür
  "modules": {
    "health": {                        // PT danışanı açarken seçer
      "enabled": true,
      "fields": ["conditions", "readiness", "check_in"],   // + "measurements", "screening"
      "enabledAt": "..."
    }
  },
  "consents": {                        // danışan verir; kapsadığı parçalarla birlikte
    "health": { "granted": true, "version": "2026-09", "fields": ["conditions", "readiness"], "at": "..." }
  },
  "access": {                          // oturum kuşağı: "erişimi kapat" artırır, açık oturumlar düşer
    "version": 1, "joinedAt": "...", "lastJoinAt": "...", "revokedAt": "..."
  },                                   // katılım burada: invite.json her yeni kodda ezilir
  "visibleTo": ["c_2m1x9qa4"]          // Faz 7: bağlantı verilen diğer danışanlar (yalnız kimlik)
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
  "notes": "", "water": 3,
  "effort": { "sessionRpe": 6, "durationMin": 55 }   // CR-10, bitişten ~10 dk sonra; antrenman verisi
}
```

Sağlık modülünün parçaları (PT seçer, hepsi isteğe bağlı; ilk açılışta kısıtlar + hazır oluşluk seçili gelir): **kısıtlar** (süzgecin girdisi) · **hazır oluşluk** (antrenman öncesi uyku, enerji, kas ağrısı, stres; 1–5, serbest metin yok) · **ağrı takibi** (ağrı, belirtinin yönü, kırmızı bayrak) · **ölçümler** · **hareket taraması**. Hazır oluşluk da sağlık verisi sayılır (uyku, stres, yorgunluk); bu yüzden ayrı parçadır ve onaysız tutulmaz. Danışan onay ekranında tam olarak bu listeyi görür; onay isteği gördüğü listeyi ve metin sürümünü taşır, sunucu güncel listeyle birebir eşleşmeyen onayı reddeder.

Sağlık onayının durumu (`src/lib/client-status.ts`): modül kapalı → `off`; açık ama karar yok → `pending`; onay modüldeki bütün parçaları ve güncel metin sürümünü kapsıyorsa → `granted`; kapsamıyorsa → `outdated` (danışana yeniden sorulur, o zamana kadar kayıt yok); reddettiyse → `declined`. Sağlık kaydı yalnız `granted` iken ve o parça için yazılır (`canRecordHealth`).

**`health.json`** — yalnız modül açık ve danışan onaylamışsa yazılır. Kapalıysa dosya hiç oluşmaz. Şema: `src/lib/schemas/health.ts`.
```jsonc
{
  "sex": "female",
  "toleranceMode": "pain_free",                       // pain_free (≤3/10) | pain_monitoring (≤5/10)
  "conditions": ["lumbar_disc_herniation:acute"],      // sakatlık süzgecinin girdisi
  "surgeryDate": "2026-08-01",                         // faza bağlı kurallar (ACL haftası)
  "checkIns": [
    { "date": "2026-09-20",
      "readiness": { "sleep": 4, "energy": 3, "soreness": 4, "stress": 3 },   // yalnız hazır oluşluk açıksa
      "painBaseline": 3, "painPeak": 4, "returnedToBaseline": true,         // yalnız ağrı takibi açıksa
      "symptomDirection": "stable", "irritability": "moderate", "redFlag": "none" }
  ],
  "measurements": [ { "date": "2026-09-01", "id": "waist_girth", "value": 82 } ],
  "movementScreens": [ { "date": "2026-09-01", "entries": { "hurdle_step": { "left": 2, "right": 1 } } } ]
}
```
Ağrı, semptom, kırmızı bayrak, beden ölçüleri ve tarama sağlık verisidir (KVKK'da özel nitelikli) → `health.json`. Seansın zorluğu ve süresi antrenman verisidir → seans dosyası. Yük toleransı motoru ikisini okurken birleştirir; onay yoksa yalnız antrenman tarafıyla çalışır.

---

## 5. Kimlik doğrulama

**PT: GitHub ile giriş.** "GitHub ile devam et" → GitHub yetki ekranı → dönüşte sunucu, giren kullanıcının **`GITHUB_OWNER` ile aynı kişi olduğunu** doğrular; değilse oturum açılmaz. Kullanıcı tablosu yok, şifre yok.

Neden GitHub: PT zaten tanım gereği GitHub kullanıcısı (repoların sahibi o). Yeni hesap açması gereken hiçbir servis yok ve yetki kontrolü tam olarak doğru şeye bakıyor — "bu repoların sahibi mi".

**Yedek yol (varsayılan kapalı):** PT isterse `RESEND_API_KEY` girip e-posta kodu yöntemini açabilir. Amacı tek: OAuth ayarı yanlış girilirse kendi uygulamasına giremez hale gelmemek. Anahtar yoksa bu yol hiç görünmez.

**Danışan (QR davet):**
1. PT "danışan ekle" der, isim girer, sağlık modülünü açıp kapatır.
2. Sunucu `client-<id>` özel repo'sunu açar, kaydı yazar, veri repo'sundaki listeye yalnız kimlik ve durumu ekler. Yarıda kalırsa açtığı repo'yu geri siler (öksüz repo kalmaz).
3. PT davet ekranında "davet kodu üret" der: 8 haneli kod üretilir; repo'ya **yalnız kodun anahtarlı özeti** (HMAC-SHA256, anahtar `AUTH_SECRET`, danışan kimliği karışık), son kullanma (7 gün), `used: false` ve deneme sayacı yazılır. Kod yalnız o yanıtta vardır; sayfadan çıkınca bir daha gösterilemez.
4. PT'ye QR çıkar: `https://<adres>/join?c=<id>&k=<kod>`. Kimlik bağlantıda taşınır ki sunucu hangi repo'ya bakacağını bilsin.
5. Danışan QR'ı açar; kod ekranda hazır gelir, **"Giriş yap"a dokununca** (POST) kullanılır. Adresi açmak kodu harcamaz: mesajlaşma uygulamalarının bağlantı önizlemesi kodu tüketemez.
6. Sunucu kodu doğrular, `used: true` yapar (`sha` kilidiyle: aynı kod iki cihazdan aynı anda denense yalnız biri girer) ve tarayıcıya **imzalı, httpOnly oturum çerezi** yazar (30 gün).
7. Kod tek kullanımlıktır. 5 yanlış denemede davet kilitlenir. Deneme, kod karşılaştırılmadan **önce** `sha` kilidiyle sayılır: aynı anda gelen tahminlerden sayacı yazamayan hiç denenmez, GitHub istek sınırında da tahmin bedava olmaz. Listede olmayan kimlik GitHub'a hiç gitmez (önbellekli kimlik listesi), rastgele kimlikle istek yağdırmak saatlik sınırı tüketemez. Danışan kaybederse PT yeni kod üretir, eski kod anında geçersiz olur. Bilinmeyen kimlik ile davetsiz danışan aynı yanıtı alır.

Kodun kendisi hiçbir yerde saklanmaz; `localStorage`'da yalnızca "hangi danışanım" bilgisi tutulur, yetki her zaman çerezdedir.

**Kural (PT ekranları):** her PT sayfası `requirePt()`'yi kendisi çağırır; layout'taki kontrol yetmez. Next 16'da layout kardeş sayfanın çalışmasını durdurmaz ve sayfanın okuduğu veri RSC yanıtına girer (oturumsuz `RSC: 1` isteği egzersiz listesini böyle alabiliyordu).

**Kural (danışan):** girişten sonra sunucu yetkiyi **oturum çerezinden** okur, adresteki kimlikten değil. Danışan adrese başka bir kimlik yazarsa sunucu reddeder. Çerez danışanın **oturum kuşağını** (`access.version`) taşır; her danışan ekranı kaydı okurken karşılaştırır. PT düzenleme sayfasında **"Erişimi kapat"** derse kuşak artar: açık bütün oturumlar bir sonraki istekte düşer ve bekleyen davet silinir (ör. telefon kayboldu). Arşivlenen ya da silinen danışan da giremez. Danışanın ekranında "Çıkış" düğmesi vardır.

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
- **Detay sayfası yerleşimi (egzersiz, cihaz, aparat, danışan — hepsi aynı):** başlıkta yolu, adı, tek cümlelik açıklaması ve **tek eylem**: "Düzenle". Altında `lg:grid-cols-2`: **solda kaydın kendisi** (görsel: kas haritası / cihaz fotoğrafı / aparat fotoğrafı, ve video), **sağda bilgisi** (özet tablosu, ipuçları, medikal etiketler / ağırlık ayarı / takılı cihazlar). Başka kayıtlara bağlanan **uzun ilişki listeleri** (muadiller, bu cihazla yapılan egzersizler, bu aparatla yapılan egzersizler) en altta **tam genişlikte** durur ve kartın içinde `sm:grid-cols-2 lg:grid-cols-3` ızgarasına döner — tek sütunda iki ekran boyu liste olmaz. Danışanda solda profil, sağda giriş/davet ve sağlık modülü, altta antrenmanlar. Telefonda tek sütun; sıra soldaki kolonun sırasıdır.
- **Düzenleme sayfası yerleşimi:** form bölümlere ayrılmış kartlardır (egzersizde: Hareket · Ekipman, cihaz ve tutuş · Çalışan kaslar · Yük ve ilerleme · Medikal etiketler · Muadiller). Her kartın başlığı ve tek cümlelik gerekçesi olur; kart başlığıyla içindeki alan başlığı tekrar etmez. **Yıkıcı eylemler ("Sil", "Varsayılana dön") düzenleme sayfasının başlığındadır**, detayda değil: değiştiren her şey tek yerde.
- Bağlantı olarak çizilen düğmelerde `nativeButton={false}` (Base UI, gerçek `<button>` olmayanı böyle bilmeli).
- Sayılar Türkçe biçimde: `2,5 kg` (`src/lib/format.ts`).
- **Kaslar:** 35 kas + kardiyo, kas haritasının parçalarıyla bire bir; sol ve sağ birlikte seçilir (üst/alt göğüs · ön/yan/arka omuz · üst/orta/alt trapez · üst/orta/alt kanat · bel dikleştiricileri, QL · biceps, triceps uzun/dış baş, ön kol bükücü/açıcı · üst/alt karın, yan karın, serratus · kalça, yan kalça, kalça fleksörü, ön bacak, iç bacak, arka bacak iç/dış, baldır iç/dış, soleus, kaval · boyun, ense). Kasın hareketteki payı **üç seviyede**: hedef (`primaryMuscles`, en az 1), yardımcı, dengeleyici (`stabilizerMuscles`: hareketi taşımayan ama gövdeyi sabit tutan, ör. squat'ta karın). Seviye her kas için ayrıdır, birden çok kas aynı anda hedef olabilir (thruster: ön bacak, kalça, ön omuz); bir kas yalnız bir seviyede bulunur. Haftalık yükte bir set hedefe 1, yardımcıya 0,5, dengeleyiciye 0,25 sayılır (kesirli set, `ROLE_SET_WEIGHT`). Süzgeç ve kas sayıları dengeleyiciyi saymaz. Özetlerde bütün parçaları seçili kas tek adla yazılır (`MUSCLE_FAMILIES`: üç kanat parçası → "Kanat"). Formda kaslar haritadan seçilir: dokunuş boş → hedef → yardımcı → dengeleyici → boş. Önceki sürümlerin kas adları ve tek `targetMuscle` alanı okunurken çevrilir.
- **Sakatlık süzgeci** (`src/lib/conditions.ts`, `src/lib/exercise-filter.ts`): egzersizin biyomekanik etiketleri + danışanın kısıtları → üç karar (`block` yaptırma, `warn` dikkat, `cue` ipucu). Kanıtı zayıf olan hiçbir şey yasak değildir; bilgi eksikse kural **sessizce atlanır** ve sayılır, etiketsiz hareket "uygun" sayılmaz. Eklem kuralları yalnız o eklemi çalıştıran harekete işler (diz kuralı face pull'u yasaklamaz). PT elle yasaklayabilir; "sorun yok" demesi uyarıyı susturur, yasağı susturmaz. Egzersiz listesinde `?limit=lumbar_disc_herniation:acute,…` ile önizlenir — danışan modülü gelince aynı motor onun kaydından beslenir.
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
- **Aparatlar:** kabloda ve bazı makinelerde takılan tutamaçlar. Cihazdan bağımsız bir **havuz**tur (cihazların egzersizlere bağlanması gibi): hazır liste pakette (`src/data/attachment-library.ts`), PT'nin eklediği ya da değiştirdiği aparatlar uygulama repo'sunda (`data/attachments.json`, aynı kimlikte PT'ninki kazanır). Sayfa: `/dashboard/attachments` ("Antrenman" bölümünde "Aparatlar" sekmesi) — aparat burada eklenir, adı ve **fotoğrafı** (`media/attachments/<kimlik>-<özet>.<uzantı>`, PNG/JPG/WebP, en fazla 1 MB) burada bir kez yönetilir; aynı aparat kaç cihazda kullanılırsa kullanılsın fotoğraf tektir. Cihaz formunda hangi aparatların takılabildiği havuzdan işaretlenir (`attachments: string[]`, en fazla 12); egzersiz `attachmentId` ile cihazın aparatlarından birini seçer. PT'nin aparatı silinince fotoğrafı da silinir, seçili olduğu cihazlardan ve egzersizlerden düşer; cihaz silinince aparatlar havuzda kalır.
- **Tutuş (`src/lib/grips.ts`):** egzersizde `grip` (pronasyon / supinasyon / nötr / karışık) ve `gripWidth` (dar / omuz / geniş). Kaslar belirgin değişiyorsa ayrı egzersiz açılır (ör. "Ters Tutuş Lat Pulldown"); bu alanlar küçük farkı taşır ve muadil sıralamasında aynı tutuş öne gelir.
- **Görsel:** cihaz başına tek fotoğraf (`media/devices/<id>-<özet>.<uzantı>`, PNG/JPG/WebP, en fazla 1 MB, SVG yok). Danışan salonda makineyi tanısın diye; listede küçük, detayda büyük görünür. Egzersizlerde görsel yok (video + kas haritası yeterli).
- Cihaz silinirse bağlı egzersizler cihazsız kalır ve kendi adımlarıyla devam eder.

### 7.4 Şablonlar: gruplar ve kas yükü haritası (Faz 4)

- **Dosya:** her şablon uygulama repo'sunda ayrı dosya: `data/templates/<id>.json`. Kimlik `t_` + 8 rastgele karakter; addan türetilmez, ad değişse de kimlik ve dosya aynı kalır. Şablonda kişisel veri yok (danışan adı, sağlık bilgisi yazılmaz); program ataması danışanın kendi repo'sundadır. Sayfalar: `/dashboard/templates` (liste, detay, ekleme, düzenleme; "Antrenman" bölümünün ilk sekmesi).
- **Bloklar ve satırlar:** şablon sıralı bloklardan oluşur; blok tek hareket ya da gruptur. Her hareket bir **satırdır** ve kalıcı kimliği vardır (`r_` + 6 karakter): sıralama, gruplama, hareket ya da cihaz değişimi kimliği değiştirmez, antrenman kayıtları satıra bu kimlikle bağlanır. Satırda egzersiz, hedef (tekrar aralığı; süreli harekette saniye), isteğe bağlı kural değişikliği (ilerleme türü, yedekte tekrar), isteğe bağlı cihaz ve not durur; set sayısı ve dinlenme bloktadır. Isınma setleri saklanmaz, antrenmanda `warmupSets` ile hesaplanır.
- **Gruplar:** arka arkaya yapılan hareketler tek egzersiz değil, şablonda grup olarak tutulur: süperset (2 hareket), devre (3–8 hareket, istasyonlar arası kısa geçişle), kompleks (2–6 hareket, aynı ağırlıkla ara vermeden). Grupta her hareket turda bir set yapar; tur sayısı ve tur sonu dinlenme gruptadır. Her hareket kendi kaslarını ve ilerleme kuralını korur; grup yalnız sırayı ve dinlenmeyi belirler. Hareket sayısı değişince tür kendiliğinden uyar (üçüncü hareket eklenen süperset devre olur).
- **Düzenleyici:** hareket kütüphaneden (ada ya da kasa göre arayarak) eklenir, sürükle-bırakla ya da ok tuşlarıyla sıralanır; gruplama satırın menüsünden yapılır. Satırın cihazı değiştirilince hareket o cihazdaki aynı kalıptaki muadile geçer (`alternativeForDevice`, PT'nin sabitledikleri önce); yoksa ve ekipman aynıysa hareket aynı kalır, satıra yalnız cihaz yazılır; o da olmazsa başka bir muadile geçer.
- **Şablon haritası:** şablondaki bütün çalışma setlerinin kesirli set toplamı (hedef 1 · yardımcı 0,5 · dengeleyici 0,25) kas başına hesaplanır; aynı kas birden çok harekette varsa değer toplanır. Isınma ve soğuma türündeki hareketler ve ısınma setleri sayılmaz. Haritanın tonu şablonun en çok çalışan kasına göredir.
- **Kütüphaneden silinen egzersiz** şablonda uyarıyla kalır, haritaya ve sayılara girmez; kaydetmeden önce değiştirilmesi ya da kaldırılması gerekir. Silinen cihaza yazılmış satır, egzersizin kendi cihazına döner.
- **Haftalık yük haritası (program ve danışan):** kas başına haftalık set toplamı kademeli renkle ve açıklama kutusuyla gösterilir — gri: 0 · açık: 1–9 (az) · vurgu rengi: 10–20 (yeterli) · uyarı rengi: 20+ (fazla). Değer girilmez, set kayıtlarından hesaplanır. Renkler tema tokenlarından (PT'nin vurgu rengi korunur).

---

### 7.5 Ölçüm ve yük toleransı (`src/lib/check-in.ts`, `src/lib/measurements.ts`)

Kaynak: `docs/research/medical-fitness/`. Ölçüm ayrı bir modül değil, **öneri motorunun girdisidir**.

**Seans yoklaması (her seans, tek ekran):** son 24 saat ağrısı (0–10), seans içi en yüksek ağrı, önceki seansın ağrısı ertesi sabah geçti mi, semptom yönü (merkeze çekiliyor / değişmedi / aşağı yayılıyor), irritabilite, seans RPE (CR-10) ve süresi, ağrısız yürüme süresi, **kırmızı bayrak sorusu** (her seans cevaplanır; "yok" da cevaptır). Tolere edilen en yüksek set ve uyum seans kayıtlarından hesaplanır, elle girilmez.

**Ağrı izleme kuralı** (Silbernagel 2007; ağrısız/ağrılı egzersiz RKÇ'si):
| Koşul | Karar | Öneriye etkisi |
|---|---|---|
| Kırmızı bayrak ya da semptom aşağı yayılıyor | `stop` | Yük yok, "önce değerlendirme" (`paused`) |
| Ağrı ertesi sabah geçmedi | `reduce` | Son ağırlıktan %15 aşağı, adıma yuvarlı (`pain_reduce`) |
| Seans içi ağrı tavanı aştı (varsayılan 3/10; tendinopatide PT 5/10 seçebilir) | `reduce` | Aynı |
| Haftalık ortalama ağrı ≥2 puan arttı (NPRS'de en küçük anlamlı fark) | `hold` | Artış geri çekilir (`pain_hold`) |
| İrritabilite yüksek | `hold` | Aynı; izometrik ve ağrısız aralık önerilir |

En ağır karar kazanır, gerekçelerin hepsi listelenir. Varsayılan tavan tutucudur: ağrıya girerek çalışmanın üstünlüğü gösterilmedi.

**İç yük:** sRPE = RPE × dakika (AU); haftalık toplam ve önceki haftaya göre değişim saklanır. **Akut:kronik iş yükü oranı (ACWR) bilinçli olarak kodlanmaz** — eşikleri doğrulanmamış, matematiksel eşleşmeden sahte ilişki üretiyor. Eşik yok; yorumu PT yapar.

**Periyodik ölçümler:** önerilen — vücut ağırlığı, boy, bel ve kalça çevresi (ISAK), 5 tekrar otur-kalk, ayak bileği lunge testi, bölgeye göre anket skoru (ODI / SPADI / VISA-P); isteğe bağlı — kol/uyluk/baldır çevresi, gövde dayanıklılık bataryası (fleksör, Biering-Sørensen, yan köprü). Yorumlayıcılar: bel-kalça oranı (erkek ≥0,90, kadın ≥0,85 artmış risk), otur-kalk (>12 sn değerlendirme, >15 sn tekrarlayan düşme riski). **Ölçüm hatasının altındaki değişim "gelişme" diye raporlanmaz:** otur-kalkta 2,3 sn, gövde dayanıklılığında %25 (tipik hata %12–24); yan köprü asimetrisi de bu bant aşılmadan işaretlenmez.

**Hareket taraması (FMS):** yalnız PT'nin girdiği patern puanları (0–3, gerekirse sağ/sol) ve clearing testi ağrısı. **Toplam skor saklanmaz** (sakatlık öngörüsü çelişkili); asimetri, ağrı bayrağı (0 puan ya da ağrılı clearing → tıbbi değerlendirme) ve en düşük patern gösterilir. Test yönergeleri ve puanlama tablosu tescilli olduğu için uygulamada yer almaz.

## 8. v1'den taşınacaklar

Tasarım dili, ekran akışları, Türkçe metinler, antrenman ekranı mantığı (set kaydı, dinlenme sayacı, su sayacı, sürükle-bırak), 1RM ve hacim hesapları, hazır oluşluk skoru ve ona bağlı deload (sağlık modülü açıkken; performansa bağlı hafifletme, ısınma ve aşırı yük kuralı §7.1'de taşındı), hazır antrenman şablonları.

**Taşınmayacaklar:** Postgres şeması, satır seviyesi güvenlik, Neon, Better Auth sunucusu, docker ortamı, polling altyapısı, e2e script'leri. v1 repo'su arşiv olarak kalır.

---

## 9. Bilinen riskler ve sınırlar

1. **GitHub token tarayıcıya inmez.** Bütün GitHub çağrıları sunucu tarafında yapılır.
2. **Token geniş yetkilidir — modelin bedeli budur.** *(Açık araştırma: GitHub App kullanılırsa bu token kısa ömürlü ve dar kapsamlı hâle gelebilir. GitHub App'in kişisel hesapta repo oluşturup oluşturamadığı doğrulanmadı; doğrulanırsa §9.2 büyük ölçüde kapanır.)* Repo oluşturup silebilmesi için hesap seviyesinde yönetici yetkisi gerekiyor; sızarsa aynı hesaptaki başka repolar da risk altında. Alınan önlemler:
   - Uygulama kodu **yalnız `client-` ile başlayan repolara** dokunur; bu kural veri katmanında tek noktada zorunludur, bir hata başka repoyu silemez.
   - Silme iki adımlıdır: PT danışanın adını yazarak doğrular (kontrol sunucuda da yapılır).
   - Token yalnız bu iş için üretilir, süreli olur ve sadece Vercel ortam değişkenlerinde durur.
   - İleride daralmak isterse: danışan repoları ücretsiz bir GitHub organizasyonuna taşınabilir, token o organizasyona kısılır. Veri taşınır, kod değişmez.
3. **Repolar özel olmalı.** Oluşturma çağrısında `private: true` zorunlu; testlerle sabitlenir.
4. **Sağlık verisi özel nitelikli kişisel veridir (KVKK).** PT'nin modülü açması yetmez: danışan ilk girişte açıkça onaylar, istediğinde geri çeker. Onay yoksa kayıt tutulmaz.
5. **Silme.** Repo silinir; 90 gün boyunca yalnız hesap sahibi geri alabilir, sonra tamamen gider. Aynı işlemde diğer danışanların repo'sundaki bağlantı kayıtları ve uygulama repo'sundaki kimlik satırı da temizlenir.
6. **GitHub veritabanı değil:** yazma gecikmesi yarım saniye civarı, saatte 5.000 istek sınırı var, eşzamanlı yazma çakışabilir (yeniden deneme ile çözülür). Bu ölçekte sorun değil; çok PT'li bir servise dönüşürse mimari değişmeli.
7. **Danışan listesi N repo okuması ister** (30 danışan → 30 istek). Sunucu tarafı ETag önbelleğiyle tek seferlik maliyete iner.
8. **Kod fork'u açıktır.** Açık bir repo'nun fork'u gizli yapılamaz. Bu yüzden uygulama kod repo'suna hiçbir şey yazmaz; `APP_REPO` fork'un adıyla çakışırsa ya da açık/fork bir repo'yu gösterirse kurulum durur (`createAppRepo`). PT'nin kodda yaptığı değişiklikler de herkese açık olur.
9. **Vercel ücretsiz plan ticari kullanıma kapalı.** Danışanlardan ücret alınmaya başlanırsa ücretli plana geçmek ya da Cloudflare'e taşımak gerekir.

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
| 3 | Danışan ekleme (repo açma) ✓ · sağlık modülü seçimi ✓ · QR davet ✓ · danışan girişi ✓ · sağlık onayı (ver/geri çek) ✓ · erişimi kapat ✓ · silme (adı yazarak) ✓ |
| 4 | **4a** Antrenman şablonları ✓: düzenleyici (kütüphaneden ekleme, sürükle-bırak sıralama, gruplar: süperset/devre/kompleks, satırda kural ve cihaz değişimi), şablon kas haritası · **4b** antrenman ekranı (**set başına canlı yazma**, çevrimdışı kuyruk, zorluk düğmeleri, §7.1 önerileri) · program atama · haftalık yük haritası · PT canlı görünüm · geçmiş |
| 5 | Sağlık modülü ekranları, onay akışı |
| 6 | Yönetim işlemleri (silme, dışa aktarma, yedek), JSON şeması + doğrulama, AI için PR kuralı |
| 7 | Bağlantılar (danışanların birbirini görmesi) |
| 8 | Fork'la kurulum: "Deploy to Vercel" düğmesi, kurulum rehberi (token, OAuth uygulaması, `APP_REPO`), güncelleme = "Sync fork". npm paketi / `create-pulsecoach` yalnız gerekirse |
