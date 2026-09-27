# Kısıtlar ve hareket taraması

> **Durum:** rev. 2 · eleştiri işlendi, açık soruların önerilen cevapları kabul edildi · faz 1–5 uygulandı (faz 6 "sonra") · **Tarih:** 2026-09-27 · **Kapsam:** SPEC §4 (`health.json`, onay), §6 (danışan sekmeleri, Genel bakış, sakatlık süzgeci), §7.2 (muadiller), §7.5 (ölçüm ve yük toleransı; "Hareket taraması (FMS)" paragrafının yerine), §12 satır 5b.
> **Girdiler:** v2 kodu (`schemas/health.ts`, `conditions.ts`, `exercise-filter.ts`, `alternatives.ts`, `measurements.ts`, `measurement-log.ts`, `health.ts`, `client-status.ts`, `check-in.ts`, `session-check.ts`, `attention.ts`, `notices.ts`, `notices-store.ts`, `workout-routes.ts`; `dashboard/clients/[id]/**`, `dashboard/exercises/constraint-picker.tsx`, `medical-fields.tsx`, `block-editor/exercise-sheet.tsx`, `exercise-picker.tsx`, `me/antrenman/flow-sheets.tsx`, `me/antrenman/start-check.tsx`, `me/consent-card.tsx`, `me/(sekmeler)/ayarlar`), v1 (`src/app/pt/assessment/[clientId].tsx`, `features/pt-studio/lib/assessment-model.ts`: Y-Balance, tek bacak denge, postür notu çipleri, "Sadece PT girer"; PRD P3; `readiness_logs.pain_areas`), `docs/research/medical-fitness/`, rev. 1'in eleştirisi (8 madde; §7.1).
> **Dil:** belge PT'den üçüncü şahısla söz eder. Ekran metinleri PT'ye ikinci tekil (uygulamanın geri kalanı gibi), danışana "antrenörün" der. Marka ve kişi adı yazılmaz.
> **Kanıt:** kaynaklı eşik kaynağıyla yazılır; kendi kuralımız **[sentez]**. Tescilli içerik yok: FMS'in test adları, yönergeleri, puanlama tablosu ve düzeltici hiyerarşisi uygulamaya girmez (SPEC §7.5; araştırma README'si, "Lisans uyarısı"). §4'teki protokol genel hareketlerle ve kendi cümlelerimizle kuruldu; neye benzediği ve neye dayandığı §4.1'de ve her testte yazılı.

## Özet kararlar

1. Danışan sayfasında **"Ölçümler" sekmesi "Sağlık" olur**; içinde alt şerit: **Kısıtlar · Ölçümler · Tarama**. Ölçüm adresleri aynen kalır, yönlendirme gerekmez (§1).
2. **Kısıt** bir kayıttır: bölge, taraf, tür, şiddet, başlangıç, durum (etkin/kapandı), kaçınılacak hareketler (kütüphanenin medikal etiketlerine eşlenir), isteğe bağlı **sağlık profesyonelinin koyduğu tanı** (kaynağıyla: hekim ya da fizyoterapist / danışanın beyanı), isteğe bağlı ve yalnız PT'nin gördüğü **gözlem** (bulgu), notlar. `health.json`'da, değişiklik kaydıyla (§2).
3. Danışan kendisi **bildirebilir**; bildirim PT'ye gider ve PT karar verene kadar "danışan bildirdi" rozetini taşır. **Güvenli yön hemen:** bildirilen "zorlayanlar" o andan itibaren **yalnız dikkat** olarak işler (asla yasak değil; bölgeden tahmin yok); kötüleşme hemen yazılır; gevşeten değişiklik PT onayıyla **[sentez]** (§2.4).
4. Süzgeç kısıtlardan beslenir: düzenleyicinin kütüphane sheet'i uygun olmayanı **gerekçesiyle işaretler, yasakları katlanmış grupta saklar**, PT **"Yine de ekle"** ile bu danışana özel izin verir (§3.2). **Etiketi eksik hareket hiçbir kaçınmada "uygun" sayılmaz:** kaçınmanın kalıp ailesindeyse "Etiket eksik" dikkatini alır (§2.2). Kütüphanenin squat, tek bacak, menteşe, dikey ve yatay itiş/çekiş hareketlerinin etiketlenmesi faz 3'ün ön koşuludur.
5. Antrenmandaki **"Değiştir"** yasaklıyı göstermez; her ekipman grubunda sıra **uygun → ipucu → dikkat → eksik bilgi → kontrol edilmedi** (§3.4). Danışan etkilenen harekette kısa, telaşsız bir not görür; programda kalmış izinsiz yasakta not "Değiştir'den bir muadil seç" der (§3.5).
6. Kırmızı bayrak "tıbbi izin" diye tek tarihle değil **iki tarihli adımla** yürür: **"Sağlık profesyoneline yönlendirdim"** ve **"Görüş alındı"** (dayanak: danışanın beyanı ya da yazılı rapor, kısa kapsam). Yönlendirmeye kadar Genel bakış'ta en üstte (95), sonra sakin bir izleme maddesi (40); görüş alınana kadar o bölgeyi çalıştıran her hareket **en az dikkat** alır ve danışan kartta not görür (§2.6).
7. **Hareket taraması** 8 temel hareketten oluşan kendi protokolümüzdür; sonuç **sözcüktür** (Temiz · Telafiyle · Kolaylaştırılmış · Yapılamadı · Ağrılı · Bu taramada yapılmadı), PT'nin işaretlediği gözlemlerden hesaplanır; **ağrı testi durdurur** ve sonuç üretmez; puan sayısı, toplam ve risk yüzdesi yok. Puan yapısı Cook 2006'nın sıralı ölçeğine benzer; bu protokolün güvenilirlik ya da geçerlik verisi yok (§4).
8. Tarama ipuçları yalnız PT'ye, sıra **ağrı → en düşük sonuç → asimetri → PT'nin hedefi** **[sentez]**; ağrı ve (tarama başına bir) büyük asimetri **Dikkat gerektirenler**'e düşer; hiçbir sonuç otomatik yasak üretmez (§4.6).
9. Onay **parça başına sürümlüdür**: kapsamı genişleyen iki parça (kısıtlar, tarama) `2026-10`'a geçer ve yalnız onlar yeniden sorulur; ağrı takibi, hazır oluşluk ve ölçümler kesintisiz sürer (§5.1).
10. Danışan **Sağlık** sayfasında (`/me/saglik`) kısıtlarını (bölge · taraf · tür · antrenörün notu; tanı adı yalnız hekim/fizyoterapist kaynaklıysa ve niteleyicisiz) ve taramasını (sözcük, ok, odak) görür (§5.2).
11. Beş fazda yayınlanır; sağlık verisi yalnız danışanın `health.json`'unda, commit mesajları ve hata yanıtları değer taşımaz (§5.3, §6).

---

## 1. Yer: danışan sayfasında "Sağlık" sekmesi

**Karar:** sekme şeridi **Genel · Program · Sağlık · İlerleme · Antrenmanlar · Davet** olur. "Sağlık"ın içinde küçük ikinci şerit (`TabsNav`, gezinme): **Kısıtlar · Ölçümler · Tarama**.

| Seçenek | Neden değil / neden |
|---|---|
| Kısıtlar ve Tarama için iki yeni sekme | Sekme sayısı 8 olur; 375 px'te şerit zaten kayıyor, "Davet" iyice görünmez olur. Üç parça aynı onayın ve aynı dosyanın (`health.json`) altında; kilit durumu üç yerde tekrarlanırdı. |
| Ölçümler sayfasına bölüm eklemek | Kısıt ölçüm değildir: programı süzer, danışan bildirir, onay akışı vardır. Üç ayrı giriş akışı ve üç ayrı kilit tek sayfada karışır; ad yanıltır. |
| **Sağlık + alt şerit** (seçilen) | Sekme sayısı aynı kalır. Onay ve kilit tek çatıda, parça başına. Ölçüm ve tarama çoğu zaman aynı değerlendirme gününde yapılır: yan yana durmaları doğal. |

**Adresler (kararlı):** `…/measurements/**` hiç değişmez (Genel'deki ölçüm kartı ve "Ölçümde gerileme" maddesinin bağlantıları çalışmaya devam eder). Yeni kardeşler: `…/constraints`, `…/constraints/new`, `…/constraints/[kid]/edit`, `…/screening`, `…/screening/new`, `…/screening/[tarih]/edit` (danışan sayfalarının İngilizce adlarıyla aynı). "Sağlık" sekmesi üç önekten birindeyken etkindir. Sekmenin bağlantısı layout'ta (danışan kaydı zaten okunuyor) hesaplanır: modülde seçili ilk parça, sıra **Kısıtlar → Ölçümler → Tarama**; modül kapalıysa Kısıtlar (kilit uyarısı neden ve ne yapılacağını söyler). Yönlendirme sayfası yok, ek istek yok.

**Alt şerit:** yalnız modülde seçili parçalar etkin; seçili olmayan parça pasif ve "seçili değil" notlu (`TabsNavLink disabled note`). Bekleyen danışan bildirimi ya da gözden geçirilmemiş tarama ağrısı varsa parçanın adının yanında nokta (ekran okuyucuya "bekleyen var").

**Kilit:** `measurementLock` → `healthLock(client, part)` diye genelleşir; `healthLockInfo(part, lock)` metinleri parçanın adıyla ("Kısıtlar seçili değil", "Hareket taraması seçili değil") yazılır. Kilit parça başına onaya bakar (§5.1): kısıtların onayı yenilenecekken ölçümler açık kalır. Kilitliyken sayfa dosyayı okumaz (gösterim de işlemedir).

**Genel sekmesi:** "Sağlık modülü" kartındaki parça listesi özet taşır: "Kısıtlar · 2 etkin · 1 bildirim bekliyor ›", "Hareket taraması · son 12 Eyl · 1 ağrı ›" (yalnız o parçanın onayı sürdükçe; yoksa "onay yok" ya da "yeni onay bekleniyor"). Ölçüm kartı yerinde kalır.

---

## 2. Kısıtlar

### 2.1 Veri modeli (`health.json` → `constraints[]`)

| Alan | Değerler | Not |
|---|---|---|
| `id` | `k_` + 6 | kalıcı; izinler ve kayıt buna bağlanır |
| `region` | `neck` · `shoulder` · `elbow` · `wrist_hand` · `upper_back` · `lower_back` · `hip` · `knee` · `ankle_foot` · `other` | sözlüğün `CONDITION_REGIONS`'ına eşlenir (`upper_back`/`lower_back` → `spine`, `wrist_hand` → `wrist`, `ankle_foot` → `ankle`, `other` → `systemic`) |
| `side` | `left` · `right` · `both` | yalnız çift bölgelerde (omuz, dirsek, el bileği, kalça, diz, ayak bileği); orada zorunlu |
| `type` | `injury` Sakatlık · `condition` Rahatsızlık · `post_op` Ameliyat sonrası · `limitation` Hareket kısıtı (hekim/fizyoterapist önerisi, gebelik, taramadan gelen) | |
| `conditionId` | sözlükten, **yalnız `kind: 'diagnosis'`**, niteleyiciyle (`"patellofemoral_pain:severe"`) | isteğe bağlı; seçilirse `exercise-filter.ts`'in kuralları çalışır |
| `diagnosisSource` | `clinician` Hekim ya da fizyoterapist · `client` Danışanın beyanı | `conditionId` varken **zorunlu** |
| `findingId` | sözlükten, **yalnız `kind: 'finding'`** ("Gözlem") | isteğe bağlı; kuralları çalışır; danışan hiç görmez |
| `origin` | `screening` | taramadaki ağrıdan eklendiyse (§4.4) |
| `details` | `surgeryDate`, `graft` (`hamstring`·`patellar_tendon`·`other`), `stage` (tendinopati 1–4) | yalnız ilgili tanıda; SPEC §6'da "Faz 5b" diye bekleyen alanlar burada gelir |
| `severity` | `mild` Hafif (antrenmanı etkilemiyor) · `moderate` Orta (bazı hareketlerde zorluyor) · `severe` Şiddetli (günlük hayatı etkiliyor) | tanımlar **[sentez]**; gösterim, "kötüleşti" ve bildirim sonrası metin içindir, süzgeci değiştirmez |
| `onset` | `YYYY` · `YYYY-MM` · `YYYY-MM-DD` + `onsetApprox?` | bilinen kesinlikte; danışanın aralığından gelen "yaklaşık" yazılır |
| `avoid` | kaçınılacak hareket etiketleri (§2.2) | PT seçer (danışanın "zorlayanlar"ı öneri gelir) |
| `triggers` | `squat` · `overhead` · `bend` · `jump` · `lean_back` | danışanın "Neler zorluyor?" cevabı; bekleyen bildirimde hemen dikkat (§2.4), onayda `avoid`'e çevrilir |
| `status` | `active` · `resolved` (+ `resolvedAt`) | kapanan silinmez, "Kapananlar"a iner |
| `source` | `pt` · `client` | |
| `confirmedAt` | an | `client` kaynaklıda yoksa "danışan bildirdi" |
| `clientChange` | `{ at, severity?, resolved?, note? }` | onaylı kısıtta danışanın bekleyen güncellemesi |
| `declined` | `{ at, note? }` | PT bildirimi kısıt olarak almadı (danışan notu görür) |
| `referredAt` | tarih | kırmızı bayraklı kısıtta "sağlık profesyoneline yönlendirdim" (§2.6) |
| `clearance` | `{ at, basis: 'client_report' \| 'written_report', scope? ≤ 140 }` | "görüş alındı"; `client_report` danışanın beyanı, `written_report` yazılı rapor |
| `note` | ≤ 500 | PT'nin notu; danışan görmez |
| `clientNote` | ≤ 140 | danışanın antrenmanda ve Sağlık sayfasında göreceği not |
| `reportNote` | ≤ 280 | danışanın bildirimde yazdığı |
| `createdAt`, `updatedAt` | an | `updatedAt` çakışma tabanı (§5.5) |

Sınırlar **[sentez]**: en çok 30 kısıt, bunların en çok 12'si etkin (süzgecin bugünkü sınırı), not uzunlukları yukarıdaki gibi.

**Sözlükte tür (`kind`):** `CONDITIONS`'a `kind: 'diagnosis' | 'finding'` eklenir. Bulgu olanlar (sözlüğün kendi notunda "Bulgu" diyenler ve postür/hareket gözlemleri): `upper_crossed_pattern`, `lower_crossed_pattern`, `scapular_dyskinesis`, `dynamic_knee_valgus`, `thoracic_extension_deficit`, `ankle_dorsiflexion_restriction`, `movement_screen_pain_flag`. Tanı seçicisinde yalnız `diagnosis`, "Gözlem" seçicisinde yalnız `finding` çıkar; `movement_screen_pain_flag` hiçbir seçicide yoktur (eski kayıtta okunur, §4.4).

### 2.2 Kaçınılacak hareketler (`avoid`)

Kütüphanedeki medikal etiketlerle (`exercise-filter.ts`: `jointWindows`, `spinalAlignment`, `axialLoading`, `shearForce`, `contractionType`, `loadVector`, `kineticChain`, `resistanceProfile`, `internalRotationUnderLoad`, `pattern`) birebir eşlenen yüklemler. Her biri üç değerli çalışır (doğru / yanlış / bilinmiyor).

| Etiket | PT'ye | Egzersiz etiketinde | Karar | Kalıp ailesi (etiket eksikse dikkat) |
|---|---|---|---|---|
| `deep_knee_flexion` | Derin diz bükme (90° üstü) | `jointWindows ∋ knee_flexion_over_90` | yaptırma | squat, lunge |
| `knee_end_extension_open` | Açık zincirde son aralık diz açma | `kineticChain = open ∧ jointWindows ∋ knee_terminal_extension_0_30` | yaptırma | knee_extension |
| `deep_hip_flexion` | Derin kalça bükme (90° üstü) | `jointWindows ∋ hip_flexion_over_90` | yaptırma | squat, lunge |
| `overhead` | Kol baş üstünde (90° üstü) | `jointWindows ∋ shoulder_elevation_over_90` | yaptırma | vertical_push, vertical_pull |
| `abduction_external_rotation` | 90° kol açma + son aralık dış rotasyon | `jointWindows ∋ shoulder_abduction_90_end_range_er` | yaptırma | vertical_push, vertical_pull |
| `behind_body` | Dirsek gövdenin arkasında (dips, pressin alt noktası) | `jointWindows ∋ glenohumeral_extension_beyond_neutral` | yaptırma | vertical_push, horizontal_push |
| `ir_under_load` | Yük altında iç rotasyon | `internalRotationUnderLoad` (etiketli harekette yoksa hayır) | yaptırma | — |
| `loaded_horizontal_adduction` | Dirençle göğüste kapanma | `loadVector = horizontal_adduction ∧ resistanceProfile ≠ bodyweight` | yaptırma | horizontal_push, chest_fly |
| `loaded_spinal_flexion` | Yüklü öne bükülme | `spinalAlignment = flexion ∧ yüklü` | yaptırma | hinge |
| `spinal_flexion_rotation` | Öne bükülme + dönme | `spinalAlignment = flexion_with_rotation` | yaptırma | core_rotation |
| `loaded_spinal_extension` | Yüklü geriye bükülme | `spinalAlignment ∈ {extension, extension_with_rotation} ∧ yüklü` | yaptırma | hinge |
| `high_axial_load` | Yüksek eksenel yük (bar sırtta) | `axialLoading = high` | yaptırma | squat, hinge, lunge, vertical_push |
| `high_shear` | Yüksek kesme kuvveti | `shearForce = high` | yaptırma | hinge |
| `ballistic` | Sıçrama / balistik | `contractionType = energy_storage_ballistic` | yaptırma | squat, lunge, hinge |
| `forward_bend` | Öne eğilme / yerden kaldırma | `pattern = hinge` | **dikkat** | — (kalıp her harekette var) |

- **"Yüklü"** bugünkü `loaded()` ile aynı (eksenel yük orta ya da yüksek).
- **Karar:** PT'nin açık talimatı olduğu için `yaptırma` **[sentez]**; kanıta dayalı yumuşatma zaten sözlüğün kurallarında (`warn`, `cue`). Tek istisna `forward_bend`: öne eğilmenin kendisi yasak gerekçesi değildir (kaldırmada lomber fleksiyonun bel ağrısıyla ilişkisine dair kanıt düşük kaliteli, Saraceni 2020); menteşe kalıbı yalnız **dikkat** alır.
- **Etiket eksikse (kalıp yedeği):** kuralın okuduğu etiket yoksa ve hareketin kalıbı etiketin ailesindeyse karar **dikkat**, gerekçe "Etiket eksik: kol baş üstünde olabilir". Aile dışındaysa kural atlanır ve sayılır ("eksik bilgi"). Hiçbir durumda "uygun" değildir **[sentez]**.
- **Bölge kapısı [sentez]:** diz ve omuz kısıtlarının kaçınmaları (ve bekleyen bildirimin zorlayanları) yalnız o eklemi yükleyen harekete işler. Omuz: `touches(tags, 'shoulder')` (omuz pencereleri ya da omuz kasları). Diz: diz pencereleri ya da **ön bacak** (`quadriceps`) hedef/yardımcı; arka bacak kalça hareketinde de çalıştığı için dizi yüklemiş sayılmaz (yoksa "Sol diz · kaçın: sıçrama" Kettlebell Swing'i yasaklar). Kas ve pencere bilgisi hiç yoksa bilinmiyor.
- **Danışanın zorlayanları → öneri:** çömelmek → `deep_knee_flexion`; kolu başın üstüne kaldırmak → `overhead`; öne eğilmek / yerden kaldırmak → `forward_bend`; zıplamak → `ballistic`; geriye eğilmek → `loaded_spinal_extension`.
- **Sınır:** egzersiz etiketleri taraf ayırmaz; "sol diz" kısıtı tek bacak hareketinde de iki taraf için geçerlidir (ekranda bir kez söylenir). `spine_end_range` penceresi kütüphanede hiçbir harekette olmadığı için kaçınma listesine alınmadı.
- **Kütüphane ön koşulu (faz 3):** ailelerdeki hareketler kuralların okuduğu etiketleri taşır: Hack Squat, Smith Squat, Destekli Sandalye Squat (pencere), Bulgarian Split Squat, Dambıl Lunge, Hiperekstansiyon, Paralel Bar Dips, Oturarak Dambıl Omuz Press, Makine Omuz Press, Barfiks, Ters Tutuş Lat Pulldown, Kablo Düz Kol Pulldown, Eğimli Dambıl Press, Şınav, Makine Chest Press, Smith Bench Press, Nötr Tutuş Floor Press (pencere: yok), Dambıl Fly, Pec Deck, Kablo Crossover, Makine Gövde Döndürme, Kablo Woodchop. `libraries.test.ts` her kaçınma etiketinin ailesindeki her hazır hareketin kuralın okuduğu alanları taşıdığını denetler. PT'nin kendi hareketlerinde etiket eksikse kalıp yedeği işler.

### 2.3 PT girişi

**Liste (`/constraints`, masaüstü; telefonda tek sütun):**

```
Danışanlar › Ayşe Y.
Ayşe Y. ●
 Genel   Program  [Sağlık]  İlerleme   Antrenmanlar   Davet
 ──────────────────────────────────────────────────────────────────────────
 [Kısıtlar •]  Ölçümler   Tarama

 Kısıtlar                                                   [+ Kısıt ekle]
 Sakatlık, rahatsızlık ve kaçınılacak hareketler. Program düzenleyicisi ve
 antrenmandaki "Değiştir" bunlara göre süzer.

 ┌ Karar bekliyor ─────────────────────────────────────────────────────────┐
 │ Danışan bildirdi · 26 Eyl 18:40                                         │
 │ Sol diz · yeni sakatlık · orta · bu ay                                  │
 │ Zorlayanlar: çömelmek, zıplamak (şimdiden dikkat olarak işliyor)        │
 │ "Merdiven inerken ağrıyor."                                             │
 │ Onaylarsan kaçınılır: derin diz bükme, sıçrama                          │
 │ [Onayla ve düzenle]   [Olduğu gibi onayla]   Kaydetmeden kapat          │
 └─────────────────────────────────────────────────────────────────────────┘

 Etkin (2)
 ┌─────────────────────────────────────┐ ┌─────────────────────────────────────┐
 │ Bel · Lomber disk hernisi           │ │ Sağ omuz · Subakromiyal ağrı        │
 │ (sakin dönem) · hekim               │ │ sendromu · danışanın beyanı         │
 │ Rahatsızlık · orta · 2024'ten beri  │ │ Sakatlık · hafif · Ağu 2026'dan beri│
 │ Kaçın: yüklü öne bükülme            │ │ Kaçın: kol baş üstünde              │
 │ Programda: 1 yaptırma · 2 dikkat  › │ │ Programda: sorun yok                │
 │ Danışana: "Bel nötr, acele yok."    │ │                          [Düzenle]  │
 └─────────────────────────────────────┘ └─────────────────────────────────────┘

 İzin verilen hareketler (1)
  Romanian Deadlift · Bel · 24 Eyl · "Dizden yukarı aralıkta"           [Kaldır]

 ▸ Kapananlar (1)          ▸ Değişiklik kaydı
```

- Kartlar `sm:grid-cols-2`; "Programda: …" şu anki programın satırlarını süzgeçten geçirir, dokununca Program sekmesine gider.
- **Olduğu gibi onayla** danışanın zorlayanlarını eşlenen kaçınmalara çevirip onaylar; hangi kaçınmaların yazılacağı düğmeden **önce** kartta görünür ("Onaylarsan kaçınılır: …"). Zorlayan yoksa düğme **"Kaydet (süzgeçsiz)"** olur: kısıt Kısıtlar'da ve düzenleyici sheet'inin üst satırında görünür ama hiçbir hareketi değiştirmez; danışan "Antrenörün onayladı" değil **"Antrenörün gördü"** okur (süzgece etkisi olmayan kısıt, türetilir: `avoid`, `conditionId`, `findingId` boş).
- **Onayla ve düzenle** formu danışanın cevaplarıyla ve zorlayanlardan gelen öneriyle doldurur. **Kaydetmeden kapat** bildirimi kısıt yapmadan, isteğe bağlı danışana notla kapatır (ör. "Kas ağrısı; yoklamada söylemen yeter"); o andan zorlayanların dikkati de düşer.
- Onaylı kısıtta danışanın güncellemesi varsa kartın üstünde "Danışan güncelledi · şiddetli dedi · 27 Eyl" [Gördüm] ya da "Danışan düzeldi dedi" [Kapat] [Etkin kalsın].

**Ekle / düzenle (`/constraints/new`, `/constraints/[kid]/edit`):** sayfa, modal değil (SPEC §6). Başlıkta "‹ Kısıtlar", Kaydet; düzenlemede yıkıcı ve durum eylemleri başlıkta: **Sil** (yanlış kayıt), **Kapat** / **Yeniden aç**.

```
‹ Kısıtlar
Kısıt ekle                                                           [Kaydet]
┌ Nerede ───────────────────────────┐ ┌ Ne ───────────────────────────────────┐
│ Bölge   [Diz                  ▾]  │ │ Tür  (•) Sakatlık   ( ) Rahatsızlık   │
│ Taraf   [Sol] [Sağ] [İki taraf]   │ │      ( ) Ameliyat sonrası ( ) Kısıt   │
└───────────────────────────────────┘ │ Sağlık profesyonelinin koyduğu tanı   │
┌ Şiddet ve başlangıç ──────────────┐ │ (varsa) [Patellofemoral ağrı ▾]       │
│ [Hafif] [Orta] [Şiddetli]         │ │ Tanıyı sen koyma; danışanın doktorun- │
│ Başlangıç  [2026-08    ]          │ │ dan ya da fizyoterapistinden öğrendi- │
└───────────────────────────────────┘ │ ğini seç.                             │
                                      │ Kaynak (•) Hekim/fizyoterapist        │
                                      │        ( ) Danışanın beyanı           │
                                      │ Gözlem (yalnız sen) [Dinamik diz …▾]  │
                                      │ Ameliyat tarihi [          ]          │
                                      └───────────────────────────────────────┘
┌ Kaçınılacak hareketler ─────────────────────────────────────────────────────┐
│ [✓ Derin diz bükme (90° üstü)] [ Açık zincirde son aralık diz açma ]        │
│ [✓ Sıçrama / balistik] [ Yüksek eksenel yük ] [ Derin kalça bükme ] …       │
│ Önizleme: kütüphanede 9 yaptırma · 6 dikkat · 14 kontrol edilmedi           │
│ (etiketsiz). Listede gör ›                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
┌ Notlar ─────────────────────────────────────────────────────────────────────┐
│ Senin notun (danışan görmez)     [                                       ]  │
│ Danışana not (antrenmanda görür) [Ağrısız aralıkta kal, derine inme.   ]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Tanı seçicisi var olan `ConditionSelect`, bölgeye ve `kind: 'diagnosis'`'a göre süzülmüş; Gözlem seçicisi aynı bileşen, `kind: 'finding'`. Ameliyat tarihi, greft ve evre yalnız ilgili tanıda görünür. Tanı seçilince "Kaynak" zorunlu.
- Önizleme sayfada, saf fonksiyonla hesaplanır (kütüphanenin etiketleri sunucudan gelir). "Listede gör" `/dashboard/exercises?client=c_…` açar: kısıtlar sunucuda okunur. **Adres satırına sağlık verisi yazılmaz** (kısıt kimliği ya da tanı değil yalnız danışan kimliği; tarayıcı geçmişine ve sunucu günlüğüne düşmesin). Bugünkü genel `?limit=` önizlemesi aynen kalır.
- Kırmızı bayraklı tanı seçilince kartın altında §2.6'nın iki adımı. **Kauda ekina şüphesi** seçilince kırmızı uyarı, yoklamayla aynı dil: **"Acil: danışanı bugün acil servise yönlendir."**

### 2.4 Danışanın bildirimi

Yer: danışanın **Sağlık** sayfası (§5.2), "Yeni bir şey bildir". Tek, kaydırılan sheet (adım adım sihirbaz değil); "Gönder" bölge ve şiddet seçilince açılır (çift bölgede taraf da). Çevrimdışıysa gönderilmez, "Bağlantı yok" der (antrenman dışında; kuyruk yok).

```
┌─────────────────────────────────────────┐
│ Antrenörüne bildir                   ✕  │
│ ┌ (!) ────────────────────────────────┐ │
│ │ İdrar ya da dışkılamada yeni        │ │
│ │ değişiklik, kasıkta uyuşma ya da    │ │
│ │ yeni güç kaybı varsa beklemeden     │ │
│ │ acil servise başvur.                │ │
│ └─────────────────────────────────────┘ │
│ Nerede?                                 │
│ [Boyun] [Omuz] [Dirsek] [El bileği]     │ 44 px çipler
│ [Sırt] [Bel] [Kalça] [Diz] [Ayak bileği]│
│ [Başka bir yer]                         │
│ Hangi taraf?   [Sol] [Sağ] [İkisi]      │
│ Ne oldu?                                │
│ ( ) Yeni bir sakatlık                   │
│ ( ) Eskiden beri süren bir sorun        │
│ ( ) Ameliyat oldum                      │
│ ( ) Doktorum bir şeyden kaçınmamı söyledi│
│ Ne kadar etkiliyor?                     │
│ [Hafif]    [Orta]    [Şiddetli]         │
│ Orta: bazı hareketlerde zorluyor        │
│ Ne zamandan beri?                       │
│ [Bu hafta] [Bu ay] [1–6 ay] [Daha uzun] │
│ Neler zorluyor? (isteğe bağlı)          │
│ [Çömelmek] [Kolu başın üstüne kaldırmak]│
│ [Öne eğilmek] [Zıplamak] [Geriye eğilmek]│
│ Not (isteğe bağlı)                      │
│ [                                     ] │
│ Geceleri uyandıran ağrı, düşme ya da    │
│ darbeden sonra üstüne basamama, hızla   │
│ şişen ya da kilitlenen eklem varsa      │
│ antrenmandan önce bir sağlık            │
│ profesyoneline görün.                   │
│ [              Gönder              ]    │ 56 px
└─────────────────────────────────────────┘
```

- **İki kademe**, yoklamanın "Bugün yük yok" ekranıyla aynı ayrım: **acil** (sheet'in başında, vurgulu): "İdrar ya da dışkılamada yeni değişiklik, kasıkta uyuşma ya da yeni güç kaybı varsa beklemeden acil servise başvur." — ciddi omurga patolojisi işaretleri (Finucane 2020, aynı gün sevk). **Öteki** (Gönder'in üstünde): "Geceleri uyandıran ağrı, düşme ya da darbeden sonra üstüne basamama, hızla şişen ya da kilitlenen eklem varsa antrenmandan önce bir sağlık profesyoneline görün." — "üstüne basamama" Ottawa ayak bileği ve diz kurallarından (Stiell 1992; Stiell 1995), gece ağrısı Finucane 2020'den; hızlı şişme ve kilitlenme ile seçimin kendisi **[sentez]**. Cevap istenmez, kaydedilmez (veri en aza).
- **Gönderince (şiddete göre):** hafif/orta → "Antrenörüne iletildi. Antrenörün bakana kadar zorlayan hareketlerde dikkatli ol; ağrı yaparsa 'Hareketi geç' ya da 'Değiştir'i kullan." · şiddetli ya da "Yeni bir sakatlık · Bu hafta" → "Antrenörüne iletildi. Antrenörün bakana kadar bu bölgeyi zorlayan hareketleri yapma; ağrı günlük hayatını etkiliyorsa bir sağlık profesyoneline görün."
- **Bekleyen bildirimin zorlayanları hemen işler, yalnız dikkat olarak** (asla yasak değil): eşlendikleri kaçınmalarla (§2.2, bölge kapısıyla) değerlendirilir; hareket kartında not "Bildirdiğin sol diz için zorlayabilir; ağrı yaparsa geç", "Değiştir" bu hareketleri sona alır. Bölgeden tahmin yoktur: zorlayan seçilmemişse hiçbir hareket değişmez.
- Danışan onay bekleyen bildirimini düzeltebilir ya da **geri çekebilir** (kayıttan çıkar; kayıtta "geri çekildi" satırı kalır). Onaylı kısıtta yalnız iki düğme: **Kötüleşti** (şiddet seçimi) ve **Düzeldi**.
- **Güvenli yön kuralı [sentez]:** bildirilen yeni kısıt PT onaylayana kadar hiçbir hareketi yasaklamaz, yalnız zorlayanları dikkat olur (düzenleyicide ve Kısıtlar'da bekleyen bildirim olarak durur); **kötüleşme** hemen yazılır (şiddet görünür, Dikkat maddesi doğar); **düzelme** kısıtı PT onaylayana kadar kapatmaz (`clientChange.resolved`). Yük artıran yönü yalnız PT açar.

### 2.5 Değişiklik geçmişi

`health.json` → `constraintLog[]`: en yenisi üstte, en çok 200 satır (program geçmişiyle aynı kırpma: metin 300 karakter); tam kayıt git geçmişidir. Satır: `{ at, by: 'pt' | 'client', id, kind, text }`; `kind`: `added` · `reported` · `confirmed` · `declined` · `edited` · `worsened` · `improved` · `resolved` · `reopened` · `withdrawn` · `removed` · `override_added` · `override_removed` · `referred` · `cleared`. Metin okunur Türkçe ve değişeni söyler: "Sol diz bildirildi (orta)", "Sol diz onaylandı · kaçın: derin diz bükme, sıçrama", "Sol diz: orta → şiddetli (danışan)", "Bel: Romanian Deadlift'e izin verildi", "Sol diz: sağlık profesyoneline yönlendirildi", "Sol diz: görüş alındı (yazılı rapor)". Commit mesajı geneldir ("Kısıt kaydedildi", "Kısıt bildirildi"), değer taşımaz. Değişiklik yoksa yazılmaz.

### 2.6 Kırmızı bayrak: yönlendirme ve görüş

Sözlükte `redFlag: true` olan tanı (radikülopati, ACL erken dönem, menisküs onarımı, anterior instabilite…) PT'nin tek başına karar vermeyeceği durumdur (araştırma README'si). Rev. 1'deki "tıbbi izin günü" tek tarihle kapanıyor, kapsamı yazılamıyor ve yıllardır yönetilen bir instabiliteyi sonsuza dek en üstte tutuyordu; PT'yi var olmayan bir izni beyan etmeye itiyordu. Yerine iki tarihli adım **[sentez]**:

| Adım | PT'nin eylemi | Dikkat maddesi | Süzgeç | Danışan |
|---|---|---|---|---|
| Yönlendirme bekliyor | — | **95** "Sağlık profesyoneline yönlendir: Sol diz (ACL erken dönem)" | bölgeyi çalıştıran her hareket en az **dikkat**; bu kısıtın yasaklarına izin verilmez | kartta not: "Antrenörün bu bölge için sağlık profesyonelinin görüşünü bekliyor. Ağrı yaparsa hareketi geç." |
| Yönlendirildi (`referredAt`) | "Sağlık profesyoneline yönlendirdim" (tarih) | **40** "Profesyonel görüşü bekleniyor · Sol diz · 12 gün" | aynı | aynı |
| Görüş alındı (`clearance`) | "Görüş alındı": tarih, dayanak (danışanın beyanı / yazılı rapor), kapsam ≤ 140 ("Tam yük; derin squat 6 hafta yok") | yok | kurallar sözlükteki gibi (`block`/`warn`/`cue`); izin verilebilir | not yalnız kısıtın kendi bulgularında |

- **"Bölgeyi çalıştıran":** diz ve omuz `touches()` ile (bölge kapısındaki diz kuralı değil: burada kuşkuda dikkat daha güvenli); omurga (bel, sırt) ve boyun eksenel yükle (`axialLoading ∉ {none}`). Dirsek, el bileği, kalça, ayak bileği ve "başka yer" için güvenilir bir ölçüt yok: dikkat üretilmez, sheet'in üstündeki bekleyen satır ve Dikkat maddesi yeter **[sentez]**. Karar **dikkat**tir, yasak değil: gereksiz yasak hiçbir şeyi durdurmadan listeyi boşaltırdı.
- Görüşün kapsamı PT'nin notudur; uygulama kapsamı yorumlamaz. Kapsam bir kaçınma söylüyorsa PT onu `avoid`'e ekler.
- **Kauda ekina şüphesi** (`cauda_equina_or_progressive_neuro_deficit`): sözlüğün "egzersiz yok" kuralı (her hareket yasak) görüşle de değişmez, izin verilemez; seçilince ve maddede "Acil: danışanı bugün acil servise yönlendir."

---

## 3. Entegrasyon

### 3.1 Süzgeç: kısıt → karar (`src/lib/constraint-filter.ts`, saf)

- **Kısıt başına ayrı bağlam:** her etkin ve onaylı kısıt için `evaluateExercise(tags, [condition], context)` çağrılır (tanı ve gözlem ayrı ayrı); bağlam o kısıttan gelir (`weeksPostOp` ← `details.surgeryDate`, `graftType`, `tendinopathyStage` ← `details.stage`; `symptomDirection` ← en yeni yoklama, yalnız ağrı takibi onaylıysa). Böylece iki ameliyat tarihi birbirine karışmaz.
- **`avoid` etiketleri** kısıtın kendi kuralları olarak aynı üç değerli mantıkla (§2.2: karar, kalıp yedeği, bölge kapısı); mesaj "Sol diz: sıçrama / balistik".
- **Kırmızı bayrak, görüş yok:** bölgeyi çalıştıran harekete en az dikkat (§2.6).
- **Bekleyen bildirim:** yalnız zorlayanları, dikkat olarak (§2.4); mesaj PT'ye "Danışan bildirdi (onay bekliyor): Sol diz · çömelmek".
- **İzinler** (`overrides[]`): `{ exerciseId, source: 'k_…', at, note? }`. İzinli harekette o kısıtın bulguları susar (yasak dahil; PT'nin bilinçli kararı); kırmızı bayraklı ve görüşü alınmamış kısıtta ve kauda ekinada susmaz. İzin kısıt kapanınca etkisiz kalır, kısıt silinince silinir.
- Sonuç hareket başına tek işaret: `{ decision, reasons[], overridden, unassessed, untagged }`; kümeler bugünkü gibi **yaptırma · dikkat · uygun · kontrol edilmedi · eksik bilgi** (`FILTER_GROUPS`); sıralama için ipucu (`cue`) dikkatten ayrı tutulur (`careRank`).

### 3.2 Program düzenleyicisinin kütüphane sheet'i

Yalnız danışanın programında (şablonda danışan yok) ve `conditions` onayı varken. Program düzenleme sayfası `health.json`'u sunucuda okur, işaretleri hesaplar ve sheet'e `care` haritası olarak verir (`ExerciseSheet` / `ExercisePicker`'a isteğe bağlı prop; şablon ve danışanın kendi programı değişmez).

```
┌ Hareket ekle ─────────────────────────────────── ✕ ┐
│ Gün A'nın sonuna eklenir.                          │
│ Kısıtlar: Bel · Sağ omuz               Kısıtlar ›  │
│ (!) Danışan bildirdi: Sol diz · karar bekliyor     │
│ [ Egzersiz ya da kas ara                        ]  │
│ [Göğüs] [Sırt] [Omuz] [Kol] [Bacak] [Karın] …      │
│ ┌────────────────────────────────────────────────┐ │
│ │ Dambıl Yana Açış                            +  │ │
│ │ Yan omuz · Dambıl                              │ │
│ │ (!) İpucu · Sağ omuz: kolu gövdeden 30–45° önde│ │
│ │ (skapular düzlemde) çalıştır.                  │ │
│ └────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────┐ │
│ │ Hip Thrust                                  +  │ │
│ │ Kalça · Halter                                 │ │
│ └────────────────────────────────────────────────┘ │
│ ▸ Bu danışana önerilmeyenler (5)                   │
│   Deadlift · Bel: yüksek eksenel yük               │
│   Barfiks · Sağ omuz: kol baş üstünde              │
│                                   [Yine de ekle]   │
├────────────────────────────────────────────────────┤
│ Eklendi: Dambıl Yana Açış · ipucu: sağ omuz [Bitti]│
└────────────────────────────────────────────────────┘
```

- **Dikkat** ve **ipucu** alan hareket yerinde kalır, ikinci satırda gerekçe (iki satırla kırpılır; tamamı `title`/ekran okuyucu metninde). Dokununca doğrudan eklenir.
- **Yaptırma** alanlar listenin sonunda katlanmış "Bu danışana önerilmeyenler (n)" grubundadır (kaybolmaz, arama onları da bulur). Açılınca her satırda gerekçe ve **Yine de ekle** → kısa onay (`AlertDialog`): "Good Morning bu danışana önerilmiyor · Bel (kaçın: yüklü öne bükülme) · Not (isteğe bağlı) [ ] · İzin bu danışan ve bu hareket için kaydedilir; Kısıtlar'dan kaldırılabilir. [Vazgeç] [Yine de ekle]". Onayda satır eklenir ve izin hemen yazılır (`POST …/constraints/overrides`); programı kaydetmeden çıkılsa da izin kalır (Kısıtlar'da görünür, kaldırılabilir). Görüşü alınmamış kırmızı bayrağın yasağında düğme yok: "Sağlık profesyonelinin görüşü kaydedilene kadar izin verilemez."
- Kısıt yoksa sheet bugünkü gibidir. Onay yoksa sheet'in açıklamasında tek satır: "Kısıtlar kullanılamıyor: danışanın sağlık onayı yok." (durum söylenir, veri değil).

### 3.3 Programdaki satırlar ve program sayfası

- Düzenleyicide satırın hareketi bu danışan için yasak ya da dikkatliyse kart yüzünün meta satırında 14 px ikon ("kısıt", ekran okuyucuya gerekçe). Kısıt sonradan eklendiyse eski satırlar da böyle işaretlenir.
- Program sayfasının başında, çelişki varsa: "Kısıtlarla çelişen 2 hareket · Gün A · Jump Squat (Sol diz: sıçrama) · Gün B · Good Morning (Bel)" [Programı düzenle] [Kısıtlar].

### 3.4 Antrenmanda "Değiştir" (375 px)

`alternativesRoute` danışanın onaylı etkin kısıtlarını, bekleyen bildirimlerinin zorlayanlarını ve izinlerini okur (yalnız `conditions` onayı varken): **yaptırma** alanlar listeden çıkar (izinli olan kalır), her ekipman grubunun içinde sıra **uygun → ipucu → dikkat → eksik bilgi → kontrol edilmedi** olur (grupların sırası ve muadil puanı aynı; aynı kümede puan sırası korunur). Danışan izin veremez. Örnek: onaylı "Sol diz · kaçın: derin diz bükme".

```
│ Squat yerine                            │
│ Aynı kaslar, ekipmana göre. Kısıtına    │
│ uygun olanlar önce.                     │
│ VÜCUT AĞIRLIĞI                          │
│ Destekli Sandalye Squat 3 × 10–12     › │
│ Split Squat             3 × 8–10      › │
│   Sol diz için dikkatli                 │
│ DAMBIL                                  │
│ Goblet Box Squat        14 kg ile     › │
```

"Kısıtına (kısıtlarına) uygun olanlar önce." yalnız sıra gerçekten değiştiyse **ve** en az bir aday uygunsa eklenir; tanı adı yazılmaz, bölge ve taraf yazılır.

### 3.5 Danışanın hareket kartındaki not (375 px)

Günün planı (`/api/me/workout`) satır başına isteğe bağlı `care: { label: 'Sol diz', kind, note? }` taşır:

| `kind` | Ne zaman | Metin (çip açılınca) |
|---|---|---|
| `note` | onaylı etkin kısıtın dikkat ya da ipucu bulgusu, ya da izinli yasak | PT'nin `clientNote`'u; yoksa "Antrenörün bu hareketi sol dizini düşünerek planladı. Ağrısız aralıkta kal; ağrı artarsa hareketi geç ya da Değiştir'e dokun." |
| `avoid` | **izinsiz yasak** programda kalmış (kısıt program yazıldıktan sonra eklendi) | "Antrenörün bu hareketi sol dizin için değiştirecek. Bugün 'Değiştir'den bir muadil seç." Ana düğme **Değiştir** |
| `report` | bekleyen bildirimin zorlayanı | "Bildirdiğin sol diz için zorlayabilir; ağrı yaparsa geç." |
| `referral` | görüşü alınmamış kırmızı bayrak bölgesi | "Antrenörün bu bölge için sağlık profesyonelinin görüşünü bekliyor. Ağrı yaparsa hareketi geç." |

```
│ 2/5  Leg Press                 Değiştir │
│ 3 set · 10–12 tekrar · 90 sn            │
│ ( i  Sol diz için not )                 │ 44 px çip
```

Çip kartın öteki çipleri gibi (planın gerekçesi, PT'nin notu) dokununca kartın içinde açılır, sheet açmaz; `avoid`'de altında **Değiştir** düğmesi. Birden çok kısıt aynı satıra değiyorsa en ağırı (`avoid` > `referral` > `report` > `note`). "Yasak", "risk", tanı adı yazılmaz. Not telefonda saklanan gün planının parçasıdır (danışanın kendi cihazı; yoklama girdisiyle aynı yaklaşım); planın damgası kısıtların son değişimini ve onay durumunu da taşır, onay çekilince bir sonraki açılışta not düşer.

### 3.6 Dikkat gerektirenler ve Bildirimler

Yeni Dikkat türleri: `constraint` ("Kısıt") ve `screening` ("Tarama"). Özet (`attentionFactsOf`) `health.json`'u yalnız ilgili parça onaylıyken okur; önbellek bugünkü gibi her kısıt ve tarama yazımında düşer (`dropNotices`).

| Madde (PT'ye metin) | Koşul | Aciliyet **[sentez]** | Götürür | Kapanır |
|---|---|---|---|---|
| "Acil: danışanı bugün acil servise yönlendir (Bel)" | kauda ekina şüphesi, `referredAt` yok | 95 | Kısıtlar | yönlendirme ya da kısıt kapanınca |
| "Sağlık profesyoneline yönlendir: Sol diz (ACL erken dönem)" | kırmızı bayraklı etkin kısıt, `referredAt` yok | 95 | Kısıtlar | yönlendirme, görüş ya da kısıt kapanınca |
| "Programda kısıtla çelişen hareket: Gün B · Jump Squat" | izinsiz `block`, çelişen satır danışanın **sıradaki günündeyse** | 85 | Program | program ya da izin değişince |
| "Danışan kısıt bildirdi: Sol diz (orta)" | `client` kaynaklı, onaysız, reddedilmemiş | 80 | Kısıtlar | onay ya da "Kaydetmeden kapat" |
| "Taramada ağrı: kol kaldırma (sağ)" | son taramada ağrı, gözden geçirilmemiş | 78 | Tarama | "Gördüm", "Kısıt olarak ekle" ya da ağrısız yeni tarama |
| "Kısıt kötüleşti: Sol diz orta → şiddetli" / "Danışan düzeldi dedi: Bel" | danışanın kötüleşme ya da düzelme güncellemesi bekliyor | 72 | Kısıtlar | PT "Gördüm" / karar |
| "Programda kısıtla çelişen 2 hareket" | izinsiz `block`, sıradaki günde değil | 66 | Program | program ya da izin değişince |
| "Profesyonel görüşü bekleniyor · Sol diz · 12 gün" | `referredAt` var, `clearance` yok | 40 | Kısıtlar | görüş ya da kısıt kapanınca |
| "Taramada büyük asimetri: split squat" | son tarama ≤ 28 gün; sıra farkı ≥ 2 ya da ön uzanma farkı ≥ 4 cm; ağrılı, yapılmamış ya da etkin kısıtlı taraf sayılmaz; **tarama başına tek madde** | 38 | Tarama | 28 gün ya da yeni tarama |

Mevcut ölçekte (kaçan günler 90, öneriler 75 … bekleyen davet 25) yönlendirme en üstte, sıradaki güne düşen çelişki kaçan günlerle önerinin arasında, bekleyen görüş ve asimetri ölçüm eğiliminin (45) altındadır. **Bildirimler**'e `constraint` türü ("Kısıt"): değişiklik kaydının danışan satırlarından, 14 günlük pencerede ("Kısıt bildirildi: Sol diz (orta)", "Kısıt güncellendi: Sol diz · kötüleşti", "Bildirim geri çekildi: Sol diz"); yalnız onay sürdükçe (bugünkü ağrı bildirimleri gibi).

---

## 4. Hareket taraması

### 4.1 İlkeler

- **Tarama ağrısız kişide hareket kalitesine bakar; ağrı taramanın değil klinik değerlendirmenin işidir.** Ağrı testi durdurur, sonuç üretmez, sağlık profesyoneline yönlendirmeyi söyler (tarama ile klinik değerlendirmeyi ayırma ilkesi, Functional Movement Systems; SPEC'in "ağrı bayrağı → tıbbi değerlendirme" kuralı).
- **Toplam puan yok, puan sayısı yok, risk yüzdesi yok.** Bileşik skorların sakatlık öngörüsü zayıf ve çelişkili: askeri personelde ≤ 14 için havuzlanmış RR 1,47 (Moran 2017), OR 2,74 ama ciddi geçerlik sorunları (Bonazza 2017), NCAA DII'de AUC 0,53–0,56 (Dorrel 2018); bileşik puan tek boyutlu da değil (Kraus 2014). Asimetri de risk değil **öncelik** için kullanılır, çünkü bağımsız öngörücülüğü replikasyonda tekrarlanamadı (Chalmers 2018).
- **Neye benzediği ve ne olmadığı:** Puan yapısı Cook 2006'nın sıralı ölçeğine benzer; testler, noktalar ve kurallar bizim; bu protokolün güvenilirlik ya da geçerlik verisi yok. Cuchna ve Shultz yalnız görsel puanlamanın eğitime bağlı olduğunu gösterir (eğitimli değerlendiricide bileşik puan için değerlendiriciler arası ICC 0,843, değerlendirici içi 0,869, Cuchna 2016; eğitimsizde Krippendorff α 0,38'e düşebiliyor, Shultz 2013); bu protokolün tutarlılığı için kanıt değildir. Uygulama tek PT'lidir; sonucu hep aynı kişi verir. Tutarlılık için sonuç elle seçilmez, **gözlenen noktalardan hesaplanır** ve her nokta için sayım kuralı yazılıdır (§4.2) **[sentez]**.
- **Gözlem eksik kalabilir.** Squat'ta diz içe kaymanın gözle taranması orta düzeyde güvenilir ve bir kısmını kaçırır (J Sport Rehabil 2017, baş üstü squat testi); ekran bulguya kesin etiket basmaz, "gözlendi" der.
- Temel kalıplara bakma fikri genel literatürden (Cook 2006, bölüm 1; Kritz 2009); testlerin seçimi, kontrol noktaları, kolaylaştırılmış sürümler, sonuç kuralı ve ipucu sırası bizimdir. Düzeltici hiyerarşi (hareketlilik → kontrol → kalıp) alınmadı: tescilli manuelin içeriğidir (`findings.json`).

### 4.2 Sonuç (bütün testlerde aynı kural) **[sentez]**

PT her test için (iki taraflıda her taraf için) sırayla girer:

1. **Ağrı** (ilk düğme). Açılınca "Ağrı olunca testi bırak." yazar; sürüm ve noktalar pasifleşir; sonuç yalnız **Ağrılı**dır, puan saklanmaz. İsteğe bağlı "nerede" (≤ 140).
2. **Hangi sürüm yapıldı:** Standart · Kolaylaştırılmış · Yapılamadı · **Yapılmadı** (neden: etkin kısıt / başka).
3. **Kaçan noktalar** (dokunarak; varsayılan hepsi tuttu). **Sayım kuralı:** 3 tekrarın en az 2'sinde görülen nokta kaçmış sayılır. Tek ayak dengede yalnız **süre** 3 denemenin en iyisidir (Springer 2007'nin en iyi deneme bulgusu yalnız tek ayak duruş içindir); süre girildiyse `time` noktası kendiliğinden işaretlenir (< 30 sn → kaçtı), elle seçilmez.

| Sonuç (PT ve danışan) | Kural | İç sıra (yalnız asimetri için) |
|---|---|---|
| **Temiz** | standart sürüm, kaçan nokta yok | 3 |
| **Telafiyle** | standart sürüm, 1–2 nokta kaçtı | 2 |
| **Kolaylaştırılmış** | standart sürümde 3+ nokta kaçtı ya da yalnız kolaylaştırılmış sürüm yapılabildi | 1 |
| **Yapılamadı** | kolaylaştırılmış sürüm de yapılamadı | 0 |
| **Ağrılı** | testin herhangi bir anında ağrı; sonuç ve sıra yok, ipucu yok | — |
| **Bu taramada yapılmadı** | PT yapmadı (etkin kısıt ya da başka neden) | — |

Ekranda ve danışana **yalnız sözcük** görünür; sıra içte kalır. Kayıtta sonuç (`result`) ve kaçan noktalar (`missed`) durur, sayı durmaz. Protokol sürümlüdür (`protocol: 1`): noktalar değişirse sürüm artar ve farklı sürümler karşılaştırılmaz.

### 4.3 Testler (protokol 1)

Kurulum metni ekranda testin kartında durur; aşağıdakiler PT'ye dönük kontrol noktalarıdır. "Kalıp" sütunu kütüphanedeki `pattern` ile eşleşir (ipuçları ve §4.6). "Bölge" etkin kısıtla testin ön-seçimini ve asimetri bastırmasını belirler (§4.5).

| # | Test (kimlik) | Taraf | Kurulum (kısa) | Kontrol noktaları | Kolaylaştırılmış sürüm | Kalıp | Bölge | Dayanak |
|---|---|---|---|---|---|---|---|---|
| 1 | **Squat, kollar önde** (`squat`) | tek | ayaklar kalça-omuz genişliğinde, kollar öne uzanık, 3 tekrar | `heels` topuklar yerde · `knees` dizler ayak yönünde (içe kaçmıyor) · `depth` uyluk en az yere paralel · `torso` gövde kaval kemiğiyle yaklaşık paralel ya da daha dik · `spine` alt noktada bel yuvarlanmıyor | diz hizasındaki kutuya otur-kalk, kollar önde | squat | diz, kalça, ayak bileği | Kritz 2009 (vücut ağırlığıyla squat taraması); ek gözlem aşağıda |
| 2 | **Kalça menteşesi, çubukla** (`hinge`) | tek | çubuk sırtta baş, sırt ve sağrıya değer; dizler hafif bükük; kalçadan öne eğil, 3 tekrar | `contact` çubuk üç noktadan ayrılmıyor · `hips` hareket kalçadan başlıyor · `range` gövde yataya doğru en az ~45° iniyor · `return` dönüşte bel geriye aşırı açılmıyor | kalçayla arkadaki duvara dokunma (duvar 15–20 cm geride) | hinge, hip_extension | bel | **[sentez]**; noktalar "bel hiç bükülmesin" değil "hareket kalçadan gelsin" diye yazıldı (Saraceni 2020) |
| 3 | **Split squat** (`split_squat`) | sol/sağ (öndeki bacak) | bir adım boyu açıklık, arka topuk kalkık, eller belde; arka diz yere yaklaşana dek in, 3 tekrar | `knee` ön diz ayak yönünde · `pelvis` kalça yatay · `torso` gövde dik · `depth` arka diz yere bir avuç kalana dek kontrollü · `balance` denge kaybı yok | bir elle duvara ya da çubuğa tutunarak | lunge | diz, kalça, ayak bileği | **[sentez]**; squat noktalarının tek bacağa uyarlanması (Kritz 2009'un yaklaşımı) |
| 4 | **Tek ayak denge** (`single_leg_balance`) | sol/sağ (duran bacak) | göz açık, eller belde, öbür ayak yerden ~5 cm; en çok 30 sn, süre 3 denemenin en iyisi | `time` 30 sn doldu (süreden hesaplanır) · `hip` kalça düşmüyor, yana kaymıyor · `foot` destek ayağı kaymıyor · `arms` eller belden ayrılmıyor | parmak ucuyla duvara hafifçe dokunarak | lunge | diz, kalça, ayak bileği | Springer 2007 (tek ayak duruş süresi yaşla düşer; karşılaştırma norma değil taraflara ve zamana göre); 30 sn **[sentez]** |
| 5 | **Şınav, 5 tekrar** (`push`) | tek | eller omuz genişliğinde, vücut düz; göğüs yere bir avuç kalana dek | `plank` gövde tek parça · `scapula` kürek kemikleri kanatlanmıyor · `elbows` dirsekler gövdeye yaklaşık 45° · `depth` tam aralık, 5 tekrarın hepsinde | eller sehpada (kalça hizasında) | horizontal_push | omuz | **[sentez]** |
| 6 | **Ters kürek, 5 tekrar** (`pull`) | tek | halka ya da askı bandı; gövde yere ~45°, topuklar yerde, kollar düz | `plank` gövde tek parça · `shoulders` omuzlar kulağa kalkmıyor · `range` dirsekler gövde hizasını geçiyor · `control` iniş kontrollü, 5 tekrarın hepsinde | daha dik açı (gövde ~70°) | horizontal_pull, vertical_pull | omuz | **[sentez]** |
| 7 | **Dönmeye direnç, tutuş** (`anti_rotation`) | sol/sağ (direncin geldiği yan) | yarım diz çökme, bant ya da kablo yandan, kollar göğüsten ileri uzanık, 10 sn | `trunk` gövde dönmüyor · `pelvis` kalça sabit · `arms` kollar orta hatta · `breath` nefes tutulmadan 10 sn | ayakta geniş duruş, daha hafif direnç | anti_rotation, core_stability | — | **[sentez]** |
| 8 | **Kol kaldırma, sırt duvarda** (`shoulder_flexion`) | sol/sağ | topuk, kalça, sırt ve baş duvarda, dizler hafif bükük; dirsek düz, başparmak yukarı, kolu önden yukarı kaldır | `wall` kol ya da başparmak duvara ulaşıyor · `ribs` bel duvardan ayrılmıyor · `elbow` dirsek düz · `shrug` omuz kulağa kalkmıyor | sırtüstü yatarak (bel yerde) | vertical_push | omuz | **[sentez]** |

**Ek gözlem ve sayılar (isteğe bağlı):**
- Squat'ta "Topuk altına 2–5 cm destekle düzeldi mi?" (evet/hayır). Evet ise ipucu ayak bileğini gösterir ve Ölçümler'deki **duvar lunge testine** bağlanır: dorsifleksiyon kısıtlanınca squat'ta diz içe kayması artar, kalça kinematiği değişmez (Macrum 2012); diz içe kayan grupta kalça kuvveti farklı değil, dorsifleksiyon kısıtı belirgin (Bell 2008).
- Tek ayak dengede **süre** (sn) ve **ön uzanma** (cm; yıldız denge testinin ön yönü). v1'in Y-Balance ekranından yalnız kaynaklı eşiği olan ön yön alındı. Bacak boyuna göre yüzde sonra.
- Her testte kısa not (≤ 140).

### 4.4 Asimetri ve ağrı

- **Asimetri** (iki taraflı testler, iki tarafın da sonucu varsa): iç sıra farkı 1 → "asimetri" (tabloda görünür, madde yok), ≥ 2 → "büyük asimetri" **[sentez]**. Ön uzanmada fark ≥ 4 cm → "büyük asimetri": lise basketbolcularında bu farkla alt ekstremite sakatlığı yaklaşık 2,5 kat sıktı (Plisky 2006; tek çalışma, dar popülasyon, "risk" diye yazılmaz). Tek ayak süresindeki fark gösterilir, sınıflanmaz (kaynaklı eşik yok). Ağrılı, yapılmamış ya da etkin kısıtlı (testin bölgesinde, o tarafta ya da iki tarafta) taraf asimetriye girmez. Dikkat'e **tarama başına tek madde** düşer (en büyük farkla).
- **Ağrı** sonucun yerine geçer (§4.2); o test ve taraf "Ağrılı" görünür, ipucu üretmez, Dikkat'e düşer. PT'nin iki eylemi: **Gördüm** (`painReviewedAt`; "değerlendirmeye yönlendirdim") ve **Kısıt olarak ekle** (conditions onayı varsa): kısa onaydan sonra kısıt yazılır — bölge ve taraf testten, `type: 'limitation'`, `origin: 'screening'`, **tanı yok**, testin kaçınma önerisi (kol kaldırma → `overhead`, şınav → `behind_body`, ters kürek → yok, menteşe → `forward_bend`, squat/split squat → `deep_knee_flexion`); ağrı "gözden geçirildi" olur ve kısıtın düzenleme sayfası açılır. Otomatik kısıt yazılmaz.
- Test → bölge önerisi: kol kaldırma, şınav, ters kürek → omuz; menteşe → bel; squat, split squat, denge → diz (PT değiştirir); dönmeye direnç → bel.

### 4.5 PT ekranları

**Genel görünüm (`/screening`, masaüstü):**

```
 Kısıtlar   Ölçümler  [Tarama •]
 Hareket taraması                                               [Tarama yap]
 Sekiz temel hareket; sonuç gözlenen noktalardan. Toplam ve puan yok.
 Karşılaştır: [12 Eyl 2026 ▾]  ile  [1 Ağu 2026 ▾]

 ┌ Uyarılar ──────────────────────────────────────────────────────────────┐
 │ ⚑ Ağrı · Kol kaldırma (sağ): önce değerlendirme.                        │
 │   [Gördüm]  [Kısıt olarak ekle]                                         │
 │ ◐ Büyük asimetri · Split squat: sol Temiz · sağ Kolaylaştırılmış        │
 └─────────────────────────────────────────────────────────────────────────┘

 Test                 Sol                         Sağ                    1 Ağu'ya göre
 Squat                Telafiyle · topuk, derinlik                        ↑
 Kalça menteşesi      Temiz                                              =
 Split squat          Temiz                       Kolaylaştırılmış       ↓ sağ
 Tek ayak denge       Temiz · 30 sn · 64 cm       Telafiyle · 30 sn · 61 cm  yeni
 Şınav                Telafiyle · dirsekler                              =
 Ters kürek           Temiz                                              ↑
 Dönmeye direnç       Temiz                       Temiz                  =
 Kol kaldırma         Temiz                       ⚑ Ağrılı               yeni ağrı

 Programa ipuçları (yalnız sana)
 1  Kol kaldırma, sağ: ağrılı; öneri yok. Değerlendirmeden sonra yeniden tara.
 2  Split squat, sağ (Kolaylaştırılmış): destekli sürümle çalış — Goblet Box
    Squat, Glute Bridge. Zayıf taraftan başla, iki tarafa eşit iş.
 3  Squat (Telafiyle · topuk, derinlik): topuk desteğiyle düzeldi → ayak
    bileği. Ölçümler'de duvar lunge testini gir.
 4  Şınav (Telafiyle · dirsekler): yüklenebilir; "dirsekler gövdeye 45°".
 5  Ters kürek (Temiz): ilerlet — Tek Kol Dambıl Row, Barfiks.
 Sıra: ağrı → en düşük sonuç → asimetri. Sonrası senin hedefine göre.

 Tarama günleri
 12 Eyl 2026 · 8 test · 1 ağrı ›        1 Ağu 2026 · 7 test ›
```

- Satırlar ikon + sözcükle yazılır (renk tek başına bilgi taşımaz); tablo telefonda test başına kart olur.
- **Karşılaştırma:** aynı protokol sürümündeki iki gün; test ve taraf başına ↑ ↓ = (iç sıraya göre). Tek basamaklık değişim ok ile gösterilir ama "belirgin" sayılmaz; belirgin: ≥ 2 basamak, ağrının başlaması ya da geçmesi, asimetrinin açılması ya da kapanması **[sentez]**. "Yapılmadı" karşılaştırılmaz. Tablonun altında: "Tek basamaklık değişim gözlem farkı olabilir."
- **Sıklık:** başlangıçta ve 6–8 haftada bir önerilir **[sentez]** (araştırma dosyasındaki protokolde tarama 4 haftada bir, yıldız denge testi 6–8 haftada bir). Hatırlatma maddesi yok; başlıkta "Son tarama 9 hafta önce" yazar.

**Giriş (`/screening/new`, tablet öncelikli; masaüstü ve PT telefonu da çalışır):**

```
‹ Tarama
Tarama yap · 27 Eyl 2026                                              [Kaydet]
Etkin kısıtlar: Sol diz · ACL erken dönem (görüş bekleniyor) → squat, split
squat ve denge "Yapılmadı (kısıt)" olarak hazır; istersen değiştir.
[1 Squat ✓] [2 Menteşe ✓] [3 Split squat ◐] [4 Denge] [5 Şınav] [6 Kürek] …   ← kayar

┌ 3 · Split squat ──────────────────────────────────────────────────────────┐
│ Bir adım boyu açıklık, arka topuk kalkık, eller belde. Arka diz yere      │
│ yaklaşana dek in; 3 tekrar. Bir nokta 3 tekrarın en az 2'sinde görüldüyse │
│ kaçmış say. Öndeki bacak test edilen taraftır. Kolaylaştırılmış: bir      │
│ elle duvara tutunarak.                                                    │
│ ┌ Sol ──────────────────────────────┐ ┌ Sağ ──────────────────────────────┐│
│ │ [ Ağrı ]                          │ │ [ Ağrı ✓ ] Ağrı olunca testi bırak.││
│ │ [Standart] [Kolaylaştırılmış]     │ │ Nerede [ön diz              ]     ││
│ │ [Yapılamadı] [Yapılmadı]          │ │ (sürüm ve noktalar pasif)         ││
│ │ Kaçan noktalar                    │ │                                   ││
│ │ [Ön diz içe] [Kalça düştü]        │ │                                   ││
│ │ [Gövde öne]  [Derinlik] [Denge]   │ │                                   ││
│ │ Temiz                             │ │ Ağrılı                            ││
│ └───────────────────────────────────┘ └───────────────────────────────────┘│
│ Not [                                                                   ] │
└────────────────────────────────────────────────────────────────────────────┘
```

- Düğmeler 44 px, tablette taraflar yan yana (`md:grid-cols-2`), telefonda alt alta. Kaçan nokta `Toggle`'dır (basılı = kaçtı, çarpı ve metinle). Sonuç canlı hesaplanır ve kartın altında sözcüğüyle yazar; "Yapılamadı" ve "Yapılmadı"da noktalar pasif.
- **Etkin kısıtlar başlıkta** listelenir; görüşü alınmamış kırmızı bayrak bölgesine değen testler (squat, split squat, denge → diz, kalça, ayak bileği; menteşe → bel; şınav, ters kürek, kol kaldırma → omuz) "Yapılmadı (kısıt)" olarak hazır gelir. Öteki etkin kısıtlarda yalnız başlıkta söylenir.
- Yalnız doldurulan testler kaydedilir (ölçümlerle aynı); aynı güne ikinci giriş o günü günceller. Gelecek gün girilemez. Kaydet başlıkta, telefonda yapışkan çubukta (ölçüm formunun deseni). Kaydedilmemiş değişiklik uyarısı var; taslak yalnız `sessionStorage`'da (sekme kapanınca gider; sağlık verisi tarayıcıda kalıcı durmaz), kaydedince ve silince silinir **[sentez]**.
- Düzenleme `/screening/[tarih]/edit`; başlıkta **Sil** günü kaldırır.

### 4.6 Sonuçlar ne yapar

- **İpuçları (yalnız PT, [sentez]):** Ağrılı → öneri yok, "önce değerlendirme"; Yapılamadı → kalıbı yükleme, destekli ve kısa aralıkla başla; Kolaylaştırılmış → kolaylaştırılmış sürümle çalış (testin gerileme listesi); Telafiyle → yüklenebilir, kaçan noktanın ipucu; Temiz → ilerlet (testin ilerleme listesi); asimetri → zayıf taraftan başla, iki tarafa eşit iş. **Sıra: ağrı → en düşük sonuç → asimetri**, eşitlikte test sırası; ötesi PT'nin hedefidir (uygulama hedef bilmez). Hareketlilik → kontrol → kalıp basamakları kullanılmaz (§4.1).
- **Gerileme ve ilerleme listeleri** test başına paketteki kütüphanenin kimlikleriyle `screening.ts`'te sabittir; kütüphane testi (`libraries.test.ts`) kimliklerin var olduğunu denetler. Altında "Kütüphanende aynı kalıptan" PT'nin kendi hareketleri (`pattern` eşleşmesi).
- **Dikkat gerektirenler:** ağrı (78) ve tarama başına tek büyük asimetri (38), §3.6.
- **Süzgeç:** tarama hareketi yasaklamaz. Sonraki fazda ağrılı testin kalıbındaki hareketler düzenleyicide "dikkat" alır, ipucu rozeti bilgi olarak görünür (§6, faz 6 — sonra).

---

## 5. Onay, danışan görünümü, veri, uçlar

### 5.1 Onay kapısı (parça başına sürüm)

| Parça | Onay yokken PT | Onay yokken danışan | Onay varken |
|---|---|---|---|
| `conditions` (Kısıtlar) | Kısıtlar sayfası kilit uyarısı; düzenleyici sheet'inde tek satır "kısıtlar kullanılamıyor"; süzgeç danışan kısıtı olmadan; kısıt Dikkat ve Bildirimleri yok | Sağlık sayfasında kısıt bölümü ve "bildir" yok; kartta not yok; "Değiştir" sırası normal | §2, §3 |
| `screening` (Tarama) | Tarama sayfası kilit uyarısı; tarama Dikkat maddeleri yok | tarama bölümü yok | §4 |
| ikisi de yok | — | avatar menüsünde "Sağlık" yok | |

- **Sürüm parça başınadır** **[sentez]**: `HEALTH_FIELD_VERSIONS` — `conditions` ve `screening` `2026-10` (amaçları genişledi: danışanın bildirimi, antrenmandaki not, tarama ipuçları), `readiness`, `check_in`, `measurements` `2026-09`. Onay kaydı `versions` taşır (parça → onaylandığı sürüm); `versions`'ı olmayan eski onay her parça için kendi `version`'ını (bugün `2026-09`) taşımış sayılır. `canRecordHealth(client, field)` yalnız o parçanın sürümüne bakar. Böylece sürüm artışı ağrı takibini, kırmızı bayrak sorusunu ve ölçüm girişini **kapatmaz**; yalnız değişen parçalar yeniden sorulur. Modülün yeniden açılması ya da kapsamının genişlemesi (`enabledAt`) bugünkü gibi bütün onayı yeniler (PT'nin bilinçli eylemi, SPEC §9.4).
- **Onay kartı** (`outdated`): "Kısıtlar ve hareket taraması için yeni onay gerekiyor; ağrı takibi ve ölçümler sürüyor." Onay yeniden verilince bütün parçalar güncel sürümle yazılır.
- **Onayı geri çekme** penceresi neyin değişeceğini söyler: kısıtlar onaylıysa "Programın kısıtlarına göre süzülmez, hareket kartlarındaki notlar kalkar." eklenir.
- Denetim her yazmada sunucuda, danışan kaydı taze okunarak (`canRecordHealth(client, part)`); okumada da aynı kural: `health.json` yalnız onaylı bir parça gerektiriyorsa okunur ve ekrana yalnız o parçanın dilimi verilir (`healthView(record, parts)`).
- **Onay çekilince** kayıt git'te kalır ama okunmaz: süzgeç kısıtsız çalışır. Düzenleyici bunu söyler ("Kısıtlar kullanılamıyor: danışanın sağlık onayı yok.") ama neyin kayıtlı olduğunu söylemez.
- Yeni açıklamalar: *Kısıtlar* "Sakatlık, rahatsızlık ve kaçınılacak hareketler; antrenörün programı bunlara göre yazar, sen de bildirebilirsin." · *Hareket taraması* "Temel hareketlerin sonucu, sağ-sol farkı ve ağrı notu; antrenörün nereden başlayacağını buna göre seçer."

### 5.2 Danışanın Sağlık sayfası (`/me/saglik`, 375 px)

Avatar menüsünde Programım · **Sağlık** · Ayarlar · Çıkış (yalnız `conditions` ya da `screening` onaylıysa). Ayarlar'daki onay kartının altında "Sağlık sayfan ›". Dock'ta etkin sekme yok (Ayarlar gibi).

```
┌─────────────────────────────────────────┐
│ Sağlık                             (AY) │
│ Kısıtların                              │
│ Antrenörün programını bunlara göre      │
│ yazar.                                  │
│ ┌─────────────────────────────────────┐ │
│ │ Sol diz · orta                      │ │
│ │ Antrenörüne iletildi · bekliyor     │ │
│ │ [Düzelt]                [Geri çek]  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Bel · Rahatsızlık                   │ │
│ │ Lomber disk hernisi                 │ │
│ │ "Bel nötr, acele yok."              │ │
│ │ Antrenörün onayladı · 24 Eyl        │ │
│ │ [Kötüleşti]            [Düzeldi]    │ │
│ └─────────────────────────────────────┘ │
│ [   + Yeni bir şey bildir           ]   │ 44 px
│ ▸ Kapananlar (1)                        │
│                                         │
│ Hareket taraman · 12 Eylül              │
│ Antrenörün 8 temel harekete baktı. Not  │
│ değil; nereden başlayacağınızın haritası│
│ ┌─────────────────────────────────────┐ │
│ │ Squat                   Telafiyle ↑ │ │
│ │ Odak: topukların yerde kalsın       │ │
│ ├─────────────────────────────────────┤ │
│ │ Split squat                         │ │
│ │ Sol   Temiz                         │ │
│ │ Sağ   Kolaylaştırılmış sürümle    ↓ │ │
│ │ Odak: ön dizin ayağının yönünde     │ │
│ ├─────────────────────────────────────┤ │
│ │ Kol kaldırma                        │ │
│ │ Sağ   Ağrı not edildi. Antrenörün   │ │
│ │       seninle konuşacak.            │ │
│ ├─────────────────────────────────────┤ │
│ │ Denge                               │ │
│ │ Sol   Bu taramada yapılmadı         │ │
│ └─────────────────────────────────────┘ │
│ ↑ ↓: bir önceki taramaya göre (1 Ağu).  │
│ ▸ Önceki taramalar (1)                  │
└─────────────────────────────────────────┘
```

- **Danışan ne görür:** bölge · taraf · tür · şiddet · antrenörün `clientNote`'u. **Tanı adı** yalnız `diagnosisSource: 'clinician'`, sözlükte `kind: 'diagnosis'` ve niteleyicisizse (niteleyici sözcüğü yazılmaz: akut, şiddetli, kontrolsüz…; adında bu sözcükler ya da "şüphe" geçen tanı hiç yazılmaz). Gözlem ve PT'nin notu hiç görünmez. Böylece PT'nin taramada gördüğü bir şey danışana "antrenörümün koyduğu tıbbi tanı" diye ulaşmaz. Antrenmandaki notta tanı adı yoktur.
- Onaylı kısıt: süzgece etkisi varsa "Antrenörün onayladı · 24 Eyl", yoksa "Antrenörün gördü · 24 Eyl". "Kötüleşti" şiddet sorar, "Düzeldi" onaya gider (§2.4); ikisi de antrenörüne bildirim olur. Reddedilmiş bildirimde "Antrenörün kısıt olarak almadı" ve notu.
- Taramada sayı ve toplam yok; sözcük (§4.2), taraf, önceki taramaya göre ok ve en çok bir "odak" satırı (kaçan ilk noktanın danışan dilindeki karşılığı, `screening.ts`'te her nokta için; ör. `heels` → "topukların yerde kalsın", `knee` → "ön dizin ayağının yönünde"). Ağrı telaşsız yazılır. Danışan taramayı düzenleyemez ("Sadece PT girer", v1).
- Boş durumlar: "Antrenörün henüz tarama yapmadı." · "Kayıtlı kısıtın yok. Bir sakatlık ya da rahatsızlığın varsa bildir."

### 5.3 `health.json` şekli (sürüm 2)

```jsonc
{
  "version": 2,                                  // yeni; alanı olmayan dosya sürüm 1 sayılır
  "sex": "female", "toleranceMode": "pain_free", // değişmez
  "checkIns": [ … ], "measurements": [ … ],      // değişmez
  "constraints": [
    { "id": "k_q2m8xk", "region": "knee", "side": "left", "type": "injury",
      "conditionId": "patellofemoral_pain:severe", "diagnosisSource": "clinician",
      "findingId": "dynamic_knee_valgus",                                           // yalnız PT görür
      "details": { "surgeryDate": "2026-08-01", "graft": "hamstring", "stage": 2 },   // yalnız ilgili tanıda
      "severity": "moderate", "onset": "2026-09", "onsetApprox": true,
      "avoid": ["deep_knee_flexion", "ballistic"], "triggers": ["squat", "jump"],
      "status": "active", "source": "client", "confirmedAt": "2026-09-27T09:12:00.000Z",
      "clientChange": { "at": "…", "severity": "severe" },      // onay bekleyen danışan güncellemesi
      "referredAt": "2026-09-20",                               // kırmızı bayrakta yönlendirme
      "clearance": { "at": "2026-10-02", "basis": "written_report", "scope": "Tam yük" },
      "note": "…", "clientNote": "Ağrısız aralıkta kal.", "reportNote": "Merdiven inerken ağrıyor.",
      "createdAt": "…", "updatedAt": "…" }
  ],
  "overrides": [ { "exerciseId": "romanian-deadlift", "source": "k_q2m8xk", "at": "…", "note": "Dizden yukarı" } ],
  "constraintLog": [ { "at": "…", "by": "client", "id": "k_q2m8xk", "kind": "reported", "text": "Sol diz bildirildi (orta)" } ],
  "screenings": [
    { "date": "2026-09-12", "protocol": 1,
      "tests": {
        "squat": { "result": "standard", "missed": ["heels", "depth"], "heelSupportHelps": true },
        "split_squat": { "left":  { "result": "standard", "missed": [] },
                         "right": { "result": "easier",   "missed": ["knee"] } },
        "single_leg_balance": { "left": { "result": "standard", "missed": [], "seconds": 30, "reachCm": 64 },
                                "right": { "result": "not_tested", "reason": "constraint" } },
        "shoulder_flexion": { "left": { "result": "standard", "missed": [] },
                              "right": { "pain": true, "painNote": "ön omuz" } }   // ağrıda sonuç yok
      },
      "painReviewedAt": { "shoulder_flexion.right": "…" },
      "note": "…" }
  ]
}
```

- Sınırlar **[sentez]**: kısıt 30 (etkin 12), izin 100, kayıt 200 satır, tarama günü 60 (en eskisi kayıtta değil yalnız git'te kalır). Liste tarih sırasıyla yazılır.
- Yazım `src/lib/health.ts` → `updateHealth(clientId, part, change, message)`: taze danışan kaydı, `canRecordHealth(client, part)`, `sha` kilidi, 409'da bir kez taze okuyup yeniden uygulama, `dropNotices`. Bozuk dosyanın üstüne yazılmaz (bugünkü kural). Commit mesajları: "Kısıt kaydedildi", "Kısıt bildirildi", "Kısıt güncellendi", "İzin kaydedildi", "Tarama kaydedildi", "Tarama güncellendi", "Tarama silindi".
- **Kısıt düzeyinde çakışma:** yazımlar kısıtın `updatedAt`'ini `baseUpdatedAt` diye taşır; o arada değiştiyse 412 "Bu kısıt o arada değişti" (danışanın bildirimi PT'nin açık formunu sessizce ezmesin) **[sentez]**.
- Yoklama, bitiş ve deneme geçmişi yazımları aynı şemadan geçer: yeni alanları korur.

### 5.4 Eski kayıtlar

- `conditions: string[]` okunurken her kimlik bir kısıta çevrilir (`source: 'pt'`, onaylı, bölge sözlükten, şiddet boş, tanının kaynağı "danışanın beyanı", bulgu türündekiler `findingId`'ye); ilk kısıt yazımı yeni biçimi yazar, `conditions` düşer. Tek ameliyatlı tanı varsa üst düzeydeki `surgeryDate` onun `details`'ine taşınır. Uygulama bu alanlara hiç yazmadı; gerçek dosyalarda boş listeler beklenir.
- `movementScreens` (eski biçim) çevrilmez: başka protokol. Boşsa yazımda düşer; doluysa dosyada olduğu gibi kalır ve Tarama'da "Eski biçimde tarama kaydı (n gün); yeni protokolle karşılaştırılmaz" yazar, test adları gösterilmez.
- Koddan kalkanlar: `measurements.ts` → `FMS_PATTERNS`, `fmsSummary`, `FmsEntry`; `schemas/health.ts`'in eski tarama şeması (hoşgörülü `unknown[]`'a döner). `conditions.ts` → `movement_screen_pain_flag`'in notu "Hareket taramasında ağrı: önce değerlendirme." olur (FMS adı geçmez).
- `consents.health.version`: `versions`'ı olmayan onay parçaları bu sürümle onaylamış sayılır (§5.1).

### 5.5 Uçlar

Desenler bugünkülerle aynı: PT uçları `readPtSession()?.role === 'pt'`, `clientIdSchema`, Valibot, ortak yanıtlar (`measurements/respond.ts` gibi; hata metni değer taşımaz); danışan uçları oturumdan kimlik (`currentClient` kuralları), yalnız bu siteden ve JSON'la. Okuma sunucu bileşenlerinde (`requirePt()`, `currentClient()`), ayrı GET yok.

| Uç | İş |
|---|---|
| `POST /api/clients/[id]/constraints` | PT kısıt ekler → 201 `{ id }`; `{ fromScreening: { date, key } }` ile taramadaki ağrıdan |
| `PATCH /api/clients/[id]/constraints/[kid]` | `{ action: 'edit' \| 'confirm' \| 'confirm_as_is' \| 'decline' \| 'resolve' \| 'reopen' \| 'ack_change' \| 'refer' \| 'clear', baseUpdatedAt, … }` |
| `DELETE /api/clients/[id]/constraints/[kid]` | yanlış kaydı çıkarır (kayıtta "silindi"; izinleri de) |
| `POST /api/clients/[id]/constraints/overrides` | `{ exerciseId, source, note? }` |
| `DELETE /api/clients/[id]/constraints/overrides/[exerciseId]?source=k_…` | izni kaldırır |
| `POST /api/clients/[id]/screenings` | `{ date, tests, note? }` → 201; aynı gün varsa günceller |
| `PUT` / `DELETE /api/clients/[id]/screenings/[tarih]` | günü değiştirir / siler (yoksa 404) |
| `POST /api/clients/[id]/screenings/[tarih]/review` | `{ key: 'shoulder_flexion.right' }` → `painReviewedAt` |
| `POST /api/me/constraints` | danışan bildirir → 201 |
| `PATCH /api/me/constraints/[kid]` | kendi onaysız bildirimini düzeltir; onaylıda `{ severity }` (kötüleşti) ya da `{ resolved: true }` → `clientChange` |
| `DELETE /api/me/constraints/[kid]` | yalnız kendi onaysız bildirimini geri çeker |
| `GET /api/me/workout` · `GET /api/me/workout/alternatives` | değişir: satırda `care`; muadillerde yasak çıkar, sıra değişir (§3.4, §3.5) |

Onay yoksa 403 ve kilidin nedeni; geçersiz gövde 400 (alan başına); kısıt çakışması 412; dosya çakışması bir kez yeniden denenir.

### 5.6 Saf modüller (`npm test`; kardeşler `.ts` uzantısıyla)

- `src/lib/constraints.ts`: şema yardımcıları, bölge/taraf/tür/şiddet adları (PT ve danışan dilinde), `AVOID_TAGS` yüklemleri ve kalıp aileleri, zorlayan → kaçınma eşlemesi, kırmızı bayrak adımları, danışan değişikliğinin güvenli yön kuralı, PT ve danışan eylemleri (kayda uygulanır), kayıt metinleri, eski `conditions` çevirisi, danışanın göreceği tanı adı kuralı.
- `src/lib/constraint-filter.ts`: kısıt başına bağlam, `avoid` + sözlük + bekleyen bildirim + yönlendirme + izin birleşimi, düzenleyici ve "Değiştir" için işaretler ve sıra, kart notu, programdaki çelişkiler.
- `src/lib/screening.ts`: protokol 1 (testler, noktalar, iki dilde metin, kolaylaştırılmış sürüm, kalıplar, bölgeler, gerileme/ilerleme kimlikleri), sonuç, asimetri, karşılaştırma, ipuçları ve sırası, kısıttan ön-seçim.
- `attention.ts` ve `notices.ts`'e yeni türler; `measurement-log.ts`'teki kilit `healthLock`'a genelleşir; `client-status.ts` parça başına onay.

---

## 6. Fazlar

Her faz tek başına yayınlanır; PT ekranları masaüstünde, danışan ekranları 375 px'te doğrulanır; `npm run lint` 0 hata.

| # | Faz | Çıktı |
|---|---|---|
| 1 | Veri ve Sağlık sekmesi | `health.json` sürüm 2 şeması, eski alanların okunması, parça başına onay sürümü, `healthLock`, `updateHealth`, `healthView`; sekme "Sağlık" + alt şerit (ölçüm adresleri aynı); Genel'deki özet; `constraints.ts` + testler |
| 2 | Kısıtlar (PT) | liste, ekle/düzenle sayfaları (tanı + kaynak, gözlem), onayla/kapat/yeniden aç/sil, yönlendirme ve görüş, izinler listesi, değişiklik kaydı, uçlar; `?client=` egzersiz önizlemesi |
| 3 | Süzgeç entegrasyonu | **ön koşul: kütüphanenin etiketlenmesi ve aile testi**; `constraint-filter.ts`; düzenleyici sheet'i (işaret, katlanmış grup, "Yine de ekle"), kart rozeti, program sayfası uyarısı; Dikkat: yönlendirme, bekleyen görüş, çelişki |
| 4 | Danışan | `/me/saglik`, bildir sheet'i (iki kademeli güvenlik metni), düzelt/geri çek/kötüleşti/düzeldi, PT karar akışı; Bildirimler ve Dikkat (bildirildi, kötüleşti); "Değiştir" sırası; hareket kartı notu; `conditions` ve `screening` onay sürümü `2026-10` |
| 5 | Tarama | `screening.ts`; genel görünüm, giriş (tablet), düzenleme, karşılaştırma, ipuçları, uçlar; Dikkat (ağrı, asimetri); "Kısıt olarak ekle"; danışanın tarama bölümü; FMS adlarının koddan kalkması |
| 6 | Sonra | ağrılı test kalıbının düzenleyicide "dikkat" alması ve tarama rozetleri; antrenman bitişinde ağrıyla iki kez geçilen harekette "Antrenörüne kısıt olarak bildir" kısayolu; İlerleme'de tarama kartı; ön uzanmanın bacak boyuna göre yüzdesi; dirsek, el bileği, kalça ve ayak bileği için "bölgeyi çalıştıran" ölçütü |

**Gözden geçirme (QA):** "Test Gelişim" (`c_zmrbywaz`, kısıtlar/hazır oluşluk/ağrı/ölçüm açık) modülüne Tarama da eklenir; kısıtların ve taramanın sürümü değiştiği için danışan olarak (`/api/dev/login?role=client&client=c_zmrbywaz`) yeniden onay verilir (ağrı takibi ve ölçümler bu arada sürer); kısıt, bildirim, yönlendirme, izin ve tarama akışları burada. "Test Öneri" (`c_sflqg2b9`) programlı danışanda düzenleyici sheet'i ve "Değiştir". "Test Ölçüm" (`c_b4b572ef`, yalnız ölçüm onayı) kilitli Kısıtlar ve Tarama sayfalarını ve alt şeridin pasif parçalarını gösterir; ölçüm girişi sürüm artışından etkilenmez. Gerçek danışana (`c_uc942qx6`) hiçbir koşulda yazılmaz; yalnız okuma.

---

## 7. Açık sorular (önerilen kararlar kabul edildi)

1. **Sekme:** "Sağlık" + alt şerit mi, ayrı sekmeler mi? **Karar:** Sağlık (§1).
2. **Onay metni sürümü** artsın mı? **Karar:** evet, faz 4'le birlikte; ama **parça başına** (eleştiri 1): yalnız kısıtlar ve tarama yeniden sorulur.
3. **Onaysız danışan bildirimi** harekete karar üretsin mi (bölgeden tahminle "dikkat")? **Karar:** bölgeden tahmin yok; bildirilen **zorlayanlar** eşlendikleri kaçınmalarla hemen **dikkat** olur (eleştiri 3), asla yasak değil.
4. **Kaçınılacak hareket** yasak mı dikkat mi? **Karar:** yasak (PT'nin açık talimatı), danışana özel "Yine de ekle" izniyle; tek istisna "öne eğilme" (dikkat; §2.2).
5. **Sheet'te yasaklar** gizli mi soluk mu? **Karar:** katlanmış grupta, sayısıyla; arama onları da bulur.
6. **Danışanın "düzeldi"si** kısıtı hemen kapatsın mı? **Karar:** hayır, PT onaylar; kötüleşme hemen yazılır.
7. **Tarama sonucu** elle değiştirilebilsin mi? **Karar:** hayır; noktalardan hesaplanır (sayım kuralıyla), PT not düşer.
8. **Danışan sonucun sayısını** görsün mü? **Karar:** hayır; PT de görmez (eleştiri 8): sözcük, ok ve odak. Toplam hiçbir yerde yok.
9. **Tarama hatırlatması** Dikkat'e düşsün mü? **Karar:** hayır; "Son tarama 9 hafta önce" satırı yeter.
10. **Taramadaki ağrı** kendiliğinden kısıt olsun mu? **Karar:** hayır; "Kısıt olarak ekle" kısa onayla, tanısız hareket kısıtı yazar (eleştiri 2).
11. **Danışan tanı adını** görsün mü? **Karar:** Sağlık sayfasında yalnız hekim/fizyoterapist kaynaklı, tanı türünde ve niteleyicisiz (eleştiri 4); antrenman notunda hiç.
12. **Ön uzanma** protokolde kalsın mı? **Karar:** isteğe bağlı kalsın; mezura ister, tek kaynaklı eşiği olan sayı o.
13. **Onay çekildiğinde izinler** ne olsun? **Karar:** dosyada kalır, okunmaz; onay dönünce aynen geçerli.
14. **Kısıt sınırları** (30 kayıt, 12 etkin, 100 izin, 60 tarama günü) yeterli mi? **Karar:** evet; 10–30 danışanlı tek PT için bol.
15. **Tarama taslağı** tarayıcıda nerede? **Karar:** `sessionStorage` (sekmeyle gider); program düzenleyicisinin `localStorage` taslağı sağlık verisi taşımadığı için orada kalır.

### 7.1 Rev. 1 eleştirisi: alınanlar ve değiştirerek alınanlar

Sekiz maddenin sekizi de alındı. Değiştirerek alınan ya da alınmayan kısımlar, nedenleriyle:

- **Madde 1 (parça başına sürüm):** alındı. Kapsamın genişlemesi (`enabledAt`) parça başına yapılmadı: çıkarılıp geri eklenen parça, eski onayın kapsamında görünürdü; modülü yeniden açmak ya da parça eklemek PT'nin bilinçli eylemidir ve bugün de bütün onayı yeniler.
- **Madde 2 (yönlendirme ve görüş):** alındı. "Bölgeyi çalıştıran" ölçütü yalnız diz, omuz, omurga ve boyunda var; dirsek, el bileği, kalça, ayak bileği ve "başka yer"de dikkat üretilmez (güvenilir ölçüt yok; faz 6). Boyun, eleştirinin önerdiği omurga ölçütüne (eksenel yük) katıldı.
- **Madde 5 (bölge kapısı):** alındı, dizde `touches()` yerine daha dar bir ölçütle: `touches()` arka bacak kaslarını dize sayar ve Kettlebell Swing'i yine yakalardı; kapı ön bacak ya da diz penceresi ister. Kaçınma listesinden `spine_end_range` çıkarıldı (kütüphanede hiçbir harekette yok, her harekette "eksik bilgi" üretirdi); "dirsek gövdenin arkasında, yüklü" yüklü şartı eksenel yükten değil pencereden okunur (bench'in eksenel yükü yok).
- **Madde 7 (tarama girişi):** alındı; ön-seçim yalnız görüşü alınmamış kırmızı bayrak bölgesinde, öteki etkin kısıtlar başlıkta söylenir ve asimetriyi bastırır.
- **Madde 3, 4, 6, 8:** olduğu gibi alındı.

## 8. SPEC'e yansıyanlar

- §4 `health.json`: sürüm 2 (`constraints`, `overrides`, `constraintLog`, `screenings`); `conditions`, `surgeryDate` ve `movementScreens`'in eski alan olarak okunması; onay kaydında parça başına `versions`.
- §4 sağlık parçaları: "kısıtlar (süzgecin girdisi)" → "kısıtlar (süzgecin girdisi; danışan da bildirir)"; parça sürümleri.
- §6 danışan sekmeleri: Genel · Program · **Sağlık** (Kısıtlar · Ölçümler · Tarama) · İlerleme · Antrenmanlar · Davet; Genel bakış'ta `constraint` ve `screening` Dikkat türleri, `constraint` bildirim türü; sakatlık süzgecinde danışan kısıtları, `avoid` etiketleri, kalıp yedeği ve danışana özel izin; danışanın avatar menüsünde Sağlık.
- §7.2: "Değiştir" danışanın kısıtlarına göre yasaklıyı çıkarır, uygun olanı öne alır.
- §7.5 "Hareket taraması (FMS)" paragrafı → "Hareket taraması (protokol 1)".
- §12 satır 5b: kısıtlar ve tarama bu belgenin fazlarına bağlanır.

## Kaynaklar

Araştırma klasöründekiler (`docs/research/medical-fitness/findings.json`, bağlantılar orada):
- Moran RW, Schneiders AG, Mason J, Sullivan SJ. Do Functional Movement Screen (FMS) composite scores predict subsequent injury? A systematic review with meta-analysis. *Br J Sports Med* 2017 (Europe PMC 28360142).
- Bonazza NA, Smuin D, Onks CA, Silvis ML, Dhawan A. Reliability, validity, and injury predictive value of the Functional Movement Screen: a systematic review and meta-analysis. *Am J Sports Med* 2017 (Europe PMC 27159297).
- Dorrel B, Long T, Shaffer S, Myer GD. The Functional Movement Screen as a predictor of injury in NCAA Division II athletes. *J Athl Train* 2018 (PMC5800724).
- Chalmers S, Debenedictis TA, et al. Asymmetry during Functional Movement Screening and injury risk in junior football players: a replication study. *Scand J Med Sci Sports* 2018 (Europe PMC 29161759).
- Kraus K, Schütz E, Taylor WR, Doyscher R. Efficacy of the functional movement screen: a review. *J Strength Cond Res* 2014 (Europe PMC 24918299).
- Cuchna JW, Hoch MC, Hoch JM. The interrater and intrarater reliability of the functional movement screen: a systematic review with meta-analysis. *Phys Ther Sport* 2016 (Europe PMC 26777566).
- Shultz R, Anderson SC, Matheson GO, Marcello B, Besier T. Test-retest and interrater reliability of the Functional Movement Screen. *J Athl Train* 2013 (PMC3655746).
- Functional Movement Systems. "FMS and SFMA: When Should I Use What?" (functionalmovement.com, makale 1133): ağrı taramayı klinik değerlendirmeden ayırır. Yalnız ilke alındı.
- The reliability and discriminative ability of the overhead squat test for observational screening of medial knee displacement. *J Sport Rehabil* 2017 (PubMed 27834577).
- Bell DR ve ark. Muscle strength and flexibility characteristics of people displaying excessive medial knee displacement. *Arch Phys Med Rehabil* 2008 (PubMed 18586134).
- Macrum E ve ark. Effect of limiting ankle-dorsiflexion range of motion on lower extremity kinematics and muscle-activation patterns during a squat. *J Sport Rehabil* 2012 (PubMed 22100617).
- Saraceni N ve ark. To flex or not to flex? Is there a relationship between lumbar spine flexion during lifting and low back pain? A systematic review with meta-analysis. *J Orthop Sports Phys Ther* 2020 (PubMed 31775556).
- Finucane LM ve ark. International framework for red flags for potential serious spinal pathologies. *J Orthop Sports Phys Ther* 2020;50(7):350–372.

Klasörde olmayanlar (araştırma klasörüne eklenecek):
- Cook G, Burton L, Hoogenboom B. Pre-participation screening: the use of fundamental movements as an assessment of function – part 1. *N Am J Sports Phys Ther* 2006;1(2):62–72. Yalnız kavram ve sıralı ölçeğin genel biçimi.
- Kritz M, Cronin J, Hume P. The bodyweight squat: a movement screen for the squat pattern. *Strength Cond J* 2009;31(1):76–85. ([LWW](https://journals.lww.com/nsca-scj/fulltext/2009/02000/the_bodyweight_squat__a_movement_screen_for_the.14.aspx))
- Springer BA, Marin R, Cyhan T, Roberts H, Gill NW. Normative values for the unipedal stance test with eyes open and closed. *J Geriatr Phys Ther* 2007;30(1):8–15. ([PubMed 19839175](https://pubmed.ncbi.nlm.nih.gov/19839175/))
- Plisky PJ, Rauh MJ, Kaminski TW, Underwood FB. Star Excursion Balance Test as a predictor of lower extremity injury in high school basketball players. *J Orthop Sports Phys Ther* 2006;36(12):911–919. ([JOSPT](https://www.jospt.org/doi/10.2519/jospt.2006.2244))
- Stiell IG, Greenberg GH, McKnight RD, Nair RC, McDowell I, Worthington JR. A study to develop clinical decision rules for the use of radiography in acute ankle injuries. *Ann Emerg Med* 1992;21(4):384–390. (Ottawa ayak bileği kuralı: "dört adım basamama".)
- Stiell IG, Greenberg GH, Wells GA ve ark. Derivation of a decision rule for the use of radiography in acute knee injuries. *Ann Emerg Med* 1995;26(4):405–413. (Ottawa diz kuralı.)
