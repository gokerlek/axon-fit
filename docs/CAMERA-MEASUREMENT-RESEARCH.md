# Kamera ölçümü: mevcut sistemlerden çıkarılan ürün ve doğrulama kararları

Araştırma tarihi: 4 Ekim 2026. Bu belge araştırma ve önerilen uygulama sırasıdır; aşağıdaki protokollerin ürünümüzde uygulanmış veya doğrulanmış olduğu anlamına gelmez. Kaynaklar üretici belgeleri ve özgün araştırmalardır. Üretici özellik beyanı, bağımsız yöntem doğrulaması ve bizim ürünümüzün doğrulaması ayrı tutulur.

## 1. Karşılaştırılan yaklaşımlar

### Hinge Health — telefonda hareket sırasında rehberlik

Üreticinin kullanıcı kılavuzu kamera yerleşimi için yönerge, harekete özel eğitim, tekrar sayımı, hareket açıklığı göstergesi ve kullanıcı geri bildirimi tarif ediyor. Kamera kullanmadan devam etme seçeneği var. Mühendislik yazısı bilgisayarlı görü hattının telefon/tablette çalıştığını ve cihaz çeşitliliği için performans ölçtüklerini belirtiyor. Bu belgelerden hareketle her açıya ait bağımsız klinik hata değeri çıkarılamaz.

Bizim çıkarımımız: kullanıcıya yalnız eklem noktalarını göstermek yerine, seçilen görevin başlangıcı/sonu, tamamlanan tekrarlar ve neden tekrar çekim gerektiği açıklanmalı. Görüntünün cihazda işlenmesi bizim gizlilik tercihimizle uyumlu bir mimari örneğidir; üreticinin tüm veri saklama politikasının bizimkiyle aynı olduğu iddia edilmez.

Kaynaklar: [kullanıcı kılavuzu, §4.4](https://www.hingehealth.com/user-manual/), [cihazda çalışma/performance mühendislik yazısı](https://rnd.hingehealth.com/blog/cutting-latency-by-up-to-15-percent).

### OpenCap — çok kamera ve yeni tek kamera sürümü ayrı

2023 hakemli çalışması kalibrasyon tahtası, en az iki telefon, çoklu bakış ve biyomekanik modellemeyle yürütülmüş; test edilen görevlerde ortalama eklem açısı mutlak hatası 4,5° bildirilmiş. Resmî çekim rehberi kameraları kalibrasyondan sonra oynatmamayı ve segmentlerin en az iki kameradan görünmesini istiyor.

Mart 2026 tarihli OpenCap Monocular ön baskısı tek sabit telefon videosu, WHAM/ViTPose, hareket dizisi optimizasyonu ve OpenSim kullanıyor. Kişinin boyu ve cihazın kamera iç parametreleri de yönteme giriyor. Yürüme, squat ve otur-kalk için ortalama dönme açısı hatası 4,8° bildiriliyor. Canlı hizmet iOS ve bulut işlemeye dayanıyor; sitede monocular beta olarak sunuluyor. Ön baskının hakemli yayın statüsü bu araştırmada doğrulanmadı.

Bizim çıkarımımız: tek kamera ile daha ileri analiz mümkündür; yalnız üç noktanın açısını almak aynı yöntem değildir. Bu işlem hattını mevcut Vercel/browser/yerel görüntü sınırımıza doğrudan eklenebilir bir kütüphane gibi kabul etmeyiz. İleride kod/model lisansları, işlem maliyeti ve yerel çalışma ayrıca incelenir. Bildirilen ortalama hata, her ölçüm için ±4,8° garanti veya bizim değişim eşiğimiz değildir.

Kaynaklar: [2023 hakemli çalışma](https://doi.org/10.1371/journal.pcbi.1011462), [çekim rehberi](https://www.opencap.ai/best-practices), [2026 monocular ön baskı ve yöntem](https://arxiv.org/html/2603.24733v1), [güncel ürün](https://www.opencap.ai/).

### VALD HumanTrak — derinlik kamerası

Üretici RGB-D kamerayla renk ve derinliği birlikte kullandığını; hareketin tekrarlarını/fazlarını ayırıp açı, hareket açıklığı ve yer değiştirme raporladığını açıklıyor. Buradaki tek kamera, sıradan RGB telefon kamerası değildir. Üreticinin doğrulama özeti, ayrı hareket görevleri için referans sistemle karşılaştırma ve günler arası tekrar ölçüm değerlendirmesi anlatıyor. Bu özeti bağımsız araştırmanın tam metnini incelemiş gibi sunmuyoruz.

Bizim çıkarımımız: metriği hangi görevde, hangi donanımla ve hangi işlemlerle ürettiğimizi sürümlemeliyiz. Hareketin bütün zaman dizisinden rapor üretme yaklaşımı kullanılabilir; derinlik donanımının performansı MediaPipe/Android'e taşınamaz.

Kaynaklar: [üretici yöntem açıklaması](https://valdhealth.com/news/understanding-markerless-motion-capture-with-humantrak), [üretici doğrulama özeti](https://valdhealth.com/news/validity-and-reliability-of-movement-analysis-methods-used-in-humantrak).

### msk.ai Deep Vision — belirli bir diz testi için somut protokol

2026 Physiotherapy çalışması diz osteoartriti olan 15 kişide yatarak aktif diz bükme/açmayı değerlendirmiş. Beş tekrarda uçlarda kısa bekleme; 3 m uzaklıkta tripod, yandan ve belirlenmiş yükseklikte telefon; uygulamada yatay/dikey eğimin 1° altında olması koşulu kullanılmış. Tepe bükülme/açılma ve aralarındaki hareket açıklığı ortadaki üç tekrardan ortalanmış. Referans 3D sistemle uyum ve tekrarlar arası güvenilirlik Bland–Altman ile incelenmiş. Videolar bulutta işlenmiş.

Bizim çıkarımımız: anlamlı telefon ölçümü için çekim prosedürü ve tekrar özeti birlikte gerekir. Bu çalışmanın hasta grubu, yatarak diz testi, Deep Vision modeli ve telefon düzeni; sağlıklı kişilerin squat'ı veya bizim omuz çizgimiz için doğrulama sağlamaz. Makaledeki klinik değişim eşikleri bize doğrudan aktarılmaz.

Kaynak: [özgün makalenin üniversite arşivindeki tam metni, yöntem s.2–3](https://research.edgehill.ac.uk/ws/files/103217753/PIIS0031940625003888.pdf).

## 2. Şimdiki uygulamayla fark

Mevcut uygulama MediaPipe noktalarından anlık 2D izdüşüm açıları çıkarıyor. Piksel en/boy oranı hesaba katılıyor; görüntü aynalaması sayısal hesabı değiştirmiyor. Gerekli noktalar belirsizse ölçüm reddediliyor. Ancak kamera eğimi ölçülmüyor, hareket tekrarı ayrıştırılmıyor, sonuç tek kareden geliyor ve kalıcı ölçüm geçmişine yazılmıyor.

Dolayısıyla şu anda ürünün çıktısı kalibre edilmiş postür değerlendirmesi, anatomik omuz genişliği, omurga eğriliği, eklem kuvveti veya egzersiz reçetesi değildir. Model görünürlüğü, derece doğruluğunun yüzdesi değildir. Aynı kişinin görüntüsünü sıfır kabul edip tüm duruş farkını çıkarmak gerçek bulguyu da silebilir; bu kalibrasyon yöntemi kullanılmaz.

## 3. Bizim için önerilen kapsam

Bunlar araştırmadan üretilmiş ürün önerileridir; hazır doğrulanmış protokol olarak sunulmaz.

| Aday | Kamera yönü ve çıktı | Öncelik / sınır |
|---|---|---|
| Kontrollü squat | Yandan; geçerli tekrarlar, görünür tarafın 2D diz hareket açıklığı, gövde ekseni | İlk hareket pilotu adayı. Önden görünen diz iç açısını sagittal diz bükülmesi diye sunmayız. Yeni prosedürün doğrulaması gerekir. |
| Otur-kalk | Sabit sandalye ve çekim; tamamlanan tekrarlar, görev süresi | İşlevsel takip adayı. Sandalye yüksekliği, kol desteği ve yardım kullanımı kayda girer; değişen koşullar karşılaştırılmaz. |
| Önden statik duruş | Omuz/gövde çizgisinin görüntü eksenlerine göre eğimi | İkincil betimleme; kısa sabit duruş örneklerinin özeti. Tek başına normal/bozuk veya hangi kasın zayıf olduğu hükmü verilmez. |
| Omuz genişliği / boyut | Santimetre | Öncelikle manuel. Kamera seçeneği için ölçek, perspektif ve anatomik nokta yöntemini ayrı doğrulamak gerekir. |
| Omurga eğriliği, kuvvet, doku aktivitesi | Mevcut RGB görüntü hattıyla yok | Bu ürün kapsamına ölçülmüş sonuç olarak alınmaz. |

İlk sürümde bütün testleri birden açmak yerine bir hareket testi uçtan uca tamamlanır. Test ve kullanıcı için uygun hareket sınırı PT tarafından belirlenir. Kamera reddi veya testin uygulanamaması manuel alternatife götürür; başarı puanı düşürmez.

## 4. Uygulama akışı

1. **Görev seçimi:** Ne ölçülecek, hangi yönden ve hangi hareketle? Kısa görsel yönerge ve PT'nin belirlediği sınır.
2. **Çekim kontrolü:** Sabit kamera, tam gerekli segmentler, tek kişi, aydınlatma ve hedef yön. Desteklenen telefonlarda izinli cihaz yönelim verisiyle kamera düzlüğü kontrol edilebilir; sensör/izin yoksa eşdeğer doğrulanmış görsel referans veya manuel yöntem gerekir. Kendiliğinden tüm tarayıcılarda su terazisi varmış gibi davranılmaz.
3. **Hazırlık ve başlangıç:** Hazır pozisyona geldikten sonra geri sayım. Görünür nokta bulundu diye test tamamlanmış sayılmaz.
4. **Yerel örnek toplama:** Görüntü kaydedilmeden geçici kareler işlenir. Zaman bilgisiyle hareket fazları/tekrarları ayrılır. Kaybolan eklem, kadraj değişimi ve kamera hareketi ilgili örneği/tekrarı geçersiz kılar. Rastgele tek tepe yerine görev sözleşmesindeki özet yöntemi kullanılır.
5. **Kalite değerlendirmesi:** Geçerli örnek oranı, tekrar sayısı, örnekler/tekrarlar arası dağılım, gerçek örnekleme hızı ve eksik segmentler değerlendirilir. Pilot teknik sınırlar ile klinik değişim eşiği farklıdır; sayıları literatürden gelişigüzel kopyalamayız.
6. **Sonuç ve kayıt:** Değerler, birimler, taraf, tarih, görev/protokol/model/işleme sürümü, çekim koşulları ve kalite özeti gösterilir. Ayrı kayıt tercihiyle danışanın kendi reposuna yazılır. Fotoğraf/video veya tam landmark zaman dizisi kalıcılaştırılmaz.
7. **Karşılaştırma:** Aynı yöntem ve koşuldaki kayıtlar eşleşir. Bilinmeyen ölçüm hatasıyla küçük farktan gelişme iddiası çıkmaz. Hata sınırı doğrulanmamışsa sayısal fark yalnız betimlenir.
8. **PT ve AI:** Motor uygun veri varsa açıklama ve ek test/program taslağı adayı oluşturur. Sonucu kişiyi yargılayan bir beden puanına çevirmez. Statik çizgi açısı tek başına kas disfonksiyonu veya egzersiz seçimi kuralı olmaz. Program ataması PT onayından geçer.

## 5. Açılma koşulları

- Her aday için test kartı: hedef metrik, anatomik tanım, kamera düzlemi, kullanılan taraf, başlangıç/son pozisyon, tekrar/özet yöntemi, teknik ret nedenleri ve PT inceleme alanları.
- Gerçek danışan verisi kullanılmadan senaryolar; sonra ayrı izinli cihaz/katılımcı pilotu. Yöntem karşılaştırması ve tekrar ölçüm tasarımında gerekli örneklem, beklenen hatanın güven aralığı ve amaçlanan kullanım üzerinden belirlenir.
- Referans gonyometre/uygun ölçüm sistemiyle aynı görevde eşleştirme; yalnız korelasyon değil sistematik fark ve %95 uyum sınırları. Aynı gün ve farklı gün tekrarlanabilirliği ayrı değerlendirilir. Referansın kendi hatası da hesaba katılır.
- Android/iOS cihaz, tarayıcı, ışık, kıyafet, görünürlük ve örnekleme hızı kapsamı tanımlanır. Doğrulanmayan cihaz/koşulda klinik veya program kararına girdi açılmaz.
- Sonuç kayıt endpoint'inde PT/danışan yetkisi, modül ve onay, izin iptali, kaynak/doğrulama durumu, şema sınırları ve çift gönderim test edilir. İstemcinin “doğrulanmış” yazması yetmez.
- Model/protokol değiştiğinde eski kayıtlarla karşılaştırmanın uygunluğu yeniden değerlendirilir.

## 6. Karar ve sıradaki teslim

Mevcut MediaPipe çıkarımı yerel algılama tabanı olarak korunabilir. Serbest kamera ekranı; görev ve çekim protokolü olan bir ölçüm oturumuna dönüştürülmelidir. İlk teslim: bir hareket testinin çekim/tekrar/kalite/özet/kayıt/geçmiş zinciri. Bu zincir tamamlanınca belirlenen kapsamda doğrulama yapılır; başarı varsa AI karar katmanına kademeli açılır.

OpenCap veya başka bir bulut hizmetine görüntü gönderme, özel kamera satın alma, ticari SDK entegrasyonu ve ön baskı kodunu doğrudan ürüne alma bu araştırmayla yetkilendirilmiş veya uygulanmış değildir. Sadece isim/özellik kopyalamak yerine prosedür, kanıt sınırı ve kullanıcı akışı örnek alınmıştır.
