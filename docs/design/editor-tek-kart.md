# Önerilen tasarım: "Tek kart"

> **PT kararları (2026-09-24):**
> 1. Görünür "Sıra ▾" seçici **YOK**; sıralama yalnız sürükle-bırak (klavye Alt+ok ve ekran okuyucu şeridi gizli yol olarak kalır). §1, §2, §4'teki "Sıra ▾" satırları geçersiz.
> 2. ⧉ Kopyala kart yüzünde **hep görünür**.
> 3. Sola tam kaydırma **onaysız siler**, 8 sn "Geri al".
> 4. 2'li süpersetin üstüne 3. hareket bırakılınca **devreye döner** ("Ekle · devre olur").
> 5. "Değiştir" editörden kalkar (PT isteği).

Temel C. Üstüne A'nın jestleri ve set düzenlemesi, B'nin grup kurma akışı ve kısayolları eklendi.

## 0. Neden bu karışım
- **C'den (temel):** Her şey (tek hareket, grup, grup üyesi, antrenman) aynı kapalı kartı kullanır. Sola kaydırma = sil, sağa kaydırma = kopyala. Sürükleme dnd-kit/core ile, kartlar canlı kaymaz, bırakılacak yeri bir ekleme çizgisi gösterir. Grup tek bir kaptır ve üyeleri çizgiyle ayrılmış bölümlerdir (kart içinde kart yok).
- **A'dan:** `useCardGesture` hakemi. Üye ve grup kaydırma eşlemesi (grup tam kaydırmayla silinemez). Stepper + v1 tekrar çipleri + "Setleri ayrı düzenle" açılır bölümü. Telefonda dıştaki Card çerçevesinin kalkması. Süperset üyesi kopyalanınca grup sessizce devreye dönmez.
- **B'den:** Çoklu seçimli "Grup kur" sayfası. Alt+→/← ve Delete kısayolları. `DndContext id=useId`. Fazlı teslim.
- **Atılanlar:** A'nın özel sürükleme motoru. B'nin canlı kayma + birleştirme, reçete alanı (sonraya ertelendi), toplu seçim ve hover ikonları. C'nin hep açık set tablosu, çipsiz düzeni ve görünür "Sonrakiyle grupla" düğmesi.

| Çatışma | Karar | Gerekçe |
|---|---|---|
| Sürükleme motoru (A: özel, B: sortable, C: core) | **@dnd-kit/core**, sortable yok | Otomatik kaydırma, overlay ve gruplar arası taşıma hazır geliyor. Kartlar yerinde durduğu için "üstüne bırak" net ayırt edilir. |
| Basılı tutma süresi | Editörde **350 ms**, antrenmanda **400 ms** (token) | 200 ms dokunmayı yakalıyordu. Antrenmanda eller terli. |
| Telefonda ⧉ kart yüzünde mi | **Evet**, 44 px | PT'nin açık isteği. |
| Kaydırma eşlemesi | A'nınki | Grubu tek hamlede silmek imkânsız olur. |
| Set düzenleme | A'nınki (stepper + çip + açılır bölüm) | Vakaların %80'i düz set. v1 kartlarını PT sevmişti. |
| Görünür taşıma yolu | Yalnız **açık kartta** "Sıra: 3 ▾" | WCAG 2.5.7'yi karşılar. 25. kartı 2. sıraya taşımak sürüklemekten kolay. (Açık soru 2) |
| Masaüstünde hover ikonları | **Yok** | ⧉ hep görünür. Sil açık kartta ve Delete tuşunda. |

## 1. Kart anatomisi (375 px)
Sayfa kenar boşluğu 16 px, liste 343 px. Telefonda "Hareketler" Card'ının çerçevesi ve iç boşluğu kalkar (`max-sm:ring-0 px-0 bg-transparent`). Kartın 1 px kenarı ve `px-3` boşluğuyla içerik alanı 317 px kalır.

**Kapalı** (varsayılan; telefonda aynı anda tek kart açık):
```
┌──────────────────────────────────────────┐ 343
│ ┌──┐ Barbell Bench Press          [⧉]  ⌄ │ yüz ≥ 60 px
│ │ 1│ 3 × 8–12 · son set AMRAP · 90 sn  🗒 │
│ └──┘                                     │
└──────────────────────────────────────────┘
 rozet 28 | 12 | başlık ≈205 (2 satır) | ⧉ 44 | ⌄ 20
```
- Yüzün tamamı gerilmiş bir `<button aria-expanded>`. ⧉ bu düğmenin üstünde duran kardeş bir düğme: `z-10`, 44×44, `aria-label="Kopyala: Bench Press"`, `data-no-dnd`.
- Rozet artık tutamak değil, yalnızca etiket.
- Meta satırı `setsText()` + dinlenmeden oluşur. Kural, cihaz ve not işaretleri meta satırının sonunda 14 px ikon olarak durur (her birinin aria-label'ı var). Bugünkü rozet satırı kalkar.
- Kütüphanede olmayan hareket: başlık kırmızı "Silinmiş egzersiz", ⧉'nin yerinde 🗑 "Sil".

**Kaydırınca** (yalnızca yüz kayar, açık gövde yerinde kalır):
```
 sağa →                                  ← sola
┌────────┬─────────────────────┐ ┌─────────────────────┬────────┐
│   ⧉    │ 1 Bench Press     ⌄ │ │ Bench Press   [⧉] ⌄ │   🗑    │
│Kopyala │   3×8–12 · 90 sn    │ │ 3×8–12 · 90 sn      │  Sil   │
└────────┴─────────────────────┘ └─────────────────────┴────────┘
  72 px, primary                               72 px, destructive
```

**Açık** (telefon):
```
┌──────────────────────────────────────────┐
│ ┌──┐ Barbell Bench Press          [⧉]  ⌃ │
│ │ 1│ 3 × 8–12 · 90 sn                    │
├──────────────────────────────────────────┤
│ Set               Dinlenme               │
│ [−]  3  [+]       [−] 90 sn [+]          │ 132+8+152 = 292 px
│ Hedef  [ 8 ] – [ 12 ] tekrar             │
│ (5)(8)(10)(12)(6–8)(8–12)(12–15) →       │ v1 çipleri, yatay kayar
├──────────────────────────────────────────┤
│ Setleri ayrı düzenle · %, AMRAP        ⌄ │ 44 px
├──────────────────────────────────────────┤
│ Ayrıntılar · kural · not               ⌄ │ 44 px
├──────────────────────────────────────────┤
│ [Sıra: 1 ▾]                     [🗑 Sil] │ 44 px
└──────────────────────────────────────────┘
```
"Setleri ayrı düzenle" açılınca:
```
│ Düzen [ Düz ][ Piramit ][ Back-off ]     │ yalnız ağırlıklı
│ 1  [ 8 ]–[ 12 ]  %[100]  [ AMRAP ]       │ 20+52+12+52+64+72+gaps = 296
│ 2  [ 8 ]–[ 12 ]  %[ 90]  [ AMRAP ]       │ <360 px'te % ve AMRAP
│ 3  [ 8 ]–[ 12 ]  %[ 80]  [●AMRAP ]       │ ikinci satıra kayar
```

**Masaüstü** (≥ md). İçerik aynı, yalnızca yatay yerleşir. ≥ lg'de birden çok kart açık kalabilir.
```
┌───────────────────────────────────────────────────────────────────────┐
│ [1] Barbell Bench Press                                        [⧉]  ⌄ │
│     3 × 8–12 · son set AMRAP · 90 sn · Göğüs · Olympic Bar            │
├───────────────────────────────────────────────────────────────────────┤
│ Set [−] 3 [+]   Dinlenme [−] 90 sn [+]   Hedef [8]–[12] tekrar        │
│ (5)(8)(10)(12)(6–8)(8–12)(12–15)                                      │
│ Setleri ayrı düzenle ⌄                    Ayrıntılar · kural · not ⌄  │
├───────────────────────────────────────────────────────────────────────┤
│ [Sıra: 1 ▾]                                                  [🗑 Sil] │
└───────────────────────────────────────────────────────────────────────┘
```

**Grup.** Tek kap: `border-primary/40`, %4 primary zemin. Üyeler ince çizgiyle ayrılan bölümlerdir ve 317 px genişliği korur.
```
╭──────────────────────────────────────────╮
│ ┌──┐ Süperset                     [⧉]  ⌄ │ grup yüzü
│ │ 2│ 2 hareket · 3 tur · 90 sn tur sonu  │
├──────────────────────────────────────────┤
│ 2a  Bench Press                   [⧉]  ⌄ │ üye yüzü (aynı anatomi)
│     3 × 8–12                             │
├──────────────────────────────────────────┤
│ 2b  Cable Row                     [⧉]  ⌄ │
│     3 × 10–12                            │
├──────────────────────────────────────────┤
│ [ + Gruba hareket ekle ]            h-11 │
╰──────────────────────────────────────────╯
```
Grup yüzü açılınca ayarlar, yüz ile üyelerin arasında görünür:
```
│ Tür  [ Süperset ][ Kompleks ]            │ kindOptions(n)
│ Tur              Tur sonu dinlenme       │
│ [−] 3 [+]        [−] 90 sn [+]           │
│ İstasyon arası [−] 15 sn [+]   (devre)   │
│ İki hareket arka arkaya; dinlenme turun  │
│ sonunda.                                 │
│ [Sıra: 2 ▾]          [Grubu dağıt] [Sil] │
```
Açık üyede dinlenme alanı yok. Yerine şu satır çıkar: "Dinlenme grup ayarlarında." Alt çubuk: `[Sıra: 2a ▾] [Gruptan çıkar] [🗑 Sil]`.

## 2. Jest haritası
| Hedef | Dokunmatik | Fare / kalem | Klavye (yüz odakta) |
|---|---|---|---|
| Aç / kapat | Dokun (<350 ms, <8 px) | Tıkla | Enter / Space, Esc kapatır |
| Taşı | 120 ms'de basılı tonu, **350 ms'de kalkar** (Android'de vibrate 10) | Bas ve 6 px sürükle, gecikme yok | Alt+↑/↓, Alt+Home/End |
| Grupla | Sürüklerken kartın ortasında 250 ms bekle, sonra bırak | Aynı | Alt+→ = öncekiyle grupla |
| Gruptan çıkar | Üst düzeye sürükle, ya da üyeyi sağa kaydır → "Çıkar" | Üst düzeye sürükle, ya da açık üyede "Gruptan çıkar" | Alt+← (grup yüzünde: grubu dağıt) |
| Kopyala | ⧉, ya da sağa tam kaydır | ⧉ | ⧉'ye Tab ile gelip Enter |
| Sil | Sola tam kaydır (8 sn "Geri al") | Açık kartta "Sil" | Delete / Backspace (+ Geri al) |
| İptal | Liste dışına bırak, ya da pointercancel | Esc | Esc |

- **Hakem (`useCardGesture`):** 350 ms dolmadan |dx|>10 ve |dx|>1,5·|dy| olursa kaydırma başlar (yalnız `pointerType==='touch'`, `dragControls.start`). |dy|>8 olursa sayfa kayar (`touch-action: pan-y`). Sürükleme etkinken kaydırma kapalıdır. Kaydırma paneli açıksa basılı tutmak önce paneli kapatır. Kaydırma ya da sürüklemeden sonra gelen click yutulur. Yüzde `select-none` ve `-webkit-touch-callout:none` var, contextmenu engellenir.
- **Sürüklerken:** kaynak kartın yerinde kesik çizgili bir yer tutucu kalır. Parmağın altında yalnızca yüzden oluşan bir overlay durur (ölçek 1.02, ring-2 primary/40; reduced-motion'da ölçek yok). Kardeş kartlar kaymaz. Bırakılacak yeri 2 px'lik bir çizgi ve 8 px'lik bir nokta gösterir; grup içinde çizgi 12 px içeriden başlar. Ekranın üst ve alt 80 px'i otomatik kaydırma bölgesidir. Dock `data-reordering` ile gizlenir.
- **Bırakınca:** forma tek yazım yapılır. 1,2 sn vurgu. Ekran okuyucu "Bench Press 3. sıraya taşındı" der. Sıralamada Geri al toast'u yok (geri sürüklemek yeter).
- **Ekran okuyucu (dokunmatik):** yüzün hemen arkasında sr-only bir şerit var: "Yukarı taşı · Aşağı taşı · Öncekiyle grupla / Gruptan çıkar". Klavyeyle odaklanınca görünür olur. Görünür yol ise açık karttaki "Sıra ▾" ve "Sil".
- **Kopya metinleri:**
  - Telefon açıklaması: "Karta dokun: düzenle. Basılı tutup sürükle: sırala; bir kartın ortasına bırak: grupla. Sola kaydır: sil, sağa kaydır: kopyala."
  - Masaüstü açıklaması: "Karta tıkla: düzenle. Tutup sürükle: sırala; bir kartın ortasına bırak: grupla. Alt + ok tuşları taşır."
  - İlk kullanımda bir kez ilk kart 40 px sola "göz kırpar" (localStorage, try/catch içinde). Reduced-motion'da bunun yerine şu satır çıkar: "İpucu: kartı sola kaydır → sil, sağa kaydır → kopyala".

## 3. Kaydırma eşlemesi
Kural: sağda olumlu işlemler, solda sil ve dağıt. Bir tarafta tek işlem varsa tam kaydırma onu tetikler (Easy Dude kuralı).

| Öğe | Sağa → (soldan açılır) | ← Sola (sağdan açılır) |
|---|---|---|
| Tek hareket | [Kopyala] (tam kaydırma) | [Sil] (tam kaydırma) |
| Grup üyesi | [Kopyala][Çıkar] (tam kaydırma yok) | [Sil] (tam kaydırma) |
| Grup yüzü | [Kopyala] (tam kaydırma) | [Dağıt][Sil] (tam kaydırma **yok**) |

- Değerler: işlem genişliği 72 px. Tam kaydırma eşiği satırın %45'i (343 px'te ≈154 px). Fırlatma 400 px/sn'de paneli açar ama işlemi tetiklemez. Yay: 500/40.
- Eşik geçilince panel parmağa kadar uzar, ikon kenarı izler ve bir kez vibrate(8) olur. Parmak eşiğin altına dönerse iptal.
- Aynı anda tek panel açık (SwipeGroup). Kaydırma, başka bir kartı kaldırmak, Esc ya da dışarı dokunmak paneli kapatır.
- Panel düğmeleri `aria-hidden` ve `inert`. Hepsi başka yerdeki görünür düğmelerin kopyası.
- Sil: yüz sola çıkar, satır yüksekliği 220 ms'de kapanır. Toast: "Bench Press silindi · Geri al" (8 sn).

## 4. Gruplama
**Kurmanın iki yolu (PT maddesi 6):**
1. **Üstüne bırak.** Hedef kartın yüzü üç banda ayrılır: üst %25 = önüne, alt %25 = arkasına, orta %50 = birleştir. Birleştirme ancak parmak ortada **250 ms** bekleyince devreye girer; o zamana kadar en yakın çizgi görünür, yani hızlı geçişte grup oluşmaz. Birleştirme devreye girince hedefte ring-2 primary ve bg-primary/8 belirir, vibrate(8) olur, ⧉ ile ⌄'nin yerine sonucu söyleyen bir hap çıkar:
   - tek → tek: **"Süperset yap"**
   - bir süpersete: **"Ekle · devre olur"**
   - devre ya da komplekse: **"Gruba ekle"** (kompleksin 7. hareketinde "Ekle · devre olur")
   - 8 hareketli gruba: soluk **"Grup dolu (8)"**; birleştirme olmaz, yalnız çizgi çalışır

   Sonuç: hedef önde kalır, bırakılan arkasına girer. Grup hedefinde parmak bir üyenin üstündeyse o üyenin önüne ya da arkasına, yüzündeyse sona girer. Toast: "Süperset yapıldı: Squat + Bench Press · Geri al".
2. **"+ Grup kur".** Liste sonunda "+ Hareket ekle" ile yan yana durur. Kütüphane sayfası çoklu seçimde açılır:
   - Açıklama: "Arka arkaya yapılacak hareketleri sırayla seç."
   - Seçilen hareketlerde sıra numarası (1, 2, 3) görünür.
   - Alt düğme sırasıyla şöyle değişir: "En az 2 hareket seç" (pasif), "Süperset ekle (2)", "Devre ekle (3)"… 8'de kilitlenir: "Grup en çok 8 hareket".
   - Boş grup hiç oluşmaz, böylece şema kuralı bozulmaz. Grubun içine sonradan hareket eklemek için altındaki "+ Gruba hareket ekle" kullanılır. PT'nin tarif ettiği "grup ekle, içine hareket koy" yapısı budur.

**Bırakma sonuçları:**

| Sürüklenen | Nereye | Sonuç |
|---|---|---|
| tek | üst düzey çizgi | sıralama |
| tek | bir tekin ortası | süperset |
| tek ya da üye | grup yüzü, ya da grup içi çizgi/orta | o gruba katılır |
| üye | kendi grubundaki çizgi | grup içinde sıralama |
| üye | üst düzey çizgi | gruptan çıkar, tek olur |
| grup | herhangi bir yer | yalnızca üst düzey çizgiler; birleştirme bandı yok |

**Grubu bozmanın yolları** (hepsinde Geri al var):
- Üyeyi dışarı sürükle.
- Üyeyi sağa kaydır → "Çıkar".
- Açık üyede "Gruptan çıkar".
- Grup yüzünü sola kaydır → "Dağıt", ya da grup ayarlarında "Grubu dağıt".
- Alt+←.
- Üye sayısı 1'e inince grup kendiliğinden teke döner.

**Kısıtlar:**
- Grup gruba girmez. Grup yüzünde Alt+→ şunu duyurur: "Grup başka bir gruba eklenemez".
- Süperset tam 2, kompleks 2–6, devre 3–8 hareket.
- Toplam en fazla 30 blok ve 40 hareket. Sınıra gelince işlem pasifleşir ve nedeni gösterilir.

## 5. Ekleme ve kopyalama
- **Liste sonu:** yarım yarım iki düğme, [+ Hareket ekle] [+ Grup kur] (h-11). Boş durum: "Henüz hareket yok" / "Kütüphaneden hareket ekle ya da grup kur." ve aynı iki düğme. Başlıktaki ikinci "Hareket ekle" telefonda gizlenir, masaüstünde kalır.
- **ExerciseSheet modları:** `'add' | 'group' | 'addToGroup'`.
  - add: bugünkü gibi dokununca sona ekler, sayfa açık kalır. Durum satırı: "Bench Press eklendi (5. sıra)".
  - addToGroup: başlık "Süperset 2'ye ekle". 8'de "Grup dolu (8)".
  - `'replace'` editörden kalkar. ExercisePicker'daki `replace`/`suggestFor` kodu kalır, çünkü antrenmandaki "Muadil" (SPEC §7.2) ona ihtiyaç duyuyor.
- **Kopyala** (⧉, ya da sağa tam kaydırma):
  - Tek hareket: hemen arkasına kopyalanır.
  - Grup yüzü: grubun tamamı arkasına kopyalanır (yeni `duplicateBlock`).
  - Devre ya da kompleks üyesi: yer varsa grup içinde arkasına kopyalanır.
  - Süperset üyesi: grubun arkasına **tek** olarak kopyalanır (bugünkü gibi sessizce devreye dönmez; `duplicateRow` ve testleri güncellenir).
  - Kopya 1,2 sn vurgulanır ve görünüme kaydırılır. Odak ⧉'de kalır. Toast: "Bench Press kopyalandı · Geri al".
  - Sınırda düğme pasiftir: "Şablon dolu: en fazla 40 hareket, 30 blok".

## 6. Set düzenleme
- **Stepper:** Base UI NumberField sarmalayıcısı, `src/components/ui/stepper.tsx`.
  - Boyutlar: sm 32 (masaüstü), default 44, lg 56 (antrenman).
  - Basılı tutunca tekrarlar: 400 ms sonra başlar, sonra 100 ms'de bir.
  - Ortadaki değer yazılabilir. `useCountDraft` sayesinde "1 → 10" yazarken setler silinmez.
- **Değerler:**
  - Set: 1–10. "−" son seti siler, "+" son seti kopyalar.
  - Dinlenme: 0–600 sn, 15 sn adım.
  - Hedef: min–max alanları (`inputMode=numeric`).
  - Setler düzken çipler görünür: tekrar için 5 · 8 · 10 · 12 · 6–8 · 8–12 · 12–15 (v1), süre için 20 · 30 · 45 · 60 sn. Çip tüm setlere yazar.
- **Düz olmayan setler:** Hedef satırı "12 / 10 / 8 · piramit" özet düğmesine dönüşür ve açılır bölümü açar. Böylece bir çip piramidi yanlışlıkla ezemez.
- **"Setleri ayrı düzenle":** setler düz değilse ya da bir sette hata varsa kendiliğinden açılır.
  - Düzen: ToggleGroup [Düz][Piramit][Back-off]. "Özel" durumda hiçbiri basılı değildir ve "Özel düzen" yazar. Her basış "Piramit uygulandı · Geri al" gösterir.
  - Set satırı: n · min–max · % (yalnız ağırlıklı) · **AMRAP toggle**. AMRAP'ı ayarlamanın tek yolu budur (PT maddesi 4).
  - Enter / Shift+Enter aynı sütunda aşağı / yukarı gider.
  - Tek tek set silme ve set menüsü yok; silmek için "−" kullanılır.
- **Grup üyesi:** dinlenme alanı yok. Tur, tur sonu dinlenme ve istasyon arası grup yüzünde durur.

## 7. Kütüphaneler
- **Eklenecek:** `@dnd-kit/core ^6.3` ve `@dnd-kit/utilities`. Sürüm sabitlenir; kurarken registry kontrol edilir.
  - Kullanılacaklar: `useDraggable`/`useDroppable`, `DragOverlay`, `autoScroll`, ve bantlarla 250 ms beklemeyi uygulayan özel bir çarpışma algılaması.
  - Sensörler: TouchSensor {delay 350, tolerance 8}, MouseSensor {distance 6}. Kalem fare gibi davranır ve bugünkü touchmove engeli korunur. Aktivatör `data-no-dnd` taşıyan öğeleri (⧉, input'lar) eler.
  - Kullanılmayacaklar: `sortable`, `@dnd-kit/react` (0.x) ve KeyboardSensor (kendi Alt şemamız var). `attributes` yüze yayılmaz, çünkü yüz zaten bir button. Hidrasyon uyumsuzluğunu önlemek için `DndContext id={useId()}`.
- **Kalanlar:**
  - motion 13: kaydırma, açılma, vurgu, bırakınca oturma. `Reorder.Group` ve `Reorder.Item` kalkar.
  - Base UI: NumberField, ToggleGroup, Select (Sıra seçici), Sheet.
  - sonner (Geri al toast'ları).
- **Port edilecek:** Easy Dude'un `swipe-row.tsx` dosyası `src/components/swipe/` altına kopyalanır (bağımlılık değil). Düzeltmeler:
  - Yalnız dokunmatikte çalışır (`dragListener=false` + `dragControls`).
  - Paneller `aria-hidden` ve `inert`.
  - `role=button` sarmalayıcı kalkar.
  - Reduced-motion'da panel anında oturur.
  - Eşik geçilince geri bildirim verilir.
  - SwipeGroup ile aynı anda tek panel açık kalır.
  - Spinner ve ✓ durumları atılır.
  - İkonlar Phosphor, renkler token'lardan.
- **Reddedilenler:**
  - Özel motor: otomatik kaydırma, kaydırma sırasında ölçüm ve gruplar arası taşıma için hata yüzeyi büyük.
  - sortable + combine: hedef parmağın altından kayar.
  - pragmatic-dnd: native HTML5 sürükle-bırak dokunmatikte zayıf.
  - vaul: gerek yok.

## 8. Bugünkü editörden kalkanlar
- Rozetin tutamak olması (`ReorderHandle`). Rozet yalnız etiket kalır.
- ⋮ `RowMenu` ve `GroupMenu`.
- "Değiştir…" girişi (`startReplace`, sayfanın replace modu).
- "Son set AMRAP" (hem satır menüsünde hem SetPresetMenu'deki onay kutusunda). `toggleLastAmrap` lib'de kullanılmadan durabilir.
- "Hazır düzen" açılır menüsü ve set başına ⋮ menüsü.
- "Hedefi bütün setlere uygula".
- Kapalı kartta hep açık duran Set/Dinlenme/Hedef ızgarası, "Setler | Ayrıntılar" alt çubuğu ve rozet satırı.
- Telefonda dış Card çerçevesi ve başlıktaki ikinci "Hareket ekle".
- motion Reorder.

## 9. Antrenman ekranında yeniden kullanım
- Aynı kart yüzü. Meta satırı: `formatSets(…,'client')` + "1/3 set". ⧉'nin yerinde ilerleme çipi durur. Şu anki hareket açık, bitenler kapalı ve tikli.
- Sürükleme: `combine=false`, `crossGroup=false`, 400 ms. Grup tek parça taşınır. "Sıra ▾" seçici de burada var.
- Kaydırma: ← [Atla] (Geri al ile), → [Muadil] (ExercisePicker'ın replace modu). Açık kartta aynı ikisi görünür düğme olarak durur.
- Kg ve tekrar için lg (56 px) Stepper, yanında 56 px'lik "✓ Set bitti".
- Ortak altyapı: canlı bölge (live region), Geri al toast'ları, motion token'ları, reduced-motion kuralları.

## 10. Fazlar
1. **Kart ve sadeleştirme** (yeni bağımlılık yok; PT maddeleri 1–4):
   - Yeni kart yüzü anatomisi ve akordeon.
   - Görünür ⧉.
   - ⋮, Değiştir ve Son set AMRAP kalkar.
   - Açık gövde: Stepper, çipler, "Setleri ayrı düzenle", ToggleGroup, alt çubuk.
   - Sürükleme tutamağı yüze taşınır. Bugünkü ReorderHandle mantığı yüz sarmalayıcısına geçer ve 350 ms'ye çıkar; bu fazda motion Reorder geçici olarak kalır.
2. **Kaydırma ve Grup kur** (PT maddesi 5 ve 6'nın ekleme yolu):
   - SwipeRow portu ve `useCardGesture`.
   - Geri al toast'ları.
   - `duplicateBlock`, yeni `duplicateRow` kuralı.
   - `appendGroup` ve `addToGroup` (`node --test` ile).
   - Sayfanın `group` ve `addToGroup` modları.
3. **dnd-kit motoru** (PT maddesi 6'nın sürükleme yolu):
   - Saf fonksiyonlar `moveItem` ve `combineInto`, testleriyle.
   - Bantlar, 250 ms bekleme, sonuç hapı.
   - Gruplar arası taşıma, otomatik kaydırma.
   - Alt+→/←, Delete, sr-only şerit, "Sıra ▾" seçici.
   - Reorder kaldırılır.
4. **Antrenman ekranı:** aynı parçalarla kurulur. İsteğe bağlı olarak masaüstüne B'nin "reçete" alanı ("3x8-12"), PT isterse.

Her fazda gerçek bir iPhone'da Safari'yle ve bir Android telefonda Chrome'la test edilir. SPEC §6 ve §7.4, `DEFAULT_DESCRIPTION` ve boş durum metni ilgili fazın PR'ında güncellenir.

## Açık sorular
- 'Değiştir' kalkınca bir hareketi başka bir hareketle değiştirmek 'sil + ekle' olur. Programda o satırın önceki antrenman kayıtlarıyla bağı, notu ve kuralı kaybolur. Bu kabul edilebilir mi? — **Önerilen:** Kabul et ve başlıktan kaldır. Cihaz değişimi (Ayrıntılar → Cihaz) satırın kimliğini korumaya devam eder. İhtiyaç duyulursa 'Hareketi değiştir' yalnızca Ayrıntılar'ın içine bir bağlantı olarak geri gelir, kart başlığına asla.
- Açık kartın altında görünür bir 'Sıra: 3 ▾' seçici olsun mu? v1 kararı (a) 'görünür taşıma düğmesi yok' diyordu. Bu seçici ▲▼ değil, yalnızca açık kartta görünüyor ve uzun listede uzak taşımayı kolaylaştırıyor. — **Önerilen:** Evet, yalnızca açık kartta. WCAG 2.5.7'yi karşılar, 30 kartlık listede sürüklemekten hızlıdır ve antrenman ekranında da işe yarar.
- Telefonda ⧉ Kopyala kart yüzünde her zaman görünsün mü, yoksa yalnızca sağa kaydırınca ve açık kartta mı çıksın? Yüzde durursa başlık yaklaşık 44 px daralır. — **Önerilen:** Yüzde her zaman görünsün (44 px). 'Kopya butonu koyalım' isteğine birebir uyar. Başlık 2 satıra sarar.
- Tek bir hareket sola tam kaydırınca onay sorulmadan silinsin mi, yalnızca 8 saniyelik 'Geri al' yeterli mi? — **Önerilen:** Evet, onay yok, 8 sn Geri al var. Grup yüzünde sola iki işlem ([Dağıt][Sil]) olduğu için tam kaydırma yok; bütün bir grup tek hamlede silinemez.
- 2 hareketli bir süpersetin üstüne üçüncü bir hareket bırakılınca grup otomatik olarak devreye dönsün mü, yoksa bu reddedilsin mi? — **Önerilen:** Devreye dönsün. Bırakmadan önce hap 'Ekle · devre olur' der, bıraktıktan sonra 'Süperset devreye dönüştü · Geri al' toast'u çıkar.