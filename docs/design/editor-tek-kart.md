# Önerilen tasarım: "Tek kart"

> **PT kararları.** Bu belge tek kaynaktır; kararlar aşağıdaki bölümlere işlendi.
>
> *2026-09-24, birinci tur*
> 1. Görünür "Sıra ▾" seçici **yok**. Sıralama sürükle-bırakla; klavyede Alt+ok, ekran okuyucuda sr-only şerit.
> 2. ⧉ Kopyala kart yüzünde **hep görünür**.
> 3. Sola tam kaydırma **onaysız siler**, 8 sn "Geri al".
> 4. 2'li süpersetin üstüne 3. hareket bırakılınca **devreye döner** ("Ekle · devre olur").
> 5. "Değiştir" editörden kalkar. ⋮ menüleri ve "Son set AMRAP" menü öğesi yok (AMRAP set başına bir düğme).
>
> *2026-09-24, ikinci tur (birinci turla çatışırsa bunlar geçer)*
> 6. **Tutamak = kartın üst ortasında tek yatay çizgi** (bottom-sheet tutamağı gibi). Basıp kaydırınca sürükleme hemen başlar; basılı tutma yok. Grubun ve her üyenin kendi çizgisi var. Rozet yalnız etiket (§1, §2).
> 7. **Seçim modu** (v1'deki gibi): başlıkta "Seç", kartlarda onay kutusu, altta [Vazgeç] [Grupla (n)] [Kopyala] [Sil]. "+ Grup kur" sayfasının yerine geçer. Üstüne bırakıp gruplama hızlı yol olarak kalır (§4, §5).
> 8. **Yapışkan alt çubuk** her iki düzenleyicide: [+ Hareket ekle] ve [Kaydet] / "Kaydedildi". Telefonda bu sayfalarda dock gizlenir. Başlıktaki "Hareket ekle" kalkar (§6).
>
> *2026-09-24, üçüncü tur*
> 9. **Kart yüzünde açma oku (⌄/⌃) yok.** Tek harekette, grup yüzünde ve üyede. Yüze dokunmak zaten açıp kapatıyor; ok gereksizdi. En sağdaki denetim ⧉ Kopyala. Erişilebilirlik okla gitmez: yüz gerçek bir `<button aria-expanded aria-controls>` olarak kalır, odak halkası görünür, adı "Plank, ayrıntıları aç/kapat" (grupta "Süperset 2, ayarları aç/kapat"), meta satırı açıklama olarak okunur. Açık kart görsel olarak belli: yüz koyulaşır (`bg-muted/50`), rozet ana renge döner, altında gövde durur. Açık gövdenin içindeki "Setleri ayrı düzenle" ve "Ayrıntılar · kural · not" bölüm başlıkları küçük oklarını korur (kart yüzü değiller) (§1).
>
> *2026-09-24, dördüncü tur*
> 10. **Kaydırma farede ve kalemde de çalışır** (farenin sol tuşuyla kartı sağa/sola çek). Masaüstündeki PT de aynı jestleri kullanır; ⧉ ve açık karttaki "Sil" yine durur (§3).
> 11. **Tutamak için ayrı şerit yok.** Çizgi yüzün içinde `absolute` durur (kart `relative`), yer kaplamaz ve kaydırınca yüzle birlikte kayar. Kart ≈ 12 px kısalır. Çizgiye kıpırdamadan dokunmak yüze dokunmakla aynıdır (kartı açar/kapatır) (§1).

Temel C. Üstüne A'nın jestleri ve set düzenlemesi, B'nin kısayolları, v1'in seçim modu ve alt çubuğu eklendi.

## 0. Neden bu karışım
- **C'den (temel):** Her şey (tek hareket, grup, grup üyesi, antrenman) aynı kapalı kartı kullanır. Sola kaydırma = sil, sağa kaydırma = kopyala. Sürükleme dnd-kit/core ile, kartlar canlı kaymaz, bırakılacak yeri bir ekleme çizgisi gösterir. Grup tek bir kaptır ve üyeleri çizgiyle ayrılmış bölümlerdir (kart içinde kart yok).
- **A'dan:** Üye ve grup kaydırma eşlemesi (grup tam kaydırmayla silinemez). Stepper + v1 tekrar çipleri + "Setleri ayrı düzenle" açılır bölümü. Telefonda dıştaki Card çerçevesinin kalkması. Süperset üyesi kopyalanınca grup sessizce devreye dönmez.
- **B'den:** Alt+→/← ve Delete kısayolları. `DndContext id=useId`. Adım adım teslim.
- **v1'den:** Seçim modu ve alt işlem çubuğu (Kaydet / "Kaydedildi").
- **Atılanlar:** A'nın özel sürükleme motoru ve basılı tutarak sürükleme. B'nin canlı kayma + birleştirme, reçete alanı (sonraya ertelendi) ve hover ikonları. C'nin hep açık set tablosu, çipsiz düzeni ve görünür "Sonrakiyle grupla" düğmesi. "+ Grup kur" sayfası.

| Çatışma | Karar | Gerekçe |
|---|---|---|
| Sürükleme motoru (A: özel, B: sortable, C: core) | **@dnd-kit/core**, sortable yok | Otomatik kaydırma, overlay ve gruplar arası taşıma hazır geliyor. Kartlar yerinde durduğu için "üstüne bırak" net ayırt edilir. |
| Sürükleme nereden başlar | **Üstteki çizgi**, 4 px kayınca, basılı tutma yok (karar 6) | Yatay kaydırma yüzde, sürükleme çizgide: iki jest çakışmaz, süre yarışı kalmaz. |
| Telefonda ⧉ kart yüzünde mi | **Evet**, 44 px | PT'nin açık isteği. |
| Kaydırma eşlemesi | A'nınki | Grubu tek hamlede silmek imkânsız olur. |
| Set düzenleme | A'nınki (stepper + çip + açılır bölüm) | Vakaların %80'i düz set. v1 kartlarını PT sevmişti. |
| Görünür taşıma yolu | **Yok** (karar 1) | Klavyede Alt+ok, ekran okuyucuda sr-only şerit. (Açık soru 1) |
| Çoklu gruplama | **Seçim modu** (karar 7) | Var olan hareketleri gruplar; kopyala ve sil de toplu çalışır. |
| Kaydet nerede | **Yapışkan alt çubuk** (karar 8) | 30 kartlık listede kaydetmek için sayfa sonuna inilmez. |
| Masaüstünde hover ikonları | **Yok** | ⧉ hep görünür. Sil açık kartta ve Delete tuşunda. |

## 1. Kart anatomisi (375 px)
Sayfa kenar boşluğu 16 px, liste 343 px. Telefonda "Hareketler" Card'ının çerçevesi ve iç boşluğu kalkar (`max-sm:ring-0 px-0 bg-transparent`). Kartın 1 px kenarı ve `px-3` boşluğuyla içerik alanı 317 px kalır. Kartlar arası 12 px.

**Kapalı** (varsayılan; telefonda aynı anda tek kart açık):
```
┌──────────────────────────────────────────┐ 343
│                   ━━━━                   │ çizgi 32×4, üstten 6 px (absolute, yer kaplamaz)
│ ┌──┐ Barbell Bench Press             [⧉] │ yüz: üst 16, içerik ≥ 36, alt 14
│ │ 1│ 3 × 8–12 · son set AMRAP · 90 sn  🗒 │
└──────────────────────────────────────────┘ ≈ 68 px
 rozet 28 | 12 | başlık ≈229 (2 satır) | 12 | ⧉ 44 (sağ kenardan 4 px)
```
- **Tutamak çizgisi:** kartın üst ortasında, ayrı bir şerit değil: yüzün içinde `absolute` (karar 11), yer kaplamaz, kaydırınca yüzle birlikte kayar. Görsel 32×4 `rounded-full bg-muted-foreground/40` (grupta `primary/50`), kartın üstünden 6 px içeride; üstüne gelince ya da basılıyken koyulaşır, sürüklerken primary.
  - Dokunma alanı **64×40**: kartın 12 px üstünden (kart aralığı) yüzün 28 px'ine. Başlığın ortasına binen kısmına kıpırdamadan dokunmak yüze dokunmakla aynıdır (kartı açar/kapatır; 4 px'ten çok kayan basış dokunma sayılmaz), ölü bölge yok. İlk kartın üstünde en az 16 px boşluk olur.
  - `touch-action: none`, masaüstünde `cursor: grab`, sürüklerken `grabbing`, `title="Sürükleyerek taşı"`.
  - Basıp **4 px** kaydırınca sürükleme hemen başlar. Kartın başka hiçbir yerinden sürükleme başlamaz.
  - `aria-hidden` ve odaklanmaz (her kartta fazladan sekme durağı olmasın). Klavye ve ekran okuyucu yolu §2'de.
- Yüzün tamamı gerilmiş bir `<button aria-expanded aria-controls>`, adı "Bench Press, ayrıntıları aç/kapat" (meta satırı `aria-describedby`). Açma oku yok (karar 9): açık kartta yüz koyulaşır ve rozet ana renge döner. ⧉ en sağda, bu düğmenin üstünde duran kardeş bir düğme: `z-10`, 44×44, `aria-label="Kopyala: Bench Press"`.
- Rozet yalnız etiket.
- Meta satırı `setsText()` + dinlenmeden oluşur. Kural, cihaz ve not işaretleri meta satırının sonunda 14 px ikon olarak durur (her birinin aria-label'ı var). Bugünkü rozet satırı kalkar.
- Kütüphanede olmayan hareket: başlık kırmızı "Silinmiş egzersiz", ⧉'nin yerinde 🗑 "Sil".

**Kaydırınca** (yalnız yüz kayar; tutamak şeridi ve açık gövde yerinde kalır):
```
 sağa →                                  ← sola
┌──────────────────────────────┐ ┌──────────────────────────────┐
│             ━━━━             │ │             ━━━━             │
├────────┬─────────────────────┤ ├─────────────────────┬────────┤
│   ⧉    │ 1 Bench Press       │ │ Bench Press     [⧉] │   🗑    │
│Kopyala │   3×8–12 · 90 sn    │ │ 3×8–12 · 90 sn      │  Sil   │
└────────┴─────────────────────┘ └─────────────────────┴────────┘
  72 px, primary                               72 px, destructive
```

**Açık** (telefon):
```
┌──────────────────────────────────────────┐
│                   ━━━━                   │
│ ┌──┐ Barbell Bench Press             [⧉] │ açık: yüz koyu, rozet primary
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
│                                 [🗑 Sil] │ 44 px
└──────────────────────────────────────────┘
```
"Setleri ayrı düzenle" açılınca:
```
│ Düzen [ Düz ][ Piramit ][ Back-off ]     │ yalnız ağırlıklı
│ 1  [ 8 ]–[ 12 ]  %[100]  [ AMRAP ]       │ 20+52+12+52+64+72+gaps = 296
│ 2  [ 8 ]–[ 12 ]  %[ 90]  [ AMRAP ]       │ <360 px'te % ve AMRAP
│ 3  [ 8 ]–[ 12 ]  %[ 80]  [●AMRAP ]       │ ikinci satıra kayar
```

**Masaüstü** (≥ md). İçerik aynı, yalnız yatay yerleşir. ≥ lg'de birden çok kart açık kalabilir.
```
┌───────────────────────────────────────────────────────────────────────┐
│                                 ━━━━                                  │
│ [1] Barbell Bench Press                                           [⧉] │
│     3 × 8–12 · son set AMRAP · 90 sn · Göğüs · Olympic Bar            │
├───────────────────────────────────────────────────────────────────────┤
│ Set [−] 3 [+]   Dinlenme [−] 90 sn [+]   Hedef [8]–[12] tekrar        │
│ (5)(8)(10)(12)(6–8)(8–12)(12–15)                                      │
│ Setleri ayrı düzenle ⌄                    Ayrıntılar · kural · not ⌄  │
├───────────────────────────────────────────────────────────────────────┤
│                                                              [🗑 Sil] │
└───────────────────────────────────────────────────────────────────────┘
```

**Grup.** Tek kap: `border-primary/40`, %4 primary zemin. Üyeler ince çizgiyle ayrılan bölümlerdir ve 317 px genişliği korur. Kabın çizgisi bütün grubu, üyenin çizgisi yalnız o üyeyi taşır.
```
╭──────────────────────────────────────────╮
│                   ━━━━                   │ grubun çizgisi (primary/50)
│ ┌──┐ Süperset                        [⧉] │ grup yüzü
│ │ 2│ 2 hareket · 3 tur · 90 sn tur sonu  │
├──────────────────────────────────────────┤
│                   ━━━━                   │ üyenin çizgisi
│ 2a  Bench Press                      [⧉] │ üye yüzü (aynı anatomi)
│     3 × 8–12                             │
├──────────────────────────────────────────┤
│                   ━━━━                   │
│ 2b  Cable Row                        [⧉] │
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
│                    [Grubu dağıt] [🗑 Sil] │
```
Açık üyede dinlenme alanı yok. Yerine şu satır çıkar: "Dinlenme grup ayarlarında." Alt satır: `[Gruptan çıkar] [🗑 Sil]`.

## 2. Jest haritası
| Hedef | Dokunmatik | Fare / kalem | Klavye (yüz odakta) |
|---|---|---|---|
| Aç / kapat | Yüze dokun (<8 px) | Tıkla | Enter / Space, Esc kapatır |
| Taşı | Üstteki çizgiyi tut, 4 px kaydır: hemen kalkar | Çizgiden tut, sürükle | Alt+↑/↓, Alt+Home/End |
| Grupla (hızlı) | Sürüklerken kartın ortasında 250 ms bekle, bırak | Aynı | Alt+→ = öncekiyle grupla |
| Grupla (çoklu) | "Seç" → kartlara dokun → "Grupla" | "Seç" → tıkla (Shift+tık aralık) → "Grupla" | "Seç" → Space → "Grupla" |
| Gruptan çıkar | Üst düzeye sürükle, ya da üyeyi sağa kaydır → "Çıkar" | Üst düzeye sürükle, ya da açık üyede "Gruptan çıkar" | Alt+← (grup yüzünde: grubu dağıt) |
| Kopyala | ⧉, ya da sağa tam kaydır | ⧉ | ⧉'ye Tab ile gelip Enter |
| Sil | Sola tam kaydır (8 sn "Geri al") | Açık kartta "Sil" | Delete / Backspace (+ Geri al) |
| İptal | Liste dışına bırak, ya da pointercancel | Esc | Esc |

- **Hakem (`useCardGesture`, sadeleşti):** Sürükleme yalnız çizgiden başladığı için süre yarışı yok. Yüzde: |dx|>10 ve |dx|>1,5·|dy| olursa kaydırma başlar (parmak, kalem ya da farenin sol tuşu; `dragControls.start`). |dy|>8 olursa sayfa kayar (`touch-action: pan-y`). 8 px'ten az hareket dokunmadır. Sürükleme etkinken kaydırma kapalıdır. Panel açıkken çizgiye basmak paneli kapatır, sürükleme yine başlar. Kaydırmadan sonra gelen click yutulur. Yüzde `select-none` ve `-webkit-touch-callout:none` var.
- **Sürüklerken:** kaynak kartın yerinde, kartın o anki yüksekliğinde kesik çizgili bir yer tutucu kalır (açık kart da; liste zıplamaz). Parmağın altında yüzden (çizgisiyle) oluşan bir overlay durur (ölçek 1.02, ring-2 primary/40, çizgi primary; reduced-motion'da ölçek yok). Kardeş kartlar kaymaz. Bırakılacak yeri 2 px'lik bir çizgi ve 8 px'lik bir nokta gösterir; grup içinde çizgi 12 px içeriden başlar. Ekranın üst ve alt 80 px'i otomatik kaydırma bölgesidir. `html[data-reordering]` dock'u, kullanıcı menüsünü ve alt çubuğu çeker (`data-reorder-hide`).
- **Bırakınca:** forma tek yazım yapılır. Kart kapalı olarak yerine oturur, 1,2 sn vurgulanır. Sıralamada Geri al toast'u yok (geri sürüklemek yeter).
- **Ekran okuyucu:** yüzün hemen arkasında sr-only bir şerit var: "Yukarı taşı · Aşağı taşı · Öncekiyle grupla / Gruptan çıkar". Klavyeyle odaklanınca görünür olur. Çizgi `aria-hidden`.
- **Canlı bölge:** düzenleyicide tek `aria-live="polite"` paragraf.
  - Taşıma: "Bench Press 3. sıraya taşındı" (klavyeyle her adımda da).
  - Gruplama ve çıkarma: "Squat ile süperset yapıldı", "Cable Row gruptan çıktı".
  - Kopyalama, silme ve seçim sayısı: toast metniyle aynı cümle.
  - Olmayan işlemin nedeni: "Grup başka bir gruba eklenemez", "Grup dolu (8)", "Şablon dolu: en fazla 40 hareket, 30 blok".
  - Sheet açıkken duyurular sheet kapanınca yapılır.
- **Kopya metinleri:**
  - Telefon açıklaması: "Karta dokun: düzenle. Üstteki çizgiden sürükle: sırala; bir kartın ortasına bırak: grupla. Sola kaydır: sil, sağa kaydır: kopyala."
  - Masaüstü açıklaması: "Karta tıkla: düzenle. Üstteki çizgiden sürükle: sırala; bir kartın ortasına bırak: grupla. Alt + ok tuşları taşır."
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
- Aynı anda tek panel açık (SwipeGroup). Kaydırma, sürükleme başlatmak, Esc ya da dışarı dokunmak paneli kapatır.
- Seçim modunda ve sürükleme sürerken kaydırma kapalı.
- Panel düğmeleri `aria-hidden` ve `inert`. Hepsi başka yerdeki görünür düğmelerin kopyası.
- Sil: yüz sola çıkar, satır yüksekliği 220 ms'de kapanır. Toast: "Bench Press silindi · Geri al" (8 sn).

## 4. Gruplama
**Üç yol:**
1. **Üstüne bırak (hızlı yol).** Hedef kartın yüksekliği üç banda ayrılır: üst %25 = önüne, alt %25 = arkasına, orta %50 = birleştir. Birleştirme ancak parmak ortada **250 ms** bekleyince devreye girer; o zamana kadar en yakın çizgi görünür, yani hızlı geçişte grup oluşmaz. Birleştirme devreye girince hedefte ring-2 primary ve bg-primary/8 belirir, vibrate(8) olur, ⧉'nin yerine sonucu söyleyen bir hap çıkar (`combineOutcome`):
   - tek → tek: **"Süperset yap"**
   - bir süpersete: **"Ekle · devre olur"**
   - devre ya da komplekse: **"Gruba ekle"** (kompleksin 7. hareketinde "Ekle · devre olur")
   - 8 hareketli gruba: soluk **"Grup dolu (8)"**; birleştirme olmaz, yalnız çizgi çalışır

   Sonuç (`combineInto`): hedef önde kalır, bırakılan arkasına girer. Grup hedefinde parmak bir üyenin üstündeyse o üyenin arkasına, yüzündeyse sona girer. Toast: "Süperset yapıldı: Squat + Bench Press · Geri al"; türü değiştiyse "Süperset devreye dönüştü · Geri al".
2. **Seçim modu (çoklu, §5).** 2–8 tek hareketi seç, "Grupla". Kütüphaneden yeni hareketlerle grup kurmak: önce ekle, sonra seç ve grupla.
3. **"+ Gruba hareket ekle"** (grubun altında): kütüphane sheet'i `addToGroup` kipinde açılır (§7). Boş grup hiç oluşmaz.

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

## 5. Seçim modu
**Giriş:** "Hareketler" başlığındaki [Seç] (listede en az 2 kart varken). Açık kartlar ve açık kaydırma paneli kapanır, odak ilk kartın onay kutusuna gider.

```
Hareketler                         [Tümünü seç]
Gruplamak, kopyalamak ya da silmek istediklerini seç.
┌──────────────────────────────────────────┐
│                   ━━━━                   │ çizgi sönük, dokunuşu yüze bırakır
│ [✓] Barbell Bench Press                  │ seçili: ring-2 primary, bg-primary/6
│     3 × 8–12 · 90 sn                     │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│                                          │
│ [ ] Squat                                │
│     4 × 5 · 180 sn                       │
└──────────────────────────────────────────┘
╭──────────────────────────────────────────╮
│                                          │
│ [ ] Süperset                             │ grubun tek onay kutusu
│     2 hareket · 3 tur                    │
├──────────────────────────────────────────┤
│                                          │
│ 2a  Bench Press                          │ üyeler soluk (%60), inert
│     3 × 8–12                             │
├──────────────────────────────────────────┤
│                                          │
│ 2b  Cable Row                            │ "+ Gruba hareket ekle" gizli
│     3 × 10–12                            │
╰──────────────────────────────────────────╯
┌──────────────────────────────────────────┐ alt çubuk, telefon
│ 2 seçili · süperset olur        [Vazgeç] │
│ [ Grupla (2) ] [ ⧉ Kopyala ] [ 🗑 Sil ]  │ h-11, üçte bir
└──────────────────────────────────────────┘
 masaüstü tek satır:  2 seçili · süperset olur   [Vazgeç] [Grupla (2)] [Kopyala] [Sil]
```
- **Kartlar:** her üst düzey kartta rozetin yerinde 28 px onay kutusu (başlık kaymaz). Yüz `role="checkbox"` + `aria-checked`; dokunmak seçer ya da bırakır. Grup tek onay kutusu taşır; üyeler görünür ama soluk (%60) ve `inert`, grubun herhangi bir yerine dokunmak grubu seçer. Üye tek başına seçilmez.
- **Kapananlar:** çizgi söner ve dokunuşu yüze bırakır, ⧉ gizlenir. Sürükleme, bırakma, kaydırma, Alt kısayolları, akordeon ve "+ Gruba hareket ekle" kapalı.
- **Başlık:** [Seç] yerine [Tümünü seç] / [Seçimi kaldır]; açıklama "Gruplamak, kopyalamak ya da silmek istediklerini seç."
- **Masaüstü:** Shift+tık aralık seçer. Liste odaktayken Ctrl/⌘+A tümünü seçer, Delete "Sil" gibi çalışır.

**Alt çubuk düğmeleri** (normal çubuğun yerine geçer, §6):

| Düğme | Etkin | Sonuç | Toast (8 sn) |
|---|---|---|---|
| Vazgeç | hep | Moddan çıkar, hiçbir şey değişmez | — |
| Grupla (n) | 2–8 seçili ve **hepsi tek hareket** | 2 → süperset (90 sn), 3–8 → devre (120 sn, istasyon 15 sn). Sıra listedeki sıradır, dokunma sırası değil. Grup, ilk seçilen kartın yerinde ve kimliğiyle kurulur. Her hareket setlerini, kuralını ve notunu korur. | "Süperset yapıldı: Squat + Bench Press · Geri al" / "Devre yapıldı (4 hareket) · Geri al" |
| Kopyala | ≥ 1 seçili ve sığıyor (30 blok, 40 hareket) | Kopyalar liste sırasıyla son seçilen kartın arkasına | "3 hareket kopyalandı · Geri al" |
| Sil | ≥ 1 seçili | Hepsi silinir, onay yok | "3 hareket silindi · Geri al" |

- **Durum satırı** (çubuğun solunda, `aria-live`): "Seçmek için kartlara dokun" (0) · "2 seçili · süperset olur" · "3 seçili · devre olur" · "Grup seçili: yalnız tek hareketler gruplanır" · "9 seçili · grup en çok 8 hareket" · "Şablon dolu: kopya sığmaz". Pasif düğmenin nedeni burada yazar, tooltip'te değil.
- Toast'lardaki sayı hareket sayısıdır (seçili gruplardaki üyeler dahil). Geri al tek adımdır: bütün toplu işlemi geri alır.
- **Çıkış:** Vazgeç, Esc, ya da bir işlemden sonra kendiliğinden.
  - Grupla ve Kopyala sonrası: yeni grup / ilk kopya 1,2 sn vurgulanır, görünüme kaydırılır, odak onun yüzüne gider.
  - Sil sonrası: odak silinenlerden sonraki karta, yoksa öncekine, liste boşaldıysa çubuktaki "+ Hareket ekle"ye.
  - Vazgeç ve Esc'te odak [Seç]'e döner. Açık kartlar geri açılmaz.
- **Saf yardımcılar** (`template-edit.ts`, `node --test` ile): `groupCheck` / `groupBlocks`, `canDuplicateBlocks` / `duplicateBlocks`, `removeBlocks`. Girdi kimliklerinin sırası önemsiz (liste sırası geçer), bilinmeyen kimlik yok sayılır, olmuyorsa aynı dizi döner. Tür ve dinlenme kuralı `appendGroup` ile aynıdır (`newGroupKind`).

## 6. Alt çubuk
Her iki düzenleyicide (şablon, program günü) aynı çubuk. Sayfanın formuna aittir: `<Form>`'un son çocuğudur ve `sticky` durur. Kaydet formun submit düğmesidir; "+ Hareket ekle" ve seçim modu içeriğini BlockEditor bir bağlam üzerinden verir. Programda "+ Hareket ekle" seçili güne ekler (`aria-label="Hareket ekle: Gün A"`).

```
telefon (< md): dock gizli, çubuk ekranın altında, tam genişlik
┌──────────────────────────────────────────┐
│ [ + Hareket ekle ]   [ ✓ Kaydet        ] │ h-11, yarım yarım
└──────────────────────────────────────────┘ + env(safe-area-inset-bottom)

masaüstü (≥ md): içerik sütununun altında sticky, dock'un üstünde
╭─────────────────────────────────────────────────────────────────╮
│ [+ Hareket ekle]                          [Vazgeç] [✓ Kaydet]  │
╰─────────────────────────────────────────────────────────────────╯
                          ( dock )
```

| Durum | Kaydet düğmesi |
|---|---|
| Kaydedilmemiş değişiklik var | "Kaydet", primary, etkin |
| Değişiklik yok (düzenleme sayfası) | "Kaydedildi", ✓ ikon, pasif |
| Kaydediliyor | Spinner + "Kaydediliyor…", pasif |
| Oluşturma sayfası | "Şablonu oluştur" / "Programı oluştur", hep etkin |

- **Telefon:** bu dört sayfada dock gizli (`/dashboard/templates/new`, `/dashboard/templates/[id]/edit`, `/dashboard/clients/[id]/program/new`, `.../program/edit`). Çubuk `bottom-0`, üst kenar çizgisi, `bg-background/95` + blur, altta güvenli alan payı. Bir metin ya da sayı alanı odaktayken (klavye açık) çubuk gizlenir.
- **Masaüstü:** çubuk dock'un üstünde durur (`--dock-clearance`: dock'un büyümüş yüksekliği + 8 px, tek yerde tanımlı). Dock gibi yuvarlak kenarlı, kenarlıklı ve gölgeli bir yüzeydir.
- Sürüklerken çekilir (`data-reorder-hide`), otomatik kaydırma bölgesi açık kalır.
- Vurgulanan ya da odaklanan kart çubuğun altında kalmaz: kartlarda `scroll-margin-bottom`, sayfada `scroll-padding-bottom` çubuk yüksekliği kadar.
- Formların altındaki [Vazgeç][Kaydet] satırı kalkar. Masaüstünde Vazgeç çubuğa taşınır; telefonda breadcrumb yeter.
- Hata: bugünkü Alert'ler formun sonunda, çubuğun üstünde kalır. Kaydet'e basınca ilk hataya kaydırılır.

## 7. Ekleme ve kopyalama
- **Tek ekleme girişi:** çubuktaki [+ Hareket ekle]. Başlıktaki ve liste sonundaki kopyaları kalkar. Boş durum: "Henüz hareket yok" / "Kütüphaneden hareket ekle." ve bir [+ Hareket ekle] (liste boşken tek içerik o).
- **ExerciseSheet kipleri:** `'add' | 'addToGroup'`.
  - add: dokununca sona ekler, sheet açık kalır. Durum satırı: "Bench Press eklendi (5. sıra)". Kapanınca son eklenen vurgulanır ve görünüme kaydırılır; odak açan düğmeye döner.
  - addToGroup: grubun altındaki "+ Gruba hareket ekle"den açılır. Başlık "Süperset 2'ye ekle". Dokununca grubun sonuna ekler (`addToGroup`), sheet açık kalır. Durum satırı `addToGroupOutcome`'a göre: süpersette önceden "Eklenirse devre olur", ekleyince "Cable Row eklendi · grup devre oldu"; 8'de "Grup dolu (8)" ve liste pasif; 40 harekette "Şablon dolu". Kapanınca odak "+ Gruba hareket ekle"ye döner.
  - `'replace'` editörden kalkar. ExercisePicker'daki `replace`/`suggestFor` kodu kalır, çünkü antrenmandaki "Muadil" (SPEC §7.2) ona ihtiyaç duyuyor.
- **Kopyala** (⧉, ya da sağa tam kaydırma):
  - Tek hareket: hemen arkasına kopyalanır.
  - Grup yüzü: grubun tamamı arkasına kopyalanır (`duplicateBlock`).
  - Devre ya da kompleks üyesi: yer varsa grup içinde arkasına kopyalanır.
  - Süperset üyesi: grubun arkasına **tek** olarak kopyalanır (`duplicateRow(…, exercises)`; sessizce devreye dönmez).
  - Kopya 1,2 sn vurgulanır ve görünüme kaydırılır. Odak ⧉'de kalır. Toast: "Bench Press kopyalandı · Geri al".
  - Sınırda düğme pasiftir (`canDuplicate`): "Şablon dolu: en fazla 40 hareket, 30 blok".

## 8. Set düzenleme
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
  - Set satırı: n · min–max · % (yalnız ağırlıklı) · **AMRAP düğmesi**. AMRAP'ı ayarlamanın tek yolu budur.
  - Enter / Shift+Enter aynı sütunda aşağı / yukarı gider.
  - Tek tek set silme ve set menüsü yok; silmek için "−" kullanılır.
- **Grup üyesi:** dinlenme alanı yok. Tur, tur sonu dinlenme ve istasyon arası grup yüzünde durur.

## 9. Kütüphaneler
- **Eklenecek:** `@dnd-kit/core ^6.3` ve `@dnd-kit/utilities`. Sürüm sabitlenir; kurarken registry kontrol edilir.
  - Kullanılacaklar: `useDraggable` (çizgi `setActivatorNodeRef` ile aktivatör), `useDroppable`, `DragOverlay`, `autoScroll` (kenar 80 px), ve bantlarla 250 ms beklemeyi uygulayan özel bir çarpışma algılaması.
  - Sensör: tek `PointerSensor { distance: 4 }`, yalnız çizgide. Kalem de bununla çalışır; bugünkü touchmove engeli çizgide korunur.
  - Kullanılmayacaklar: `sortable`, `@dnd-kit/react` (0.x) ve KeyboardSensor (kendi Alt şemamız var). Hidrasyon uyumsuzluğunu önlemek için `DndContext id={useId()}`.
  - shadcn: `npx shadcn add checkbox --yes` (seçim modu).
- **Kalanlar:**
  - motion 13: kaydırma, açılma, vurgu, bırakınca oturma. `Reorder.Group` ve `Reorder.Item` kalkar.
  - Base UI: NumberField, ToggleGroup, Checkbox, Sheet.
  - sonner (Geri al toast'ları; aynı anda tek Geri al toast'u, yenisi eskisini kapatır).
- **Port edilecek:** Easy Dude'un `swipe-row.tsx` dosyası `src/components/swipe/` altına kopyalanır (bağımlılık değil). Düzeltmeler:
  - Yalnız dokunmatikte çalışır (`dragListener=false` + `dragControls`).
  - Paneller `aria-hidden` ve `inert`.
  - `role=button` sarmalayıcı kalkar.
  - Reduced-motion'da panel anında oturur.
  - Eşik geçilince geri bildirim verilir.
  - SwipeGroup ile aynı anda tek panel açık kalır.
  - Spinner ve ✓ durumları atılır.
  - İkonlar Phosphor, renkler token'lardan.
  - `expandable-swipe-row.tsx`'teki alttaki `Thumb` alınmaz: bizde çizgi sürükleme tutamağıdır ve kartın üstündedir; açılabilirliği yüzün kendisi gösterir (karar 9).
- **Reddedilenler:**
  - Özel motor: otomatik kaydırma, kaydırma sırasında ölçüm ve gruplar arası taşıma için hata yüzeyi büyük.
  - sortable + combine: hedef parmağın altından kayar.
  - Kartın her yerinden basılı tutarak sürükleme: yatay kaydırma ve sayfa kaydırmasıyla yarışır, keşfedilmesi zor (karar 6).
  - pragmatic-dnd: native HTML5 sürükle-bırak dokunmatikte zayıf.
  - vaul: gerek yok.

## 10. Bugünkü editörden kalkanlar
- Rozetin tutamak olması (`ReorderHandle`), `SortableList`, motion Reorder ve `DRAG.touchDelay`. Rozet yalnız etiket kalır.
- ⋮ `RowMenu` ve `GroupMenu`.
- "Değiştir…" girişi (`startReplace`, sheet'in replace kipi). Bir hareketi değiştirmek artık "sil + ekle" olur (satırın geçmişle bağı, notu ve kuralı gider). Cihaz değişimi (Ayrıntılar → Cihaz) satırın kimliğini korur. Gerekirse "Hareketi değiştir" yalnız Ayrıntılar'ın içine bağlantı olarak döner, kart başlığına asla.
- "Son set AMRAP" (satır menüsünde ve SetPresetMenu'deki onay kutusunda). `toggleLastAmrap` lib'de kullanılmadan durabilir.
- "Hazır düzen" açılır menüsü ve set başına ⋮ menüsü.
- "Hedefi bütün setlere uygula".
- Kapalı kartta hep açık duran Set/Dinlenme/Hedef ızgarası, "Setler | Ayrıntılar" alt çubuğu ve rozet satırı.
- Telefonda dış Card çerçevesi.
- Başlıktaki ve liste sonundaki "Hareket ekle"; formların altındaki [Vazgeç][Kaydet] satırı (alt çubuğa taşınır).
- Eski düzenleyicinin saf işlemleri: `reorderBlocks`, `reorderRows`, `canJoin`, `joinBlocks` (yerlerini `moveItem`, `combineInto` aldı). "Grup kur" kalktığı için `appendGroup` ve `newGroupCapacity` kullanılmıyorsa testleriyle silinir.

## 11. Antrenman ekranında yeniden kullanım
- Aynı kart yüzü ve aynı çizgi tutamak. Meta satırı: `formatSets(…,'client')` + "1/3 set". ⧉'nin yerinde ilerleme çipi durur. Şu anki hareket açık, bitenler kapalı ve tikli.
- Sürükleme: `combine=false`, `crossGroup=false`. Grup tek parça taşınır. Seçim modu yok.
- Kaydırma: ← [Atla] (Geri al ile), → [Muadil] (ExercisePicker'ın replace kipi). Açık kartta aynı ikisi görünür düğme olarak durur.
- Kg ve tekrar için lg (56 px) Stepper, yanında 56 px'lik "✓ Set bitti".
- Ortak altyapı: canlı bölge, Geri al toast'ları, motion token'ları, reduced-motion kuralları.

## 12. Adımlar
1. **Kart, set düzenleme ve sürükle-bırak** (`@dnd-kit/core` eklenir):
   - Yeni kart anatomisi (şerit + çizgi, yüz, görünür ⧉) ve akordeon.
   - Açık gövde: Stepper, tekrar çipleri, "Setleri ayrı düzenle" (ToggleGroup, set başına AMRAP), alt satır.
   - §10'daki kaldırmalar (ekleme düğmeleri ve form alt satırı hariç; onlar 2. adımda).
   - Çizgi tutamak + dnd-kit motoru: ekleme çizgisi, yer tutucu, overlay, gruplar arası taşıma (`moveItem`).
   - Üstüne bırakma: bantlar, 250 ms bekleme, sonuç hapı (`combineOutcome`/`combineInto`).
   - Otomatik kaydırma. Alt+↑/↓/Home/End/→/← ve Delete. sr-only şerit. Canlı bölge duyuruları.
2. **Kaydırma, seçim modu ve alt çubuk:**
   - SwipeRow portu ve `useCardGesture`.
   - Seçim modu, saf yardımcılar (`groupBlocks`, `duplicateBlocks`, `removeBlocks`) ve seçim çubuğu.
   - Yapışkan alt çubuk, telefonda dock gizleme; başlıktaki ve liste sonundaki "Hareket ekle" ile form alt satırı kalkar.
   - Sheet'in `addToGroup` kipi ve "+ Gruba hareket ekle".
   - Geri al toast'larının tamamı (kaydırmayla silme, toplu işlemler, kopya, gruplama).
3. **Antrenman ekranı:** aynı parçalarla kurulur. İsteğe bağlı olarak masaüstüne B'nin "reçete" alanı ("3x8-12"), PT isterse.

Her adımda gerçek bir iPhone'da Safari'yle ve bir Android telefonda Chrome'la test edilir. SPEC §6 ve §7.4, `DEFAULT_DESCRIPTION` ve boş durum metni ilgili adımın PR'ında güncellenir.

## Açık sorular
1. Görünür "Sıra ▾" kalkınca fareyle sürüklemeden taşımanın yolu kalmıyor (klavye ve ekran okuyucu yolu var; WCAG 2.5.7). — **Önerilen:** Şimdilik kabul. İhtiyaç olursa seçim moduna tek seçimde "Taşı…" (hedef sıra) eklenir, kart yüzüne değil.
2. Masaüstünde alt çubuk dock'un hemen üstünde duruyor; ikisi birlikte kalabalık görünebilir. — **Önerilen:** Böyle başla. PT kalabalık bulursa düzenleyici sayfalarında masaüstünde de dock gizlenir.
