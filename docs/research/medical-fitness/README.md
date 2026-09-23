# Medikal / düzeltici fitness — kaynak taraması ve veri modeli

Bu klasör, sakatlık filtreleme ve ölçüm sisteminin kanıt temelidir. 7 başlıkta paralel
web taraması + tek sentez pasosuyla üretildi (8 ajan, 472 kaynak sorgusu, 164 kaynak).
Buradaki hiçbir kural kaynaksız değildir; kanıtın zayıf olduğu yerler `gaps` altında
açıkça yazılıdır.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `contraindication-model.json` | Sentez: patoloji sözlüğü (24), etiketleme eksenleri (18), filtre kuralları (54), ölçüm protokolü (29 alan), MCP kaynak listesi (13), kanıt boşlukları (14) |
| `findings.json` | 7 başlığın ham çıktısı: 232 kural, 60 kontrendikasyon kaydı, 164 kaynak (her iddia bir URL'ye bağlı) |
| `../exercise-biomechanics-v1.json` | 28 egzersizin biyomekanik etiketi (ilk parti) |

Başlıklar: McGill omurga biyomekaniği · FMS · NASM-CES + Janda/Kendall/Sahrmann ·
omuz (SAPS, manşet, instabilite, AC) · diz (PFP, ACL, tendinopati, OA, menisküs) ·
ölçüm/değerlendirme standartları · açık veri kaynakları.

## Kanıtın özeti (uygulamayı doğrudan etkileyenler)

- **Disk hasarı mekanizması yüktür değil tekrardır.** Callaghan & McGill: 260–1472 N gibi
  düşük kompresyonda tekrarlı fleksiyon siklüsleri herniasyon üretiyor. Rotasyon tek başına
  zararsız; fleksiyonla birleşince 3000 siklüste herniasyon oranı %29 → %71 (Drake 2005).
  Kural: `spinal_alignment == flexion` + rotasyon kombinasyonu diskojenik profilde **block**.
- **Fleksiyon yasağı herkese değil.** Saraceni 2020 derlemesi, kaldırmada lomber fleksiyonun
  genel popülasyonda risk faktörü olduğuna dair yalnız düşük kaliteli kanıt buldu. Filtre,
  provokasyon testiyle doğrulanmış `flexion_intolerant_back` alt grubuna uygulanmalı.
- **Sabah kuralı sağlam.** Uyanmadan sonraki ilk saatlerde fleksiyon stresi diskte ~%300 daha
  yüksek (Adams 1987); sabah fleksiyonunu kısıtlamak ağrı günlerini %23 azaltıyor (Snook RKÇ).
- **Big 3 dozu sabittir:** 7–8 sn izometrik tutuş (üst sınır 10 sn), azalan piramit (8-6-4 →
  10-8-6), nefes tutulmaz, dayanıklılık süreyle değil tekrarla artırılır.
- **Bracing > hollowing:** bracing stabiliteyi %32 artırıyor, izole TrA'nın katkısı %0,14.
- **Diz açı penceresi:** açık zincirde 0–45° patellofemoral stres ve ACL gerilimi tepe yapar;
  kapalı zincirde ilişki terstir (derinlikte artar). Bu yüzden etiketlemede tek başına
  `kinetic_chain` yetmiyor, `joint_angle_window` ekseni gerekiyor.
- **FMS'in toplam skoru zayıf bir öngörücü** (AUC 0,53–0,56'dan 0,83'e kadar çelişkili
  sonuçlar). Asimetri ve ağrı bayrağı (skor 0) klinik olarak daha değerli — bizde de toplam
  skor değil, asimetri + ağrı bayrağı saklanmalı.
- **Kompansasyon → kas eşlemesi büyük ölçüde uzman görüşü.** EMG meta-analizi adduktor/kuadriseps
  artışını doğruluyor, gluteus medius zayıflığı hipotezini doğrulamıyor. Bu yüzden NASM tablosu
  "uyarı + öneri" olarak kullanılmalı, otomatik yasak olarak değil.

## Model kararları

- **Karar üç kademeli:** `block` (21 kural) · `warn` (23) · `allow_with_cue` (10). Gereksiz
  yasak PT'yi bunaltır; kanıtı zayıf olan her şey `warn`.
- **Kırmızı bayraklar** (`red_flag: true`) egzersiz filtresi değil, akış kesicidir: kauda ekina
  şüphesi, ilerleyici nörolojik defisit, radikülopatide periferikleşen semptom, ACL erken dönem,
  menisküs onarımı sonrası, taramada ağrı. Bunlarda uygulama "tıbbi izin" ister.
- **Şiddet kimliğe gömülmez.** Egzersiz veri setinde `kimlik:nitelik` biçimi kullanılıyor
  (`lumbar_disc_herniation:acute`, `knee_osteoarthritis:severe`, `hypertension:uncontrolled`).
- **Ölçümün çekirdeği 10 alan** ve hepsi seans başına: ağrı (24 sa ortalama, seans içi tepe,
  24 saatte bazale dönüş), semptom yönü, irritabilite, seans RPE, tolere edilen en yüksek set,
  uyum, ağrısız yürüme süresi, yeni kırmızı bayrak kontrolü. Antropometri ve hareket taraması
  `recommended`, SFMA/MSI/Y-balance `optional`.

## Taksonomiye eklenmesi gerekenler

Sentez omuz/diz/omurgaya odaklandı; ilk parti egzersizlerde kullanılan şu kimlikler henüz
sözlükte yok: `acute_knee_effusion`, `acute_meniscus_tear`, `cervical_pain`,
`cervical_radiculopathy`, `hip_impingement_fai`, `hypertension`, `lateral_epicondylitis`,
`lumbar_stenosis`, `pregnancy_second_third_trimester`, `si_joint_pain`,
`thoracic_extension_deficit`, `wrist_pain`.

## Lisans uyarısı (MCP yaparken)

- **Serbest:** PubMed E-utilities, Europe PMC, PMC OA alt kümesi, CC BY dergiler (Frontiers,
  BMC, PLOS), NASS kılavuzu (okunur, yeniden dağıtılmaz).
- **Telifli — kopyalanamaz, yalnız atıf:** JOSPT kılavuzları, Cochrane tam metinleri,
  McGill (backfitpro) doz parametreleri, NASM içeriği.
- **Tescilli marka:** FMS. Test adları ve puanlama tablosu ürün içinde yeniden üretilemez;
  PT'nin kendi girdiği skorları saklamak serbesttir.
- Egzersiz adı → biyomekanik etiket eşlemesi için **açık veri seti yok**; bizim ürettiğimiz
  `exercise-biomechanics-v1.json` bu boşluğu dolduruyor.
