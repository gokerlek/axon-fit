# Danışanın kendi programları

> **Durum:** onaylandı (rev. 2: inceleme işlendi, açık soruların önerilen kararları kabul) · **Tarih:** 2026-09-27 · **Kapsam:** SPEC §3, §4, §6 ("kendi programı", "PT ile paylaş"), §7.4; `antrenman-ekrani.md` §0 (dock), §2.11 (günler), §6.5; `editor-tek-kart.md` (düzenleyici).
> **Girdiler:** v2 kodu (`programs.ts`, `schemas/program.ts`, `program-plan.ts`, `program-diff.ts`, `training-days.ts`, `client-targets.ts`, `proposals*.ts`, `program-feedback.ts`, `session-finish.ts`, `session-merge.ts`, `workout-plan.ts`, `workout-routes.ts`, `session-routes.ts`, `progression.ts`, `attention.ts`, `notices*.ts`, `components/block-editor/**`, PT'nin program sayfaları), v1'in "Antrenmanlarım" ekranı (kendi şablonları, arşiv), rev. 1'in incelemesi (8 madde).
> **Dil:** belge PT'den üçüncü şahısla söz eder. Danışana dönük metin "antrenörün" der; marka ve kişi adı yazılmaz (beyaz etiket).

## Rev. 2'de değişenler (inceleme)

Sekiz maddenin hepsi alındı; ikisi küçük eklerle (↳). Ayrıntı ilgili bölümde.

| # | Madde | Karar | Bölüm |
|---|---|---|---|
| 1 | 8 antrenmanlık geçmiş penceresi programları karıştırıyor, PT programının ağırlıklarını oynatıyor | Pencere satır başına (her satırın en yeni 4 antrenmanı + bugünkü gibi en yeni 8). Kendi serisi olmayan satır yalnız aynı programın antrenmanlarına bakar; başka programın antrenmanı yalnız çeviri kaynağıdır (`latest`), seriye (`chain`) girmez. "Önceki" ve ayar notu da önce aynı programdan. Deneyim (exposure) programdan bağımsız. | §3.9 |
| 2 | Seansla program arasındaki bağ zayıf | `programId` başlangıçta yazılır; ilk PUT'ta gün o dosyada aranır (yoksa 400); birleştirmede sabittir (farklıysa 400). Devam etme seansın programından. Bitişin kipi günün bulunduğu dosyadan; kendi program kipi `program.json`'a hiç uygulanmaz. Seçim değiştirmede 409 yok; 409 yalnız yarım antrenmanın geldiği programı silerken, satır içi [Yarım antrenmanı sil] ile. | §3.2, §3.7, §5.4 |
| 3 | Bitiş, başlangıçtan sonra değişen programa doğrudan yazıyor | Madde satırın başlangıçtaki hâlini taşır (`row`: hareket ve setler); program o arada değiştiyse (revision farklı) ve satır farklıysa ya da yoksa yazılmaz, `stale` sayılır. Sonuç: "Evde o arada değişti; bu değişiklik yazılmadı." [Programı aç]. Silinen satır geri getirilmez. | §3.4 |
| 4 | PT'nin yazma izni ve yol denetimleri | PT'nin PUT'u dosyayı dalın ucunda okur, `shared` yoksa 403; aynı uçla commit eder, ref çakışmasında yeniden okuyup `shared`'ı yeniden denetler. `name`, `shared`, `id`, `phased`, `log`, `rotation`, `schedule` (PT günleri değiştirmediyse) dosyadan gelir. `pid` yol kurmadan önce `^op_[a-z0-9]{8}$` ile denetlenir, uymazsa 404. Kimlikle okunan her şablon `sharedWithClients === true` ister; işaretsiz şablon yokmuş gibi 404. | §3.5, §3.8, §6 |
| 5 | PT uyarıları ve kaçan gün penceresi etkin kendi programı bilmiyor | `attentionFactsOf` seçimi alır: kendi programda günler index'ten, pencere `max(scheduleSince, active.at)`. Bugün'ün şeridi aynı kuralla. Kendi program seçiliyken evre maddesi "Danışan Evde ile çalışıyor · evre süresi doldu". | §4, §7.1 |
| 6 | Yalnız kalıcı seçim telefonda tuzak | Sheet'te birincil [Yalnız bugün] (hiçbir şey yazmaz; bitiş o programın rotasyonunu ilerletir), ikincil [Bundan sonra hep bu] (`active` yazılır, PT'ye bildirim). Çip tek seferlikte "Bugün: Evde". PT'nin programı `active.at`'ten sonra kaydedildiyse Bugün'de tek satır: "Antrenörün yeni bir program hazırladı" [Onunla çalış] [Sonra]. | §2.6, §3.2 |
| 7 | Index eksik, geri alma ikinci commit | Index satırı `daysPerWeek`, `weekdays`, `revision`, `updatedAt` taşır. Kendi programda "Günlerini değiştir" `commitFiles` (dosya + index, 3 yazma). Paylaşımı kapatmak Switch'i yerelde kapatır; commit 8 sn'lik toast kapanınca gider (`keepalive`), "Geri al" bedava. ↳ Sayfa gizlenince ve sekmeden çıkınca da hemen gider; gönderilemezse Switch açığa döner ve söylenir (kapattığını sanan danışanın programı açık kalmasın). Yazma bedeli tablosu. | §2.7, §5.3 |
| 8 | Antrenmanda PT ve kendi program karışıyor; düzenleyici PT'ninki kadar ağır | `WorkoutDay` `source: 'pt' \| 'own'` ve programın adını taşır; kendi programda satır notu "Not:". Bitiş sheet'i "Evde programını güncelleyelim mi?", birincil düğme "Evde'ye yaz". Kendi kipte İlerleme/RIR ve yüzdeli set düzeni gizli. "Haftada kaç gün" seçicisi kalkar; hiç gün seçilmemişse "Gün seçmezsen haftada kaç gün: [n]". ↳ Kopyalanan satırın PT kuralı ve set düzeni silinmez, yalnız okunur satırda görünür. | §2.5, §2.9 |

**Tasarımın kendisinden bir değişiklik:** PT'nin `ProgramForm`'u taşınmaz. Kendi program düzenleyicisi ayrı, telefon öncelikli ve evresiz bir formdur (`src/components/program/own-program-form.tsx`, kipler `own` · `own-pt`); `BlockEditor`, taslak, Kaydet ve çıkış uyarısı ortak. Gerekçe: PT formunun evreleri, şablon diyaloğu, danışan hedefi rozetleri ve "PT'nin günlerine dön"ü kendi programda yok; ad alanı, koşullu sıklık ve "+ Gün" sheet'i PT formunda yok. Taşımak PT'nin düzenleyicisini kırma riski taşır, ortak parça zaten ortak bileşenlerde (§5.5).

## Kararlar (özet)

| # | Konu | Karar |
|---|---|---|
| 1 | Yer | Dock'un 4. sekmesi **Programlar** (`/me/programlar`, `Notebook`). Avatar menüsündeki "Programım" kalkar (`antrenman-ekrani.md` açık soru 12 kapanır). |
| 2 | Liste | Üstte "Antrenörünün programı" (salt okuma), altta "Kendi programların" (en çok 5). İkisi ayrı listelenir (SPEC §6). |
| 3 | Oluşturma | Telefonda evresiz düzenleyici (`OwnProgramForm`, `BlockEditor`, kütüphane sheet'i). Başlangıç: boş · antrenörünün programından gün(ler) · PT'nin danışanlara açtığı şablon. |
| 4 | Yapı | **Evresiz**: tek gizli evre, 1–7 gün, gün başına şablon sınırları (40 hareket, 30 blok). |
| 5 | Depo | Danışanın repo'sunda `own-programs/<id>.json` + `own-programs-index.json` (liste, Bugün'ün programı, paylaşım olayları). Uygulama repo'suna hiçbir şey yazılmaz. |
| 6 | Bugün | Kalıcı seçim (`active`, varsayılanı PT'ninki) + tek seferlik seçim ("Yalnız bugün", yazmaz). Rotasyon ve günler program başına. Seans kaynağını (`programId`, ad) taşır; Geçmiş, İlerleme ve deneyim hepsini birlikte görür, öneri motorunun serisi programı ayırır (§3.9). |
| 7 | Bitişte güncelleme | Kendi programda her madde (set sayısı, değiştir, ekle, çıkar dahil) doğrudan "Evde'ye yaz". Öneri, `proposals.json`, `clientTargets` yok. O arada değişen satıra yazılmaz (§3.4). |
| 8 | Paylaşım | "Antrenörünle paylaş": PT görür ve doğrudan düzenler. Her değişiklik programın geçmişine kimin yaptığıyla yazılır, öteki taraf bildirim görür. Danışan istediği an kapatır. |
| 9 | Çakışma | `revision` + `createdAt`, 412 (PT programıyla aynı akış ve uyarı). |
| 10 | Şablon | **Şablon başına** "Danışanlar kopyalayabilir" bayrağı, varsayılan kapalı (§3.8). |
| 11 | Sağlık | Onay gerekmez: program ve seans antrenman verisidir. |
| 12 | Silme | Onaylı; "uygulamadan kalkar, deponun geçmişinde kalır". Yapılan antrenmanlar silinmez. |

---

## 1. İlkeler

- **Yalnız telefon:** 375 px, tek sütun, 16 px kenar, dokunma hedefleri ≥ 44 px, aralarında ≥ 8 px.
- **PT'nin programı değişmez:** `program.json`, öneriler, `clientTargets`, `clientSchedule` bugünkü gibi. Kendi program ayrı dosyadır; ortak olan gövde (evre → gün → blok) ve saf işlevlerdir (`nextDayId`, `completeDay`, `buildWorkoutDay`, `normalizeProgram`, `applyProgramEdit`, `diffProgram`, `applyProposal`, `effectiveSchedule`, `weekProgress`).
- **Sahip danışandır:** oluşturur, adlandırır, siler, paylaşır, Bugün'ün programı yapar. PT paylaşılmış programı yalnız düzenler.
- **Dürüst metin:** program PT'nin sahibi olduğu veri deposunda durur; "paylaşmak" uygulamadaki görünürlüğü açar. Paylaşılmasa da yapılan antrenmanlar PT'ye her zaman görünür. Metinler bunu saklamaz (§2.7, §2.8).
- **Kütüphane PT'nindir:** danışan hazır kütüphaneden ve PT'nin egzersizlerinden seçer; yeni egzersiz ya da cihaz ekleyemez.
- **Kimin programı olduğu hep yazar:** antrenmanda, bitişte, Geçmiş'te ve PT'nin ekranlarında kaynak ve ad görünür; danışanın notu PT'ye mal edilmez (§2.9).

---

## 2. Ekranlar (375 px)

### 2.1 Programlar sekmesi — `/me/programlar`

```
┌─────────────────────────────────────────┐
│ Programlar                         (AY) │
│                                         │
│ Antrenörünün programı                   │
│ ┌─────────────────────────────────────┐ │
│ │ Antrenörünün programı               │ │
│ │ ✓ Bugün'ün programı                 │ │
│ │ 3 gün · haftada 3 · Pzt, Çar, Cum   │ │
│ │ Sıradaki: Gün B                   › │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Kendi programların                2 / 5 │
│ ┌─────────────────────────────────────┐ │
│ │ Evde                     Paylaşıldı │ │
│ │ 2 gün · Sal, Per · son: 22 Eyl    › │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Tatil                               │ │
│ │ 1 gün · gün seçilmedi             › │ │
│ └─────────────────────────────────────┘ │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │           + Yeni program            │ │ 44 px
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│  ┌───────────────────────────────────┐  │
│  │  ⌂       ◷        ↗        ▤      │  │
│  │ Bugün  Geçmiş  İlerleme Programlar│  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```
- Kartlar bütünüyle bağlantıdır (`Item`, ≥ 44 px). "Bugün'ün programı" rozeti tek kartta durur. Kendi programlar oluşturulma sırasıyla (seçim değişince liste zıplamaz).
- Kartın bütün satırları index'ten gelir (ad, gün sayısı, `weekdays`, `daysPerWeek`; §5.3): liste program başına dosya okumaz. Günler yoksa "haftada n", o da yoksa "gün seçilmedi".
- "son: 22 Eyl" o programdan son bitmiş antrenman (seans index satırlarının `programId`'si).
- Rozetler: "Paylaşıldı"; PT son 14 günde paylaşılmış programı düzenlediyse ve telefonda görülmediyse "Antrenörün düzenledi". PT'nin programı Bugün'ün programı değilken ve o arada kaydedildiyse PT kartında "Güncellendi".
- PT'nin programı yok: kart yerine "Antrenörün henüz program hazırlamadı." Okunamıyor: "Antrenörünün programı şu an açılamıyor."
- Kendi program yok: `Empty` — "Kendi programın yok" / "Evde ya da tatilde çalışmak için kendi programını kur; antrenörünün programından gün kopyalayabilirsin." [+ Yeni program].
- 5 programda "+ Yeni program" pasif, altında "En fazla 5 program; yenisi için birini sil."
- Dock 4 öğe; etiketler telefonda ikonun altında. Sıra: Bugün · Geçmiş · İlerleme · Programlar.

### 2.2 Antrenörünün programı — `/me/programlar/antrenor`

```
┌─────────────────────────────────────────┐
│ ‹ Programlar                       (AY) │
│ Antrenörünün programı                   │
│ 3 gün · haftada 3 · Pzt, Çar, Cum       │
│ Evre: Güç · 2. hafta / 6                │ yalnız evreliyse
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Gün A · sıradaki                    │ │
│ │ 1  Goblet Squat  3 set · 8–12 tekrar│ │
│ │ 2  Leg Press    3 set · 10–12 tekrar│ │
│ │    3 hareket daha                 ⌄ │ │
│ │ ⧉ Kendi programına kopyala          │ │ 44 px
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Gün B · son: 22 Eyl                 │ │
│ │ …                                   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```
- Salt okuma. Setler danışanın dilinde (`ClientDayPlan`) ve danışanın hedefleriyle (`withClientTargets`), Bugün'deki gibi.
- Evreliyse şu anki evrenin günleri; öteki evreler altta kapalı ("Sonraki evre: Güç · 6 hafta"), açılınca salt okuma.
- "Kendi programına kopyala" sheet açar: "Yeni programa" ya da var olan programlar (7 günü dolu olan pasif, "7 gün dolu"). Kopya anlık görüntüdür: PT günü sonra değiştirse de kopya değişmez. Var olan programa kopyalamak o programın düzenleyicisini günü eklenmiş olarak açar (kaydetmek danışanın işi; kendiliğinden yazılmaz).
- Programın değişiklik geçmişi danışana gösterilmez (bugünkü gibi); öneri sonuçları Bugün'de kalır.

### 2.3 Kendi programın — `/me/programlar/[pid]`

```
┌─────────────────────────────────────────┐
│ ‹ Programlar                       (AY) │
│ Evde                                    │
│ 2 gün · Sal, Per                        │
│ ✓ Bugün'ün programı                     │ ya da [Bugün'ün programı yap]
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Gün A · sıradaki                    │ │
│ │ 1  Şınav        3 set · 10–14 tekrar│ │
│ │ 2  Goblet Squat  3 set · 8–12 tekrar│ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Gün B · son: 19 Eyl                 │ │
│ └─────────────────────────────────────┘ │
│ [             ✎  Düzenle            ]   │ 44 px
│                                         │
│ Antrenörünle paylaş               ( ●)  │ Switch, satır 44 px
│ Antrenörün görür ve düzenleyebilir.     │
│                                         │
│ Değişiklikler                           │
│ 26 Eyl · Antrenörün düzenledi           │
│   Gün A: Şınav 3×8–12 → 3×10–14         │
│ 22 Eyl · Antrenmandan                   │
│   Gün A: Goblet Squat 3 → 4 set         │
│ 20 Eyl · Oluşturuldu                    │
│                                         │
│ Programı sil                            │ yalnız metni kırmızı, 44 px
└─────────────────────────────────────────┘
```
- Değişiklikler `ChangeLog` bileşeniyle; etiketler §7.3. İlk 5 kayıt, "Daha fazla göster".
- "Bugün'ün programı yap" tek dokunuş (toast: "Bugün Evde ile açılır"). Yarım antrenman seçimi engellemez (§3.2).
- Adres `pid`'si `^op_[a-z0-9]{8}$`'e uymuyorsa ya da program yoksa sayfa 404.

### 2.4 Yeni program — `/me/programlar/yeni`

```
┌─────────────────────────────────────────┐
│ ‹ Programlar                            │
│ Yeni program                            │
│                                         │
│ Adı                                     │
│ [ Programım 2                       ]   │ 44 px, 16 px yazı
│                                         │
│ Nasıl başlayalım?                       │
│ (•) Boş program                         │ satır 44 px
│ ( ) Antrenörünün programından           │
│     ☑ Gün A    ☑ Gün B    ☐ Gün C       │ yalnız seçiliyken
│ ( ) Hazır şablondan                     │ yalnız açılmış şablon varsa
│     ( ) Tüm vücut · 6 hareket           │
│                                         │
│ [              Devam              ]     │ 44 px
└─────────────────────────────────────────┘
```
- Aynı adres iki adımdır: ad + başlangıç, sonra düzenleyici (oluşturma kipi, Kaydet "Programı oluştur"). "Devam" hiçbir şey yazmaz.
- PT'nin günleri şu anki evreden gelir, hepsi seçili (7'yi aşarsa ilk 7); evreliyse öteki evrelerin günleri "Öteki evreler" altında. Günün hareketleri danışanın geçerli hedefleriyle kopyalanır (`withClientTargets`), kimlikler yeni üretilir (`reIdBlocks`), gün `copiedFrom` taşır (§5.2).
- Şablondan: tek şablon = tek gün (şablon bir günlük bloktur); `source` şablonun kimliği ve o anki adıdır (PT programındaki gibi).
- `?gunler=d_…,d_…` (§2.2'deki kopyadan) PT günleriyle, `?sablon=t_…` şablonla açar; ikisi de sunucuda denetlenir (şablonda bayrak, §3.8).

### 2.5 Düzenleyici — `/me/programlar/[pid]/duzenle`

```
┌─────────────────────────────────────────┐
│ ‹ Evde                             (AY) │
│ Evde'yi düzenle                         │
│ Adı [ Evde                          ]   │
│ Antrenman günleri                       │
│ Pzt [Sal] Çar [Per] Cum Cmt Paz         │ 7 × 44 px, ToggleGroup
│                                         │ gün seçilince sıklık satırı yok
│ (Gün A) (Gün B) (+ Gün)                 │ çipler, yatay kayar
│                                         │
│ Hareketler     [Seç · Grupla] [Kaydet]  │
│ ┌──────────────────  ───  ────────────┐ │ üstteki çizgi: tutamak
│ │ 1  Şınav                            │ │
│ │    3×10–14 · 60 sn                  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 2  Goblet Squat                     │ │
│ │    3×8–12 · 90 sn · Dambıl          │ │
│ └─────────────────────────────────────┘ │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │          + Hareket ekle             │ │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│ Gün A'yı sil                            │
│                    ( Programı kaydet )  │ yüzen, dock'un üstünde
└─────────────────────────────────────────┘
```
- `OwnProgramForm` (kip `own`): `BlockEditor` değişmeden (kart, jestler, seçim modu, Geri al, yüzen Kaydet, çıkış uyarısı; `editor-tek-kart.md` kararları 12–18), yalnız sade kipte (`variant="simple"`): İlerleme/RIR alanı ve "Setleri ayrı düzenle"nin yüzde ve düzen (Düz/Piramit/Back-off) seçimi yok; set sayısı, tekrar ya da süre, dinlenme, cihaz, not ve süperset kalır. Kopyalanan satırda PT'nin kuralı ya da piramidi varsa silinmez: Ayrıntılar'da okunur satır ("Antrenörünün kuralı: Doğrusal · 2 tekrar yedekte") ve [Egzersizin kuralına dön]; düz olmayan setlerde [Setleri eşitle].
- **Günler:** 7 günlük `ToggleGroup`. Hiç gün seçilmemişse altında "Gün seçmezsen haftada kaç gün: [n]" (1–7, boş olabilir); gün seçilince bu satır görünmez ve sıklık kaydedilmez (y = seçili gün sayısı, `weekTarget`). Ayrı "Haftada kaç gün" seçicisi yok.
- "+ Gün" sheet'i: Boş gün · Antrenörünün programından · Hazır şablondan (yalnız açılmış şablon varsa) · Bu programdaki bir günü kopyala. 7 günde pasif.
- Kütüphane sheet'i (`ExerciseSheet`): açıklama "Antrenörünün kütüphanesinden hareket ekle." Sağlık onayı ve kısıt varsa uymayan harekette "Kısıtına uymayabilir" rozeti, engel değil.
- Dock görünür kalır; kaydedilmemiş değişiklikte dock ve "‹" önce sorar ("Çıkarsan bu değişiklikler kaydedilmez."). Yerel taslak: `pulsecoach.draft.own.<clientId>.<pid>` (yenide `….new`); çıkışta danışanın taslakları da silinir.

### 2.6 Bugün: program seçimi

```
┌─────────────────────────────────────────┐
│ Antrenörün yeni bir program hazırladı   │ yalnız §3.2'deki koşulda
│                   [Onunla çalış] [Sonra]│
│ ┌─────────────────────────────────────┐ │
│ │ [ Evde ▾ ]             Bu hafta 1/2 │ │ program çipi 44 px
│ │ Bugün antrenman günün · Gün A       │ │
│ │ Pzt  Sal  Çar  Per  Cum  Cmt  Paz   │ │
│ │  ·    ◉    ·    ○    ·    ·    ·    │ │
│ │ 1  Şınav        3 set · 10–14 tekrar│ │
│ │ [       ▶  Antrenmana başla       ] │ │ 56 px
│ │           Başka gün seç             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```
```
┌─────────────────────────────────────────┐
│ Hangi programla çalışacaksın?           │
│                                         │
│ (•) Antrenörünün programı               │ satır 56 px
│     son antrenman: 22 Eyl               │
│ ( ) Evde                                │
│     son antrenman: 19 Eyl               │
│ ( ) Tatil                               │
│     henüz antrenman yok                 │
│                                         │
│ Sıra ve günler her programda ayrı sürer.│
│ [          Yalnız bugün          ]      │ 44 px, birincil
│ [       Bundan sonra hep bu      ]      │ 44 px, ikincil
│                 Vazgeç                  │
└─────────────────────────────────────────┘
```
- Çip yalnız en az bir kendi program varken görünür; yoksa Bugün bugünkü gibi. Çipin adı kalıcı seçimde "Antrenörünün programı" ya da programın adı; tek seferlikte "Bugün: Evde".
- **[Yalnız bugün]** (birincil): Bugün `/me?program=op_…` (PT'ninki için `program=pt`) ile yeniden çizilir, kart o programın sıradaki gününü, günlerini ve haftalık hedefini gösterir; "Antrenmana başla" `/me/antrenman?program=…` açar. Hiçbir şey yazılmaz, PT'ye bildirim gitmez; seans programın kimliğini taşır, bitiş o programın rotasyonunu ilerletir. Sekmeden çıkınca kalıcı seçime dönülür.
- **[Bundan sonra hep bu]** (ikincil): `active` yazılır (§3.2), PT'ye bildirilir, toast "Bugün Evde ile açılır". Seçilen zaten kalıcı seçimse düğme görünmez.
- Yarım antrenman çipi engellemez: yarım antrenman kendi programıyla sürer (§3.2); kart zaten yarım antrenman kartıdır.
- **Yeni PT programı satırı:** kalıcı seçim kendi programken ve `program.json` `active.at`'ten sonra oluşturulduysa ya da kaydedildiyse (`createdAt` ya da `updatedAt` > `active.at`): "Antrenörün yeni bir program hazırladı" [Onunla çalış] (`active` → PT'nin programı) [Sonra] (bu sürüm için telefonda gizlenir; `localStorage`, try/catch).
- Boş Bugün (hiç program yok): var olan `Empty`'nin altına [Kendi programını kur] (→ `/me/programlar/yeni`).

### 2.7 Paylaşım

```
┌─────────────────────────────────────────┐
│ Evde antrenörünle paylaşılsın mı?       │
│                                         │
│ • Antrenörün programı görür ve          │
│   düzenleyebilir.                       │
│ • Her değişiklik programın geçmişine    │
│   kimin yaptığıyla yazılır; öteki taraf │
│   haberdar olur.                        │
│ • Paylaşımı istediğin an kapatırsın.    │
│                                         │
│ Paylaşmasan da yaptığın antrenmanları   │
│ antrenörün görür. Programların          │
│ antrenörünün veri deposunda durur.      │
│                                         │
│ [             Paylaş              ]     │ 44 px
│ [             Vazgeç              ]     │ en altta, odakta
└─────────────────────────────────────────┘
```
- Açmak sheet'le onaylanır (düzenleme yetkisi veriyor), hemen yazılır.
- **Kapatmak** Switch'i yerelde kapatır, toast "Paylaşım kapatılıyor · Geri al" (8 sn). "Geri al" hiçbir şey yazmaz. Toast kapanınca (süre dolunca, sayfa gizlenince ya da sayfadan çıkınca) istek `keepalive`'la gider; gönderilemezse Switch açığa döner: "Paylaşım kapatılamadı; yeniden dene."

### 2.8 Silme

```
┌─────────────────────────────────────────┐
│ Evde silinsin mi?                       │
│                                         │
│ Program uygulamadan kalkar, geri        │
│ getirilemez. Antrenörünün veri          │
│ deposunun geçmişinde kalır.             │
│ Ayrıntı ⌄                               │
│   Yaptığın antrenmanlar silinmez;       │
│   Geçmiş ve İlerleme'de program adıyla  │
│   kalır. Deponun eski sürümleri ve      │
│   kayıt notları da silinmez.            │
│                                         │
│ [          Programı sil           ]     │ yıkıcı
│ [             Vazgeç              ]     │ en altta, odakta
└─────────────────────────────────────────┘
```
- Bugün'ün programıysa ek satır: "Bugün yeniden antrenörünün programıyla açılır." Paylaşılmışsa: "Antrenörüne bildirilir."
- Yarım antrenman bu programdansa silme reddedilir (409) ve diyalog içinde satır çıkar: "Yarım antrenmanın bu programdan; önce bitir ya da sil." [Yarım antrenmanı sil] (seans silmeyle aynı onaylı akış, `DELETE /api/me/sessions/[id]`), sonra silme yeniden denenebilir.
- Onaydan sonra `/me/programlar`'a dönülür; "Geri al" yok (seans silmeyle aynı dil, `antrenman-ekrani.md` §2.10).

### 2.9 Antrenman ve bitiş sheet'i

- Antrenman ekranının üst çubuğu kendi programda programın adını da yazar ("Evde · Gün A · 12:04").
- Satır notunun etiketi PT programında "Antrenörünün notu:", kendi programda "Not:" (`WorkoutDay.source`).
- Soru kendi programda "Evde programını güncelleyelim mi?"; birincil düğme "Evde'ye yaz", ikincil "Hayır, aynı kalsın", "Tek tek seç" aynı. Bütün maddeler doğrudan yazılır; "Antrenörüne öner" yok (§6.5). Madde ipucu "İşaretsiz: program aynı kalır".
- Sonuç toast'u: "Evde güncellendi"; yazılamayan madde varsa "Evde o arada değişti; bu değişiklik yazılmadı." [Programı aç] (→ `/me/programlar/[pid]`). Özetin 4. kartı değişiklikleri "programa yazılan" olarak listeler.

---

## 3. Kurallar

### 3.1 Sınırlar, adlar, kimlikler
- **En çok 5** kendi program (`OWN_PROGRAM_LIMITS.programs`). Gerekçe: liste telefonda tek ekrana sığar; index ve PT'nin özeti küçük kalır. Arşiv yok.
- **Ad** 1–40 karakter, kırpılır; danışanın programları arasında benzersiz (büyük-küçük ve Türkçe harf farkı gözetilmez, `tr`). "Antrenörünün programı" ad olarak kabul edilmez. Varsayılan "Programım", sonra "Programım 2" (`uniqueName`).
- **Günler** 1–7, adlar "Gün A…" (`nextDayName`), programda benzersiz; gün başına şablon sınırları.
- **Kimlik** `op_` + 8 küçük harf/rakam, telefonda üretilir (oluşturma idempotent); dosya yolu yalnız kimlikten ve yalnız kalıba uyan kimlikten kurulur (`ownProgramPath` uymayanda hata fırlatır; uçlar önce 404 döner).
- **Gün, blok, satır kimlikleri danışanın bütün programlarında benzersiz.** Seanslar güne ve satıra kimlikle bağlanır ("son: 22 Eyl", geçen seferki setler, öneri serisi). Kopyalanan gün yeni kimlik alır; sunucu oluşturma ve kayıtta PT programıyla ve öteki kendi programlarla çakışanı yeniden üretir.
- Geçmiş (`log`) 200 kayıt, `appendLog` kırpması aynı.

### 3.2 Bugün'ün programı
- **Kalıcı seçim:** `own-programs-index.json` → `active: { programId, at }`. Yoksa ya da `programId: null` ise PT'nin programı. **Tek seferlik seçim** ("Yalnız bugün", §2.6) yalnız adrestedir, yazılmaz.
- PT'nin programı yokken oluşturulan ilk kendi program kendiliğinden seçilir (Bugün boş kalmasın). PT'nin programı varsa seçilmez; toast "Evde oluşturuldu" [Bugün'ün programı yap].
- PT sonradan program kurar ya da değiştirirse seçim değişmez; Bugün'de "Antrenörün yeni bir program hazırladı" satırı (§2.6), Programlar'da PT kartı "Güncellendi".
- PT danışanın seçimini değiştiremez; Program sekmesinde görür, bildirim alır.
- **Yarım antrenman seçimi engellemez.** Seans kendi programını taşır (`programId`); devam etme, bitiş ve rotasyon hep o programla olur (§5.4). Yalnız yarım antrenmanın geldiği programı silmek 409 (§3.7).
- Seçili program silinir ya da okunamazsa Bugün PT'nin programına döner; okunamıyorsa kartta "Evde şu an açılamıyor" ve seçim sheet'i.
- **Rotasyon ve günler program başına:** her dosya kendi `rotation`'ını ve `schedule`'ını taşır; program değiştirmek sırayı sıfırlamaz.
- **"Günlerini değiştir"** (Bugün, Ayarlar) Bugün'de gösterilen programa yazar: PT'ninkiyse bugünkü gibi `clientSchedule` katmanı; kendi programıysa programın `schedule`'ı doğrudan (katman yok, revision artmaz, PT'ye bildirim yok), dosya ve index tek commit.
- **"Bu hafta x/y":** x bütün bitmiş antrenmanların günleri (hangi programdan olursa), y gösterilen programın seçili günleri ya da sıklığı. Gün şeridinin "kaçırıldı" penceresi `max(scheduleSince, active.at)` (Genel bakış'la aynı kural, §4): seçimden önceki günler kaçmış sayılmaz.
- **"Başka gün seç"** yalnız gösterilen programın günleri; kendi programda PT'ye bildirilmez.
- Telefondaki plan damgası (`programStamp`) programın kimliğini de taşır: seçim değişince saklanan plan eskir.

### 3.3 Evreler
Yok. Kendi program tek, gizli, süresiz evredir (`phased: false`). Gerekçe: evre geçişini PT onaylar (SPEC §7.4) ve kendi programda onaylayacak PT yok; ihtiyaç "evde", "tatil" gibi kısa döngüler; telefonda evre düzeni ağır. PT paylaşılan programda da evre açamaz. PT'nin evreli programından kopyalanan günler tek listeye girer (7 gün sınırı).

### 3.4 PT geri bildirimi, öneriler, hedefler
- Kendi programda `proposals.json`'a öneri gitmez; `clientTargets` ve `clientSchedule` yazılmaz. Danışan hedefini satırın kendisine yazar (düzenleyicide ya da bitişte).
- **Kip günün bulunduğu dosyadan:** seans `programId` taşıyorsa ve gün `own-programs/<id>.json`'da bulunuyorsa kendi program kipi; `programId` yoksa ve gün `program.json`'da bulunuyorsa PT kipi (bugünkü akış). Gün bulunamazsa ya da dosya yoksa programa hiçbir şey yazılmaz, seans kaydedilir. Kendi program kipi `program.json`'a hiç uygulanmaz.
- Bitişin maddeleri hepsi `direct` (§6.5), aynı algılama (§6.1):
  - kilo → yalnız geçmişe kayıt (motor geçmişten planlar);
  - tekrar/süre hedefi (piramit, back-off, AMRAP dahil) → satırın setleri;
  - set sayısı ve algoritmanın set artışı (§5.6) → satırın setleri;
  - "Değiştir" → satırın hareketi (satır kimliği ve set düzeni kalır; cihaz egzersizinkine döner);
  - eklenen hareket → günün sonuna yeni satır;
  - geçilen hareket → satırı sil, **seçili gelmez** (geri dönüşsüz görünen iş kendiliğinden yapılmaz). "Değiştir" ve ekleme PT kipindeki gibi seçili gelmez.
  Dönüşümler `applyProposal`'ın saf adımlarıyla (`proposals.ts`) yapılır; öneri dosyası yazılmaz.
- **O arada değişen program (paylaşılmış program, ikinci cihaz):** her madde satırın antrenman başındaki hâlini taşır (`row: { exerciseId, sets }`; eklemede yok). Programın revision'ı seansınkiyle (`doc.program.revision`) aynıysa madde yazılır. Farklıysa satır kayıtta aranır: yoksa ya da hareketi veya setleri maddeninkinden farklıysa **yazılmaz** ve `stale` sayılır; silinen satır geri getirilmez, eklemede gün yoksa yazılmaz. Sonuç metni §2.9. Kilo maddesi satıra yazmadığı için her zaman geçmişe girer.
- Paylaşılmış olsa da öneri akışı yok: PT değişikliği doğrudan yapar (§3.5), danışan beğenmezse düzenler.
- PT'nin program sayfasındaki öneri kartı ve "Danışan güncelledi" rozetleri yalnız PT'nin programı içindir.
- Kendi programdan antrenmanda `other_day` ve `unfinished` bildirimi yazılmaz (plan danışanın); `overload`, `lighter` ve ağrı ayrıntısı bugünkü gibi.

### 3.5 Paylaşım
- **Açık:** PT, danışanın Program sekmesinde görür, açar, düzenler (§4): günler, hareketler, sıklık ve antrenman günleri. Adı değiştiremez; silemez; paylaşımı ve Bugün'ün programını değiştiremez.
- **PT'nin kaydı** (`PUT /api/clients/[id]/programs/[pid]`): dosya dalın ucunda okunur; `shared` yoksa 403 (index'teki `shared` yalnız gösterimdir, karar dosyadan). Commit aynı uçla (`commitFiles`, `force: false`); ref çakışmasında dosya yeniden okunur ve `shared` yeniden denetlenir (yalnız revision değil). `name`, `shared`, `id`, `phased`, `log`, `rotation` ve (PT günleri değiştirmediyse) `schedule` her zaman kayıttaki dosyadan gelir; gövde yalnız günleri, hareketleri, sıklığı ve seçili günleri taşır.
- PT'nin kaydı `revision + 1`, geçmişe `by: "pt"`; index'te `ptEditedAt`; danışana bildirim (§7.2). Danışanın paylaşılmış programdaki kaydı (düzenleyici ya da bitiş) index'te `clientEditedAt`, PT'ye bildirim (§7.1).
- **Kapatma:** program PT'nin listesinden ve adresinden düşer (404: "Danışan bu programın paylaşımını kapattı."); PT'nin açık düzenleyicisinin kaydı 403 alır, değişiklikler PT'nin tarayıcı taslağında kalır. PT'nin eski değişiklikleri programın geçmişinde kalır. PT'ye bildirim.
- Yeniden paylaşım aynı dosyadır, geçmiş sürer.
- **Görünürlük:** paylaşılmamış programın içeriği PT ekranlarında hiç görünmez. Adı yalnız Bugün'ün programıysa (Program sekmesindeki bilgi satırı) ve seanslarda (anlık görüntü) görünür; seanslar zaten PT'ye açıktır.

### 3.6 Çakışma
- Dosya PT programıyla aynı sürüm çiftini taşır: `revision`, `createdAt`; düzenleyici `baseRevision`, `baseCreatedAt` gönderir, tutmazsa 412 (`sameProgramBase`).
- **Revision artıran yazımlar:** düzenleyici kaydı (danışan ya da PT), bitişte satıra yazılan değişiklik. **Artırmayanlar:** rotasyon, "Günlerini değiştir", paylaşım, Bugün'ün programı seçimi, bitişte yalnız kilo kaydı.
- Bitişin satır değişikliği revision'ı bu yüzden artırır: satırın sahibi danışandır, PT programındaki `clientTargets` katmanı yoktur; artmasaydı açık düzenleyicinin kaydı onu sessizce ezerdi. Bedeli: aynı anda açık düzenleyici 412 alır (kabul; sessiz ezilmeden iyi).
- **Günler ezilmesin:** düzenleyici açılıştaki günleri de gönderir (`baseWeekdays`); gönderdiği günler onunla aynıysa kayıttakine dokunulmaz (arada Bugün'den değişen günler kalır).
- 412 uyarısı PT'dekiyle aynı dil; danışan metni: "Bu program sen düzenlerken değişti (antrenörün ya da başka bir cihazın kaydetti). Değişikliklerin burada duruyor; sayfayı yenilersen gider." Telefonda "Yeni sekmede aç" yok.
- Oluşturmanın yeniden denenmesi: aynı kimlik ve aynı gövde → `unchanged`; farklı gövde → 409 `exists`.
- Sınır yarışı (iki cihazdan 5. ve 6.): index programla tek commit'te yazılır, ref ileri sarma değilse sunucu bir kez yeniden okur, sınırı görür, 409 "En fazla 5 program."

### 3.7 Silme
- Yalnız danışan; onaylı (§2.8). Tek commit: dosya silinir, index satırı düşer, Bugün'ün programıysa `active` kalkar, paylaşılmışsa `events`'e `deleted` yazılır.
- Yarım antrenman bu programdansa (seans index'inde bitmemiş satır, dosyasında `programId`) 409 "Yarım antrenmanın bu programdan; önce bitir ya da sil." ve yanıt yarım antrenmanın kimliğini taşır (`sessionId`): diyalog [Yarım antrenmanı sil]'i sunar.
- Seanslar, rekorlar, İlerleme kalır; Geçmiş'te "Evde · Gün A" (anlık görüntü), programa bağlantısız.
- PT'nin açık düzenleyicisi 404 ("Program silindi."). Telefondaki taslak silinir.
- Commit mesajı genel: "Kendi programı silindi" (ad yok; seans silmeyle aynı ilke).
- Veri silme (danışanın repo'su silinir) kendi programları da götürür.

### 3.8 Şablon bayrağı (şablondan başlama)
- `data/templates/<id>.json` → `sharedWithClients: true`. Şablon formunda Switch "Danışanlar kendi programlarına kopyalayabilir" (varsayılan kapalı); listede "Danışanlara açık" rozeti.
- **Neden şablon başına, danışan başına değil:** asıl soru "bu şablon gözetimsiz kullanıma uygun mu?" ve bunun cevabı şablondadır. PT yarım kalmış ya da özel (rehabilitasyon) şablonları kapalı tutar, genel olanları tek yerden açar. Danışan kaydına yeni alan girmez, her yeni danışanda ayrı karar gerekmez. Şablonda kişisel veri olmadığı için (SPEC §7.4) bütün danışanlara açmak güvenlidir.
- Okuma sunucudadır: liste yalnız bayraklı şablonları döner; **kimlikle her okuma** (`?sablon=t_…`, gün ekleme) `sharedWithClients === true` ister, işaretsiz şablon yokmuş gibi 404 (şablon kimlikleri tahmin edilebilir). Danışan uygulama repo'suna hiçbir şey yazamaz.
- Kopya anlık görüntüdür (`source`: kimlik ve o anki ad); bayrak kapanınca yeni kopya yapılamaz, yapılmışlar kalır. Satır notları kopyalanır (PT'nin genel notları).

### 3.9 Öneri motoru ve geçmiş (rev. 2)
- **Pencere satır başına:** `historyRows` bugünkü günün her satırı için o satırı içeren en yeni 4 bitmiş antrenmanı (index'te `exercises[].rowId`), aynı programdan (`programId`) günün egzersizlerini içeren en yeni 4'ü ve bugünkü gibi en yeni 8'i okur (birleşim). Evde üç hafta çalışan danışanın PT satırı kendi serisini pencerede tutar.
- **Kendi serisi olmayan satır** (yeni kopya, yeni satır) yalnız aynı programın antrenmanlarına bakar. Aynı programda da yoksa başka programın en yeni antrenmanı yalnız çeviri kaynağıdır (`latest`: Epley, `CONVERT_MAX_STEPS` sınırı), seriye (`chain`) girmez: salondaki tıkanma evdeki satırı hafifletmez, evdeki ilk antrenman salonun serisini sürdürmez (`planSession`'ın `convertOnly`'si).
- **"Önceki" ve ayar notu** (`lastTimeOf`, `setupNoteOf`): önce satırın kendi kaydı, sonra aynı programda aynı egzersiz ve cihaz, en son başka programlarda.
- **Deneyim (exposure) programdan bağımsız:** hareketi kaç kez, ne kadar süredir yaptığı danışanın bilgisidir.

---

## 4. PT tarafı

Masaüstü öncelikli, telefonda çalışır. Yeni sekme yok: danışanın **Program** sekmesi.

```
Program sekmesi (/dashboard/clients/[id]/program), en üstte
╭──────────────────────────────────────────────────────────────╮
│ ⓘ Danışan şu an kendi programıyla çalışıyor: Evde            │
│   Paylaşıldı · 3 gün önce seçti                [Programı aç] │
╰──────────────────────────────────────────────────────────────╯
  … PT'nin programı (bugünkü sayfa) …
╭ Danışanın paylaştığı programlar (1) ─────────────────────────╮
│ Evde                                     Bugün'ün programı   │
│ 2 gün · haftada 2 · Sal, Per · son antrenman 22 Eyl          │
│ Son değişiklik: danışan · 26 Eyl                     [Aç ›]  │
╰──────────────────────────────────────────────────────────────╯
```
- **Bilgi satırı** (`Alert`) yalnız Bugün'ün programı kendi programken. Paylaşılmamışsa "Paylaşılmadı" yazar, [Programı aç] yok. PT'nin programı yokken boş durumun üstünde de görünür. Satırın bütün bilgisi index'ten (dosya okunmaz).
- **Paylaşılan programlar kartı** yalnız paylaşılmış program varsa; satırlar index'ten.
- **Görünüm** `/dashboard/clients/[id]/program/own/[pid]`: PT program sayfasının evresiz hâli (`DayPlan`, haftalık yük planı, `ChangeLog`). Eylemler: [Düzenle]. Öneri kartı, evre geçişi, silme yok. Dosya paylaşılmamışsa 404 ("Danışan bu programın paylaşımını kapattı.").
- **Düzenleyici** `/…/own/[pid]/edit`: `OwnProgramForm`, `own-pt` kipi (ad salt okuma; `BlockEditor` tam kipte; "+ Gün"de PT'nin bütün şablonları). Kayıt `PUT /api/clients/[id]/programs/[pid]` (§3.5). Taslak `pulsecoach.draft.own.<clientId>.<pid>`. 412 / 403 (paylaşım kapandı) / 404 (silindi) metinleri §3.5–3.7.
- **Antrenmanlar** sekmesi ve seans detayı: kendi programdan antrenmanda "Kendi programı · Evde" rozeti.
- **Genel bakış:** bildirimler §7.1. "Dikkat gerektirenler" seçimi bilir: kaçan gün kendi programın günlerinden (index) ve `max(scheduleSince, active.at)`'ten; PT programının evresi dolduysa ve danışan kendi programıyla çalışıyorsa madde "Danışan Evde ile çalışıyor · evre süresi doldu".
- Her PT sayfası `requirePt()`'yi kendisi çağırır; uç `readPtSession()` ile.

---

## 5. Veri

### 5.1 Dosyalar (`client-<id>`)
```
program.json                    PT'nin programı (değişmez)
own-programs/op_k2m9x4qa.json   kendi program; dosya başına bir program, yol yalnız kimlikten
own-programs-index.json         liste, Bugün'ün programı, paylaşım olayları
sessions/<id>.json              program: { …, programId?, programName? }
sessions-index.json             satırda programId?, programName?
```

### 5.2 `own-programs/<id>.json` — şema `src/lib/schemas/own-program.ts`
```jsonc
{
  "version": 2,                          // program.json ile aynı gövde: saf işlevler olduğu gibi çalışır
  "id": "op_k2m9x4qa",
  "name": "Evde",
  "phased": false,                       // her zaman: tek, gizli, süresiz evre
  "revision": 4,                         // içerik yazımında +1 (§3.6)
  "createdAt": "2026-09-20T18:00:00.000Z",
  "updatedAt": "2026-09-26T09:12:00.000Z",
  "shared": { "at": "2026-09-21T08:00:00.000Z" },   // yoksa paylaşılmamış
  "phases": [ { "id": "p_…", "name": "Evre 1", "daysPerWeek": 2, "days": [   // daysPerWeek yalnız gün seçilmemişse
    { "id": "d_…", "name": "Gün A",
      "copiedFrom": { "dayId": "d_q2m8xk", "dayName": "Gün A", "at": "…" },   // PT'nin gününden; şablondan geldiyse "source"
      "blocks": [ … ] } ] } ],           // şablonla aynı bloklar
  "current": { "phaseId": "p_…", "startedAt": "…" },
  "rotation": { "lastDayId": "d_…", "lastCompletedAt": "…" },   // bitiş yazar
  "schedule": { "weekdays": [2, 4], "at": "…" },                // danışan doğrudan; katman yok
  "log": [                               // en yenisi üstte, en fazla 200
    { "at": "…", "revision": 4, "kind": "edit", "by": "pt", "changes": [ { "scope": "Gün A", "text": "Şınav 3×8–12 → 3×10–14" } ] },
    { "at": "…", "revision": 3, "kind": "client", "sessionId": "s_…", "changes": [ { "scope": "Gün A", "text": "Goblet Squat 3 → 4 set" } ] },
    { "at": "…", "revision": 2, "kind": "share", "changes": [ { "text": "Antrenörle paylaşıldı" } ] }
  ]
}
```
- `by`: `"pt"` ya da yok (danışan). `LOG_KINDS`'a `share` eklenir (paylaşma ve kapatma; revision artmaz); `programLogEntrySchema`'ya isteğe bağlı `by`. `program.json` ikisini de yazmaz.
- `clientSchedule`, `clientTargets` yazılmaz; gelirse atılır. `phased: true` ya da birden çok evre reddedilir.
- Şema `programSchema`'nın gövdesini paylaşır, üstüne `id`, `name`, `shared`, `copiedFrom` ve tek evre denetimi.

### 5.3 `own-programs-index.json` — türetilmiş satırlar + seçim
```jsonc
{
  "version": 1,
  "active": { "programId": "op_k2m9x4qa", "at": "…" },   // programId null ya da alan yok: PT'nin programı
  "items": [                                              // oluşturulma sırasıyla
    { "id": "op_k2m9x4qa", "name": "Evde", "days": 2, "daysPerWeek": 2, "weekdays": [2, 4],
      "revision": 4, "createdAt": "…", "updatedAt": "…",
      "shared": { "at": "…" },                             // paylaşılmışsa (gösterim; karar dosyadan)
      "ptEditedAt": "…", "clientEditedAt": "…" }           // paylaşılmışken son düzenlemeler (bildirim)
  ],
  "events": [                                             // yalnız paylaşılmış programlar; 30 gün, en çok 20
    { "kind": "unshared", "id": "op_…", "name": "Evde", "at": "…" },
    { "kind": "deleted", "id": "op_…", "name": "Tatil", "at": "…" }
  ]
}
```
- **Neden:** Bugün ve Programlar listeyi, günleri ve seçimi tek okumayla alır (program başına okuma yok); PT'nin özeti ve "Dikkat gerektirenler" seçili programın günlerini dosya açmadan bilir; silinen ya da kapatılan programın bildirimine iz kalır.
- **Ne zaman yazılır:** oluşturma, kayıt (ad, gün sayısı, günler, sıklık, revision), kendi programda "Günlerini değiştir", paylaşma ve kapatma, silme, seçim, bitişte satır yazımı. Programla **aynı commit** (`commitFiles`). Rotasyon ve bitişin yalnız rotasyonu ya da yalnız kilo kaydı index'e dokunmaz.
- **Onarım** (`sessions-index` gibi): okunurken `own-programs/` ağacıyla karşılaştırılır. Dosyası olmayan satır düşer; satırı olmayan ya da `revision`'ı dosyanınkinden farklı dosya okunup satırı yeniden kurulur (`shared` dahil, dosyadan); `active` yok olan programı gösteriyorsa PT'nin programı geçerlidir. Bozuk index dosyalardan kurulur, seçim PT'nin programına döner (günlüğe yazılır).

**Yazma bedeli** (GitHub içerik yazımı; `commitFiles` dosya sayısından bağımsız 3):

| Eylem | Dosyalar | Yazma |
|---|---|---|
| Oluştur · kaydet (danışan ya da PT) | program + index | 3 |
| Bugün'ün programı seç | index | 3 |
| Paylaş · paylaşımı kapat | program + index | 3 |
| Kapatma + "Geri al" | — | 0 |
| Kendi programda "Günlerini değiştir" | program + index | 3 |
| Sil | program (silme) + index | 3 |
| Bitiş (seans + index + program [+ own index]) | tek commit | 3 |
| "Yalnız bugün" | — | 0 |

### 5.4 Seans ve index
- `sessionProgramSchema`: + `programId?` (`op_…`; yoksa PT'nin programı), `programName?` (anlık görüntü, ≤ 40). Index satırı aynı iki alanı taşır.
- **Başlangıç:** `GET /api/me/workout` yanıtında `program.id` (kendi programda `op_…`, PT'ninkinde yok) ve `day.programId`, `day.programName`, `day.source`; telefon yeni seansa `programId` ve adı yazar.
- **İlk PUT** (dosya yokken): gün seansın programında aranır (`own-programs/<programId>.json`, yoksa `program.json`); bulunmazsa 400 "Bu antrenmanın programı bulunamadı." (telefon kayıtları tutar; bitiş yine kaydeder, programa yazmaz).
- **Birleştirme:** `programId` sabittir; kayıttaki seansın `programId`'si gelenden farklıysa PUT ve bitiş 400 ("Kayıt başka bir programa ait.").
- **Devam etme:** `GET /api/me/workout` yarım antrenman varken programı seansın `programId`'sinden kurar, `active`'ten ya da adresten değil. Program okunamıyorsa plan yok (yarım kart telefondaki kopyayla sürer).
- **Bitiş** (`planFinish`, tek commit): kip günün bulunduğu dosyadan (§3.4). Kendi program kipinde `own-programs/<id>.json` (rotasyon, §3.4 maddeleri) ve satır yazıldıysa index (`revision`, `updatedAt`, paylaşılmışsa `clientEditedAt`) yazılır; PT kipinde bugünkü gibi `program.json` + `proposals.json`. Dosya yoksa ya da gün bulunamazsa rotasyon ve güncelleme geçilir, seans kaydedilir.
- Egzersiz deneyimi, rekorlar, İlerleme egzersiz kimliğiyle çalışır: kaynak fark etmez. Öneri motorunun serisi §3.9.

### 5.5 Modüller
| Dosya | İş |
|---|---|
| `src/lib/own-programs.ts` (saf, `node --test`) | sınırlar, kimlik ve ad, oluşturma (boş · PT günlerinden `withClientTargets` + `reIdBlocks` · şablondan), kimlik çakışması, kayıt (`applyProgramEdit` + `copiedFrom` + `by`), paylaşım kaydı, günler |
| `src/lib/own-program-index.ts` (saf) | index okuma, satır, onarım, seçim çözümü, olaylar, PT ve danışan bildirimleri |
| `src/lib/own-program-feedback.ts` (saf) | bitişin kendi program kipi: §3.4 dönüşümleri, bayat satır denetimi |
| `src/lib/schemas/own-program.ts` | dosya, kayıt, paylaşım ve seçim gövdeleri |
| `src/lib/own-program-files.ts` (çekirdek, sahte depoyla test) | okuma (onarılmış index), oluşturma, kayıt, silme, paylaşım, seçim, günler, PT kaydı; hepsi `commitFiles` |
| `src/lib/own-program-routes.ts` (ince çekirdek, test) | danışan uçları: `run()`, `postGuard`, `originGuard` |
| `src/lib/own-programs-store.ts` (`server-only`) | sayfaların okumaları, PT uçlarının bağlaması, `dropNotices` |
| `program-feedback.ts`, `session-finish.ts`, `session-files-core.ts` | kip ve dosya kaynağa göre; `row` anlık görüntüsü; `programId` denetimleri |
| `workout-plan.ts`, `workout-routes.ts`, `progression.ts`, `recommend.ts` | seçimden plan, `programStamp`'e kimlik, `weekOf`/`scheduleOf`, satır başına pencere, `convertOnly` |
| `notices.ts`, `notices-store.ts`, `attention.ts` | `own_program` türü; seçimi bilen dikkat maddeleri |
| `client-tabs.ts`, `client-dock.tsx`, `client-menu.tsx` | 4. sekme; "Programım" kalkar |
| `src/components/program/own-program-form.tsx` | kendi program düzenleyicisi; kip `own` · `own-pt` |
| `components/block-editor/**` | `variant: 'full' \| 'simple'` (sade kip) |
| `schemas/template.ts`, şablon formu, `templates.ts` | `sharedWithClients`, danışanın kimlikle okuması |

---

## 6. Uçlar ve sayfalar

| Uç | Kim | İş |
|---|---|---|
| `PUT /api/me/programs/[pid]` | danışan | Oluştur (`baseRevision: null`) ya da kaydet. Gövde: `name`, `phases` (tek evre), `currentPhaseId`, `weekdays`, `baseWeekdays`, `baseRevision`, `baseCreatedAt`. 201 / 200 (`unchanged`); 400 alan hataları; 409 `exists` ya da sınır; 412; 404 |
| `DELETE /api/me/programs/[pid]` | danışan | Sil (+ index); 409 yarım antrenman (`sessionId`) |
| `POST /api/me/programs/[pid]/share` | danışan | `{ shared: boolean }`; revision artmaz |
| `POST /api/me/programs/active` | danışan | `{ programId: "op_…" \| null }` (null: PT'nin programı); 404 bilinmeyen program. Yarım antrenman engellemez |
| `POST /api/me/schedule` | danışan | `{ weekdays, programId? }`: gösterilen programa yazar (kendi programda `schedule`, tek commit) |
| `GET /api/me/workout?program=&day=` | danışan | Plan: yarım antrenman varsa onun programından; yoksa `program` (`op_…` ya da `pt`), o da yoksa kalıcı seçim. Yanıtta `program.source` (`pt` \| `own`), `id`, `name` ve seçim listesi (`choices`: ad, son antrenman) |
| `PUT /api/clients/[id]/programs/[pid]` | PT | Paylaşılmış programı kaydet; 403 paylaşılmamış; 404; 412 |

- Her uç yol kurmadan önce `pid`'yi `^op_[a-z0-9]{8}$` ile denetler; uymazsa 404 (dosya adı yalnız kimlikten, `ownProgramPath`).
- Danışan uçları `session-routes.ts`'in kapısıyla (`run()`: oturum, kayıt, GitHub hataları → 429/503); durum değiştirenler `postGuard` (yalnız bu siteden, JSON); DELETE köken denetimiyle. Kimlik yalnız oturumdan.
- Sayfalar okumayı sunucuda yapar, her biri `currentClient()` (PT: `requirePt()`) çağırır: `/me/programlar`, `/me/programlar/antrenor`, `/me/programlar/yeni`, `/me/programlar/[pid]`, `/me/programlar/[pid]/duzenle`. Hepsi `(sekmeler)` kabuğunda; dock'ta Programlar etkin (`clientTabIndex` alt sayfaları sayar).

---

## 7. Bildirimler ve geçmiş etiketleri

### 7.1 PT'ye (Genel bakış; yeni tür `own_program`, etiket "Kendi programı", bağlantı Program sekmesi)
| Olay | Metin | Kaynak |
|---|---|---|
| Bugün'ün programını değiştirdi | "Bugün'ün programı: Evde" · "Antrenörün programına döndü" | index `active.at` |
| Paylaştı | "Paylaştı: Evde" | `items[].shared.at` |
| Paylaşımı kapattı · sildi | "Paylaşımı kapattı: Evde" · "Sildi: Evde" | index `events` |
| Paylaşılmış programı düzenledi (düzenleyici ya da bitiş) | "Evde · Gün A: Goblet Squat 3 → 4 set" | programın geçmişi (yalnız `clientEditedAt` penceredeyse okunur) |

"Yalnız bugün" bildirilmez (yazılmaz); o antrenman Antrenmanlar'da "Kendi programı · Evde" rozetiyle görünür. Paylaşılmamış programdaki düzenlemeler bildirilmez. Özetin önbelleği bu yazımların hepsinde düşer (`dropNotices`).

### 7.2 Danışana (Bugün ve Programlar)
- PT paylaşılmış programı düzenleyince Bugün'de tek satır: "Antrenörün Evde programını düzenledi · 2 gün önce" [Gör] (→ programın sayfası, geçmiş). Kaynak index `ptEditedAt` (14 gün); Programlar'da "Antrenörün düzenledi" rozeti.
- Görüldü bilgisi telefonda (`localStorage`, try/catch; `ProposalOutcomes` gibi 14 günlük pencere): başka cihazda yeniden görünebilir; kabul.

### 7.3 Geçmiş etiketleri
| Kayıt | Danışan görür | PT görür |
|---|---|---|
| `create` | Oluşturuldu | Danışan oluşturdu |
| `edit` (danışan) | Düzenledin | Danışan düzenledi |
| `edit`, `by: "pt"` | Antrenörün düzenledi | Düzenledin |
| `client` (bitiş) | Antrenmandan | Danışan güncelledi |
| `share` | Paylaşım | aynı |

---

## 8. Kenar durumlar

| Durum | Davranış |
|---|---|
| Hiç program yok | Bugün'de `Empty` + [Kendi programını kur] |
| PT'nin programı okunamıyor, kendi program seçili | Kendi program çalışır; Programlar'da PT kartı "şu an açılamıyor" |
| Kendi program dosyası bozuk | Listede "okunamadı" satırı, silinebilir; seçiliyse Bugün PT'nin programına döner |
| Egzersiz kütüphaneden silindi · cihaz silindi | PT programıyla aynı: uyarı ve kaydetmeden önce kaldırma · egzersizin cihazına dönüş (`normalizeProgram`) |
| Yarım antrenman varken seçim | İzinli; yarım antrenman kendi programıyla sürer |
| Yarım antrenmanın programını silmek | 409; diyalogda [Yarım antrenmanı sil] |
| Bitişte program silinmiş ya da gün yok | Seans kaydedilir; rotasyon ve güncelleme geçilir |
| Bitişte satır o arada değişmiş | O madde yazılmaz (`stale`), öteki maddeler yazılır |
| Seansın `programId`'si başka cihazda farklı | 400; kayıt telefonda kalır |
| Paylaşım kapandı, PT düzenliyor | 403; değişiklikler PT'nin taslağında |
| İki cihaz ya da PT ile aynı anda düzenleme | 412 (§3.6) |
| 5 program dolu · 7 gün dolu | Oluşturma ve "Yeni programa" pasif · hedef program pasif |
| Kopyalanan PT günü sonra değişti | Kopya değişmez (anlık görüntü, `copiedFrom`) |
| Aynı gün iki programdan antrenman | İzinli; "bu hafta" günü bir kez sayar |
| Erişim kapatıldı · arşiv | Dosyalar durur; paylaşılmışsa PT görmeye ve düzenlemeye devam eder |
| Kimlik çakışması (kopyada) | Sunucu yeniden üretir |
| Adresteki `pid` kalıba uymuyor · işaretsiz şablon kimliği | 404 |

---

## 9. Fazlar

| # | Faz | Çıktı |
|---|---|---|
| 1 | Veri ve saf mantık | `schemas/own-program.ts`, `own-programs.ts`, `own-program-index.ts`, `own-program-feedback.ts` (+ testler), index onarımı, seans ve index alanları, `LOG_KINDS` + `by`, `own_program` bildirim türü, şablon bayrağının şeması, satır başına geçmiş penceresi |
| 2 | Programlar sekmesi (okuma) | Dock 4. sekme, liste, PT programının görünümü, boş durumlar; "Programım" kalkar |
| 3 | Oluştur, düzenle, sil | `OwnProgramForm` (`own`), sade `BlockEditor`, yeni ve düzenle sayfaları, başlangıç (boş, PT günleri), "+ Gün" sheet'i, taslak, 412, silme ve yarım antrenman |
| 4 | Bugün ve antrenman | Seçim ([Yalnız bugün], [Bundan sonra hep bu]), yeni PT programı satırı, plan ve bitiş kaynağı, `programId` denetimleri, rotasyon ve günler program başına, "Evde'ye yaz", bayat satır, Geçmiş ve PT Antrenmanlar rozeti |
| 5 | Paylaşım ve PT | Paylaş ve (gecikmeli) kapat, PT'nin bilgi satırı, kartı, görünümü ve düzenleyicisi (`own-pt`), iki yönde bildirimler, seçimi bilen dikkat maddeleri |
| 6 | Şablon bayrağı | Şablon formunda Switch, listede rozet, "Hazır şablondan" başlangıcı ve gün ekleme, kimlikle okumada bayrak |

Her faz tek başına yayınlanır, 375 px'te test danışanlarında doğrulanır (gerçek danışanın verisine yazılmaz), saf mantık `npm test`, `npm run lint` 0 hata.

---

## 10. Kararlar (rev. 1'in açık soruları; önerilen kararlar kabul edildi)

1. **Dock sırası:** Programlar 4. (`antrenman-ekrani.md` §0'daki plan; Geçmiş ve İlerleme'nin yeri değişmez). **Kabul.**
2. **Sınır ve arşiv:** 5 program, arşiv yok; ihtiyaç olursa 10 + arşiv. **Kabul.**
3. **Seçim kalıcı mı, günlük mü?** Rev. 1'in önerisi (yalnız kalıcı) inceleme 6 ile değişti: kalıcı seçim + tek seferlik "Yalnız bugün" (yazmaz). Rotasyon program dosyasında, seans `programId` taşıdığı için karışmaz. **Kabul (değişmiş hâliyle).**
4. **PT danışanın seçimini değiştirebilsin ya da kilitleyebilsin mi?** Hayır; bilgi satırı ve bildirim yeter, PT danışanla konuşur. **Kabul.**
5. **PT'nin paylaşılmış programdaki değişikliği danışanın onayını beklesin mi?** Hayır; doğrudan + geçmiş + bildirim. Danışan beğenmezse düzenler ya da paylaşımı kapatır. **Kabul.**
6. **Paylaşılmamış programın adı PT'ye görünsün mü?** Evet, yalnız seçiliyken ve seanslarda; seanslar zaten açık, paylaşım metni bunu söylüyor. **Kabul.**
7. **Algoritmanın set artışı kendi programda seçili mi gelsin?** Evet, PT programındaki seçimle aynı; tek fark "Evde'ye yaz". **Kabul.**
8. **PT paylaşılmış programı kendi programına alabilsin mi ("Programıma al")?** Sonraki faz; şimdilik yok. **Kabul (sonra).**
9. **Bitişin satır değişikliği açık düzenleyiciyi 412'ye düşürüyor.** Kabul (nadir, sessiz ezilmeden iyi); gerekirse sonra satır bazlı birleştirme. Bitiş de artık o arada değişen satırı ezmiyor (§3.4). **Kabul.**
10. **Kısıt süzgeci danışanın kütüphane sheet'inde?** Yalnız sağlık onayı ve kısıt varken "Kısıtına uymayabilir" rozeti, engel değil; onay yoksa hiçbir şey. **Kabul.**
11. **Kendi programda evre?** Yok; PT paylaşılmış programda da açamaz. **Kabul.**
12. **Danışana PT'nin program geçmişi gösterilsin mi?** Hayır (bugünkü gibi); yalnız kendi programlarının geçmişi. **Kabul.**

**İncelemeden reddedilen madde yok.** Değiştirilerek alınanlar: 7 (paylaşımı kapatmanın gecikmeli commit'i sayfa gizlenince ve çıkışta da gider, başarısızlık Switch'i geri açar: kapattığını sanan danışanın programı açık kalmasın) ve 8 (kopyalanan satırdaki PT kuralı ve piramit silinmez, sade kipte okunur satır; danışanın elinden PT'nin kararı sessizce düşmesin).

**Sonraki faza kalanlar ("sonra"):** "Programıma al" (8), paylaşılmış program için satır bazlı birleştirme (9).

---

**SPEC'e yansıyanlar** (bu revizyonla): §3 ağaç (`own-programs/`, `own-programs-index.json`), §4 veri şekilleri ve seansın `programId`'si, §6 dock (dört sekme; avatar menüsündeki "Programım" kalkar), Bugün'ün program seçimi ve Programlar sekmesi, §7.4 kendi program kuralları ve şablon bayrağı; `antrenman-ekrani.md` §0 tablosu, §6.5 ve açık soru 12.
