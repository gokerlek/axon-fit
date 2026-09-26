# Antrenman ekranı (danışan)

> **Durum:** tasarım önerisi, **rev. 2**, onay bekliyor · **Tarih:** 2026-09-26 · **Kapsam:** SPEC §7 (set başına canlı yazma), §7.1 (öneriler), §7.4 (program, rotasyon), §7.5 (yoklama), §12 satır 4c ve 9.
> **Girdiler:** v1 akışı (`/Users/goker/Projects/pulsecoach/src/app/workout/*`), sektör ve literatür taraması, v2 kodu (`src/lib/progression.ts`, `template-plan.ts`, `program-plan.ts`, `program-diff.ts`, `programs.ts`, `device-loads.ts`, `check-in.ts`, `muscles.ts`, `motion.ts`, `github/client.ts`, `github/files.ts`), rev. 1'in UX ve veri incelemeleri (2026-09-26).
> **Dil:** belge PT'den üçüncü şahısla söz eder ("PT onaylar", "antrenöre bildirim gider"). Danışana dönük metin "antrenörün" der. Marka ve kişi adı yazılmaz (beyaz etiket).
> **Prototip:** akışın tıklanabilir telefon prototipi `antrenman-prototip.html` (tek dosya, 375 × 812). Bu belgedeki ekranları izler; veriler uydurmadır.

## Rev. 2'de değişenler

- **Önceden dolu tekrar** geçen seferki (aynı sıradaki set, aynı ağırlık) değerdir; yoksa aralığın altı. Tepe hiçbir zaman önceden dolmaz (§2.4).
- **Çift dokunuş koruması:** alt panel her durum değişiminden sonra 400 ms dokunuş almaz; "Set bitti"nin yerinde dinlenmede düğme yok; ✓ panel değişmeden önce satırda görünür (§2.4, §2.5, §3).
- **Hareket ekranı 375 px telefona sığar** (~624 px): "Bugün" satırı kalktı, hedef bir kez, "Önceki" sütunu, gerekçe ve ayar notu tek satır çip, panelde 32 px rakamlar (§2.4).
- **Dinlenme:** zorluk hareket başına bir kez (Kolay · İyi · Zor), "Başaramadım" yok; 208 px sayaç; −10 sn bip, bitişte yinelenen alarm, kilit uyarısı ilk dinlenmede (§2.5).
- **Geçme tek dokunuş:** "Hareketi geç ›" panelde; hareket sona alınır, 5 sn toast [Bugün yapma] [Geri al]; neden yalnız bitişte (§2.6).
- **Bitiş:** "Programını güncelleyelim mi?" tek soru, hazır seçimle; erken bitişte "Sıradaki antrenman: Gün B · Değiştir"; "Antrenmanı sil" bitiş sheet'inden kalktı (§2.7).
- **Silme:** onay düğmeleri telefonda üst üste, Vazgeç en altta; metin "kalır" der ve neyin silinmediğini söyler (§2.10, §4.5).
- **Karusel 4 kart;** ilk kart PT'nin istediği dört sayıyı birlikte gösterir; birincil düğme "Sonraki ›" (§2.8).
- **Veri:** bitiş tek commit (Git Data API); silme izleri kalıcı; alan başına, sıradan bağımsız birleştirme; su bir dokunuş listesi; dosya yolu yalnız kimlikten; seans yazımları için ayrı Octokit ayarı; index onarımı; sağlık ayrıntısı yalnız `health.json`'da (§4).
- **Program:** danışanın tekrar hedefi `clientTargets`'e yazılır, `revision` artmaz; PT'nin açık düzenleyicisi 412 almaz (§6.2).
- **Algoritma:** aşama sayımı yalnız hafifletmeyle; `inc(W)` mutlak yükle yazıldı; hafif seans motordan saklanmaz (§5, §6).
- Kabul edilmeyen öneriler gerekçeleriyle §8'in sonunda.

## PT kararları (2026-09-26)

1. Günün hareket listesi var; danışan **herhangi bir hareketi geçip** devam edebilir (set kaydedilmiş olsa da).
2. Her hareketin setleri ve girilecek değerleri (kg, tekrar, süre, zorluk) girilir.
3. Set sonunda dinlenme sayacı ve "Su içtim"; standart fitness uygulaması davranışı.
4. Her geçiş animasyonlu ve yumuşak. **Hareket bitince hemen sıradakine** geçilir.
5. Hepsi bitince sorulur: **"Antrenman tamamlandı, bitirelim mi?"**. Danışan her an bitirebilir; yapılmayan hareket varsa ne olacağı sorulur.
6. Plandan fazla ya da az yapıldıysa **"Programını güncelleyelim mi?"** sorulur. **Kilo ve tekrar hedefi** "evet"le doğrudan güncellenir: program geçmişine danışan değişikliği olarak yazılır, PT'ye bildirim gider. **Set sayısı ve yapı değişikliği** PT'ye öneri olarak gider, PT onaylar.
7. Geçmiş veriden **ağırlık ve set artışı önerisi** verilir; algoritma danışanın **o harekette ne kadar süredir** çalıştığını hesaba katar.
8. Bitiş ekranı: toplam kaldırılan ağırlık, set sayısı, çalışan kaslar; **kaydırılabilir karusel**; gelişim (geçen seferle fark, rekorlar).
9. Danışan geçmişini görür ve istediği veriyi (antrenman, hareket, set) **silebilir**; her silmede "geri alınamaz" uyarısı. Git geçmişinde eski sürüm kalır: metin bunu dürüstçe söyler.
10. Önceki kararlar: günler sırayla döner (A → B → C); danışan başka gün seçebilir, **PT'ye bildirim gider**; hazır oluşluk ve ağrı yoklaması sağlık modülünün isteğe bağlı parçasıdır (onaylıysa, §7.5); "bu hafta x/3".
11. **Danışan uygulamasına alt dock** gelir (PT'ninki gibi, telefon öncelikli): Bugün · Geçmiş · İlerleme; Programlar sonraki fazda. Antrenman sırasında dock gizlenir.

---

## 0. Danışan uygulamasının iskeleti

Danışan yalnız telefondan kullanır (SPEC §6). Gezinme alttaki dock'ta; hesapla ilgili her şey sağ üstteki avatar menüsünde kalır ve dock'ta tekrarlanmaz.

| Sekme | Adres | İçerik | Faz |
|---|---|---|---|
| **Bugün** | `/me` | Sıradaki antrenman kartı, "Antrenmana başla", "Başka gün seç", "bu hafta x/3", bugünkü su, yarım kalan antrenman kartı, karar bekleyen kartlar (onay, şifre), antrenmandan ~10 dk sonra "Antrenman ne kadar zordu?" | 1 (kabuk), 3 (antrenman) |
| **Geçmiş** | `/me/gecmis` | Geçmiş antrenmanlar, detay, silme (§2.10) | 1 (boş), 9 |
| **İlerleme** | `/me/ilerleme` | Hareket başına grafik (üst ağırlık, e1RM; `progress-chart.tsx`), haftalık tonaj, haftalık kas yükü (gerçekleşen, SPEC §7.4), rekorlar ve başarılar (seri, rozet) | 1 (boş), 10 |
| Programlar | `/me/programlar` | Danışanın kendi programları ve "PT ile paylaş" (SPEC §6) | **Sonraki faz**; gelene kadar dock'ta görünmez |

- **Avatar menüsü** (var olan `client-menu.tsx`): Programım · Ayarlar · Çıkış yap. Ayarlar (`/me/ayarlar`) sağlık onayını ve şifreyi tutar. Dock'a girmez. Öneri: "Programım" bugün `/me`'yi açıyor, dock'taki Bugün ile aynı yer. Programın bütün günlerini ve geçmişini gösteren `/me/program`'a bağlansın (açık soru 12).
- **Dock bileşeni:** `src/components/dock/dock.tsx` aynen (PT'de `src/app/dashboard/nav.tsx`). Telefonda (`touch:`) ikonun altında kısa etiket; öğe ≥ 44 px; `aria-current="page"`; `ariaLabel="Ana menü"`. İkonlar Phosphor: `House` Bugün, `ClockCounterClockwise` Geçmiş, `ChartLineUp` İlerleme, ileride `Notebook` Programlar.
- **Dock nerede görünmez:** etkin antrenman (`/me/antrenman`) tam ekrandır, dock ve avatar menüsü yoktur. Özet (`/me/antrenman/ozet/[id]`) ve ana sayfa dock'la açılır. Önerilen dosya düzeni: `src/app/me/(sekmeler)/layout.tsx` dock'u çizer (Bugün, Geçmiş, İlerleme, özet); `src/app/me/antrenman/page.tsx` bu grubun dışında kalır. Next 16'da route group ve layout davranışı yazmadan önce `node_modules/next/dist/docs/` ile doğrulanır (AGENTS.md).
- İçerik dock'un altında kalmasın: sayfa alt boşluğu = dock yüksekliği + `env(safe-area-inset-bottom)`.

```
┌─────────────────────────────────────────┐ 375
│ Merhaba, {ad}                      (AY) │ avatar menüsü, 44 px
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Bugün · Gün A          Bu hafta 1/3 │ │
│ │ …                                   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Su · bugün 3 bardak            [+1] │ │ 44 px
│ └─────────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │   ⌂          ◷          ↗         │  │ dock ≈ 64 px + güvenli alan
│  │ Bugün     Geçmiş    İlerleme      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Günlük su:** Bugün'deki "+1" antrenman dışındaki bardakları `water.json`'a yazar (`{ "taps": [ { "id": "wt_…", "d": 1, "at": "…" } ] }`; dokunuşlar 10 sn biriktirilip tek yazılır; §4.2'deki dokunuş listesiyle aynı birleştirme). Günün toplamı = `water.json`'daki o günün dokunuşları + o günkü antrenmanların suyu; çift sayılmaz.

---

## 1. Akış özeti

```
Bugün kartı ──[Antrenmana başla]──► (sağlık modülü açık ve onaylıysa) Hazır oluşluk sheet'i · "Bugün atla"
   └──[Başka gün seç]──► gün sheet'i ──► seçilen günle başlar (PT'ye bildirim)
                 │
                 ▼
Hareket ekranı ──[Set bitti]──► ✓ satırda ──► Dinlenme (sayaç, Su içtim, ±15, atla;
   ▲   │                                       hareketin son setinden sonra "nasıldı?")
   │   └── son set ──► sıradaki hareket HEMEN (dinlenme onun üstünde sürer)
   │
   ├── [Hareketi geç ›] ──► sona alınır · toast [Bugün yapma] [Geri al]
   └── ☰ Akış: şimdi yap · geç · Geçilenler
                 │
      hepsi bitti ▼                         erken "Bitir" ▼
"Antrenman tamamlandı, bitirelim mi?"     "Antrenmanı bitir?" · "Sıradaki antrenman: Gün B · Değiştir"
                 └───────────────┬────────────────┘
                                 ▼  (plandan sapma ya da öneri varsa)
        "Programını güncelleyelim mi?"  [Evet, güncelle] [Hayır, aynı kalsın] · Tek tek seç
                                 ▼
              Özet karuseli (4 kart, kaydırmalı) ──► Bugün (dock geri gelir)
```

| Adres | Ekran | Dock |
|---|---|---|
| `/me` | Bugün | var |
| `/me/antrenman` | Etkin antrenman (tek sayfa; hareket, dinlenme, sheet'ler) | yok |
| `/me/antrenman/ozet/[id]` | Özet karuseli (geçmişten de açılır) | var |
| `/me/gecmis`, `/me/gecmis/[id]` | Geçmiş listesi, detay | var |
| `/me/ilerleme` | İlerleme | var |

Başlatmak **tek dokunuştur**: v1'in hazırlık ekranı (C3) ve zorunlu yoklaması (C2) kalkar. Sıralama ve geçme hareket ekranına ve akış sheet'ine taşınır. Başlatmak ağ beklemez; dosya ilk set kaydıyla oluşur (§4.3).

---

## 2. Ekranlar (375 px)

Genel kurallar:
- Tek sütun, 16 px kenar. Sayılar Türkçe (`formatKg`: `62,5 kg`, `4.215 kg`); değişen sayılar `tabular-nums`. Danışana "hareket" denir; "antrenman" yalnız seansın adıdır (SPEC §6).
- Dokunma hedefleri: antrenman ekranında birincil düğme ve stepper **56 px** (`Stepper size="lg"`), set satırı 48 px; başka yerde ≥ 44 px; aralarında ≥ 8 px.
- **Dokunma kilidi:** alt panel ve dinlenme paneli, her durum değişiminden (set kaydedildi, dinlenme atlandı ya da bitti, sıradaki hareket geldi, gruptaki sıradaki üye geldi) sonra **400 ms** dokunuş almaz (`WORKOUT.tapGuardMs`). Dokunuş yutulur, alttaki öğeye geçmez. iOS'ta titreşim olmadığı için emin olmak için iki üç kez basmak olağandır; kilit, yeni set kimliğiyle ikinci bir set yazılmasını önler (idempotent anahtar bunu yakalayamaz).

### 2.1 Bugün / Başlat

```
┌─────────────────────────────────────────┐
│ Bugün · Gün A            Bu hafta 1/3   │
│ Alt vücut A                             │
│ 5 hareket · 17 set · ~55 dk             │
│ 1  Goblet Squat    3 set · 8–12 tekrar  │
│ 2  Leg Press       3 set · 10–12 tekrar │
│    3 hareket daha                    ⌄  │
│ [        ▶  Antrenmana başla        ]   │ 56 px
│            Başka gün seç                │ 44 px, bağlantı görünümü
└─────────────────────────────────────────┘
```
- Gün `nextDayId` (A → B → C); "Bu hafta x/3" `weekProgress` (programın ya da evrenin `daysPerWeek` değeri yoksa yalnız "Bu hafta 1").
- Yarım antrenman varsa kart yerine: **"Yarım kalan antrenman · Gün A · 7/17 set · 25 dk önce"** [Kaldığın yerden devam et] + "Bitir ve özete geç".
- 6 saatten eskiyse açılışta sheet: "Yarım kalan antrenman · Gün A · 7/17 set · dün 18:05" [Sürdür] [Bitir ve özete geç]. **"Antrenmanı sil"** eşit düğme değildir: sheet başlığının sağ üstünde üçüncül metin, onaylı (§2.10).
- Boş program: var olan `Empty` ("Henüz program yok"); başlat yok.

### 2.2 Hazır oluşluk (isteğe bağlı, §7.5)
Yalnız `canRecordHealth(client, 'readiness')` (ağrı soruları için `'check_in'`) doğruysa, "Antrenmana başla"dan sonra sheet açılır. Onay yoksa hiç görünmez, hiçbir şey yazılmaz.
```
│ Bugün nasıl hissediyorsun?              │
│ Dün gece nasıl uyudun?                  │
│ [1] [2] [3] [4] [5]                     │ 44 px
│ …                                       │
│ [          Başla            ]           │
│         Bugün atla                      │
```
- Puan v1 formülü: (uyku + enerji + (6−ağrı) + (6−stres)) × 5; 60'ın altında "Hacmi hafifletelim mi?" [Evet, hafiflet] [Planı koru]. Evet yalnız bugünün planını değiştirir: ağırlık −%15 (`deloadWeight`), 3 ve üstü çalışma setinde son set düşer.
- Seans dosyasına yalnız nötr **`adjust: "lighter"`** yazılır. Nedeni (puan, "hazır oluşluk") `health.json` → `checkIns[]` kaydında `sessionId` ile durur (§4.2). PT'ye `lighter` bildirimi gider; nedeni yalnız onay sürdükçe görünür.
- Ağrı takibi açıksa `assessTolerance` → `applyTolerance` bugünün planına uygulanır (SPEC §7.5).
- Yazım `health.json` → `checkIns` (sunucu `canRecordHealth` denetler); seans dosyasına sağlık verisi girmez.

### 2.3 Başka gün seç
```
│ Hangi günü yapacaksın?                  │
│ (•) Gün A · sıradaki                    │
│ ( ) Gün B · son: 22 Eyl                 │
│ ( ) Gün C · son: 19 Eyl                 │
│ Antrenörüne bildirilir. Sıra seçtiğin   │
│ günden devam eder.                      │
│ [        Bu günle başla        ]        │
```
Seçilen gün seansa `program.plannedDayId` ≠ `dayId` olarak yazılır → bildirim `other_day`. Bitişte `completeDay(program, dayId)` sırayı seçilen günden sürdürür (zaman denetimiyle, §4.7).

### 2.4 Hareket ekranı

```
┌─────────────────────────────────────────┐
│ ‹ Ara ver       Gün A · 24:18    Bitir  │ 52 px; süre `startedAt`'ten
│ ▰▰▰▰▰▰▱▱▱▱▱  Hareket 2/5 · 7/17 set  ☰ │ 44 px; ☰ akış sheet'i
├─────────────────────────────────────────┤
│ Bench Press                   Değiştir  │ başlık ≤ 2 satır (~64 px)
│ (↑ +2,5 kg · hedefe ulaştın) (Sehpa 3.) │ tek satır çipler; dokununca açılır
├─────────────────────────────────────────┤
│ Isınma 20×10 · 40×5              ✓ ✓    │ 40 px; bitince çipe katlanır
│ Set   Önceki      kg       Tekrar       │ 24 px
│ 1     60 × 10     62,5     10       ✓   │ 48 px
│ 2     60 × 10     62,5      9       ✓   │
│▌3     60 × 9      62,5      —           │ vurgu şeridi şu anki sette
│ + Set ekle                              │ 44 px
├─────────────────────────────────────────┤ alt panel, yapışkan
│ Set 3/3 · Hedef 8–10    Hareketi geç ›  │ 44 px
│ [ − ]         62,5 kg         [ + ]     │ 56 px; rakam ≥ 32 px
│ [ − ]         9 tekrar        [ + ]     │ 56 px
│ [            Set bitti  ✓           ]   │ 56 px, tek dokunuş
└─────────────────────────────────────────┘
```
**Yükseklik bütçesi.** 375 × 812 telefonda bile Safari'nin araç çubukları `dvh`'ı ~660–680 px'e indirir. Üst çubuklar 96 + başlık 64 + tablo (24 + 3 × 48 + 44 = 212) + panel ~252 = **~624 px**; ısınma satırı açıkken ~664 px. 4+ sette, süpersette ya da açık ısınmada tablo kayar; şu anki satır her zaman panelin üstünde görünür (`scroll-margin-bottom` = panel yüksekliği, set değişince `scrollIntoView({ block: 'nearest' })`).

- **Plan değerleri bir kez görünür.** "Bugün 62,5 kg · 8–10" satırı yok. Hedef panelde ("Hedef 8–10"); planın ağırlığı kg sütununda. Setlerin hedefi farklıysa (piramit, back-off, yüzdeli set) tablo bir "Hedef" sütunu alır; düz setlerde almaz.
- **"Önceki" sütunu** (Strong, Hevy gibi): aynı satırın geçen seferki aynı sıradaki seti, gri. Geçen sefer yoksa "—".
- **Çipler:** öneri gerekçesi (§5.7) ve ayar notu tek satırlık çip; taşarsa kırpılır. Dokununca küçük popover: gerekçenin tamamı ("Geçen sefer bütün setlerde 10'a ulaştın; +2,5 kg.") ya da ayar notunu düzeltme. "Hareket 2/5" ilerleme satırında.
- **Panel rakamları** ≥ 32 px, `tabular-nums`: sehpadan okunur.
- **Önceden dolu değerler:**
  - **Ağırlık:** planın ağırlığı (`planSession` → `nextSetInPlan`); danışan bu seansta değiştirdiyse bir önceki setin ağırlığı (v1 sırası: kaydedilmemiş taslak → bu seansın önceki seti → plan).
  - **Tekrar / süre:** geçen seferki **aynı sıradaki setin, aynı ağırlıktaki** değeri. Öyle bir set yoksa (ağırlık arttı, ilk kez) aralığın **altı**. Tepe hiçbir zaman önceden dolmaz; bu seansın önceki setinin tekrarı da kopyalanmaz.
  - Sonuç: dokunup geçmek "geçen seferle aynı" demektir; motor `hold` verir, `increase` vermez. Artış bilinçli bir "+" dokunuşu ister. Yorgun ya da acelesi olan danışan 10·10·10'u tek dokunuşla yazamaz. "Hedef 8–10" stepper'ın hemen üstünde durduğu için yukarı düzeltmek görünür bir seçimdir.
- **Stepper:** ağırlık adımı cihazın bir sonraki/önceki ayarı (`loadSpecFor` → ızgara; `gridOf`'un dışa açılması gerekir). Basılı tutunca tekrarlar; kutuya dokununca `inputMode="decimal"`.
- **Yumuşak uyarılar** (engellemez): "Hedefin çok altında — doğru mu?"; `isOverload` → "Hedefin çok üzerindesin" [Onayla] [Düzelt]. Onaylanan set `overload: true` işaretlenir, PT'ye bildirim gider; hareket başına bir kez sorulur, sonra satırda gösterilir.
- **Kaydedilmiş sete dokunmak:** "Seti düzelt" sheet'i. En üstte, stepper'lardan ve Kaydet'ten uzakta, metin olarak **"Seti sil"** (yıkıcı renk, onaylı; §2.10'daki metin). Altında kg, tekrar, zorluk; en altta [Kaydet].
- **Başlık ve düğmeler** 44 px. "Değiştir" başlığın sağında; **"Hareketi geç ›"** panelin üst satırında, "Set 3/3"ün yanında: başparmak erişiminde ve "Değiştir"den uzakta (§2.6). ⋮ menüsü yok (düzenleyiciyle aynı ilke).

**Set türleri**

| Tür | Girilen | "Set bitti" |
|---|---|---|
| Ağırlık × tekrar | kg + tekrar | tek dokunuş |
| Vücut ağırlığı | tekrar; isteğe bağlı "kg ek yük" (v1) | tek dokunuş |
| Süreli (`duration`) | saniye (geçen seferki ya da aralığın altı); aletin adımı varsa kg | düğme **"Başlat ▶"** → sayar (alt sınırda tek bip) → **"Bitir ■"**; elle stepper da var |
| AMRAP | tekrar stepper'ı hep açık, hedef "en az 8, yapabildiğin kadar" | tek dokunuş; zorluk sorulmaz (SPEC §7.1) |
| Isınma | hesaplanır, saklanır ama hacme ve rekora girmez | satırdaki ✓ |

**Gruplar** (`setSlots` sırası; SPEC §7.4)
```
│ Süperset · Tur 2/3                      │
│ ┌ A  Bench Press   62,5 × 8–10    ✓  ┐  │
│ └ B  Barbell Row   50 × 8–10      ▶  ┘  │ şu anki üye vurgulu
```
- Süperset ve komplekste üyeler arasında dinlenme yok: "Set bitti" → kart 12 px kayarak sonraki üyeye geçer, düğme "Set bitti → B" olur (400 ms kilitle). Devrede istasyon geçişi (`transitionSeconds`, varsayılan 15 sn) panelde ince bir çubuk olarak sayar, tam dinlenme değildir. Tur sonunda blok dinlenmesi.
- Setleri biten üye sonraki turlarda atlanır (`setSlots`). Geçilen üye grubu bozmaz; kalan üye(ler) tur düzeniyle sürer.

**Hareket bitince:** son setin ✓'u satıra düşer, kart kapanır ("Bench Press ✓ 3/3"), **sıradaki hareket hemen** sağdan gelir; dinlenme paneli onun üstünde açılır ve altta "Sıradaki: Squat · Set 1 · 80 kg × 5" yazar (§2.5, §3). Son hareketin son setinden sonra dinlenme yok: bitirme sorusu açılır.

### 2.5 Dinlenme paneli
"Set bitti"den sonra önce ✓ satırda görünür (fast). 220 ms sonra alt panel yukarı büyüyüp dinlenme paneline döner; hareket kartı üstte tek satıra iner. Set tablosu dinlenmede görünmez; bakmak için **"Küçült"**: panel 48 px'lik bir şeride iner ("Dinlenme 1:12 · Büyüt"), tablo ve giriş paneli geri gelir, "Set bitti" dinlenmeyi bitirir.
```
├─────────────────────────────────────────┤
│ Bench Press · 2/3 set ✓                 │ kart tek satır
├─────────────────────────────────────────┤
│ Dinlenme            Küçült   Atla ›     │ 44 px; atla sağ üstte
│ ✓ Set 2 kaydedildi · 62,5 × 9   Düzelt  │
│ Bench Press nasıldı?                    │ yalnız hareketin son setinden sonra
│ [ Kolay ]    [  İyi  ]    [  Zor  ]     │ 3 × ~110 px, 56 px
│            ╭─────────────╮              │
│  [−15 sn]  │    1:12     │  [+15 sn]    │ halka 208 px, rakam 56 px
│            ╰─────────────╯              │
│ [          💧 Su içtim · 2          ]   │ 56 px
│ Sıradaki: Set 3 · 62,5 kg × 8–10        │ düğme değil; "Set bitti"nin yerinde
└─────────────────────────────────────────┘
```
- **Yerleşim çift dokunuşa göre:** "Set bitti"nin yerinde düğme olmayan "Sıradaki" satırı durur; "Dinlenmeyi atla" sağ üstte. İkinci ve üçüncü dokunuş boşa düşer (ayrıca 400 ms kilit).
- Süre bloğun `restSeconds` değeri; 0 ise panel açılmaz. ±15 yalnız bu dinlenmeyi değiştirir.
- **Zorluk hareket başına bir kez:** hareketin son çalışma setinden sonra "Bench Press nasıldı?" Kolay · İyi · Zor (tek satır). Cevap o hareketin bütün çalışma setlerine yazılır; set başına ayrım "Seti düzelt"te. Seçilmezse alan boş kalır, motor `good` sayar. Başlık hareketin adını taşır: soru sıradaki hareketin kartının üstünde çıksa da neyi sorduğu bellidir.
- **"Başaramadım" yok:** tekrar alt sınırın altındaysa bu zaten kaçırmadır (`progression.ts`: `effort === 'fail' || value < min`); düğme aynı şeyi ikinci kez sorup tekrarı yeniden istiyordu. `fail` eski kayıtlar için şemada kalır. §5.3'ün "bütün setler Kolay/İyi" ve "bütün setler Kolay → ×2" kuralları aynen çalışır.
- **Ara setlerde tek kısayol:** tekrar aralığın tepesindeyse ve sonraki set aynı ağırlıktaysa panelde isteğe bağlı çip: **"Kolaydı · sonraki set 65 kg"**. Dokunmak o sete `easy` yazar ve sonraki seti bir adım artırır (`nextSetInPlan`'in "kolay ve tepede" kuralı). Soru değildir; dokunulmazsa hiçbir şey olmaz. Bu olmadan aynı seans içi artış hiç tetiklenmezdi.
- **Sayaç** `restEndsAt` zaman damgasından; telefon uyusa da doğru (v1). Halka ≥ 200 px (208), rakam ≥ 56 px, `tabular-nums`.
  - Son 10 sn: rakam ana renk ve **tek bip** ("10 saniye kaldı").
  - Bitince: halka bir kez nabız, **3 bip**, Android'de titreşim, "Hazırsın". Danışan dokunana kadar 3 bip **15 sn'de bir, en çok 3 kez** yinelenir; spor salonu müziğinin altında tek seferlik 120 ms bipler kayboluyordu. Alttaki "Sıradaki" satırı [Sonraki sete geç] düğmesine döner (400 ms kilitle). Otomatik geçiş yok.
  - Sayfaya dinlenme bittikten sonra dönülürse aşım büyük yazılır: **"Dinlenme 1:40 önce bitti"**.
- **Kilit uyarısı yerinde:** her antrenmanın ilk dinlenmesinde, Wake Lock yoksa ya da iOS'taysa panelde tek satır: "Ekranı kilitleme; kilitlenirse dinlenme bitişi çalmayabilir." Ayarlar'daki not kalır; antrenman ortasında Ayarlar okunmaz.
- **Su içtim** tek düğmedir (v1'deki ikinci kopya yok): sayı atlar, "+1 · Geri al" hapı 3 sn durur; uzun basış geri alır. Üst çubukta yalnız sayı görünür (düğme değil). Geri al bir −1 dokunuşudur ve kalıcıdır (§4.2).

### 2.6 Antrenman akışı (☰) ve geçme
```
│ ━━━━                                    │
│ Antrenman akışı               7/17 set  │
│ Alet doluysa geç: hareket sona alınır,  │
│ sıra kaldığın yerden sürer.             │
│ ✓ 1  Goblet Squat         3/3           │
│ ▶ 2  Bench Press          2/3   şimdi   │
│ ○ 3  Leg Press            0/3    [Geç]  │ satıra dokun = "Şimdi yap"
│ ○ 4a Face Pull  ┐ Süperset 0/3   [Geç]  │
│ ○ 4b Curl       ┘                       │
│ ↻ 5  Calf Raise · sona alındı 0/3 [Geç] │
│ ── Geçilenler ───────────────────────── │
│ ↷ 6  Plank                    [Geri al] │
└─────────────────────────────────────────┘
```
- **Hareketi geç ›** (panelin üst satırında ya da akıştaki [Geç]) **tek dokunuştur**: hareket listenin sonuna alınır, sıradaki hareket hemen gelir (§3). Sheet yok, neden sorulmaz. "Alet dolu", en sık durum, tek dokunuşta biter.
- Ardından 5 sn toast: **"Calf Raise sona alındı · [Bugün yapma] [Geri al]"**. Set kaydedilmişse: "2/3 set yapıldı; kalanı sona alındı".
- Sona alınmış ya da son kalan hareket yeniden geçilirse (ya da toast'ta "Bugün yapma") **Geçilenler**'e gider: "Calf Raise geçildi · [Geri al]".
- **Neden** antrenman ortasında sorulmaz; yalnız bitişte ve hareket hâlâ yapılmamışsa, isteğe bağlı (§2.7). "Ağrı / rahatsızlık" nedeni yalnız `canRecordHealth(client, 'check_in')` doğruysa çıkar ve `health.json`'a yazılır (§4.2).
- Geçilen hareket **eksik** sayılır (`incomplete`, tıkanma serisinde nötr), tıkanma sayılmaz.
- **Şimdi yap:** satıra dokununca o harekete atlanır; sıra kaldığı yerden sürer (v1).
- **Değiştir** (başlıkta): `alternatives.ts` muadilleri, cihaza göre gruplu; muadil kendi geçmişiyle önerilir (SPEC §7.2). Seansa `swappedFrom: rowId` yazılır, bitişte "Bundan sonra da bunu yapayım" PT önerisi olabilir (§6).
- **Hareket ekle** (akışın altında, kütüphane sheet'i) yalnız bu seansa ekler; bitişte PT önerisine dönüşebilir.
- Grupta sürükle-bırak yok; sıra "Şimdi yap" ve "Geç" ile değişir (v1'in hazırlık ekranındaki sürükleme gerekmez).

### 2.7 Bitirme soruları

**a) Hepsi bitti** (geçilmemiş her hareketin planlı setleri kaydedildi; son setin ✓'undan hemen sonra açılır):
```
│ ✓  Antrenman tamamlandı, bitirelim mi?  │
│ 5 hareket · 17 set · 4.215 kg · 52 dk   │
│ [              Bitir               ]    │
│ [   Devam et (set ya da hareket ekle) ] │
```
Geçilen hareket kaldıysa: "1 hareket geçildi: Calf Raise" [Geçileni yap] [Bitir] ve kapalı "Neden? (isteğe bağlı) ⌄".

**b) Erken bitir** (üst çubuktaki "Bitir"):
```
│ Antrenmanı bitir?                       │
│ 12/17 set yapıldı. Yapılmayanlar:       │
│ · Leg Press · 1/3 set                   │
│ · Calf Raise · geçildi                  │
│ · Plank                                 │
│ Sıradaki antrenman: Gün B     Değiştir  │ hazır seçim, tek satır
│ Neden? (isteğe bağlı)                ⌄  │ kapalı
│ [        Bitir ve özete geç        ]    │
│ [          Kalanlara dön           ]    │
```
- Asıl soru rotasyondur ama yorgun danışana "Atla; sıradaki gün…" radyo çifti sorulmaz: sonuç hazır seçilmiş tek satır olarak görünür. "Değiştir" iki seçeneği açar: "Gün B · sıradaki" / "Gün A yine sırada kalsın".
- Varsayılan: planın ≥ %50'si yapıldıysa sıradaki gün, değilse aynı gün (**[sentez]**). "Sırada kalsın" seçilirse rotasyon ilerlemez (`completeDay` çağrılmaz); seans yine kaydedilir ve haftaya sayılır.
- "Neden?" açılınca çipler: Zamanım yok · Yoruldum · Alet dolu · Ekipman yok · Diğer (+ onaylıysa Ağrı).
- 0 set: "Henüz set yok." [Kalanlara dön] [Antrenmanı iptal et]. Dosya ilk sette oluştuğu için silinecek bir şey yok.
- **Silme bu sheet'te yok.** Yorgun başparmağın düştüğü yerde yıkıcı işlem durmaz; antrenman silme geçmiş detayındadır (§2.10).
- PT'ye: yarım bırakılan antrenman `unfinished` bildirimi (12/17 set).

**c) "Programını güncelleyelim mi?"** yalnız sapma ya da öneri varsa (§6), a/b'den sonra, özetten önce açılır. Tek soru, seçimler hazır:
```
│ Programını güncelleyelim mi?            │
│ · Bench Press: bundan sonra 65 kg       │
│ · Şınav: hedef 10–14 tekrar             │
│ · Leg Press: 3 → 4 set (antrenörüne)    │
│ +2 değişiklik                           │
│ Kilo ve tekrar hedefin hemen değişir;   │
│ set sayısını antrenörün onaylar.        │
│ [          Evet, güncelle          ]    │ 56 px
│ [        Hayır, aynı kalsın        ]    │ 44 px
│               Tek tek seç               │ bağlantı
```
- En çok 3 özet satırı (önce doğrudan olanlar), kalanı "+n". Satırlar sheet'te seçili gelenlerdir (§6.1).
- **Evet, güncelle:** seçili gelenler uygulanır: kilo ve tekrar hedefi doğrudan, set sayısı ve yapı PT'ye öneri. Tek dokunuş.
- **Hayır, aynı kalsın:** programa bir şey yazılmaz, öneri gitmez; yukarı ağırlık `oneOff`, aşağı ağırlık `lighter` (§6.2).
- **Tek tek seç:** bugünkü madde listesi. Her madde tam genişlik tek satır ve tek onay kutusu ("Programa yaz" ya da "Antrenörüne öner"); altta [Kaydet]. Yan yana radyo çifti yok (etiketler ~160 px'te kırılıyordu).
- Sheet cevapsız kapanırsa (sekme kapandı): §6.1'in "Cevapsız" sütunu.

### 2.8 Özet karuseli
shadcn `Carousel` (Embla); base-nova kaydında yoksa CSS `scroll-snap` + aynı düğmeler (açık soru 8). Kurallar (NN/g): kaydırılabilir, **"2/4" sayacı** görünür (noktalar küçük, dokunulmaz), kendiliğinden ilerlemez.
- 1–3. kartta birincil düğme **"Sonraki ›"** (tek elle ilerler, rekorlar görülmeden çıkılmaz), ikincil metin "Bugün'e dön". Son kartta birincil "Bugün'e dön".
- PT'nin istediği dört sayı (süre, toplam ağırlık, set, kas) ilk kartta birlikte; rekorlar ikinci kartta.

| # | Kart | İçerik |
|---|---|---|
| 1 | **Antrenman tamamlandı** | "Harika iş, {ad}!" · gün, tarih, saat · 2 × 2 ızgara: **süre · toplam ağırlık · set · kas** (sayarak gelir) · "2 rekor" rozeti · "Geçen Gün A'ya göre +%6" · alt satır "Bu hafta 2/3 · 2 bardak su" |
| 2 | **Rekorlar ve gelişim** | Rekor kartları ("62,5 kg × 10 · önceki en iyi 60 × 10", "+%4 tahmini 1RM"); hareket başına ↑ ↓ = geçen sefere göre; **"Gelecek sefer"**: Bench 65 kg, Squat 82,5 kg (öneri motoru, bu seans dahil) |
| 3 | **Çalışan kaslar** | `MuscleMap` (`layout="split"`, `intensity` = kesirli set / en çok), "9 kas çalıştı", ilk 5 kas setiyle |
| 4 | **Hareketler** | Hareket başına satır ("Bench Press 3 set · 27 tekrar · 62,5 kg üst"), 142 tekrar toplamı, geçilen ve yarım hareketler |

```
┌─────────────────────────────────────────┐
│ Antrenman tamamlandı              1/4   │
│ Harika iş, {ad}!                        │
│ Gün A · 26 Eyl Cmt · 18:05–18:57        │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 52 dk        │ │ 4.215 kg     │       │
│ │ süre         │ │ toplam ağırlık│      │
│ └──────────────┘ └──────────────┘       │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 17           │ │ 9            │       │
│ │ set          │ │ kas          │       │
│ └──────────────┘ └──────────────┘       │
│ ★ 2 rekor · Geçen Gün A'ya göre +%6     │
│ Bu hafta 2/3 · 2 bardak su              │
│ ● ○ ○ ○                                 │
│ [             Sonraki ›            ]    │
│              Bugün'e dön                │
└─────────────────────────────────────────┘
```
Su düzeltmesi (±1) karttan kalktı; geçmiş detayındaki "3 su" satırında durur (§2.10).

Hesaplar (`workout-summary.ts`, saf):
- **Toplam ağırlık (tonaj):** ısınma hariç çalışma setlerinde Σ kg × tekrar (ACSM 2009 hacim tanımı). Vücut ağırlığında ek yük sayılır, yoksa 0 kg; süreli hareket tonaja girmez, süresi karta yazılır. v1 başarısız setleri dışlıyordu; v2 yapılan tekrarı sayar (açık soru 5).
- **Çalışan kaslar:** set başına hedef 1, yardımcı 0,5, dengeleyici 0,25 (`ROLE_SET_WEIGHT`, SPEC §6). Kas sayısında dengeleyici sayılmaz, aileler tek ad (`summarizeMuscles`).
- **Rekorlar** (v1 `pr.ts`): e1RM (Epley, 1–12 tekrar), en ağır set, o ağırlıkta en çok tekrar; kesin büyük olmalı. Hareketin ilk kaydı referanstır, rekor sayılmaz. Hareket başına bir kutlama.

### 2.9 Yoklama sonrası: seans zorluğu
SPEC §4'e göre seans RPE'si bitişten ~10 dk sonra sorulur. Bugün'de 10 dk – 24 saat arasında kart: "Antrenman ne kadar zordu?" (CR-10) ve süre önceden dolu. Zorunlu değil (v1'de kaydı kilitliyordu).

### 2.10 Geçmiş (liste, detay, silme)
```
┌─────────────────────────────────────────┐
│ Geçmiş                             (AY) │
│ Son 30 gün · 9 antrenman · 38 t · 4 PR  │
│ EYLÜL 2026                              │
│ ┌─────────────────────────────────────┐ │
│ │ 26 Cmt  Gün A · 52 dk               │ │
│ │ 17 set · 4.215 kg · 2 rekor         │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 24 Per  Gün C · başka gün · yarım   │ │ rozetler
│ └─────────────────────────────────────┘ │
│         Daha fazla göster (12)          │
└─────────────────────────────────────────┘
```
Detay (`/me/gecmis/[id]`):
```
│ ‹ Geçmiş                  Düzenle   Sil │ Sil: antrenmanın tamamı
│ Gün A · 26 Eylül 2026                   │
│ 18:05–18:57 · 17 set · 4.215 kg · 3 su  │ Düzenle'de su ±1
│ Özeti aç ›                              │
│ Bench Press                        [🗑] │ 🗑 yalnız Düzenle'de
│  1   60 × 10   İyi                 [🗑] │
│  2   60 × 9    Zor                 [🗑] │
```
- **Düzenle** kipi (editördeki "Seç" gibi) her set ve hareket satırına 44 px 🗑 koyar. Sola kaydırma (`SwipeRow`) aynı işlemin kısayoludur; panel düğmesi görünür düğmenin kopyasıdır (`aria-hidden`).
- **Her silme onaylıdır** (`AlertDialog`; editördeki onaysız silme + "Geri al" burada yok):
```
│ Bu set silinsin mi?                     │
│ Bench Press · Set 2 · 60 kg × 9         │
│ Uygulamadan kalkar, geri getirilemez.   │
│ Antrenörünün veri deposunun geçmişinde  │
│ kalır.                                  │
│ Ayrıntı ⌄                               │
│ [               Sil                ]    │ yıkıcı, tam genişlik
│ [             Vazgeç               ]    │ en altta; odak burada
```
- **"Ayrıntı"** açılınca: "Deponun eski sürümlerinde ve kayıt notlarında kalır. Programındaki değişiklik kaydı (ör. 'Bench Press 60 → 65 kg') silinmez. Rekorların ve önerilerin kalan kayıtlara göre yeniden hesaplanır. Tamamen silinmesi için antrenörüne yaz."
- Metin çelişmez: "kalıcı olarak silinir" ile "eski sürümlerde kalabilir" bir arada yok. Veri gerçekten depoda **kalır** (§4.5), bu yüzden "kalabilir" değil.
- **Telefonda düğmeler üst üste ve tam genişlik:** [Vazgeç] en altta (sağ başparmağın düştüğü yer güvenli), [Sil] onun üstünde yıkıcı stilde. Odak Vazgeç'te.
- Hareket: "Bench Press'in 3 seti silinsin mi?"; antrenman: "Bu antrenman silinsin mi? 17 set ve özeti uygulamadan kalkar…". Metin aynı iki cümle ve "Ayrıntı"yla biter.
- Onaydan sonra satır `SwipeRow` çıkışıyla kalkar; toast yok, "Geri al" yok.

---

## 3. Hareket ve animasyon

Token'lar `src/lib/motion.ts`: `DURATION` instant 100 · fast 160 · base 220 · slow 300; `EASE.enter` / `EASE.exit`; `SWIPE.exitMs` 240, `collapseMs` 300; `DRAG.highlightMs` 1200. CSS'te yalnız `duration-100/160/220/300`. Önerilen ek grup; yeni sayılar yalnız burada:
```ts
export const WORKOUT = {
  slidePx: 24,          // hareket değişiminde yatay kayma
  groupSlidePx: 12,     // grup üyeleri arası
  countUpMs: 700,       // özet sayılarının sayarak gelmesi
  waterUndoMs: 3000,    // "+1 · Geri al" hapı
  skipToastMs: 5000,    // "sona alındı · Bugün yapma · Geri al"
  tapGuardMs: 400,      // durum değişiminden sonra alt panelin dokunuş kilidi
  restWarnSeconds: 10,  // renk + tek bip
  alarmRepeatMs: 15_000,
  alarmRepeats: 3,
  restRingPx: 208,
} as const;
```

| Olay | Hareket | Token | `prefers-reduced-motion` | His / ses |
|---|---|---|---|---|
| "Set bitti"ye basış | ölçek 0,97 | instant | yok | — |
| Set satırında ✓ (panel değişmeden önce) | ikon ölçek 0,6→1 + saydamlık | fast, `EASE.enter` | yalnız saydamlık | Android `vibrate(10)` |
| Dokunma kilidi | görsel değişiklik yok; dokunuş yutulur | `WORKOUT.tapGuardMs` | aynı | — |
| Vurgu şeridi sonraki sete | `layout` kayma | base | anında | — |
| Alt panel → dinlenme (✓'dan 220 ms sonra) | yükseklik `layout` + içerik çapraz geçiş; kart tek satıra iner | base / fast | çapraz geçiş, instant | aria-live "Set 2 kaydedildi: 62,5 kg, 9 tekrar" |
| Dinlenme halkası | `restEndsAt`'ten rAF, doğrusal | — | halka yok, saniyede bir sayı | — |
| Son 10 sn | sayı rengi → primary | fast | aynı | tek bip, aria-live "10 saniye kaldı" |
| Dinlenme bitti | halka bir kez 1→1,06→1, renk | slow | yalnız renk | 3 bip (Web Audio), dokunulana kadar 15 sn'de bir, en çok 3 kez; Android `vibrate([80,60,80])`; "Dinlenme bitti. Hazırsın." |
| **Hareket bitti → sıradaki** | eski kart x 0→−24 + saydamlık (fast, `EASE.exit`); yeni kart x 24→0 (base, `EASE.enter`); `AnimatePresence mode="popLayout"` | fast + base, `WORKOUT.slidePx` | çapraz geçiş, instant | `vibrate(20)` |
| Grupta sonraki üye | aynı, 12 px | fast + base | çapraz geçiş | — |
| Hareket geçildi (sona alındı) | kart sola çıkar, sıradaki gelir; toast alttan | fast + base; `WORKOUT.skipToastMs` | çapraz geçiş | — |
| Akışta sıra değişimi | satır `layout` + vurgu | slow + `DRAG.highlightMs` | anında + vurgu | — |
| Sheet aç / kapa | var olan Sheet | base / fast | saydamlık | — |
| Karusel | Embla sürükleme; "Sonraki ›" ile geçiş | slow, `EASE.enter` | `duration: 0` | — |
| Özet sayıları | 0 → değer | `WORKOUT.countUpMs` | son değer hemen | — |
| Rekor rozeti | ölçek 0,8→1 + vurgu | fast + `DRAG.highlightMs` | saydamlık | `vibrate([20,40,20])` |
| Su içtim | sayı 1,15→1 + geri al hapı | fast, `WORKOUT.waterUndoMs` | saydamlık | `vibrate(10)` |
| Geçmişte silme (onaydan sonra) | yüz dışarı + satır kapanır | `SWIPE.exitMs` + `collapseMs` | anında kapanma | — |

- **Ses:** Web Audio bipleri ilk "Set bitti" dokunuşunda açılır (v1). Ayarlar'da "Antrenman sesi" aç/kapa (yinelenen alarmı da kapatır).
- **Titreşim:** `navigator.vibrate` yalnız Android'de çalışır; iOS Safari'de yok. Her uyarı ses + görsel + metinle de verilir, titreşim tek başına bilgi taşımaz. iOS'ta "kaydedildi" geri bildirimi satırdaki ✓'dur; bu yüzden panel değişmeden önce görünür.
- **Ekran açık kalır:** Screen Wake Lock (iOS Safari 16.4+, ana ekrana eklenmiş uygulamada iOS 18.4+). Destek yoksa ya da iOS'ta ilk dinlenmede kilit uyarısı (§2.5).
- Aynı anda en çok iki belirgin hareket (v1 kuralı); konfeti ve sarsıntı yok (v1'in aşırı yük sarsıntısı kalkar).

---

## 4. Veri

### 4.1 Danışan repo'sunda dosyalar

```
client-<id>/
  sessions/<s_id>.json      bir antrenman = bir dosya; ilk sette oluşur (active → finished; silinince iz dosyası)
  sessions-index.json       özet satırları + silinenler (türetilmiş; dosyalardan onarılır)
  proposals.json            danışandan PT'ye program önerileri (bekliyor → onay/ret)
  water.json                antrenman dışı su (dokunuş listesi)
  program.json              + log türü "client", `clientTargets`, rotasyon (var)
  health.json               yoklamalar ve antrenmana bağlı sağlık ayrıntısı (yalnız onaylıysa; var)
```
- **Yol yalnız kimlikten:** `sessions/<id>.json`. Sunucu dosyayı kimlikle bulur; telefonun gönderdiği tarihten yol kurmaz. Saati ya da saat dilimi farklı bir telefon aynı kimlikle ikinci dosya açamaz. Tarih dosyanın ve index satırının içindedir; sunucu ilk yazımda `todayIn` ile koyar, gece yarısını geçen antrenman başlangıç gününde kalır.
- **Dizin listesi** Contents API'de 1.000 girdide durur; `sessions/` listesi Git Trees API'den okunur (kökün listesindeki `sessions` ağacının sha'sı, ETag'li).
- **`sessions-index.json`:** geçmiş listesi, "bu hafta x/3", hareket deneyimi (§5.2) ve PT'nin bildirimleri **tek okumayla** gelir. Olmasaydı 150 seans dosyası okunurdu. Her satır dosyanın `sha`'sını taşır.
- **Index onarımı:** index okunduğunda (antrenman başlangıcı, geçmiş, PT'nin danışan sayfası) `sessions/` ağacıyla karşılaştırılır: tek GET, ETag'li; 304 birincil kotadan düşmez. Eksik ya da sha'sı farklı satırlar o dosyalardan bellekte yeniden kurulur; index yazımı bir sonraki bitişe biner. Kaybolan bir satır böylece geçmişten, "bu hafta x/3"ten, deneyimden ve motorun girdisinden sessizce düşmez. (`rebuildIndex` yalnız bozuk index'te değil, her farkta çalışır.)
- **Önbellek:** motor yalnız bugünkü hareketlerin son ~8 seans dosyasını okur; önbellek anahtarı `path@sha`, etiketi `session:<id>`. **Bitmiş dosya da değişir** (PATCH: seans RPE'si, su, zorluk, silme); her PATCH index satırındaki sha'yı günceller, silme `revalidateTag('session:<id>')` ile etiketi düşürür. Böylece eski içerik ne yeni sha'yla karışır ne silindikten sonra sunulur.

### 4.2 Seans şeması (SPEC §4'ün genişlemesi; `src/lib/schemas/session.ts`)
```jsonc
{
  "version": 1,
  "id": "s_k2m9x4qa",                    // s_ + 8; idempotent anahtar; dosya yolu buradan
  "status": "active",                    // active | finished | deleted (iz dosyası, §4.5)
  "date": "2026-09-26",                  // sunucu ilk yazımda koyar (todayIn)
  "startedAt": "…", "finishedAt": "…",   // finishedAt yalnız finished'da
  "program": { "revision": 7, "phaseId": "p_…", "dayId": "d_…", "dayName": "Gün A",
               "plannedDayId": "d_…" },   // ≠ dayId → başka gün seçildi
  "rotation": { "value": "advance", "updatedAt": "…", "by": "w_ab12cd" },  // advance | keep
  "adjust": "lighter",                   // isteğe bağlı, nötr; nedeni health.json'da
  "writer": "w_ab12cd",                  // son yazan cihaz; değişiklik karşılaştırmasına girmez
  "order": { "value": ["e_…", "e_…"], "updatedAt": "…", "by": "w_…" },     // "sona al" sırası
  "entries": [
    { "id": "e_q2m8xk", "rowId": "r_…", "blockId": "b_…", "exerciseId": "bench-press",
      "title": "Bench Press",            // adın o günkü hâli: kütüphaneden silinse de geçmiş okunur
      "deviceId": "olympic-bar",         // SPEC §7.3: geçmiş cihaza göre
      "status": "done",                  // pending | done | partial | skipped
      "skip": { "reason": "busy", "moved": true },   // busy | no_equipment | no_time | tired | other
      "swappedFrom": "r_…", "added": false,
      "plan": { "topWeightKg": 62.5, "reason": "increase", "stage": "novice" },
      "setupNote": "Sehpa 3. delik",
      "oneOff": false,                   // yalnız danışan açıkça "Bir defalık"/"Hayır" dediyse (§6.2)
      "lighter": false,                  // plandan hafif, programa yazılmadı (§5.5)
      "updatedAt": "…", "by": "w_…",     // entry düzeyindeki alanların son yazımı
      "sets": [
        { "id": "st_7h2k9m4q", "type": "warmup", "kg": 20, "reps": 10, "at": "…" },
        { "id": "st_…", "type": "working", "setIndex": 0, "kg": 62.5, "reps": 10,
          "effort": "good",              // easy | good | hard (fail yalnız eski kayıtta); yoksa motor good sayar
          "target": { "min": 8, "max": 10 }, "topWeightKg": 62.5, "plannedSetCount": 3,
          "plannedKg": 62.5, "overload": false, "extra": false,
          "at": "…",                     // setin yapıldığı an; düzeltmede değişmez
          "editedAt": "…", "by": "w_…" } // son düzeltme; birleştirme bununla
      ] }                                // süreli: "reps" yerine "seconds"
  ],
  "deletedSetIds": ["st_…"],             // kalıcı iz: rastgele kimlik, kişisel veri değil
  "deletedEntryIds": ["e_…"],
  "waterTaps": [ { "id": "wt_…", "d": 1, "at": "…" }, { "id": "wt_…", "d": -1, "at": "…" } ],
  "notices": [ { "kind": "other_day", "at": "…" } ],   // other_day | program_update | proposal | overload | unfinished | lighter
  "effort": { "sessionRpe": 6, "durationMin": 55, "updatedAt": "…" }
}
```
- Birimler: `kg` cihazda seçilen ağırlıktır, makara oranı uygulanmaz (SPEC §7.3); `reps` tam sayı; `seconds` tam sayı; zamanlar ISO UTC.
- Kimlikler: `s_` + 8, `e_` + 6, `st_` + 8, `wt_` + 8 (`randomId`); cihazda üretilir, yeniden gönderimde aynı kalır.
- **Su** = `waterTaps`'taki `d`'lerin toplamı (en az 0). "Geri al" bir −1 dokunuşudur; dokunuşlar kimlikle birleştiği için azaltma da kalıcıdır ("büyük olan kazanır" kuralı azaltmayı hiç tutmuyordu).
- `toSetResults(entry)` (saf) motorun `SetResult`'ına çevirir: `kg → weightKg`, `reps|seconds → value`, `rowId` ve `deviceId` entry'den her sete dağıtılır. Isınma, `oneOff` ve `extra` setler karara girmez (SPEC §7.1: plandan fazla set karara girmez). `lighter` entry karara nötr girer (§5.5).
- **Sağlık verisi seans dosyasına girmez** (SPEC §4: `health.json`):
  - Ağrı nedeniyle geçilen hareket seansa `skip.reason: "other"`, hafifletme `adjust: "lighter"` olarak yazılır; `pain_skip` bildirimi yok.
  - Ayrıntı `health.json` → `checkIns[]` kaydında: `{ "sessionId": "s_…", "skippedRows": [ { "rowId": "r_…", "reason": "pain" } ], "adjustReason": "readiness" | "pain" }`.
  - Okurken yalnız `canRecordHealth(client, 'check_in' | 'readiness')` doğruysa seansla birleştirilir. Onay çekilince PT ayrıntıyı görmez; seans ve index nötr kalır.
  - `PUT` ve `finish` onay yoksa bu alanları sunucuda siler (istemciye güvenilmez).

`sessions-index.json`:
```jsonc
{ "version": 1,
  "items": [
    { "id": "s_…", "sha": "…", "path": "sessions/s_….json", "date": "2026-09-26", "finishedAt": "…",
      "dayId": "d_…", "dayName": "Gün A", "otherDay": false, "unfinished": false,
      "durationMin": 52, "volumeKg": 4215, "sets": 17, "prs": 2, "water": 3,
      "exercises": [ { "exerciseId": "bench-press", "rowId": "r_…", "deviceId": "olympic-bar",
                       "topKg": 62.5, "sets": 3, "full": true, "reason": "increase", "stage": "novice" } ],
      "notices": ["program_update"] } ],
  "deleted": [ { "id": "s_…", "at": "…" } ] }
```
`full`: en az bir tam yük çalışma seti var (deneyim sayımı, §5.2). `reason` ve `stage`: o günkü planın gerekçesi ve aşaması (hafifletme sayımı; Tanışma'da planlananlar sayılmaz). `deleted`: silinen antrenmanların kimlikleri (değer yok).

### 4.3 Yazma stratejisi (set başına, canlı; SPEC §7)
**Kaynak telefondur.** Etkin seansın tamamı `localStorage`'da tutulur (`pulsecoach.session.<clientId>` → `{ doc, dirty, lastAckAt, restEndsAt }`). Her değişiklikte senkron yazılır; yenileme ya da çökme bir şey kaybettirmez. Belge ~20–40 KB olduğu için IndexedDB gerekmez; her erişim `try/catch` içinde. Özel pencerede ya da dolu depoda belge bellekte kalır ve bir kez "Bu tarayıcıda yedeklenemiyor; sekmeyi kapatma" denir. **Bitiş ya da silme sunucuda onaylanınca yerel kopya silinir.**

**Gönderim (outbox = tek kirli bayrak + son belge):**
- Uçta aynı anda **tek normal istek** vardır; dönünce belge yine kirliyse **son hâl** gönderilir. Kuyrukta işlem listesi yoktur, birleştirme doğaldır.
- **Set bitti** → hemen gönder. Son yazma 15 sn'den yeniyse 15. saniyeye ertele: süperset ve devre turları tek yazmada birleşir.
- Zorluk, su, geçme, sıra ve ayar notu kendi başına yazmaz: sonraki set yazımına ya da bitişe biner. Boşta gönderim **yok** (rev. 1'deki 60 sn'lik gönderim dinlenme ortasında set başına ikinci bir yazma yapıyordu).
- `visibilitychange: hidden` ve `pagehide` → yalnız son onaylı yazımdan beri değişiklik varsa `fetch(…, { keepalive: true })` ile son hâl. Bu istek uçtaki istekle aynı anda gidebilir; birleştirme sıradan bağımsız olduğu için zararsızdır.
- Çevrimdışı birikim bağlantı gelince **tek yazma** olur.

**Birleştirme** (`session-merge.ts`; telefon ve sunucu aynı saf fonksiyonu kullanır). Birleştirme değişmeli, birleşmeli ve idempotenttir: iki belge hangi sırayla gelirse gelsin sonuç aynıdır (test rastgele sıralarla doğrular). Böylece keepalive'ın eski anlık görüntüsü sonra işlense de yeniyi ezemez.
- **Setler ve entry'ler** kimlikle birleşir. Aynı setin iki hâli varsa `editedAt ?? at` büyük olan kazanır; eşitse `by` sözlük sırası (deterministik). `at` setin yapıldığı andır ve düzeltmede değişmez.
- **İzler:** `deletedSetIds` / `deletedEntryIds` birleşimdir ve her zaman kazanır; listedeki kimlik belgeye geri giremez.
- **Entry düzeyindeki alanlar** (`status`, `skip`, `oneOff`, `lighter`, `swappedFrom`, `setupNote`) entry'nin `updatedAt`'iyle; **oturum düzeyindekiler** (`order`, `rotation`, `effort`) kendi `updatedAt`'iyle birleşir: son yazan kazanır, eşitlikte `by`.
- **Su** dokunuşları kimlikle birleşim.
- **Durum** yalnız ileri gider: `active < finished < deleted`.
- `writer` karşılaştırmaya girmez; "değişiklik yoksa yazma" yalnız veriye bakar (farklı cihazın yazması tek başına commit üretmez).
- **PUT birleşmiş belgeyi döner.** Telefon kendi kirli değişikliklerini onun üstüne birleştirip yerel kopyayı günceller; telefondaki su sayısı sunucudakinden sessizce ayrışmaz.

**Sunucu** (`PUT /api/me/sessions/[id]`):
- Yetki çerezden (SPEC §5), Origin denetimi `/api/giris` gibi. Belge şemadan geçer; onay yoksa sağlık alanları silinir (§4.2).
- Yol kimlikten (`sessions/<id>.json`). Dosya yoksa ve kimlik index'in `deleted` listesinde değilse oluşturur.
- Dosya `deleted` ise **410**: telefon yerel kopyayı siler ("Bu antrenman silinmiş").
- Dosya `finished` ise **409 `finished`**; PUT bitmiş dosyayı değiştirmez. Telefonda gönderilmemiş set varsa sorar: "Bu antrenman başka bir cihazda bitirildi. Bu telefondaki 2 set eklensin mi?" [Ekle] (`PATCH { addSets }`) [Ekleme]; sonra yerel kopya silinir.
- Birleştirir. Sonuç kayıttakiyle aynıysa **yazmaz** (aynı belgeyi yeniden göndermek bedava ve zararsız). Değilse `sha`'yla yazar; 409'da taze okuyup bir kez daha birleştirir (`saveProgram` deseni).
- Commit mesajı SPEC §7 biçiminde: `Set 3/3 · Bench Press · 62,5 kg × 10`; birden çok set birleştiyse `(+1 set)`. Sağlık bilgisi (ağrı nedeni) mesaja girmez.

**GitHub istemcisi.** `github/client.ts` `octokit` paketini (v5) kullanıyor; retry ve throttling eklentileri varsayılan olarak açık:
- `plugin-retry` yalnız `[400, 401, 403, 404, 410, 422, 451]`'i yeniden denemez. Yani 409 sha çakışması, 429 ve 5xx aynı eski sha'yla **3 kez**, 1 + 4 + 9 sn beklenerek denenir; uygulamanın "taze oku ve bir kez daha" adımı ~14 sn ve 4 PUT'tan sonra başlar.
- `plugin-throttling` Route Handler'ın içinde `Retry-After` kadar (başlık yoksa 60 sn) bekleyip yeniden dener.
- `toGithubError` 429'u 502'ye çevirir, sınır kaynaklı 403'ü izin 403'ünden ayıramaz, `retry-after` ve `x-ratelimit-remaining` başlıklarını atar; `writeJson` başlık döndürmez.

Bu yüzden:
- Seans yazımları ayrı bir Octokit örneği kullanır (`sessionWriter()`, aynı `assertRepoAllowed` kapısı): `retry.doNotRetry` varsayılana ek **409, 429**; `request.retries: 1` (yalnız 5xx); `throttle.onRateLimit` ve `onSecondaryRateLimit` **`false`** döner (beklemez; karar istemcinin).
- `GithubError`'a `retryAfter`, `rateLimited`, `remaining` alanları eklenir. `toGithubError` 429'u ve sınır kaynaklı 403'ü (`x-ratelimit-remaining: 0` ya da `retry-after` başlığı) `rateLimited` işaretler. `writeJson` yanıt başlıklarını döner.
- Uç 429 + `Retry-After` döner; istemci üstel bekler (5 sn × 2ⁿ, en çok 5 dk, rastgele pay). Veri telefonda durur; üst çubuk çevrimdışıyla aynı dili kullanır.
- `x-ratelimit-remaining` 500'ün altındaysa yanıtta `slow: true`; istemci birleştirme penceresini 60 sn'ye çıkarır.

**GitHub sınırı:** içerik yazan istekler dakikada 80, saatte 500 (SPEC §7) ve bütün danışanlar PT'nin tek token'ını paylaşır.
- Bir antrenman ≈ set başına 1 yazma (17; süperset turları birleşir) + bitişte 3 (tek commit, §4.7) + seyrek keepalive ≈ **20–22 yazma** → saatte ~22 tam antrenman. SPEC §7'nin "set başına bir yazma" hesabı bu kurallarla geçerli kalır.
- Rev. 1'in kurallarıyla gerçek sayı ~40'tı (zorluğun dinlenme ortasında ikinci yazması + her ekran kilidinde keepalive); yukarıdaki üç değişiklik bunu kapatır.
- Sunucu antrenman başına yazma sayısını günlüğe yazar (değer yok); ilk haftalarda ölçülür.

**Başlangıç** ağ beklemez. Plan ve geçmiş `GET /api/me/workout?day=d_…` ile gelir (sunucu `planSession` + deneyim hesaplar; bugünkü hareketlerin son seans dosyaları önbellekten). Plan gelmezse (çevrimdışı) son okunan plan `localStorage`'dan, o da yoksa programın hedefleri ve boş ağırlıkla başlanır.

### 4.4 Devam etme
- `/me` ya da `/me/antrenman` açılınca: yerelde etkin belge varsa imleçten devam edilir. İmleç, `setSlots` sırasında (`order`'la) ilk yapılmamış ve geçilmemiş settir. Dinlenme `restEndsAt` dolmadıysa sürer; dolduysa aşım gösterilir (§2.5).
- Yerelde yok, sunucuda `active` var (başka cihaz, silinmiş depo) → "Kaldığın yerden devam et" sunucudan yükler. İkisi de varsa birleştirilir.
- Sunucu 410 dönerse ya da 409 `finished` sorusu cevaplanınca yerel kopya silinir.
- Yeni başlatırken başka etkin seans varsa v1 seçimi: "Kaldığın yerden devam et" / "Bunu bırak, yenisini başlat". Bırakılan seans `finished` + `unfinished` olur, silinmez.

### 4.5 Silme
- **Etkin seansta set silme:** kimlik `deletedSetIds`'e eklenir, set çıkarılır.
- **Bitmiş seansta set ya da hareket:** `PATCH /api/me/sessions/[id]` `{ deleteSetIds, deleteEntryIds }` → kimlikler iz listelerine eklenir, veri çıkarılır, dosya `sha`'yla yeniden yazılır, index satırı (sha dahil) yeniden hesaplanır.
- **İz listeleri kalıcıdır** (bitişte temizlenmez). Geç gelen bir istek — ikinci cihaz, temizlenmemiş `localStorage`, çevrimdışı kuyruk, silmeden sonra varan keepalive — silineni geri getiremez; setler birleşimle birleştiği için iz olmadan getirirdi.
- **Antrenmanın tamamı:** `DELETE` dosyayı **iz dosyasına** çevirir: `{ "version": 1, "id": "s_…", "status": "deleted", "deletedAt": "…" }` (değer yok). Index satırı çıkar, kimlik index'in `deleted` listesine girer. Sonraki `PUT` 410 alır, ilk seti yeniden yazarak dosyayı diriltemez.
- Tek commit, **genel mesaj: "Kayıt silindi"** (hareket adı, tarih, değer yok).
- Önbellek `revalidateTag('session:<id>')`; telefonun yerel kopyası silinir.
- Rotasyon silmeyle geri alınmaz. "Bu hafta x/3", rekorlar, grafikler ve öneriler türetilmiş olduğu için kendiliğinden düzelir.
- **Silinmeyenler (dürüstlük).** Metin bunları söyler (§2.10 "Ayrıntı"):
  - **Git geçmişi:** dosyanın eski sürümleri ve set commit mesajları (`Set 3/3 · Bench Press · 62,5 kg × 8`, SPEC §7) depoda **kalır**. "Kalabilir" değil, kalır.
  - **Program geçmişi:** danışan kaydı ("Bench Press: çalışma ağırlığı 60 → 65 kg", `sessionId`'li) ve `proposals.json`'daki önerinin `why` metni silinmez; bunlar programın geçmişidir.
  - Tam temizlik geçmişi yeniden yazmayı gerektirir (git-filter-repo, zorla gönderme, GitHub Destek'ten önbellek temizliği). Uygulama bunu yapmaz; metin danışanı antrenörüne yönlendirir. Danışanın bütün verisinin silinmesi repo silme yoludur (SPEC §3, §9.5).

### 4.6 PT tarafı ve bildirimler
- **Canlı görünüm** (SPEC §7): açık antrenman 10 sn'de bir okunur (ETag; 304 birincil kotadan düşmez).
- **Şu an çalışanlar:** dosya adında tarih olmadığından danışan başına `sessions` yolundaki son commit okunur (`GET /commits?path=sessions&per_page=1`, ETag'li). Son 3 saatteyse dosya okunur; `status: active` ise çalışıyor. 3 saattir yazmayan etkin seans "yarım" görünür.
- **Bildirimler ayrı dosyada tutulmaz**, türetilir:
  - Seanslardaki `notices` → index'teki `notices` (nötr; `lighter` ağrı ya da hazır oluşluk demez);
  - `proposals.json`'daki `pending` öneriler;
  - program geçmişindeki `client` kayıtları;
  - sağlık ayrıntısı ("ağrı nedeniyle geçti") yalnız `health.json`'dan ve onay sürdükçe.
- PT Genel bakış'ta "Bildirimler" listesi: "{danışan} Gün B yerine Gün C'yi yaptı", "{danışan} programını güncelledi: Bench Press 60 → 65 kg", "{danışan} 2 değişiklik önerdi", "Bench Press 85 kg (hedef 62,5)", "Gün A yarım bırakıldı (12/17 set)", "Gün A hafifletildi". Okundu bilgisi `client.json` → `inbox.seenAt` (PT yazar; açık soru 7).
- Maliyet: danışan başına index okuması (ETag'li), SPEC §9.7'deki liste okumasıyla aynı düzen.
- E-posta ya da push bildirimi yok (açık soru 11).

### 4.7 Uçlar
| Uç | İş |
|---|---|
| `GET /api/me/workout?day=` | günün planı, geçen seferki değerler, deneyim aşaması, ayar notları |
| `PUT /api/me/sessions/[id]` | birleştir + yaz (idempotent); birleşmiş belgeyi döner; `deleted` → 410, `finished` → 409 |
| `POST /api/me/sessions/[id]/finish` | `{ doc, rotation, decisions }` → **tek commit**: seans `finished` + index + `program.json` (rotasyon, danışan kaydı, `clientTargets`) + gerekirse `proposals.json` |
| `PATCH` / `DELETE /api/me/sessions/[id]` | geçmişte silme (iz listeleri, iz dosyası); `PATCH` ayrıca seans RPE'si, su, `addSets` |
| `POST /api/me/water` | antrenman dışı su (10 sn birleştirilmiş) |
| `POST /api/clients/[id]/proposals/[pid]` | PT: `approve` / `decline` |

Hepsi danışan çerezinden kimlik alır (PT ucu hariç: `requirePt()`), yalnız `client-` repolarına dokunur.

**Bitiş tek commit'tir** (Git Data API, `github/files.ts` → `commitFiles`). Rev. 1'de dört dosya dört ayrı commit'ti; ortada biri düşünce (iki sha çakışması, sınır) seans `finished` kalıyor, yeniden deneme no-op dönüyor, rotasyon, index satırı, danışanın değişikliği ve öneriler kalıcı olarak kayboluyordu. Ters sırada ise tekrar hedefi iki kez uygulanıp sahte bir PT önerisine dönüşüyordu.
1. Dalın ref'ini oku → baz commit ve ağaç; dört dosyayı oku.
2. Değişiklikleri hesapla (saf: `session-finish.ts`).
3. `POST /git/trees` (`base_tree`, içerik satır içi) → `POST /git/commits` → `PATCH /git/refs/heads/<dal>` (`force: false`). 3 yazma, dört PUT'tan az.
4. Ref güncellemesi ileri sarma değilse (arada set yazımı ya da PT kaydı oldu) 1'den bir kez daha; ikinci kez de olmazsa istemci üstel bekler.
- Dört dosya ya birlikte yazılır ya hiçbiri. Seans zaten `finished` ise 200 no-op doğrudur, çünkü aynı commit'te öteki üç dosya da yazılmıştır.
- Yine de her adım `sessionId`'ye göre idempotent: aynı `sessionId`'li `client` kaydı varsa eklenmez; index satırı ve öneriler kimlikle upsert edilir.
- **Rotasyon zamanla korunur:** `completeDay` yalnız `session.startedAt > rotation.lastCompletedAt` ise uygulanır. Çevrimdışı kuyrukta bekleyip sonraki antrenmandan sonra gelen bitiş sırayı geri almaz. (`completeDay` bugün zaman karşılaştırmıyor, `program-plan.ts:702`; denetim çağıranda ya da isteğe bağlı bir parametreyle.)
- Commit mesajı: `Antrenman bitti · Gün A · 17 set` + program değişikliği varsa `· Program (danışan): Bench Press …`.

---

## 5. Öneri algoritması

Öneri her zaman öneridir; danışan başka değer girebilir (SPEC §7.1). **PT'nin satırdaki kuralı (`row.rule`) ve set düzeni hep kazanır**; deneyim yalnız onay koşulunu, artış miktarını ve efor puanının ağırlığını değiştirir.

### 5.1 Var olan motor (değişmez)
- `planSession`: çift ilerleme ya da doğrusal, set başına hedef, yüzdeli setler, AMRAP (+3 → iki adım), eksik antrenman nötr.
- Kaçırmada: hedefin altı → aynı ağırlık; hiçbiri ulaşmadı → ~%5 aşağı; 3 tıkanma → hafifletme (−%15, setler ⅔).
- `nextSetInPlan`: aynı seansta başarısız ya da 3+ eksik → ~%5 aşağı; kolay ve tepede → bir adım yukarı (§2.5'teki "Kolaydı" kısayolu).
- Diğerleri: `warmupSets`, `isOverload`, `device_max`, `applyTolerance` (ağrı), ızgara (`loadSpecFor`, cihazın ağırlıkları).

### 5.2 Hareket deneyimi (exposure) — `src/lib/exposure.ts`
Kaynak `sessions-index.json`. Hesap **egzersiz kimliğiyle** yapılır: beceri harekete özgüdür (Rutherford & Jones 1986), satır ya da gün değişse de sürer. Ağırlık geçmişi ise cihaza göre kalır (SPEC §7.3).
```
exposure(exerciseId, index, now) = {
  sessions:  bitmiş seanslarda full=true olan sayısı (oneOff hariç),
  firstAt, lastAt,
  weeks:     (now − firstAt) / 7 gün,
  gapDays:   now − lastAt,
  deloads:   reason = deload olan seans sayısı; Tanışma'da ya da ayar seansında (calibrate) planlananlar sayılmaz,
}
```

Aşama, **bu sırayla** denenen ilk tutan satırdır (koşullar çakışsa da sonuç tektir: 3 seansı 10 haftaya yayılmış danışan Tanışma'dadır):

| Sıra | Aşama | Koşul | Dayanak |
|---|---|---|---|
| 1 | **Tanışma** | sessions ≤ 3 | Erken kazanç sinirsel ve harekete özgü (Moritani & deVries 1979; Rutherford & Jones 1986); acemi efor tahmini daha az isabetli (Zourdos 2016; Steele 2017) |
| 2 | **İleri** | ≥ 52 hafta ve ≥ 40 seans | NSCA: ≥ 1 yıl ileri; seans eşiği **[sentez]** (seyrek yapılan hareket yıl dolunca ileri sayılmasın) |
| 3 | **Orta** | deloads ≥ 2 **ya da** ≥ 8 hafta **ya da** ≥ 16 seans | NSCA: 2–6 ay orta (ESTC Tablo 17.1, [ikincil]). Rippetoe & Baker'da sıfırlama acemi ilerlemesinin parçasıdır; acemilik, sıfırlamalar ilerleme getirmemeye başlayınca biter. Eşik "2" **[sentez]**; alıntı basılı kaynaktan doğrulanacak (açık soru 14) |
| 4 | **Başlangıç** | geri kalan (4–15 seans, < 8 hafta, deloads < 2) | Kazancın çoğu ilk 4–8 haftada (Kraemer & Ratamess 2004); acemi her seans ilerler (Rippetoe & Baker) |

- **Tek kötü seans aşama atlatmaz:** yalnız `deload` sayılır. `decrease` (bir seansta bütün setler kaçtı) ve Tanışma'nın ~%5 inişi sayılmaz; rev. 1'de "resets ≥ 1" tek kaçırmayla hareketi Başlangıç'ı atlayıp kalıcı olarak Orta'ya taşıyordu.
- **Ara:** `gapDays ≥ 28` → aşama bir iner (en az Tanışma). Dönüşteki ilk seans **ayar seansı** (`calibrate`): planın ağırlığı son üst ağırlığın ~%90'ı, ızgaraya aşağı; kaçırma tıkanma sayılmaz. Detraining'in etkisi dayanaktır (Santos Junior 2021); %10 değeri **[sentez]** (açık soru 3).
- **Genel deneyim tabanı:** uygulamaya deneyimli gelen danışanda her hareket Tanışma'dan başlamasın diye PT danışan formunda "Antrenman geçmişi: yeni / 6 ay+ / 1 yıl+" seçer (`client.json` → `training.experience`, yeni alan; açık soru 4). 6 ay+ → Tanışma tek seanstır (yalnız ayar), sonra en az Başlangıç. 1 yıl+ → en az Orta.

### 5.3 Aşama kuralları — `src/lib/recommend.ts` (`planSession`'ın üstünde ince katman)

| Aşama | Artış koşulu | Artış miktarı | Kaçırma | Zorluk etkisi |
|---|---|---|---|---|
| Tanışma | `planSession` artış der **ve** tam yük setlerinin hepsi Kolay/İyi | 1 ızgara adımı | tam yük setlerinden biri alt sınırın altında → hemen ~%5 aşağı (`decreaseWeight`); **tıkanma serisine ve aşama sayımına girmez**, hafifletme yok | "Kolay" iki adım vermez |
| Başlangıç | `planSession` artışı (tek seans yeter; doğrusalda her başarılı seans) | `inc(W)` | `planSession` | tüm setler Kolay → 2 × `inc`, üst sınır %10 |
| Orta | `planSession` artışı **ve** serideki bir önceki seans da tepede (**2-for-2**) | `inc(W)` | `planSession` | — |
| İleri | Orta ile aynı | 1 ızgara adımı | `planSession` | PT'ye her 4–6 haftada hafifletme ipucu |

- Zorluk artık hareket başına bir kez sorulur ve bütün setlere yazılır (§2.5); "tüm setler Kolay/İyi" kuralları değişmeden çalışır.
- **2-for-2:** NSCA'nın son sette hedefin 2+ üstü, üst üste 2 seans kuralı ve ACSM 2009'un 1–2 tekrar üstü, iki ardışık seans kuralı. Çift ilerlemede "aralığın tepesine bütün setlerde ulaşmak" hedefin üstü sayılır. Koşul tutmazsa öneri `confirm_increase` gerekçesiyle aynı ağırlıkta kalır: "Tepeye ulaştın; bir kez daha yap, sonra artır." (yeni `SuggestionReason`).
- **İleri'de hafifletme ipucu:** lifter'lar ortalama 5,6 ± 2,3 haftada bir hafifletme yapıyor (Bell 2024). Motor takvime göre kendiliğinden hafifletmez; PT'nin program sayfasında ipucu olarak çıkar, periyodizasyon PT'nin kararıdır.

### 5.4 Artış miktarı `inc(W)`
Artış bir yüktür, fark değil. Mutlak ağırlıklarla:
```
pct   = pattern ∈ {squat, hinge, lunge, hip_extension} ve category = compound ? 0.05 : 0.025
lo    = grid.up(W, 1)                          // cihazda bir sonraki ayar
hi    = grid.floor(W × 1.10)                   // ACSM 2009: %2–10
next  = clamp(grid.floor(W × (1 + pct)), lo, hi)
lo > hi (tek adım %10'dan büyük) → önce tekrar eklenir (aşağıda)
lo = W (cihazın en ağır ayarı) → device_max
```
- Rev. 1'deki "ızgaraya aşağı(W × pct)" bir farkı yük gibi yuvarlıyordu: `grid.floor(1,5)` ızgaranın tabanını (bar 20 kg ya da `loadsKg`'nin ilki) döndürür.
- **Dayanak:** NSCA artışları: az antrenmanlıda üst vücut 1–2 kg, alt vücut 2–4 kg; antrenmanlıda 2–4+ ve 4–7+ kg; yüzde olarak %2,5–10 ([ikincil]). ACSM 2009: küçük kas grubunda düşük, büyükte yüksek yüzde, %2–10.
- **Tek adım %10'dan büyükse** (30 kg'lık makinede 5 kg adım = %17) önce tekrar eklenir: satırın aralığı genişletilmeden tepe + 2 tekrara ulaşınca adım atılır. Tekrar eklemek yük eklemek kadar kazanç verdi (Plotkin 2022); kural **[sentez]**. Uzun vadede yük ilerlemesi yine gerekir (Zourdos, SbS 2024).
- **Sonuç her zaman cihazda kurulabilen bir ağırlıktır:** `loadSpecFor` + ızgara, cihazın tavanı → `device_max`.
- Vücut ağırlığı ve süreli harekette motor aynı (+1 tekrar / +5 sn); aşama yalnız 2-for-2 onayını ekler.

### 5.5 Kaçırma, hafifletme, ağrı
- Motorun kuralları sürer. SPEC'in 3 tıkanmada −%15'i StrongLifts'in −%10'undan serttir (açık soru 2); değer tek sabitte (`DELOAD_FACTOR`).
- **Hafif seans motordan saklanmaz.** Plandan hafif yapılıp programa yazılmayan hareket (`lighter: true`) motorun girdisinde kalır:
  - ilk kez **nötrdür**: sonraki seans planın ağırlığıyla (`plannedKg`) kurulur, seri ne artar ne tıkanır;
  - **üst üste ikinci kez kaçırma** sayılır; böylece ~%5 iniş ve 3 tıkanmada hafifletme çalışır.
  - Rev. 1'de cevapsız hafif seans `oneOff` oluyordu; motor onu hiç görmüyor, danışan fazla ağır planda kalıyordu (§5.5'in kendisiyle çelişki). `oneOff` artık yalnız danışan açıkça seçtiğinde yazılır.
- **Az yapılan seans** (plandan hafif ya da eksik tekrar) iki kez üst üste ve Tanışma dışında → §6'daki "hedefi düşürelim mi" sorusu (vücut ağırlığı/süre); ağırlıkta motorun ~%5 inişi.
- Hazır oluşluk ve ağrı yalnız onay varken: `applyTolerance` en son uygulanır ve artışı geri çekebilir.

### 5.6 Set artışı (yalnız PT'ye öneri, asla kendiliğinden)
Hepsi doğruysa bitişteki sheet'te "Antrenörüne öner: Bench Press 3 → 4 set":
1. Aşama ≥ Orta ve deneyim ≥ 4 hafta.
2. Son 2 haftada satırda en az bir `increase` / `add_rep`, hiç `hold` / `decrease` / `deload` yok (ilerliyor).
3. Sağlık onayı varsa son hazır oluşluk ≥ 60.
4. Hareketin hedef kasının son 7 gündeki kesirli seti < 10. ACSM 2026: kas başına haftada ~10 set, en az 2 gün. Hacim arttıkça kazanç azalarak artar (Pelland 2025).
5. Satıra en çok +1 set; kas başına haftada en çok 2 set önerisi. RP: iyi toparlanmada +1, çok iyide +2–3; burada temkinli uç seçildi.
6. Satır 10 seti aşmaz (`SET_LIMITS.perRow`).

### 5.7 Danışana ne, ne zaman

| An | Gösterilen | Kaynak |
|---|---|---|
| Hareket kartı | başlık altında tek satır çip: "↑ +2,5 kg · hedefe ulaştın", "= Bir kez daha, sonra artır", "Tanışma 2/3 · rahat bir ağırlık bul"; tabloda "Önceki" sütunu; panelde "Hedef 8–10" | `recommend` + `REASON_LABELS` (danışan dili) |
| Set arası | yalnız ağırlık değişirse: "Sonraki set 57,5 kg — önceki zorladı"; tepedeyse isteğe bağlı "Kolaydı · sonraki set 65 kg" | `nextSetInPlan` |
| Hareketin son setinden sonra | "Bench Press nasıldı?" Kolay · İyi · Zor | §2.5 |
| Bitiş sheet'i | kilo/tekrar değişikliği, set önerisi | §6 |
| Özet kart 2 | "Gelecek sefer: Bench 65 kg" (bu seans dahil hesap) | `recommend` |
| İlerleme sekmesi | aşama rozeti hareket başına ("Başlangıç · 5. hafta") | `exposure` |

### 5.8 Yeniden kullanım
- **Aynen:** `planSession`, `nextSetInPlan`, `warmupSets`, `isOverload`, `decreaseWeight`, `deloadWeight`, `REASON_LABELS`, `loadSpecFor`, `deviceLoads`, `applyTolerance`, `assessTolerance`, `setSlots`, `planInputFor`, `firstForMuscleRowIds`, `effectiveDeviceId`, `estimateMinutes`, `ROLE_SET_WEIGHT`, `summarizeMuscles`, `nextDayId`, `weekProgress`, `appendLog`, `setsText`, `clientSetText`, `formatKg`, `alternatives.ts`.
- **Küçük değişiklik:**
  - `progression.ts`: `gridOf`'u dışa aç (`floor`, `up`); `SuggestionReason`'a `confirm_increase` ve `calibrate` ekle; `planSession`'a isteğe bağlı `stallCounts: boolean` (Tanışma ve ayar seansı tıkanma saymasın) ve `lighter` girdisi (ilk kez nötr, ikinci kez kaçırma). `EFFORTS` içinde `fail` eski kayıtlar için kalır.
  - `program-plan.ts`: `LogKind`'a `client` ("Danışan güncelledi"); `completeDay`'e zaman denetimi (§4.7); `planInputFor` `clientTargets`'i okur (§6.2).
  - `programs.ts` → `saveProgram`: `clientTargets`'i rotasyon gibi korur, PT'nin değiştirdiği satırın override'ını düşürür (§6.2).
  - `github/client.ts`: `sessionWriter()` (retry/throttle ayarı); `github/errors.ts`: `retryAfter`, `rateLimited`, `remaining`; `github/files.ts`: `writeJson` başlıkları döner, yeni `commitFiles` (Git Data API, tek commit).
- **Yeni saf modüller** (Node test aracıyla; yol takma adıyla çalışma zamanı içe aktarması yok):
  - `exposure.ts`, `recommend.ts`;
  - `workout-cursor.ts` (imleç, geç/sona al, şimdi yap, önceden dolu değerler);
  - `session-merge.ts` (alan başına, sıradan bağımsız; özellik testi);
  - `session-finish.ts` (bitişte dört dosyanın yeni hâli, idempotent);
  - `workout-summary.ts` (tonaj, kaslar, rekorlar, geçen seferle fark);
  - `program-feedback.ts` (§6).

---

## 6. Program güncelleme — `src/lib/program-feedback.ts`

### 6.1 Plan ile yapılanın farkı
Satır başına, `oneOff` olmayan çalışma setleriyle:

| Sapma | Algılama | Tür | Sheet'te seçili | Cevapsız kapanırsa |
|---|---|---|---|---|
| **Ağırlık yukarı** (ağırlıklı) | tam yük setlerinin en ağırı W ≥ plan + 1 adım, bu setlerde tekrar ≥ min, aşırı yük değil | **doğrudan** | ✓ "Bundan sonra W" | sayılır ("Bundan sonra W") |
| Ağırlık yukarı, aşırı yük onaylı | `isOverload` | doğrudan | ✗ "Bir defalık" | `oneOff` |
| **Ağırlık aşağı** | bütün tam yük setleri ≤ plan − 1 adım | doğrudan | ✓ "Bundan sonra W" | `lighter` (§5.5) |
| **Tekrar/süre hedefi yukarı** (vücut ağırlığı, süreli; ya da ağırlıklıda `device_max`) | bütün setler ≥ max + 2 tekrar (süre: ≥ max + 10 sn), bu ve önceki seansta (2-for-2) | doğrudan, yalnız düz setlerde (`isStraight`) | ✓ "Hedef 10–14" | değişmez |
| Tekrar/süre hedefi aşağı | bütün setler < min, üst üste 2 seans | doğrudan, düz setlerde | ✓ "Hedef 6–10" | değişmez |
| Hedef değişimi piramit / back-off / AMRAP satırında | aynı algılama | **PT'ye öneri** | ✓ | gitmez |
| **Set sayısı** | yapılan çalışma seti ≠ `plannedSetCount` (fazla: "+ Set ekle"; az: geçilen), aynı yönde üst üste 2 seans | PT'ye öneri | ✓ | gitmez |
| **Hareket değişimi** | "Değiştir" ile başka hareket | PT'ye öneri ("Bundan sonra X") | ✗ | gitmez |
| **Hareket geçildi** | aynı satır üst üste 2 seans geçildi (aynı neden) | PT'ye öneri ("Çıkar ya da değiştir") | ✓ | gitmez |
| **Hareket eklendi** | seansa eklenen hareket | PT'ye öneri | ✗ | gitmez |
| **Set artışı (algoritma)** | §5.6 | PT'ye öneri | ✓ | gitmez |

- "Sheet'te seçili": "Evet, güncelle"nin uyguladığı ve özet satırlarında görünenler; "Tek tek seç"te onay kutusu işaretli gelir. "Hayır, aynı kalsın" hepsini işaretsiz sayar.
- Aşağı yönde "Evet" danışanın açık onayıdır (sheet satırda "bundan sonra 57,5 kg" yazar). Onaysız gerileme olmasın diye yalnız **cevapsız** kapanışta asimetri kalır: yukarı sayılır, aşağı `lighter` (açık soru 1).
- Tekrar hedefi kaydırma: genişlik korunur, en düşük sete göre kayar (8–12, en düşük set 14 → 10–14). SPEC sınırlarına kırpılır (tekrar ≤ 100, süre ≤ 3600).

### 6.2 Doğrudan güncellenenler (kilo ve tekrar)
- **Ağırlık programda yazılı değildir:** motor her seansı geçmişten planlar (`planSession`; satırda ağırlık alanı yok; `referenceWeights` ve `workWeight` kaldırılan ağırlıktan planlar). Bu yüzden:
  - **"Bundan sonra W"** → veride ek bir şey gerekmez. Program geçmişine danışan kaydı yazılır ve PT'ye bildirim gider.
  - **"Bir defalık"** (yukarı, işaretsiz) → entry `oneOff: true`; motor bu hareketi o seansta yok sayar ve bir önceki seanstan planlar. Hacim ve rekorlarda sayılır.
  - **Aşağı, işaretsiz** → entry `lighter: true` (§5.5); `oneOff` değil.
- **Tekrar/süre hedefi** → `program.json` → **`clientTargets`**; **`revision` artmaz**:
  ```jsonc
  "clientTargets": { "r_…": { "sets": [ … ], "baseSets": [ … ], "sessionId": "s_…", "at": "…" } }
  ```
  - Planlayıcı (`planInputFor`) satırın setleri hâlâ `baseSets`'e eşitse override'ı kullanır; değilse (PT satırı değiştirdi) yok sayar.
  - `saveProgram` override'ları rotasyon gibi korur (`applyProgramEdit` kayıttaki programın üstüne uygulanır). PT aynı satırın setlerini değiştirdiyse override silinir ve PT'nin kaydına "Danışanın hedefi (10–14) kaldırıldı" satırı eklenir: PT kazanır.
  - **Neden:** rev. 1'de danışanın değişikliği `revision`'ı artırıyordu. PT'nin açık düzenleyicisi kaydederken 412 alıyor, tek çıkışı "Sayfayı yenile (değişikliklerin gider)" oluyordu (`program-form.tsx`); yerel taslağı geri yüklemek eski revision'ı taşıdığı için yine 412 alıyordu (`editor-draft.tsx`). Her tekrar hedefi değişikliği PT'nin kaydedilmemiş işini siliyordu.
  - PT'nin düzenleyicisi override'lı satırda rozet gösterir: "Danışan hedefi 10–14 · 26 Eyl". Satırı düzenlemek override'ı devralır.
- **Çakışma güvenliği:** değişiklik satır kimliğiyle ve seansın `target` anlık görüntüsüyle (`baseSets`) uygulanır. Bitiş anında satır silinmiş ya da setleri değişmişse doğrudan yazılmaz, **PT önerisine döner**; danışana "Program o arada değişti; önerin antrenörüne gönderildi." denir.

### 6.3 Kayıt: program geçmişi
Bitişin tek commit'inde (§4.7): rotasyon + danışan kaydı + `clientTargets`.
```jsonc
{ "at": "…", "revision": 7, "kind": "client", "sessionId": "s_…",
  "changes": [ { "scope": "Gün A", "text": "Bench Press: çalışma ağırlığı 60 → 65 kg" },
               { "scope": "Gün A", "text": "Şınav 3×8–12 → 3×10–14" } ] }
```
- Danışan kaydı `revision`'ı artırmaz; o anki revision'ı taşır. `change-log.tsx` anahtarı `revision-at` olduğu için çakışmaz.
- **İdempotent:** aynı `sessionId`'li `client` kaydı varsa yeniden eklenmez.
- Metinler `prescriptionText` / `setsText` ile PT'nin kayıtlarıyla aynı biçimde. `appendLog` kırpması aynı.
- Rozet: `LOG_KIND_LABELS.client = "Danışan güncelledi"`.

### 6.4 PT'ye öneri ve onay akışı
```jsonc
// proposals.json
{ "version": 1, "items": [
  { "id": "pr_k2m9x4", "at": "…", "sessionId": "s_…", "dayId": "d_…", "rowId": "r_…",
    "exerciseId": "leg-press", "kind": "sets",          // sets | target | swap | remove | add | algo_sets
    "from": 3, "to": 4, "text": "Leg Press 3 → 4 set",
    "why": "2 antrenmandır 4 set yapıldı",
    "status": "pending",                                  // pending | approved | declined | stale
    "decidedAt": null, "ptNote": null } ] }
```
- **Danışan:** "Evet, güncelle" ya da "Tek tek seç"te işaretli önerileri gönderir. Geçmiş detayında "Antrenörün önerini onayladı / reddetti" satırı görünür.
- Öneriler `sessionId` + `rowId` + `kind` ile upsert edilir: bitişin yeniden denenmesi çoğaltmaz; aynı satıra aynı türde bekleyen öneri varsa yenisi onu günceller.
- **PT:** danışanın Program sekmesinde en üstte "Danışandan öneriler (2)" kartı; her satırda [Uygula] [Reddet] (isteğe bağlı not).
  - Uygula → sunucu değişikliği programa uygular, `saveProgram` yolundan geçer: `applyProgramEdit` farkı yazar ("Leg Press 3×10–12 → 4×10–12"), `revision + 1`, log türü `edit`. Öneri `approved` olur.
  - PT düzenleyicide kaydedilmemiş değişiklik varsa Uygula düzenleyiciyi açar ve değişikliği taslağa ekler, kaydı PT yapar.
  - Satır o arada silindiyse `stale` → "Program değişti; öneri uygulanamadı".
- Bekleyen öneri 30 gün sonra listede soluklaşır; silinmez.

### 6.5 Danışanın kendi programı (SPEC §6)
Program danışanınsa bütün değişiklikler (set sayısı dahil) doğrudan uygulanır ve `client` kaydı yazılır; tekrar hedefi override değil satırın kendisine yazılır (düzenleyiciyi danışan kullanır). PT ile paylaşılmışsa PT geçmişte görür. Sheet'te "Antrenörüne öner" yerine "Programa yaz".

---

## 7. Erişilebilirlik ve kenar durumlar

**Erişilebilirlik**
- Dokunma hedefleri: antrenmanda birincil 56 px, satır 48 px, başka yerde ≥ 44 px; aralarında ≥ 8 px. 375 px'te yatay taşma yok.
- Stepper adları: "Ağırlık, 62,5 kilogram", "Tekrar, 10". Set tablosu gerçek `<table>`. Durum ikonları metinle birlikte (✓ "yapıldı", ↷ "geçildi"); renk tek başına bilgi taşımaz.
- **Tek `aria-live` bölgesi** (düzenleyici ilkesi): set kaydı, "10 saniye kaldı", "Dinlenme bitti. Hazırsın.", "Bench Press tamamlandı. Sıradaki: Squat.", "Calf Raise sona alındı."
- Odak yönetimi:
  - hareket değişince yeni kartın başlığı;
  - sheet kapanınca açan düğme;
  - bitirme sorusunda birincil eylem (silme onayında Vazgeç).
- **Karusel:**
  - `role="region"`, `aria-roledescription="carousel"`;
  - kartlar "2 / 4, Rekorlar ve gelişim";
  - "Sonraki ›" ve ←/→ tuşları; kendiliğinden ilerleme yok.
- Hareket azaltma: §3 sütunu; sayarak gelen sayılar son değerle başlar.

**Kenar durumlar**

| Durum | Davranış |
|---|---|
| Ekran kilitlendi / uygulama arkada | Sayaç `restEndsAt`'ten, dönünce doğru; bittiyse aşım gösterilir. Kilitliyken ses garanti değil (iOS'ta push yalnız ana ekran uygulamasında ve sunucu gönderimi ister): ilk dinlenmede panelde uyarı (§2.5), Ayarlar'da da not. Wake Lock etkin |
| Sekme değişti | `visibilitychange`'de sayaç yeniden hesaplanır; değişiklik varsa son hâl `keepalive`'la gider |
| Yenileme / çökme | `localStorage`'dan imleçle devam (4.4) |
| İki cihaz | Sunucu belgeyi alan başına, sıradan bağımsız birleştirir (4.3). `writer` farklıysa ve 2 dk içinde yazdıysa "Bu antrenman başka bir cihazda da açık" bandı. Silme iz listeleriyle kalıcı |
| Başka cihazda bitirildi | 409 `finished` → "Bu telefondaki 2 set eklensin mi?" [Ekle] [Ekleme]; sonra yerel kopya silinir |
| Silinmiş antrenmana geç istek | 410; yerel kopya silinir, veri geri gelmez |
| Ağ yok | Üst çubuk: "Çevrimdışı · 3 set telefonda". Bitiş de çevrimdışı çalışır: özet yerelden hesaplanır, bitiş kuyrukta, "Bağlantı gelince antrenörüne gider". Geç gelen bitiş rotasyonu geri almaz (4.7) |
| GitHub 429 / 5xx | Uç 429 + `Retry-After`; Octokit Route Handler'da beklemez (4.3). Çevrimdışıyla aynı dil ve bekleme; veri kaybı yok. 4xx şema hatası → "Kayıt gönderilemedi · Tekrar dene" + günlük (değer yazılmaz) |
| Bitiş yarıda kesildi | Tek commit: ya hepsi ya hiçbiri; istemci yeniden gönderir (4.7) |
| Oturum düştü (erişim kapatıldı, 401) | Veri telefonda kalır: "Oturumun kapandı; kayıtların bu telefonda. Antrenörüne yaz." Yeni girişte aynı danışansa gönderilir |
| Sağlık onayı yok / geri çekildi | Yoklama sheet'i, "Ağrı" nedeni ve hazır oluşluk ayarı hiç görünmez. Motor `applyTolerance`'sız çalışır. Sunucu `health.json` yazmasını reddeder ve seans belgesindeki sağlık alanlarını siler; eski seanslardaki ayrıntı `health.json`'da kaldığı için PT'ye görünmez |
| Boş program / boş gün | Bugün'de `Empty`; başlatılamaz |
| PT antrenman sırasında programı kaydetti | Seans başlangıçtaki günün anlık görüntüsüyle sürer. Bitişte rotasyon `dayId`'yle; tekrar hedefi `baseSets` denetimiyle (6.2); ref ileri sarma değilse bitiş yeniden hesaplanır (4.7) |
| Danışan tekrar hedefini değiştirirken PT düzenleyicisi açık | `revision` artmaz; PT'nin kaydı 412 almaz, override korunur ya da PT'nin değişikliğiyle kalkar (6.2) |
| Gün silindi / evre değişti | `completeDay` sessizce geçer; seans yine kaydedilir |
| Egzersiz kütüphaneden silindi | Planda satır çizilmez (var olan kural), geçilmiş sayılmaz. Geçmişte `title` anlık görüntüsü + "kütüphanede yok" |
| Cihaz silindi | `effectiveDeviceId` egzersizin cihazına döner; ağırlık ızgarası ona göre |
| Aynı gün iki antrenman | İzinli; "bu hafta x/3" günü bir kez sayar (`weekProgress`) |
| Çok uzun ara (> 6 sa) | Açılışta "Yarım kalan antrenman" sheet'i. Kendiliğinden bitirme yok |
| `localStorage` kapalı | Bellekte sürer, bir kez uyarı; gönderim daha sık (birleştirme penceresi 0) |
| Gece yarısı / farklı saat dilimi | Tarih sunucunun ilk yazımda koyduğu başlangıç günü; yol kimlikten olduğu için ikinci dosya açılmaz |

---

## 8. Uygulama fazları ve açık sorular

Her faz tek başına yayınlanır, 375 px'te doğrulanır, saf mantık `npm test` ile sabitlenir.

| # | Faz | Çıktı |
|---|---|---|
| 1 | **Danışan kabuğu** | `(sekmeler)` layout + dock (Bugün · Geçmiş · İlerleme), `Empty` durumlu `/me/gecmis` ve `/me/ilerleme`, sayfa alt boşluğu, `/me/antrenman` dock'suz iskelet |
| 2 | Seans verisi | `schemas/session.ts` (iz listeleri, `waterTaps`, `editedAt`, `updatedAt`), `session-merge.ts` (sıradan bağımsız, özellik testi), `workout-cursor.ts`, `toSetResults`, `sessions-index.json` okuma/onarma/yazma, `sessionWriter()` ve `GithubError` alanları, `commitFiles`, `PUT`/`finish` uçları (410/409, tek commit, rotasyon zaman denetimi), testler |
| 3 | Hareket ekranı v0 | tek hareketli bloklar: önceden dolu set (geçen sefer / aralığın altı), "Set bitti" + ✓ + 400 ms kilit, dinlenme (zaman damgalı, 208 px, ±15, −10 sn bip, yinelenen alarm, kilit uyarısı, Wake Lock), Su içtim, `localStorage` outbox, devam etme, basit bitir; Bugün'de "Antrenmana başla" ve yarım kart; rotasyon |
| 4 | Set türleri ve gruplar | süperset/devre/kompleks turları, AMRAP, süreli set, ısınma, ayar notu çipi, aşırı yük uyarısı, zorluk hareket başına + "Kolaydı" kısayolu |
| 5 | Akış ve geçme | ☰ sheet, şimdi yap, tek dokunuş geç + toast, Geçilenler, Değiştir, hareket ekle |
| 6 | Bitirme ve bildirim | "bitirelim mi?", erken bitir (hazır rotasyon satırı, kapalı neden), başka gün seçme, `notices`, sağlık ayrıntısının `health.json`'a ayrılması, PT Genel bakış'ta Bildirimler |
| 7 | Öneri katmanı | `exposure.ts` (yalnız deload sayımı, aşama sırası), `recommend.ts` (aşamalar, 2-for-2, mutlak `inc`, ayar seansı, `lighter`), kart gerekçeleri |
| 8 | Program güncelleme | `program-feedback.ts`, tek soruluk bitiş sheet'i + "Tek tek seç", `client` log türü, `clientTargets` + `saveProgram` koruması + düzenleyici rozeti, `proposals.json`, PT'nin öneri kartı |
| 9 | Özet karuseli + geçmiş | 4 kart, rekorlar, geçen seferle fark; `/me/gecmis` liste, detay, onaylı silme (üst üste düğmeler, iz dosyası, genel commit mesajı, önbellek etiketi) |
| 10 | İlerleme sekmesi | hareket grafikleri (e1RM, üst ağırlık), haftalık tonaj ve kas yükü, rekorlar, başarılar |
| 11 | Yoklama | hazır oluşluk ve ağrı sheet'i (SPEC 5b ile), hafifletme sorusu |
| 12 | PT canlı görünüm | şu an çalışanlar (son commit), açık antrenman 10 sn |
| sonra | Programlar sekmesi | danışanın kendi programları, "PT ile paylaş" |

**Onaylanınca SPEC'e yansıyacaklar** (bu belge SPEC'i değiştirmez):
- §7.1 "Zorluk: danışan her çalışma setinden sonra… Kolay / İyi / Zor / Başaramadım" → "hareketin son çalışma setinden sonra bir kez: Kolay / İyi / Zor; cevap bütün setlere yazılır. Ara setlerde yalnız tepedeyken isteğe bağlı 'Kolaydı' kısayolu. Tekrar < alt sınır kaçırmadır; `fail` yalnız eski kayıtlarda."
- §4 seans dosyası: yol `sessions/<id>.json`, iz listeleri, `waterTaps`, sağlık alanlarının `health.json`'a ayrılması.
- §7 yazma: bitiş tek commit (Git Data API); set başına ~1 yazma hesabı aynı kalır.

**Açık sorular** (her birinde önerilen karar var; PT onaylamazsa değişir)
1. Cevapsız kapanan ağırlık sapması: yukarı sayılır, aşağı `lighter` (bir kez nötr, ikincide kaçırma). "Evet"le açık onayda aşağı da yazılır. Öneri: kabul.
2. 3 tıkanmada hafifletme −%15 (SPEC, v1) mı, −%10 (StrongLifts) mı? Öneri: −%10'a inmek, set ⅔ kalsın.
3. 4+ haftalık aradan dönüşte ~%90 ile ayar seansı: kaynaklı bir sayı yok. Öneri: sabit olarak tut, PT ayarlayabilsin.
4. Danışan formuna "Antrenman geçmişi" (yeni / 6 ay+ / 1 yıl+) alanı eklensin mi? Öneri: evet; yoksa deneyimli danışan her harekette Tanışma'dan başlar.
5. Tonaj başarısız setteki yapılan tekrarı saysın mı (v2 önerisi) yoksa v1 gibi dışlasın mı? Öneri: saysın.
6. Geçmişte silmenin yanında düzeltme de olsun mu? v1 24 saat sonra kilitliyordu. Öneri: yalnız silme ve su ±1; set düzeltme etkin seansta.
7. PT'nin bildirim "okundu" bilgisi `client.json` → `inbox.seenAt`'te mi? Öneri: evet (PT'ye ait tek zaman damgası).
8. Karusel: shadcn `Carousel` (Embla bağımlılığı) mı, CSS `scroll-snap` mı? Öneri: base-nova kaydında varsa shadcn, yoksa scroll-snap (prototip scroll-snap'le çalışıyor).
9. Silme PT'ye bildirilsin mi? Öneri: hayır (danışanın verisi). Commit mesajı genel kalır ("Kayıt silindi").
10. Seans RPE'si (CR-10) 10 dk sonra Bugün kartında mı, özetin son kartında mı? SPEC ~10 dk diyor. Öneri: Bugün kartı.
11. Antrenöre e-posta ya da push bildirimi? Öneri: şimdilik yalnız uygulama içi.
12. Avatar menüsündeki "Programım" dock'taki Bugün ile aynı yeri açıyor. Öneri: bütün günleri ve program geçmişini gösteren `/me/program`.
13. Dinlenme ±15 değişikliği programa öneri olsun mu? Öneri: hayır, yalnız o dinlenme.
14. Orta aşamaya geçiş eşiği "2 hafifletme" **[sentez]**; Rippetoe & Baker'daki sıfırlama anlatımı basılı kaynaktan doğrulanacak. Öneri: 2; PT değiştirebilsin.
15. Dinlenme alarmı 15 sn'de bir, en çok 3 kez yinelensin mi? Öneri: evet; Ayarlar'daki "Antrenman sesi" hepsini kapatır.
16. Set commit mesajlarında değer kalsın mı (SPEC §7: `62,5 kg × 10`)? Değersiz mesaj silmede daha az iz bırakır, ama dosyanın eski sürümleri değerleri yine taşır. Öneri: SPEC biçimi kalsın, silme metni "kalır" desin.

**Reddedilen ya da değiştirilerek alınan öneriler** (rev. 1 incelemeleri)
- **Veri 3 — cihaz başına `seq` sayacı:** reddedildi. Alan başına `updatedAt` + `by` ve kalıcı iz listeleri birleştirmeyi zaten sıradan bağımsız yapıyor; aynı cihazın eski anlık görüntüsü daha eski `updatedAt` taşıdığı için sayaç bir şey eklemez.
- **Veri 4 — set yazımını zorluk seçilene ya da "Set bitti"den 20 sn sonrasına ertelemek:** reddedildi. Zorluk artık hareket başına bir kez (UX 4); set başına ikinci yazma kalmadı. Ertelemek PT'nin canlı görünümünü geciktirir, telefonda kaybolma penceresini büyütürdü. Öteki üç madde (boşta gönderim yok, keepalive yalnız değişiklikte, Octokit ayarı) alındı.
- **Veri 2 — bitmiş seansa gelen PUT'a da 410 ve yerel kopyayı atmak:** değiştirilerek alındı. 410 yalnız silinmiş seansta; bitmiş seansta 409 `finished` ve danışana sorulur. İkinci cihazda kaydedilmiş setler sessizce yok olmasın.
- **Veri 1 — iki seçenekten biri:** tek commit (Git Data API) seçildi; `sessionId` idempotentliği ve rotasyon zaman denetimi yine de eklendi, index onarımı her okumada.
- **UX 4 — ara setlerde hiç zorluk göstermemek:** değiştirilerek alındı. Tepedeyken isteğe bağlı "Kolaydı · sonraki set 65 kg" çipi kaldı; yoksa `nextSetInPlan`'in "kolay ve tepede → bir adım" kuralı hiç çalışmaz. Soru değildir, dokunulmazsa bir şey olmaz.
- **UX 8 — "Ana sayfa" etiketi:** dock'taki adla aynı olsun diye "Bugün'e dön" kaldı; düzen (1–3'te "Sonraki ›" birincil, dönüş ikincil metin) aynen alındı.
- **UX 7 — silme metni "kalabilir":** Veri 8 ile birleştirildi; veri depoda gerçekten kaldığı için metin "kalır" der.

**Kaynaklar:** ACSM Position Stand 2009 (*MSSE* 41(3):687–708) · ACSM 2026 (*MSSE*, PubMed 41843416) · Haff & Triplett, *ESTC* 4. bs., Bölüm 17 ([ikincil]) · Kraemer & Ratamess 2004 (*MSSE* 36(4):674–688) · Moritani & deVries 1979 · Rutherford & Jones 1986 · Rippetoe & Baker, *Practical Programming* 3. bs. · Plotkin 2022 (*PeerJ* 10:e14142) · Pelland 2025 (*Sports Med*) · Bell 2024 (*Sports Med Open*) · Zourdos 2016 (*JSCR*) · Steele 2017 (*PeerJ*) · Halperin 2022 (*Sports Med*) · Santos Junior 2021 (*SCJ*) · StrongLifts "failure" · RP Strength "Volume Landmarks" · Hevy, Strong, Fitbod, JEFIT yardım sayfaları · NN/g mobil karusel ve otomatik ilerleme · WebKit web push · caniuse Wake Lock · GitHub "Removing sensitive data" · GitHub REST "Rate limits" ve "Git database" · `@octokit/plugin-retry`, `@octokit/plugin-throttling` (node_modules). Bağlantılar araştırma notunda (bu belgenin girdisi).
