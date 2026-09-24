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
client.json                    isim, not, modüller, onaylar, oturum kuşağı, bağlantı izinleri
program.json                   danışanın kendi programı: evreler, günler, rotasyon, program geçmişi (§7.4)
invite.json                    davet kodunun anahtarlı özeti, süresi, kullanıldı bilgisi, yanlış deneme sayısı
sessions/<tarih>-<id>.json     tamamlanmış antrenman (her biri yeni dosya)
health.json                    yalnız sağlık modülü açık ve onaylıysa oluşur
```

**Repo adında isim geçmez** (`client-c8f3k`): repo adları silindikten sonra da denetim kayıtlarında kalabiliyor.

**Neden ayrı repo:** danışan "verilerimi sil" dediğinde repo silinir; 90 gün geri alma penceresinden sonra tamamen gider. Başka hiçbir verinin geçmişine dokunulmaz.

**Neden her antrenman ayrı dosya:** aynı dosyaya eşzamanlı yazma olmaz, çakışma riski sıfıra iner, geçmiş doğal olarak birikir.

**Neden program danışanın repo'sunda:** program kişiye özeldir, şikâyet ve isteklere göre değişir; uygulama repo'sundaki şablon yalnız başlangıç noktasıdır. Program değişikliklerinin tam kaydı bu repo'nun git geçmişidir.

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

**`client-<id>` içinde `program.json`** — danışana özel program; şema `src/lib/schemas/program.ts`.
```jsonc
{
  "version": 2,
  "phased": true,                      // evrelere bölündü mü; false: tek, süresiz gün listesi (gizli tek evre)
  "revision": 7,                       // PT'nin her kaydında +1; düzenleyici çakışmayı bununla yakalar
  "createdAt": "2026-09-24T09:00:00.000Z",
  "updatedAt": "2026-10-02T18:12:00.000Z",
  "phases": [
    { "id": "p_k2m9x4", "name": "Uyum", "weeks": 2,   // isteğe bağlı (1–52); yoksa süresiz
      "daysPerWeek": 3,                // isteğe bağlı 1–7; evresizde programın sıklığı
      "days": [
        { "id": "d_q2m8xk", "name": "Gün A",
          "source": { "templateId": "t_k2m9x4qa", "templateName": "Alt vücut A", "at": "..." },   // günün geldiği şablon ve o anki adı; şablon değişse ya da silinse de program değişmez
          "blocks": [                  // şablondakiyle aynı bloklar (§7.4); kimlikler bütün programda benzersiz
            { "id": "b_…", "kind": "single", "restSeconds": 120, "rows": [
              { "id": "r_…", "exerciseId": "goblet-squat", "sets": [
                { "min": 12, "max": 12, "loadPct": 80 }, { "min": 10, "max": 10, "loadPct": 90 }, { "min": 8, "max": 8, "amrap": true } ] } ] }
          ] },                         // blokta set sayısı yok; grupta tur = en çok seti olan hareket
        { "id": "d_7h2k9m", "name": "Gün B", "blocks": [ … ] }
      ] },
    { "id": "p_x8c1v0", "name": "Güç", "weeks": 6, "days": [ … ] }
  ],
  "current": { "phaseId": "p_k2m9x4", "startedAt": "2026-09-24T09:00:00.000Z" },   // şu anki evre ve başladığı an
  "rotation": { "lastDayId": "d_q2m8xk", "lastCompletedAt": "..." },               // antrenman ekranı yazar; revision artmaz
  "log": [                             // en yenisi üstte, en fazla 200; tamamı git geçmişinde
    { "at": "2026-10-02T18:12:00.000Z", "revision": 7, "kind": "edit",   // create | edit | phase
      "changes": [ { "scope": "Uyum · Gün A", "text": "Goblet Squat 3×8–12 → 12/10/8 (piramit %80/%90/%100)" }, { "text": "Evre 'Güç' eklendi (6 hafta)" } ] }
  ]
}
```
Sürüm 1 dosyalar okunurken çevrilir (tek süresiz evre → evresiz; satırın tek hedefi × blok set sayısı → setler); kayıt yeni biçimi yazar. Çeviri yalnız yapıyı değiştirir, bozuk değeri onarmaz.

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

**Kural (iki ayrı oturum):** PT ve danışanın oturumu **ayrı çerezdedir** (`pc_oturum`, `pc_danisan`). Aynı tarayıcıda PT bir sekmede panelde, başka sekmede danışan olarak açık kalabilir; biri girince ya da çıkınca öteki etkilenmez (çıkış formu hangi rolden çıkıldığını söyler). Her uç yalnız kendi rolünün çerezine bakar; ikisine de açık okumalar (cihaz fotoğrafı, egzersiz listesi) ikisinden birini kabul eder. Oturumu olmayan kendi giriş sayfasına gider (`/login`, `/join`).

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
- **Detay sayfası yerleşimi (egzersiz, cihaz, aparat, danışan — hepsi aynı):** başlıkta yolu, adı, tek cümlelik açıklaması ve **tek eylem**: "Düzenle". Altında `lg:grid-cols-2`: **solda kaydın kendisi** (görsel: kas haritası / cihaz fotoğrafı / aparat fotoğrafı, ve video), **sağda bilgisi** (özet tablosu, ipuçları, medikal etiketler / ağırlık ayarı / takılı cihazlar). Başka kayıtlara bağlanan **uzun ilişki listeleri** (muadiller, bu cihazla yapılan egzersizler, bu aparatla yapılan egzersizler) en altta **tam genişlikte** durur ve kartın içinde `sm:grid-cols-2 lg:grid-cols-3` ızgarasına döner — tek sütunda iki ekran boyu liste olmaz. **Danışan sekmelidir:** adı ve durumu üstte sabit, altında Genel · Program · Ölçümler · Antrenmanlar · Davet (`clients/[id]/layout.tsx`). Program oluşturma/düzenleme ve ölçüm girişi kendi sekmesinin içinde açılır (adres değişir, geri tuşu çalışır; alt sayfada "‹ Program" gibi dönüş bağlantısı); danışanın sayfasından çıkılmış gibi olmaz. Genel sekmesi: solda profil, sağda giriş, sağlık modülü ve ölçüm özeti, altta program özeti. Telefonda tek sütun; sıra soldaki kolonun sırasıdır.
- **Düzenleme sayfası yerleşimi:** form bölümlere ayrılmış kartlardır (egzersizde: Hareket · Ekipman, cihaz ve tutuş · Çalışan kaslar · Yük ve ilerleme · Medikal etiketler · Muadiller). Her kartın başlığı ve tek cümlelik gerekçesi olur; kart başlığıyla içindeki alan başlığı tekrar etmez. **Yıkıcı eylemler ("Sil", "Varsayılana dön") düzenleme sayfasının başlığındadır**, detayda değil: değiştiren her şey tek yerde.
- **Hareket kartları (şablon ve program günü düzenleyicisi; danışanın antrenman ekranı da aynı parçaları kullanır: `exercise-card.tsx`, `src/components/block-editor/drag`; tasarım: `docs/design/editor-tek-kart.md`):**
  - Tek kart: her şey (tek hareket, grup, grup üyesi) aynı kapalı kartı kullanır. Yukarıdan aşağı: 20 px'lik şeridin ortasında tek yatay **tutamak çizgisi** (32×4, dokunma alanı 64×44), yüz (gerilmiş düğme, adı "Plank, ayrıntıları aç/kapat": [28 px sıra rozeti][başlık + meta satırı][⧉ Kopyala]). Açma oku yok: açık kartta yüz koyulaşır ve rozet ana renge döner. Meta satırı setler (`setsText`) + dinlenme; kural, cihaz ve not 14 px ikon. Rozet yalnız etikettir. Kütüphanede olmayan harekette başlık kırmızı "Silinmiş egzersiz", ⧉'nin yerinde 🗑 Sil.
  - Yüze dokununca kart açılır (lg altında aynı anda tek kart; Esc kapatır). Açık gövde: Set ve Dinlenme stepper'ları, Hedef (min–max) ve tekrar çipleri, "Setleri ayrı düzenle", "Ayrıntılar · kural · not", alt satır [🗑 Sil] (üyede [Gruptan çıkar], grup yüzünde [Grubu dağıt]). ⋮ menüleri yok.
  - Grup tek kaptır (vurgu tonlu kenar); üyeler ince çizgiyle ayrılan bölümlerdir. Kabın çizgisi bütün grubu, üyenin çizgisi yalnız o üyeyi taşır.
  - **Sürükle-bırak** (`@dnd-kit/core`, sortable yok): yalnız çizgiden, 4 px kayınca hemen başlar (basılı tutma yok; `touch-action: none`, kalemde de sayfa kaymaz). Kardeşler kaymaz: sürüklenen kartın yerinde kesik çizgili yer tutucu kalır, parmağın altında şerit + yüz (1,02, halkalı) durur; bırakılacak yeri 2 px'lik çizgi gösterir. Kartın orta bandında 250 ms beklenince "üstüne bırak" devreye girer (halka, titreşim, "Süperset yap" / "Ekle · devre olur" / "Gruba ekle" hapı; dolu grupta soluk "Grup dolu (8)"); hızlı geçişte grup oluşmaz. Grup gruba girmez. Ekranın üst ve alt 80 px'i otomatik kaydırır; dock, kullanıcı menüsü ve alt çubuk sürükleme boyunca çekilir. Esc ya da listenin dışına bırakmak iptal eder.
  - Klavye (yüz odaktayken): Alt+↑/↓ (Alt+Home/End uçlara), Alt+→ öncekiyle grupla, Alt+← gruptan çıkar / grubu dağıt, Delete sil (8 sn "Geri al"). Yüzün arkasında klavyeyle odaklanınca görünen sr-only şerit: "Yukarı taşı · Aşağı taşı · Öncekiyle grupla / Gruptan çıkar". Tek `aria-live` paragrafı: "Bench Press 3. sıraya taşındı", "Süperset yapıldı: Squat + Bench Press", ret nedenleri ("Grup dolu (8)").
  - **Kaydırma** (parmak, kalem ya da farenin sol tuşu; yüz çizgisiyle birlikte kayar, açık gövde yerinde kalır): tek harekette → Kopyala, ← Sil; üyede → [Kopyala][Çıkar], ← Sil; grup yüzünde → Kopyala, ← [Dağıt][Sil]. Bir tarafta tek işlem varsa satırın %45'i kadar tam kaydırma onu tetikler (eşikte titreşim, panel parmağa kadar uzar); fırlatma (400 px/sn) yalnız paneli açar. Sola tam kaydırma onaysız siler (satır 220 ms'de kapanır, 8 sn "Geri al"). Aynı anda tek panel açık; dışarı dokunmak, Esc ve sürükleme kapatır. Hakem: |dx| > 10 ve > 1,5·|dy| kaydırma, |dy| > 8 sayfa kaydırması, daha azı dokunma. Panel düğmeleri görünür düğmelerin kopyasıdır (`aria-hidden`). İlk kullanımda ilk kart bir kez 40 px sola "göz kırpar" (reduced-motion'da ipucu satırı). `src/components/swipe/swipe-row.tsx` (Easy Dude'dan kopya).
  - **Seçim modu:** başlıktaki [Seç] (en az 2 kartta). Üst düzey kartlarda rozetin yerinde onay kutusu (yüz `role="checkbox"`); grup tek kutu taşır, üyeleri soluk ve etkileşimsiz. Sürükleme, kaydırma, Alt kısayolları, akordeon, ⧉ ve "+ Gruba hareket ekle" kapalı. Shift+tık aralık, Ctrl/⌘+A tümü, Delete "Sil", Esc çıkış. Alt çubuk seçim çubuğuna döner: durum satırı ("2 seçili · süperset olur"; pasif düğmenin nedeni burada) ve [Vazgeç] [Grupla (n)] [Kopyala] [Sil]. Grupla 2–8 tek hareketi liste sırasıyla gruplar (2 süperset, 3–8 devre; ilk seçilenin yerinde). Üç işlem de tek "Geri al" toast'uyla (8 sn) geri alınır; sayı gruplardaki üyeleri de sayar.
  - **Alt çubuk** (şablon ve program günü düzenleyicisi, `editor-bar.tsx`): formun son çocuğu, yapışkan. [+ Hareket ekle] · [Vazgeç] (md ve üstü) · [Kaydet]. Kaydet değişiklik yokken "Kaydedildi" (pasif), kaydederken "Kaydediliyor…", oluşturmada "Şablonu oluştur" / "Programı oluştur"; geçersiz gönderimde ilk hataya kaydırır. Telefonda bu sayfalarda dock gizlenir, çubuk ekranın altında durur (güvenli alan payıyla) ve klavye açıkken çekilir; masaüstünde dock'un üstündedir (`--dock-clearance`). Sürüklerken çekilir.
  - Hareket kütüphanesi kalıcı kolon değildir: alt çubuktaki "+ Hareket ekle" sheet'i açar — ≥sm sağdan, telefonda tam ekran. Dokununca sona ekler ve açık kalır. Grubun altındaki "+ Gruba hareket ekle" aynı sheet'i o grubun kipinde açar ("Süperset 2'ye ekle"; süpersette "Eklenirse devre olur", 8'de "Grup dolu (8)"). "Değiştir" yok (sil + ekle). Esc ve Kapat kapatır, odak açan düğmeye döner.
  - Hareket token'ları: instant 100 · fast 160 · base 220 · slow 300 ms; sürükleme: 4 px, 250 ms, 1,02, 80 px, vurgu 1,2 sn (`src/lib/motion.ts`; CSS'te yalnız `duration-100/160/220/300`). `prefers-reduced-motion`'da ölçek yok, yalnız saydamlık.
  - Telefon (375 px): yatay taşma yok; dokunma hedefleri ≥44 px (`touch:` varyantı: kaba işaretçi ya da <40rem); sayı kutuları `inputMode="numeric"`.
- Bağlantı olarak çizilen düğmelerde `nativeButton={false}` (Base UI, gerçek `<button>` olmayanı böyle bilmeli).
- Sayılar Türkçe biçimde: `2,5 kg` (`src/lib/format.ts`).
- **Kaslar:** 35 kas + kardiyo, kas haritasının parçalarıyla bire bir; sol ve sağ birlikte seçilir (üst/alt göğüs · ön/yan/arka omuz · üst/orta/alt trapez · üst/orta/alt kanat · bel dikleştiricileri, QL · biceps, triceps uzun/dış baş, ön kol bükücü/açıcı · üst/alt karın, yan karın, serratus · kalça, yan kalça, kalça fleksörü, ön bacak, iç bacak, arka bacak iç/dış, baldır iç/dış, soleus, kaval · boyun, ense). Kasın hareketteki payı **üç seviyede**: hedef (`primaryMuscles`, en az 1), yardımcı, dengeleyici (`stabilizerMuscles`: hareketi taşımayan ama gövdeyi sabit tutan, ör. squat'ta karın). Seviye her kas için ayrıdır, birden çok kas aynı anda hedef olabilir (thruster: ön bacak, kalça, ön omuz); bir kas yalnız bir seviyede bulunur. Haftalık yükte bir set hedefe 1, yardımcıya 0,5, dengeleyiciye 0,25 sayılır (kesirli set, `ROLE_SET_WEIGHT`). Süzgeç ve kas sayıları dengeleyiciyi saymaz. Özetlerde bütün parçaları seçili kas tek adla yazılır (`MUSCLE_FAMILIES`: üç kanat parçası → "Kanat"). Formda kaslar haritadan seçilir: dokunuş boş → hedef → yardımcı → dengeleyici → boş. Önceki sürümlerin kas adları ve tek `targetMuscle` alanı okunurken çevrilir.
- **Sakatlık süzgeci** (`src/lib/conditions.ts`, `src/lib/exercise-filter.ts`): egzersizin biyomekanik etiketleri + danışanın kısıtları → üç karar (`block` yaptırma, `warn` dikkat, `cue` ipucu). Kanıtı zayıf olan hiçbir şey yasak değildir; bilgi eksikse kural **sessizce atlanır** ve sayılır, etiketsiz hareket "uygun" sayılmaz. Eklem kuralları yalnız o eklemi çalıştıran harekete işler (diz kuralı face pull'u yasaklamaz). PT elle yasaklayabilir; "sorun yok" demesi uyarıyı susturur, yasağı susturmaz. Egzersiz listesinde `?limit=lumbar_disc_herniation:acute,…` ile önizlenir — danışan modülü gelince aynı motor onun kaydından beslenir.
- **Kas haritası** (`src/components/muscle-map`): ön/arka gövde, kasları gösterir. Veri çekmez, neyin yanacağını dışarıdan alır (`intensity` 0–1, `selected`, `onToggle`, `counts`); `flip` (tek gövde, `motion` ile çevrilir) ya da `split` (yan yana). Egzersiz listesinde süzgeç (`?muscle=chest,back`), egzersiz detayında çalışan kaslar; ileride program kapsamı ve haftalık yük ısı haritası. SVG yolları body-muscles'tan (Apache-2.0, LICENSE ve NOTICE klasörde). Kaynakta ön görünümdeki karın ve omuz parçalarının adları karışıktı (ör. "abs-upper" aslında yan karın); bu yollar alt parçalarına bölünüp anatomik yerlerine göre yeniden adlandırıldı (`paths.ts` başındaki not).

**PT:** giriş · danışan listesi + detayı yan yana · antrenman şablonu düzenleyici (kütüphane sheet'i, sürükle-bırakla sıralama) · egzersiz kütüphanesi · davet QR ekranı · canlı görünüm · ayarlar (marka, yönetim işlemleri).

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
- **Set başına hedef:** her setin kendi aralığı, isteğe bağlı yük yüzdesi (tam yükteki setin %40–99'u; yalnız ağırlıklı harekette) ve AMRAP'ı olur; en az bir set tam yüktedir. Düz setler (N × aralık) eskisi gibi çalışır.
- **Plan (`planSession`):** kararı tam yükteki setler verir; yüzdeli setler (back-off, piramidin alt basamakları) ağırlığı izler (`percentOfTop`: ızgaraya aşağı yuvarlanır, tabanın altına inmez). Karar setlerinden biri tıkanırsa ağırlık korunur, bütün setler tıkanırsa iner. Aynı aralıktaki setler birlikte bir tekrar ilerler. Düz setlerde sonuç `nextSession` ile aynıdır (testte karşılaştırılır).
- **AMRAP:** zorluk düğmesi tıkanma sayılmaz, alt sınırın altı tıkanmadır; tepe ulaşmadır; aralığın 3+ üstü ağırlığı iki adım artırır.
- **Hafifletme (set başına):** önce tam yükteki setler kalır, sonra baştakiler; AMRAP yok.
- **Aynı antrenmanda (`nextSetInPlan`):** yüzde aynıysa `nextSet` kuralı; yüzde değişince (üst setten back-off'a) bu antrenmandaki üst setin gerçek ağırlığından hesaplanır, üst set belirgin tıkandıysa önce ~%5 iner. Setler satırdaki sırayla eşlenir (`setIndex`); ortadan set silinince eski kayıtların eşlenmesi kayar.
- **Isınma (`warmupSets`, v1 §7.8):** halterle bileşik hareket, kas grubunun ilk hareketi ve ≥ 40 kg ise boş bar × 10 + 1–3 ara set; set başına hedefte ilk çalışma setinin ağırlığına göre (piramitte en hafif set). Saklanmaz.
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

### 7.4 Şablonlar, programlar ve kas yükü haritası (Faz 4)

- **Dosya:** her şablon uygulama repo'sunda ayrı dosya: `data/templates/<id>.json`. Kimlik `t_` + 8 rastgele karakter; addan türetilmez, ad değişse de kimlik ve dosya aynı kalır. Şablonda kişisel veri yok (danışan adı, sağlık bilgisi yazılmaz); program danışanın kendi repo'sundadır (`program.json`). Sayfalar: `/dashboard/templates` (liste, detay, ekleme, düzenleme; "Antrenman" bölümünün ilk sekmesi).
- **Şablon ≠ program.** Şablon yalnız başlangıç noktasıdır. Her danışanın programı kendi repo'sunda `program.json`: şablondan ya da boş oluşturulur, yalnız o danışan için düzenlenir; şablonda sonradan yapılan değişiklik programa yansımaz (gün, geldiği şablonun kimliğini ve o anki adını `source`'ta saklar). Program danışanın bir özelliği değil, yapılan iştir: danışan formunda yer almaz (formda yalnız kişisel bilgiler ve izinler). Danışanın sayfasındaki "Program oluştur" düzenleyiciyi açar (şablonla ya da boş). Ölçümler de danışanın sayfasından ("Ölçümler" kartı → grafikler, ölçüm gir) yönetilir.
- **Evreler (isteğe bağlı) ve günler:** program varsayılan olarak A → B → C dönen gün listesidir (1–7 gün; "Gün A", "Gün B"…); ekranlar evreden söz etmez. "Evrelere böl" ile evreler açılır (ad, isteğe bağlı süre: 1–52 hafta; her evrede 1–7 gün), günler "Evreye taşı" ile dağıtılır; "Evreleri kaldır" günleri program sırasıyla tek listede birleştirir (en fazla 7 gün; aynı adlı gün "Gün A 2" olur, sıklık şu anki evreden kalır). Seçim `phased` alanında açıkça durur: tek, süresiz evreyle bölünmüş program da evreli kalır. Evresiz program tek, gizli bir evrede saklanır (kimlikler, şu anki evre ve rotasyon değişmesin diye). Günün yapısı şablonla aynıdır (bloklar, satırlar, gruplar). En fazla 12 evre, toplam 28 gün; evre adları programda, gün adları evrede benzersiz. Kimlikler: evre `p_`, gün `d_` + 6 karakter; blok ve satır kimlikleri bütün programda benzersiz.
- **Sıklık:** haftada kaç gün (1–7), programda ya da evrede; danışan ekranında ("haftada 3 gün"; "bu hafta x/3" antrenman ekranıyla, `weekProgress`) ve planlanan haftalık yükte (bir tur × sıklık ÷ gün sayısı) kullanılır. Değişimi program geçmişine yazılır.
- **Rotasyon:** şu anki evrenin günleri sırayla döner: sıradaki gün, son tamamlanan günün arkasındaki gündür (hiç antrenman yoksa ilk gün; `nextDayId`). Danışan başka bir günü seçebilir (PT'ye bildirilir; antrenman ekranıyla gelir). Son tamamlanan gün silinirse ya da başka evreye taşınırsa rotasyon eski sırada ondan önceki (aynı evrede kalan) günden devam eder, sıradaki gün değişmez. Evre değişince yeni evrenin ilk günüyle başlar.
- **Evre geçişini PT onaylar:** şu anki evrenin süresi başladığı andan itibaren dolunca program sayfası "Sonraki evreye geç" önerir; PT onaylar. Süresiz evre öneri üretmez. Düzenleme sayfasında geçiş kayıtla birlikte olur. Her geçiş program geçmişine yazılır.
- **Program geçmişi:** PT'nin her kaydında eski ve yeni program karşılaştırılır, okunur bir Türkçe özet otomatik yazılır (ör. "Gün A: Goblet Squat 3×8–12 → 12/10/8 (piramit %80/%90/%100) · Leg Press: son set AMRAP · Leg Press çıkarıldı · Kalça Köprüsü eklendi · Haftada 2 → 3 gün · Evre 'Güç' eklendi", "Evrelere bölündü: 'Uyum' (2 hafta · Gün A, Gün B), 'Güç' (6 hafta · haftada 3 gün · Gün C)"); gerekçe alanı yok. Özet `program.json`'daki geçmişe (en yenisi üstte, 200 kayıt) ve commit mesajına girer; tam kayıt git geçmişidir. Değişiklik yoksa hiçbir şey yazılmaz. Seans başına otomatik ayarlar (hazır oluşluk, ilerleme önerileri) programı değiştirmez; seans dosyasına aittir.
- **Günü şablon olarak kaydet:** programdaki bir gün yeni şablon olarak kaydedilebilir; şablonda kişisel veri olmaması için satır notları kopyalanmaz (sunucu da siler), adı PT verir.
- **Çakışma:** düzenleyici programın `revision`'ını taşır; o arada program başka yerde kaydedildiyse kayıt yapılmaz (412). Rotasyon yazımı `revision`'ı artırmaz: antrenman bitince PT'nin açık düzenlemesi boşa düşmez.
- **Bloklar ve satırlar:** şablon sıralı bloklardan oluşur; blok tek hareket ya da gruptur. Her hareket bir **satırdır** ve kalıcı kimliği vardır (`r_` + 6 karakter): sıralama, gruplama, hareket ya da cihaz değişimi kimliği değiştirmez, antrenman kayıtları satıra bu kimlikle bağlanır. Satırda egzersiz, setler (1–10; her setin hedefi: tekrar aralığı ya da süreli harekette saniye, isteğe bağlı yük yüzdesi, AMRAP), isteğe bağlı kural değişikliği (ilerleme türü, yedekte tekrar), isteğe bağlı cihaz ve not durur; dinlenme bloktadır. Isınma setleri saklanmaz, antrenmanda `warmupSets` ile hesaplanır.
- **Gruplar:** arka arkaya yapılan hareketler tek egzersiz değil, şablonda grup olarak tutulur: süperset (2 hareket), devre (3–8 hareket, istasyonlar arası kısa geçişle), kompleks (2–6 hareket, aynı ağırlıkla ara vermeden). Her hareketin kendi set sayısı vardır; tur = en büyüğü; seti biten hareket sonraki turlarda atlanır (turun son hareketi dinlenmeyi alır); tur sonu dinlenme gruptadır. Her hareket kendi kaslarını ve ilerleme kuralını korur; grup yalnız sırayı ve dinlenmeyi belirler. Hareket sayısı değişince tür kendiliğinden uyar (üçüncü hareket eklenen süperset devre olur).
- **Düzenleyici:** hareket kütüphane sheet'inden (ada ya da kasa göre arayarak) eklenir (sona ya da "+ Gruba hareket ekle" ile grubun sonuna), kartın üstündeki çizgiden sürükle-bırakla (klavyede Alt + ok) sıralanır; bir kartın ortasına bırakıp (250 ms bekleyerek), Alt+→ ile ya da seçim modunda "Grupla" ile (2–8 tek hareket) gruplanır. Dokunmatikte kart yüzü sola kayınca silinir, sağa kayınca kopyalanır; seçim modu toplu kopyalar ve siler. Silme, kopyalama, gruplama, gruptan çıkarma ve hazır düzenler tek "Geri al" toast'uyla (8 sn) geri alınır; sıralamada geri al yok (geri sürüklemek yeter). Kaydet sayfanın yapışkan alt çubuğundadır. Set sayısı, dinlenme ve tur stepper'la (basılı tutunca tekrarlar; "−" son seti siler, "+" son seti kopyalar); düz setlerde tek Hedef (min–max) ve çipler (5 · 8 · 10 · 12 · 6–8 · 8–12 · 12–15; süreli harekette 20 · 30 · 45 · 60 sn) bütün setlere yazar. Setler düz değilse Hedef satırı özete ("12 / 10 / 8 · piramit") döner. "Setleri ayrı düzenle" her seti açar (hedef, yük yüzdesi, set başına AMRAP düğmesi) ve düzen verir: Düz, Piramit, Back-off (%85; yalnız ağırlıklı harekette; hiçbiri değilse "Özel düzen"); setler düz değilse ya da bir sette hata varsa kendiliğinden açıktır. Tek tek set silme ve "Hedefi bütün setlere uygula" yok. Gruplama ve gruptan çıkarma setleri değiştirmez (setler hareketle taşınır). Satırın cihazı değiştirilince hareket o cihazdaki aynı kalıptaki muadile geçer (`alternativeForDevice`, PT'nin sabitledikleri önce); yoksa ve ekipman aynıysa hareket aynı kalır, satıra yalnız cihaz yazılır; o da olmazsa başka bir muadile geçer.
- **Şablon haritası:** şablondaki bütün çalışma setlerinin kesirli set toplamı (hedef 1 · yardımcı 0,5 · dengeleyici 0,25) kas başına hesaplanır; aynı kas birden çok harekette varsa değer toplanır. Isınma ve soğuma türündeki hareketler ve ısınma setleri sayılmaz. Haritanın tonu şablonun en çok çalışan kasına göredir.
- **Kütüphaneden silinen egzersiz** şablonda uyarıyla kalır, haritaya ve sayılara girmez; kaydetmeden önce kaldırılması (yerine kütüphaneden yenisi eklenir) gerekir. Silinen cihaza yazılmış satır, egzersizin kendi cihazına döner.
- **Haftalık yük haritası (program ve danışan):** kas başına haftalık set toplamı kademeli renkle ve açıklama kutusuyla gösterilir — gri: 0 · açık: 1–9 (az) · vurgu rengi: 10–20 (yeterli) · uyarı rengi: 20+ (fazla). Değer girilmez; planlanan (programdan: bir tur × sıklık ÷ gün sayısı, program sayfasında "Haftalık (plan)") ile gerçekleşen (set kayıtlarından, 4c) ayrı gösterilir. Renkler tema tokenlarından (PT'nin vurgu rengi korunur).

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

**Ölçüm girişi ve grafikler (Faz 5a):**
- **Sayfalar** (hepsi PT, danışan sayfasının altında): `/dashboard/clients/[id]/measurements` — genel bakış, yalnız gösterir; ölçülmüş her şey için bir grafik kartı (katalog grubuna göre: antropometri · performans · hareketlilik · anketler), son değer, değişim rozeti ve yorum satırları; altta tam genişlikte ölçüm günleri (güne girince düzenleme); tek eylem **"Ölçüm gir"**. `/…/measurements/new` — gün bugün (uygulamanın saat diliminde; gelecek gün girilemez), cinsiyet kayıtta yoksa sorulur, alanlar katalog gruplarına göre bölüm kartlarında, birimiyle; iki taraflı ölçümde Sol/Sağ ayrı alan; katalogdaki not ve sıklık alan açıklamasıdır; **yalnız doldurulan değerler kaydedilir**. `/…/measurements/[tarih]/edit` — o günün değerleri; boşaltılan alan o günden çıkar; başlıktaki **"Sil"** günü tamamen kaldırır.
- **Kayıt:** `health.json`'daki `measurements` düz bir listedir: gün + ölçüm + gerekirse taraf. Bir günde aynı ölçümün aynı tarafı bir kez bulunur; aynı güne yeni giriş eklenir, aynı ölçüm girilirse yenisi geçer. Liste tarih ve katalog sırasıyla yazılır. Dosya ilk yazmada boş ama geçerli bir kayıtla oluşur; bozuksa üzerine yazılmaz, sayfada sorun olarak görünür. Cinsiyet yalnız bilinmiyorsa yazılır.
- **İzin sunucuda:** veri katmanı (`src/lib/health.ts`) her yazmada danışan kaydını taze okuyup `canRecordHealth(client, 'measurements')`'ı denetler; değilse 403. Modül kapalıyken, "Ölçümler" seçili değilken ya da onay yok/eskiyken sayfalar dosyayı okumaz bile (gösterim de işlemedir); form ve grafik yerine nedeni ve ne yapılacağını söyleyen uyarı çıkar (`measurementLock`). Commit mesajları genel ("Ölçüm kaydedildi"), değer ve tarih taşımaz; hata yanıtları da değer taşımaz.
- **Değişim** (`src/lib/measurement-trends.ts`): son iki ölçüm karşılaştırılır, iki taraflıda her taraf ayrı. Eşik yalnız kaynağı olan ölçümlerde: **bel ve kalça 2 cm** (WHO, teknik ölçüm hatası ~1,2–1,6 cm; belde düşüş iyi, kalçada iyi yön tanımlı değil → "gerçek artış / azalma"), **otur-kalk 2,3 sn** (kısa iyi), **gövde dayanıklılığı %25** (uzun iyi). Rozetler: *Gerçek gelişme · Gerileme · Gerçek artış · Gerçek azalma · Ölçüm hatası içinde* (ikon + metin, yalnız renk değil). Vücut ağırlığı, boy, kol/uyluk/baldır çevresi, lunge testi ve anketlerin hata payı araştırma dosyalarında yok: fark gösterilir, **sınıflanmaz** (eşik uydurulmaz).
- **Göstergeler:** bel-kalça oranı (bel ve kalçanın aynı gün ölçüldüğü en son gün; cinsiyet yoksa "cinsiyeti seç"), otur-kalk bayrağı (son ölçüm), yan köprü asimetrisi (sol ve sağın aynı gün ölçüldüğü en son gün, %25 bandı).
- **Grafik bileşeni** (`src/components/progress-chart.tsx`, e1RM ve haftalık hacim de bunu kullanacak): `{tarih, değer}` serisi, en çok iki seri, tek eksen; tarih ekseni gerçek zamanlı (düzensiz aralık eşit dizilmez); değer ekseni yuvarlak sayılarla, hata payı bilinen ölçümde en az hata payının iki katını kapsar (gürültü içindeki oynama uçurum gibi görünmez); Türkçe tarih ve sayı; renkler tema tokenlarından (açıkta `--chart-3`/`--chart-5`, koyuda `--chart-2`/`--chart-4`; renk körlüğü benzetiminde ayrışır, yüzeyle ≥3:1); ikinci seri kare işaretli ve açıklamalı; ekran okuyucuya tek cümlelik özet, bütün değerler "tablo olarak göster" altında.

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
| 4 | **4a** Antrenman şablonları ✓: düzenleyici (kütüphaneden ekleme, sürükle-bırak sıralama, gruplar: süperset/devre/kompleks, satırda kural ve cihaz değişimi), şablon kas haritası, set başına hedef, yük yüzdesi ve AMRAP (düz/piramit/back-off), grupta hareket başına set ✓ · **4b** Kişiye özel program ✓: şablondan ya da boş, evreler ve günler, A → B → C rotasyonu, PT onaylı evre geçişi, otomatik program geçmişi, günü şablon olarak kaydetme, evreler isteğe bağlı, haftalık sıklık ve planlanan haftalık kas yükü ✓ · **4c** antrenman ekranı (**set başına canlı yazma**, çevrimdışı kuyruk, zorluk düğmeleri, §7.1 önerileri, rotasyon ve başka gün seçiminin PT'ye bildirimi) · haftalık yük haritası · PT canlı görünüm · geçmiş |
| 5 | **5a** Ölçümler ✓: giriş (gün, cinsiyet, grup kartları, Sol/Sağ), günü düzenleme ve silme, ölçüm başına grafik, değişimin ölçüm hatasına göre sınıflanması (yalnız kaynaklı eşikler), bel-kalça oranı · otur-kalk bayrağı · yan köprü asimetrisi, yeniden kullanılabilir grafik bileşeni · **5b** kısıtlar, hazır oluşluk ve ağrı takibi (seans yoklaması), hareket taraması ekranları; danışan sayfasından ölçümlere bağlantı |
| 6 | Yönetim işlemleri (silme, dışa aktarma, yedek), JSON şeması + doğrulama, AI için PR kuralı |
| 7 | Bağlantılar (danışanların birbirini görmesi) |
| 8 | Fork'la kurulum: "Deploy to Vercel" düğmesi, kurulum rehberi (token, OAuth uygulaması, `APP_REPO`), güncelleme = "Sync fork". npm paketi / `create-pulsecoach` yalnız gerekirse |
