# PulseCoach (Mobil Öncelikli Akıllı PT & Danışan Ekosistemi)

Kapsamlı Ürün Gereksinim Dokümanı (PRD) ve Sistem Mimarisi

## 1. Proje Vizyonu ve Değer Önerisi

PulseCoach, klasik "statik not defteri" fitness uygulamalarının ötesine geçen; antrenörün (PT) uzaktan koçluk operasyonunu güvenli kılan, danışanın antrenman anındaki bilişsel yükünü sıfırlayan, sıfır medya/depolama maliyetiyle çalışan akıllı ve reaktif bir antrenman ekosistemidir.

### Temel Hedefler

- **Sıfır Parola Yönetimi & Güvenli Giriş:** Parola tutulmaz, şifre sıfırlama süreçleri bulunmaz. Yalnızca Google OAuth ve E-posta Tek Kullanımlık Kod (OTP) ile hızlı, kalıcı oturum sağlayan modern giriş mimarisi.
- **Sıfır Medya Depolama Maliyeti:** Görsel veya video yüklemesi barındırmaz. Egzersiz videoları YouTube/Vimeo embed oynatıcıları üzerinden çalışır. Tüm mimari ilişkisel metin/sayı tabanlıdır.
- **Güvenlik ve Eşik Yönetimi (Guardrails):** Danışanın kontrolsüz ağırlık artışlarını engelleyen ve PT'ye anlık kritik alarmlar üreten güvenlik mekanizması.
- **Akıllı Otomasyon (Auto-Regulation):** Hazır oluşluk (Readiness) anketine göre antrenman hacmini dinamik ölçekleme ve yorgunluk birikiminde otomatik deload uyarıları.
- **Sürtünmesiz Salon Deneyimi:** Terli ellerle, tek parmakla kolayca yönetilebilen, makine sırasına göre dinamik yeniden sıralanabilir (DND), dinlenme ve hidrasyon odaklı antrenman modu.

## 2. Kimlik Doğrulama ve Oturum Mimarisi (Authentication & Session)

### 2.1. Parolasız (Passwordless) Giriş Felsefesi

Sistemde klasik kullanıcı adı/parola kombinasyonu kesinlikle yer almaz; parola hash'i dahi saklanmaz. Kullanıcılar sadece iki kanaldan sisteme dahil olur:

1. **Google OAuth (Tek Tıkla Giriş):** Mobil cihazdaki kayıtlı Google hesabı ile anında kimlik doğrulama.
2. **E-posta ile OTP (One-Time Password / 6 Haneli Kod):**
   - Kullanıcı sadece e-posta adresini yazar ve "Giriş Kodu Gönder" butonuna basar.
   - Supabase Auth e-posta adresine 6 haneli, 5 dakika geçerli tek kullanımlık bir doğrulama kodu iletir.
   - Kullanıcı gelen kodu girdiğinde hesap doğrulanır. Yeni kullanıcıysa otomatik profil oluşturulur, kayıtlı kullanıcıysa doğrudan profiline bağlanır.

### 2.2. Kalıcı Oturum (Persistent Session) Yönetimi

- Kullanıcı manuel olarak "Çıkış Yap" (Logout) butonuna basmadığı sürece oturum asla sonlanmaz.
- Cihaz hafızasında (React Native için SecureStore / PWA için IndexedDB / LocalStorage) saklanan uzun ömürlü Refresh Token mekanizması ile token arka planda sessizce yenilenir.
- Uygulama her açıldığında doğrudan ilgili role (PT Dashboard veya Danışan Dashboard) yönlendirilir; tekrar tekrar giriş ekranı gösterilmez.

### 2.3. İlk Kurulum ve Rol Belirleme (Onboarding)

İlk defa giriş yapan kullanıcının karşısına tek adımlık rol seçimi ekranı çıkar:

- **"Ben Antrenörüm (PT)":** PT Dashboard arayüzüne yönlendirilir ve danışan eşleştirme kodu üretebilir.
- **"Ben Danışanım (Client)":** Danışan arayüzüne yönlendirilir; doğrudan PT davet kodunu girerek veya tek başına antrenman yaparak başlayabilir.

## 3. Kullanıcı Rolleri ve Yetki Matrisi

| Yetki / İşlem | Super Admin | Personal Trainer (PT) | Danışan (Client) |
|---|---|---|---|
| Global Egzersiz Kütüphanesi Ekleme/Düzenleme | Evet | Hayır (Öneri yapabilir) | Hayır |
| Kendi Özel Egzersizini Tanımlama | Evet | Evet | Evet (Sadece kendisi görür) |
| Danışan Davet Kodu Üretme / Eşleşme | Hayır | Evet | Evet (Kodu girer/doğrular) |
| Antrenman Şablonu Tasarlama | Evet | Evet (Danışanlarına atar) | Evet (Sadece kendisi için) |
| Egzersiz Öncelik / Sıra Değiştirme (DND) | Hayır | Evet | Evet (Antrenman anında) |
| Tolerans / Güvenlik Eşiği Belirleme | Hayır | Evet | Hayır |
| Aşırı Yükleme (Overload) Alarmı İnceleme | Hayır | Evet | Hayır (Sadece uyarı görür) |
| Fonksiyonel & Denge Ölçümleri Girme | Hayır | Sadece PT | Hayır (Sadece okur) |
| Temel Vücut Ölçümleri (Kilo vb.) Girme | Hayır | Evet | Evet |
| Readiness Check-in Doldurma | Hayır | Hayır | Evet |
| Canlı Antrenman Set Girişi & Zamanlayıcı | Hayır | Hayır | Evet |

## 4. Temel İş Mantığı ve Algoritma Kuralları

### 4.1. Eşleşme Mekanizması (Two-Way Handshake)

- PT, paneli üzerinden "Yeni Danışan Bağla" diyerek 6 haneli alfa-numerik, 24 saat geçerli tek kullanımlık bir kod üretir.
- Danışan kendi profilinde bu kodu girer.
- Eşleşme onaylandığında PT'nin danışan havuzuna eklenir; PT danışanın geçmiş verilerine, ölçümlerine ve loglarına tam erişim kazanır.

### 4.2. Güvenlik Eşiği ve Aşırı Yükleme Kuralı (Guardrails Engine)

- **Kural Tanımı:** PT egzersiz bazında veya genel olarak bir sapma toleransı tanımlar (Varsayılan: %20 veya +5 kg).
- **Tetiklenme:** Danışan, PT'nin belirlediği hedef ağırlığın (örneğin 20 kg) tolerans sınırının üzerinde (örneğin 50 kg) bir değer kaydettiğinde:
  - Danışan ekranında teyit modalı açılır: "Antrenörünün belirlediği hedefin (+%150) çok üzerindesin. Bu veriyi onaylıyor musun?"
  - Veri onaylansa dahi sete `overload_flag = true` damgası vurulur.
  - PT'nin ana sayfasındaki "Acil Alarmlar" vitrinine kırmızı bildirim düşer: "⚠️ Ahmet, Barbell Squat egzersizinde 20 kg hedef yerine 50 kg girdi."

### 4.3. Readiness ve Dinamik Deload Algoritması

Antrenman öncesi doldurulan 4 soruluk check-in (Uyku [1-5], Enerji [1-5], Kas Ağrısı/DOMS [1-5], Stres [1-5]) sonucunda bir Hazır Oluşluk Skoru (0 - 100) hesaplanır:

```
Readiness = ((Uyku + Enerji + (6 - Ağrı) + (6 - Stres)) / 20) × 100
```

**Skor < %60 İse:** PT kuralına göre iki mod çalışır:

- **Otomatik Mod:** Sistem o günkü ağırlıkları otomatik %15 düşürür, son setleri kırpar.
- **Onay Modu:** Danışana öneri kartı sunulur: "Toparlanman düşük görünüyor. Antrenman hacmini koruyucu seviyeye çekelim mi?"

**Bölgesel Ağrı Koruması:** Danışan spesifik bir bölge (örn: "Alt Bel") seçtiyse, o günkü listede bu bölgeyi primer kullanan egzersizlerin yanına sarı dikkat rozeti eklenir.

### 4.4. Tahmini 1RM ve Kişisel Rekor (PR) Hesaplama

Her tamamlanan çalışma setinde Epley formülü kullanılarak anlık tahmini 1RM hesaplanır:

```
1RM = Ağırlık × (1 + Tekrar / 30)
```

Hesaplanan değer, danışanın o egzersizdeki geçmiş en yüksek değerini aşıyorsa:

- Arayüzde anlık kutlama rozeti çıkar: "Yeni Tahmini 1RM Rekoru!"
- Egzersizin PR kütüğü güncellenir ve PT paneline başarı logu iletilir.

### 4.5. Kümülatif Yorgunluk ve Deload Radarı

- Sistem son 3 haftalık Toplam Hacim Yükü (Volume Load = Set × Tekrar × Ağırlık) ile haftalık ortalama Readiness skorunu çapraz kontrol eder.
- **Tetikleyici:** Son 2 haftada toplam hacim yüksek seyrederken ortalama Readiness puanı art arda düşüş gösteriyorsa, PT ana paneline akıllı öneri kartı düşer:
  - ℹ️ "Ahmet son 14 gündür kümülatif yorgunluk biriktiriyor. Önümüzdeki hafta için deload planlamayı değerlendirin."

## 5. Ekran Hiyerarşisi ve Akış Mimarisi

### 5.1. Giriş ve Karşılama Akışı (Auth & Onboarding)

```
[Giriş Akışı]
  ├── A1: Karşılama & Giriş Ekranı (Login Screen)
  │     ├── [G] Google ile Tek Tıkla Giriş
  │     ├── Ayırıcı Çizgi ("veya e-posta ile")
  │     ├── E-posta Giriş Kutusu
  │     └── [Giriş Kodu Gönder] Butonu
  ├── A2: E-posta OTP Doğrulama Ekranı
  │     ├── 6 Haneli Sayısal Kod Giriş Alanı (Auto-focus)
  │     ├── Kalan Süre Sayacı (05:00) & "Kodu Tekrar Gönder" Butonu
  │     └── Otomatik Doğrulama (6 hane tamamlandığında anında login)
  └── A3: İlk Kurulum / Rol Seçimi (Sadece İlk Girişte)
        ├── "Antrenörüm (PT)" Kartı
        └── "Danışanım / Sporcuyum" Kartı
```

### 5.2. Danışan (Client) Arayüzü

```
[Danışan Akışı]
  ├── C1: Ana Sayfa (Dashboard)
  │     ├── Bugünün Antrenman Kartı
  │     ├── Haftalık Seri & Hacim Özeti
  │     └── Son Ölçüm Değişimleri
  ├── C2: Readiness Check-in (Modal / Kısa Ekran)
  ├── C3: Antrenman Öncesi Hazırlık Ekranı
  │     ├── Egzersiz Sıralama (DND Liste)
  │     ├── Egzersiz Atlama (Skip) ve Gerekçe Seçimi
  │     └── Acil Çıkış Modu (Time-Crunch Filtresi)
  ├── C4: Aktif Antrenman Ekranı (Odak Modu)
  │     ├── Sabit Üst Panel (Toplam Süre, Egzersiz İlerlemesi)
  │     ├── Egzersiz Detay Kartı (YouTube Embed, Püf Noktalar, Önceki Not)
  │     ├── Süperset Zincir Kartı (Birleşik Hareketler)
  │     ├── Set Giriş Tablosu (Hızlı +/- Butonları, Tamamlandı Tipi)
  │     ├── Akıllı Isınma Seti Açılır Paneli
  │     └── Dinlenme Zamanlayıcısı (Rest Timer) & [💧 Su İçtim] Butonu
  ├── C5: Antrenman Kapanış Ekranı
  │     ├── Başarı ve PR Kutlamaları
  │     ├── Session RPE (1-10 Slider)
  │     └── Bitiş Enerji Durumu Seçimi
  └── C6: Profil & Geçmiş Ekranı
        ├── Geçmiş Antrenman Günlükleri
        ├── Ölçüm Grafikleri (Sadece okuma)
        ├── PT Eşleşme Ayarları
        └── [Oturumu Kapat] Butonu
```

### 5.3. Antrenör (PT) Arayüzü

```
[Antrenör Akışı]
  ├── P1: PT Dashboard (Komuta Merkezi)
  │     ├── Canlı Takip Radarı (Şu An Salonda Olanlar)
  │     ├── Kritik Alarmlar (Aşırı Ağırlık Aşımları, Düşük Readiness)
  │     └── Akıllı Öneriler (Deload Radarı)
  ├── P2: Danışan Yönetim Merkezi
  │     ├── Danışan Listesi & Eşleşme Kodu Üretici
  │     └── Danışan Detay Profili
  │           ├── Geçmiş Antrenman Logları & PR Verileri
  │           ├── Toplam Tonaj ve Hacim Eğrileri
  │           └── Antrenman Programı Atama / Düzenleme
  ├── P3: Özel Ölçüm & Değerlendirme Ekranı (PT-Only)
  │     ├── Fonksiyonel Değerlendirme & Denge Skorları
  │     └── Çevre Ölçümleri (Mezura / Antropometrik Giriş)
  ├── P4: Program & Şablon Tasarımcısı
  │     ├── Blok ve Hafta Planlama
  │     ├── Egzersiz Ekleme & Süperset Gruplama
  │     └── Hedef Set, Tekrar, Ağırlık, Dinlenme ve Güvenlik Toleransı Tanımlama
  ├── P5: Egzersiz Havuzu Arayüzü (Özel Hareket Tanımlama)
  └── P6: Profil ve Ayarlar
        └── [Oturumu Kapat] Butonu
```

## 6. Ekran Detayları ve Kullanıcı Deneyimi (UX) Şartnamesi

### Ekran A1 & A2: Parolasız Hızlı Giriş (Passwordless Auth UX)

- **Temiz Tasarım:** Karmaşık kayıt formları, parola kuralları (büyük harf, özel karakter vb.) yok.
- **Hızlı E-posta Girişi:** E-posta yazılıp gönderildiğinde klavye doğrudan 6 haneli OTP kutucuklarına odaklanır. Kullanıcı mailden kodu kopyalayıp yapıştırdığı anda otomatik form gönderimi tetiklenir (Enter butonuna basmaya gerek kalmaz).
- **Kalıcı Oturum:** Giriş başarılı olduktan sonra token cihazda kalır. Kullanıcı haftalar sonra uygulamayı açsa bile login ekranı görmez, doğrudan kaldığı yerden devam eder.

### Ekran C4: Aktif Antrenman Ekranı (Tasarım Çekirdeği)

- **Ergonomi:** Ekranın alt yarısı başparmak erişim alanıdır (Thumb Zone). Sayısal klavye açılmasını minimize etmek için `[-5] [-1] [Değer] [+1] [+5]` buton blokları yer alır.
- **Önceki Not İpucu:** Danışanın geçen hafta o egzersize yazdığı not (örneğin: "Koltuk boyu 4, ayaklar ileride"), egzersiz başlığının hemen altında sarı yumuşak bir rozet olarak yer alır.
- **Süperset Akışı:** Süperset hareketler arasına dinlenme sayacı koyulmaz. Hareket A (Set 1) tamamlandığında doğrudan Hareket B (Set 1)'e odaklanır; ikisi bitince ortak sayaç başlar.
- **Rest Timer & Hidrasyon:** Sayaç geri sayarken ekranın ortasında belirgin bir `[💧 Su İçtim]` butonu bulunur. Tıklandığında küçük bir mikro animasyonla su sayacına +1 eklenir.

### Ekran C3: Acil Çıkış (Time-Crunch) Modu

- Danışan antrenmana başlamadan önce "Zamanım Kısıtlı" butonuna dokunur ve süresini seçer (örneğin: 25 dakika).
- Sistem, antrenmandaki `is_priority = false` olan tüm aksesuar/izole hareketleri tek tıkla pasife çeker, sadece bileşik (compound) ana hareketleri korur.

### Ekran P3: Ölçüm ve Değerlendirme (PT-Only Input)

- Danışan bu ekrana veri giremez, sadece geçmişini grafik olarak görüntüler.
- PT; Y-Balance, Tek Bacak Denge Süresi (göz açık/kapalı saniye), Postür Sapma Notları ve mezura ölçümlerini (kol, omuz, göğüs, bel, kalça, bacak) tarih damgalı olarak kaydeder.

## 7. Veritabanı Şeması (PostgreSQL / Supabase Taslağı)

```sql
-- 1. KULLANICI PROFİLLERİ
-- Not: auth.users tablosu Supabase Auth tarafından yönetilir.
-- Google OAuth ve Email OTP ile bağlanan her kullanıcı için bu tabloya tetikleyici ile profil eklenir.
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) CHECK (role IN ('super_admin', 'pt', 'client')) DEFAULT 'client',
    full_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PT - DANIŞAN EŞLEŞMELERİ
CREATE TABLE pt_client_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pt_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    pairing_code VARCHAR(8) UNIQUE,
    code_expires_at TIMESTAMPTZ,
    status VARCHAR(20) CHECK (status IN ('pending', 'active', 'terminated')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pt_id, client_id)
);

-- 3. MERKEZİ EGZERSİZ KÜTÜPHANESİ (Medya embed tutulur)
CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES profiles(id), -- Null ise sistem genelidir
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL, -- Isınma, Bileşik, İzole, Soğuma
    target_muscle VARCHAR(50) NOT NULL,
    video_embed_url TEXT, -- YouTube/Vimeo Embed URL
    cues_and_tips TEXT, -- Adım adım talimatlar ve püf noktalar
    is_compound BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DANIŞANIN EGZERSİZ AYAR NOTLARI
CREATE TABLE user_exercise_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
    note TEXT NOT NULL, -- Örn: Pim 4'te takılacak
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, exercise_id)
);

-- 5. ÖLÇÜMLER VE DEĞERLENDİRMELER (Sadece PT yazar)
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    recorded_by_pt_id UUID REFERENCES profiles(id) NOT NULL,
    balance_tests JSONB, -- Örn: {"single_leg_left_sec": 24, "single_leg_right_sec": 20}
    body_measurements JSONB, -- Örn: {"waist_cm": 82, "arm_left_cm": 36, "weight_kg": 78.5}
    clinical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PROGRAM ŞABLONLARI
CREATE TABLE workout_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to_client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    auto_deload_enabled BOOLEAN DEFAULT TRUE,
    weight_tolerance_percentage INT DEFAULT 20, -- Eşik toleransı
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ŞABLON EGZERSİZLERİ (Süperset & Öncelik Sıralı)
CREATE TABLE template_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES workout_templates(id) ON DELETE CASCADE,
    exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
    order_index INT NOT NULL,
    superset_group_id UUID, -- Aynı gruptakiler peş peşe yapılır
    target_sets INT NOT NULL,
    target_reps VARCHAR(20) NOT NULL,
    target_weight_kg NUMERIC(5,2),
    rest_seconds INT DEFAULT 60,
    is_priority BOOLEAN DEFAULT TRUE -- Acil çıkış modunda elenip elenmeyeceği
);

-- 8. GERÇEKLEŞEN ANTRENMAN GÜNLÜĞÜ
CREATE TABLE workout_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    template_id UUID REFERENCES workout_templates(id),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    session_rpe INT CHECK (session_rpe BETWEEN 1 AND 10),
    water_intake_count INT DEFAULT 0,
    end_energy_status VARCHAR(20),
    total_tonnage_kg NUMERIC(8,2) DEFAULT 0
);

-- 9. READINESS LOGLARI
CREATE TABLE readiness_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_log_id UUID REFERENCES workout_logs(id) ON DELETE CASCADE,
    score INT NOT NULL,
    sleep_rating INT NOT NULL,
    energy_rating INT NOT NULL,
    soreness_rating INT NOT NULL,
    stress_rating INT NOT NULL,
    pain_areas TEXT[] -- Dizi formatında ağrılı bölgeler: ['lower_back', 'left_shoulder']
);

-- 10. SET VERİLERİ (PR & Güvenlik Takibi)
CREATE TABLE set_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_log_id UUID REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
    set_number INT NOT NULL,
    reps_completed INT NOT NULL,
    weight_kg NUMERIC(5,2) NOT NULL,
    is_warmup BOOLEAN DEFAULT FALSE,
    overload_flag BOOLEAN DEFAULT FALSE, -- Limit aşıldı mı?
    estimated_1rm NUMERIC(5,2),
    is_pr BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PT KRİTİK ALARMLARI
CREATE TABLE pt_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pt_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    workout_log_id UUID REFERENCES workout_logs(id) ON DELETE CASCADE,
    alert_type VARCHAR(30) CHECK (alert_type IN ('OVERLOAD_RISK', 'LOW_READINESS', 'DELOAD_RECOMMENDED', 'PR_ACHIEVED')),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 8. Örnek JSON Veri Modelleri

### 8.1. E-posta OTP İstek ve Yanıt Modeli (Supabase Auth Uyumlu)

```jsonc
// POST /auth/v1/otp İstek Gövdesi
{
  "email": "danisan@example.com",
  "create_user": true
}

// POST /auth/v1/verify İstek Gövdesi (Kod Doğrulama)
{
  "type": "email",
  "email": "danisan@example.com",
  "token": "749201"
}

// Başarılı Yanıt (Kalıcı Oturum İçin Tokenlar)
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "r_38fj93...",
  "expires_in": 3600,
  "user": {
    "id": "7f8469d4-b772-4e4b-a25e-38f3224b7890",
    "email": "danisan@example.com",
    "app_metadata": { "provider": "email" }
  }
}
```

### 8.2. Aktif Antrenman Ekranı İçin Şablon Payload'ı

```json
{
  "workout_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "template_title": "Üst Vücut Hipertrofi (A Blok)",
  "tolerance_percentage": 15,
  "exercises": [
    {
      "order_index": 1,
      "exercise_id": "ex_101",
      "title": "Barbell Bench Press",
      "category": "Bileşik",
      "video_url": "https://www.youtube.com/embed/rT7DgCr-3pg",
      "previous_user_note": "Sehpada bel boşluğunu koru, skapulaları sık",
      "is_priority": true,
      "superset_group_id": null,
      "warmup_suggestions": [
        { "reps": 10, "weight_kg": 20 },
        { "reps": 5, "weight_kg": 40 }
      ],
      "target_sets": [
        { "set_number": 1, "target_reps": 8, "target_weight_kg": 60, "rest_seconds": 90 },
        { "set_number": 2, "target_reps": 8, "target_weight_kg": 60, "rest_seconds": 90 },
        { "set_number": 3, "target_reps": 8, "target_weight_kg": 60, "rest_seconds": 90 }
      ]
    },
    {
      "order_index": 2,
      "exercise_id": "ex_202",
      "title": "Incline Dumbbell Curl",
      "category": "İzole",
      "is_priority": false,
      "superset_group_id": "group_super_1",
      "target_sets": [
        { "set_number": 1, "target_reps": 12, "target_weight_kg": 12, "rest_seconds": 0 }
      ]
    },
    {
      "order_index": 3,
      "exercise_id": "ex_203",
      "title": "Triceps Rope Pushdown",
      "category": "İzole",
      "is_priority": false,
      "superset_group_id": "group_super_1",
      "target_sets": [
        { "set_number": 1, "target_reps": 12, "target_weight_kg": 25, "rest_seconds": 60 }
      ]
    }
  ]
}
```

### 8.3. PT Acil Durum Alarm Payload'ı (Aşırı Yükleme)

```json
{
  "alert_id": "alt_8819",
  "type": "OVERLOAD_RISK",
  "severity": "CRITICAL",
  "client_name": "Ahmet Yılmaz",
  "exercise_title": "Barbell Bench Press",
  "target_weight_kg": 60.0,
  "logged_weight_kg": 90.0,
  "deviation_percentage": 50.0,
  "timestamp": "2026-09-15T12:35:00Z",
  "action_required": "Danışanla iletişime geçin veya seti onaylayın."
}
```
