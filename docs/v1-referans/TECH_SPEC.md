# PulseCoach — Teknik Şartname (TECH_SPEC v1.1)

| Alan | Değer |
|---|---|
| Tarih | 2026-09-15 |
| Kaynaklar | `prd.md` (PRD) + 6 boyutlu inceleme bulguları (AUTH, DATA, SEC, ALGO, UX, SCOPE; refuted olanlar elendi) |
| Hedef stack | Expo SDK 57 (expo 57.0.22, RN 0.86.3, React 19.2.3, Expo Router, TS 6), Supabase (supabase-js 2.116.0, CLI 2.117.0, Postgres 17) |
| Proje yolu | `/Users/goker/Projects/pulsecoach` (create-expo-app default template; route kökü `src/app`) |
| Statü | Kod yazacak ajanlar için **tek doğruluk kaynağı**. PRD ile çelişen her yerde bu belge geçerlidir (bkz. §10). |
| Doğrulama | **v1.1 (revizyon):** §4–§6'daki SQL, `public.ecr.aws/supabase/postgres:17.6.1.167` imajında (auth/realtime şeması test için stub'lanmış; pg_cron, pg_net, pgtap) migration 01–05 + seed olarak uygulanıp **245 pgTAP assertion'ının tamamı geçerek** doğrulandı (§11.3; v1.0 SQL'i aynı ortamda 152/152 geçip eleştirideki hataları yeniden üretti). RLS performansı 12.000 satırlık EXPLAIN ANALYZE ile (§11.4), `seed-demo.sql` iki kez üst üste çalıştırılarak (idempotent) doğrulandı; geçici konteyner kaldırıldı. §1'deki sürümler 2026-09-15'te `npm view` ve `node_modules/expo/bundledNativeModules.json` ile doğrulandı; `react-native-webview` 13.16.1 navigasyon davranışı paket kaynağından, Expo push kurulumu docs.expo.dev'den teyit edildi. §7 test vektörleri referans JS uygulamasıyla hesaplandı; SQL karşılıkları pgTAP'te aynı değerlerle test edildi. Değişiklik gerekçeleri: belge sonundaki **Revizyon Notları**. |

**Dil kuralları:** "ZORUNLU" = uyulmazsa kabul edilmez. "YASAK" = hiçbir koşulda yapılmaz. "VARSAYILAN" = ürün sahibi aksini söylemedikçe uygulanır (bkz. §12).

---

## 0. Özet ve temel kararlar

PulseCoach; parolasız giriş (e-posta OTP + Google native + iOS'ta Apple), sıfır medya depolama (YouTube/Vimeo yalnızca `provider + video_id`), sunucu otoriter guardrail (aşırı yük), readiness tabanlı auto-deload ve salonda çevrimdışı dayanıklı set girişi olan bir mobil uygulamadır. Mimari üç katmandır:

1. **Supabase Postgres = iş kurallarının otoritesi.** Guardrail, e1RM, PR, alarm, deload snapshot'ı, eşleşme, rıza ve yetki kuralları trigger/RPC/RLS ile veritabanında uygulanır. İstemci aynı kuralları yalnızca anlık UX için saf TS modülünde (`src/domain`) tekrar hesaplar; sunucu sonucu esastır.
2. **İstemci = Expo development build.** Okuma cache'i TanStack Query, oturum içi yazımlar SQLite outbox (idempotent, istemci UUID'li). Aktif antrenman bağlantı kopsa da çalışır; oturum **başlatma** online zorunludur.
3. **Yan servisler = Edge Functions + pg_cron + pg_net.** Hesap silme, App Review girişi, push teslimi (Expo Push API), zamanlanmış işler (yarım oturum kapatma, deload radarı, temizlik).

### 0.1 Karar tablosu

| # | Karar | Gerekçe | Bulgular |
|---|---|---|---|
| K1 | İlk günden **EAS development build** (`expo-dev-client`). Expo Go yalnızca UI/OTP denemesi içindir. | Native Google/Apple girişi, remote push (Android'de SDK 53'ten beri Expo Go'da yok), SQLite/secure store gerçek cihaz davranışı. | AUTH-7, UX-4, SCOPE-13 |
| K2 | Giriş kanalları: **E-posta OTP (6 hane, 300 sn, 60 sn resend)** + **Google native (`react-native-nitro-google-signin`, nonce'lu `signInWithIdToken`)** + **iOS'ta Apple ile Giriş**. Android'de Apple butonu yok. | App Store 4.8; Credential Manager + nonce desteği; tek tıkla deneyim; `skip_nonce_check=false`. | AUTH-6, AUTH-7, SCOPE-3, SEC-17, SEC missed |
| K3 | `confirmation` **ve** `magic_link` şablonları yalnızca `{{ .Token }}` içerir; yerelde `enable_confirmations=true`; prod'da custom SMTP ZORUNLU. | Yeni kullanıcıya "Confirm signup" gider; varsayılan SMTP ekip dışına göndermez. | AUTH-1, AUTH-2, AUTH-9, AUTH-23, UX-10, SCOPE-12 |
| K4 | Oturum depolama: **LargeSecureStore** (AES-256-GCM `expo-crypto`; anahtar `expo-secure-store` `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; şifreli blob `expo-sqlite/localStorage`). Oturum JSON'u doğrudan SecureStore'a YASAK. Web'de düz `localStorage` (kabul edilmiş risk). | 2 KB SecureStore sınırı; sağlık verisi hassasiyeti; kilitli ekranda arka plan flush'ı. | AUTH-10, SEC-16, SCOPE-24, UX missed |
| K5 | `profiles.role` **nullable enum ('pt','client')**, DEFAULT yok; tek seferlik `complete_onboarding()` RPC; kolon GRANT'i + BEFORE UPDATE guard; trigger metadata'dan rol OKUMAZ. `super_admin` uygulama rolü yok; Super Admin yetkileri **içerik hattı** ile uygulanır (§6.8: global egzersiz ve sistem şablonu migration'ları, öneri incelemesi). | Rol yükseltme ve ilk giriş tespiti. | AUTH-3, AUTH-4, AUTH-16, AUTH-17, DATA-4, SEC-1, SEC-10, SCOPE-8 |
| K6 | v1'de PT kendi antrenmanını loglayamaz; rol değişimi yalnızca destek üzerinden. | Tekil rol modeli, kapsam. | AUTH-22, SCOPE-8 |
| K7 | `[api] auto_expose_new_tables = false`; ilk migration varsayılan yetkileri kaldırır; her tablo/fonksiyon için **açık GRANT**; anon'a sıfır yetki; RLS yardımcıları `private` şemasında SECURITY DEFINER. | 30 Mayıs / 30 Ekim 2026 Data API grant değişikliği; recursion ve performans. | SEC-6, SEC-14, DATA-23, DATA missed, SCOPE missed |
| K8 | Eşleşme: `pairing_invites` (6 karakter, 31 harfli alfabe `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 24 saat, PT başına 5 açık kod) + `pt_client_pairs` (`active`/`ended`). **Danışan başına tek aktif PT.** Önizleme + kullanma RPC'leri ortak deneme sınırıyla (15 dk'da 5, 24 saatte 20 başarısız); PT ayrıca onay vermez. | Kodun güvenli tüketimi, brute-force, yeniden eşleşme, KVKK bilgilendirilmiş rıza (PT adı rızadan önce gösterilir). | SEC-2, SEC-3, DATA-5, SCOPE-2, ALGO missed, UX missed |
| K9 | KVKK: `consents` tablosu. Sağlık rızası yoksa readiness/ölçüm **RLS ile** yazılamaz; eşleşmede `share_with_pt` rızası + "eşleşme öncesi geçmişi paylaş" anahtarı (`data_visible_from`). Bu sınır türetilmiş özetlere de uygulanır: deload radarı değerlendirmesi/alarmı (`radar_evaluations.window_start`), oturum başı en iyi e1RM ve PR'daki önceki en iyi (tabloda saklanmaz). Karşı taraf `profiles`'ta telefon/saat dilimini göremez (kolon yetkisi). Eşleşme bitince PT erişimi **anında** kesilir. Onboarding'de 18+ beyanı. | Özel nitelikli sağlık verisi, PT'ye aktarım. | SEC-4, SEC-5, AUTH missed, DATA missed, SCOPE-15 |
| K10 | Program modeli: PT **kütüphane** şablon/programı (`client_id NULL`) → `assign_program()` ile danışana **derin kopya**. v1 takvim yok: **sıralı rotasyon** (`day_order`). v1 blok planlama = süreli program (`duration_weeks`) + haftalık frekans hedefi (`days_per_week`) + hafta sayacı; hafta bazlı progresyon/periyotlama v1.2. Eşleşme bitince atanmış program danışanda kalır; danışan `leave_program()` ile bırakabilir. | "Bugünün antrenmanı", çoklu danışana atama, geçmiş bağlamı. | DATA-8, SCOPE-1, ALGO-19 |
| K11 | Şablon yapısı: `template_blocks` (single/superset + tur dinlenmesi) → `template_exercises` (öncelik, tolerans override) → `template_exercise_sets` (warmup/working ayrı numaralı, set başına hedef, `reps_min/max`, `duration`, `is_amrap`). | Piramit/back-off/süperset/ısınma; VARCHAR hedef yasak. | DATA-2, DATA-18, ALGO-6, ALGO-12, ALGO-16, UX-17, SCOPE-7 |
| K12 | Oturum snapshot'ı: `workout_log_exercises` (başlık, takip tipi, tolerans, `planned_sets` jsonb içinde orijinal+deload hedefi; `best_e1rm_at_start` saklanmaz, sahip RPC'sinde okuma anında hesaplanır). DND/skip/time-crunch yalnızca snapshot'ı değiştirir; PT şablonuna danışan yazamaz. | Geçmiş bağlam, deload/guardrail tutarlılığı. | DATA-1, SCOPE-6, SEC-8, UX-13, UX-15, ALGO-7 |
| K13 | **Oturum başlatma online zorunlu** (`start_workout` RPC snapshot üretir). Oturum içindeki set/su/skip/sıra/kapanış yazımları **SQLite outbox** ile kuyruklanır ve idempotenttir. Tam offline başlatma v1.1+. | Sunucu otoritesi vs salon bağlantısı çelişkisinin çözümü. | DATA-20, UX-1, SCOPE-14, DATA missed |
| K14 | Guardrail: `allowed = hedef + max(hedef × pct/100, abs_kg)` (varsayılan %20 / 5 kg); karşılaştırma katı `>`; referans **PT'nin orijinal hedefi** (deload'lu değil); yalnızca **aktif PT'nin atadığı şablonda**, `working` + `weight_reps` + hedef dolu iken. Sunucu `BEFORE` trigger'ı hesaplar, istemci `overload_flag` yazamaz. Teyitsiz gelen set **reddedilmez**, işaretlenir. | Yanlış alarm, float sınır hataları, manipülasyon, offline kuyruğun asla takılmaması. | ALGO-3, ALGO-4, ALGO-6, ALGO-7, ALGO-11, ALGO-22, DATA-6, DATA-10, SEC-7, SEC-8, UX-2, SCOPE-9, SCOPE-10 |
| K15 | Readiness: PRD formülü korunur `score = (uyku + enerji + (6−ağrı) + (6−stres)) × 5`, **aralık 20–100**, eşik `score < 60`; generated column. Ağrı/stres ölçeği 1=yok, 5=şiddetli (etiketli). | PRD vizyonuna sadakat, integer aritmetik. | ALGO-1, ALGO-2, DATA-12, SCOPE-16 |
| K16 | Deload modu eşleşme düzeyinde `off/auto/confirm` (VARSAYILAN `confirm`); PT'siz/kendi şablonunda `confirm`. Uygulama: ağırlık `floor(w×0.85 / artış) × artış` (min yük altına düşerse korunur), çalışma seti/tur `max(1, round(n×2/3))`, ısınma kırpılmaz, süperset atomik. | Uygulanabilir, ekipmanla uyumlu deload. | DATA-7, ALGO-8, SCOPE-9, SCOPE-16 |
| K17 | e1RM Epley: yalnızca `weight_reps` + `working` + `full` + 1–12 tekrar; `reps=1 → ağırlık`. PR: oturum kapanışında, **önceki tamamlanmış oturumlardaki** en iyiye göre katı `>`; ilk kayıt PR değildir; PT onaysız overload setleri hariç. PR ayrı `pr_events` akışı (alarm değil). | Sahte PR, taşma, gürültü. | DATA-16, ALGO-9, ALGO-10, ALGO-5, SCOPE-19, UX-16 |
| K18 | Egzersiz: `scope global/custom`, `owner_id SET NULL`, `category` enum, `tracking_type`, `load_mode`, `load_increment_kg`, `min_load_kg`, `primary_regions body_region[]`, `video_provider + video_id`; **silme yok, arşiv**. | Görünürlük, hesap silme, bölgesel ağrı, video güvenliği. | DATA-13, DATA-15, DATA-17, SEC-12, SEC-13, SCOPE-11, SCOPE-18, ALGO-20 |
| K19 | Hesap silme: `delete-account` Edge Function + Play için web silme sayfası. Hazırlık RPC'si egzersiz SİLMEZ (özel egzersiz `owner_id SET NULL`; kullanılmayan sahipsizleri `daily_cleanup` siler). Özel egzersizi kendi şablonunda, yalnızca kendi logunda ve danışan kopyasında bulunan danışan/PT senaryoları pgTAP'te hazırlık + silme ile test edilir. Apple revoke, kodu üreten varyantın bundle ID'siyle yapılır; revoke hatası silmeyi bloklamaz, audit'e yazılır (§12 S17). | App Store 5.1.1(v), Google Play. | AUTH-5, AUTH-6, DATA-3, SEC-12, SCOPE-4 |
| K20 | Alarm: `pt_alerts` (`payload jsonb`, `dedupe_key`, `occurrences`, `status`); yalnızca trigger/cron üretir; mesaj metni istemcide i18n ile payload'dan; overload egzersiz başına tek kart; düşük readiness ve deload anahtarları **danışan başına** (`low_readiness:<client>:<gün>`, `deload:<client>:<hafta>`). | Spam, sahte alarm, lokalizasyon. | DATA-11, SEC-7, SEC-20, SCOPE-10, UX-2, ALGO-6 |
| K21 | Realtime: yalnızca **private broadcast** (`realtime.send`) — içerik yok, sadece id; topic `pt:<uid>:feed`; tablolar `supabase_realtime` publication'a EKLENMEZ. İstemci olayda/odakta refetch eder. | Sağlık verisi sızıntısı, RLS maliyeti. | SEC-9, DATA-9, UX-11, SCOPE-17 |
| K22 | Push: `push_tokens` + `notification_preferences` + `private.push_outbox` → trigger `pg_net` ile `send-push` Edge Function → Expo Push API; cron süpürücü. v1 push türleri: overload alarmı, program atandı/güncellendi (düşük readiness VARSAYILAN kapalı). İçerik genel, isim/sağlık detayı YASAK. | "Anlık alarm" vaadi. | UX-4, SCOPE-13, SEC-20, DATA missed |
| K23 | Oturum yaşam döngüsü: `status in_progress/completed/abandoned`, `last_activity_at`, kullanıcı başına tek açık oturum; cron 3 saat hareketsizlikte kapatır (çalışma seti varsa completed, yoksa abandoned); `complete_workout` aynı kuralı uygular (`nothing_logged`). Canlı radar: son 30 dk aktivite. | Hayalet oturumlar. | DATA-9, ALGO-19, UX-11, SCOPE-17 |
| K24 | Zaman: `profiles.timezone` (IANA, VARSAYILAN `Europe/Istanbul`), `local_date` başlangıçta dondurulur; hafta = ISO (Pazartesi). pg_cron UTC çalışır, hafta sınırı SQL'de kullanıcının saat diliminde hesaplanır. | Seri/radar kovalama hataları. | DATA-19, ALGO-14, ALGO-18, UX-8, SCOPE-22 |
| K25 | Deload radarı: **pg_cron (saatlik) + SQL fonksiyonu**; son tamamlanmış 3 ISO hafta, ölçülebilir eşikler, 14 gün cooldown, sonuç `radar_evaluations`'a yazılır; PT'li danışanda alarm, solo danışanda C1 kartı. PT'ye giden sonuç yalnızca pencere başı `data_visible_from` sonrasındaysa (KVKK, §7.6). | Veri DB'de; Edge Function gereksiz ağ/anahtar yükü. | ALGO-14, SEC-15, SCOPE-16, DATA-21 |
| K26 | Tonaj saklanmaz, `session_volume` / `weekly_client_load` **security_invoker** view'larından türetilir: `Σ reps × kg × (per_side ? 2 : 1)`, `working`, `failed` değil, `weight_reps`. | Bayat denormalizasyon. | DATA-21, ALGO-13, SCOPE-18, SEC-15 |
| K27 | İstemci veri katmanı: TanStack Query 5.102 yalnızca **okuma cache'i** (persist whitelist, `expo-sqlite/kv-store`); yazma yolu SQLite outbox. | TanStack paused mutation tuzakları. | UX-6, UX-1 |
| K28 | Rest timer **timestamp tabanlı** (`restEndsAt`), yerel bildirim (`DATE` trigger, `rest-timer` kanalı), Android `SCHEDULE_EXACT_ALARM`; çok kanallı bitiş uyarısı. | Arka planda JS askıya alınır. | UX-5, UX-19 |
| K29 | Web: `web.output = "single"`; v1'de web yalnızca giriş + statik yasal sayfalar + davet yönlendirme; C4 web'de yok. | SSR/static export ile auth çakışması, offline katman. | AUTH-21, UX-21, SCOPE missed |
| K30 | App Review: `review-login` Edge Function (feature flag, izinli iki adres, ≥32 karakter passcode, fail-closed, rate limit, audit) + A1'de yalnızca flag açıkken görünen "Demo erişimi" girişi + idempotent `seed-demo.sql` + mağaza inceleme talimatları (§3.12). | OTP gelen kutusuna erişim yok. | AUTH-12, SCOPE-3 |
| K31 | Yalnızca yeni anahtarlar: istemci `sb_publishable_…`, Edge Function `SUPABASE_SECRET_KEYS`. Legacy `anon`/`service_role` YASAK. | 2026 sonu deprecation. | AUTH missed, SEC-11 |
| K32 | Time-crunch: PRD kuralı (öncelikli olmayan bloklar pasif; süperset atomik) + süre seçimi + tahmin + "son öncelikli hareketlerden set kırp" önerisi (`working_sets_cap`). | Seçilen sürenin anlamlı olması. | DATA-1, ALGO-15, UX-15, SCOPE-20 |
| K33 | Solo danışan: v1'de **C7 "Antrenmanlarım"** (sade şablon editörü, tek bloklu hareketler) + özel egzersiz; guardrail/alarm yok, deload `confirm`. (VARSAYILAN, §12 S1) | PRD §2.3 ve yetki matrisi vaadi. | SCOPE missed, SCOPE-9, ALGO-22 |
| K34 | Ölçümler normalize: `measurement_types` / `measurement_sessions` / `measurements`; danışan yalnızca kilo + yağ oranı girer; PT tüm tipleri. `clinical_notes` → `pt_notes` (danışan okuyabilir). | Matris/şema çelişkisi, grafik tutarlılığı. | DATA-14, SCOPE-5, SEC-5, SCOPE-15 |
| K35 | Ondalık giriş: virgül/nokta parse, 0.25 kg hassasiyet (DB CHECK), stepper adımı egzersizin `load_increment_kg`'ı; tüm ağırlık aritmetiği istemcide **gram tamsayı**. | tr-TR klavye, float sınır hataları. | UX-8, UX-12, ALGO-11, ALGO missed |
| K36 | i18n: tek dil `tr`, `i18next` + `react-i18next`; DB'de metin değil kod saklanır. | Payload tabanlı alarm metni, çoğullama. | UX-8, DATA-11 |
| K37 | OTP kötüye kullanımı: custom SMTP limitleri + doğrulanmamış kullanıcı temizliği (cron); Turnstile CAPTCHA entegrasyonu feature flag arkasında hazır, public lansman öncesi açılır. | E-posta bombalama / kota DoS. | AUTH-18, SEC missed |
| K38 | Push/log/telemetri: Sentry (`@sentry/react-native`) PII ve gövde toplamadan; analitik olaylarında sağlık değeri YASAK; prod'da `console.*` kaldırılır. | Yurt dışı aktarım kapsamı. | SEC missed, SCOPE-22 |
| K39 | Danışan verisi SELECT politikaları sahip/PT olarak **ayrı**; PT dalı `(select private.my_client_visibility_map())` InitPlan'ı + jsonb anahtar araması (satır başına definer fonksiyon YOK). İstemci PT sorgularında her zaman `.eq('user_id', …)` gönderir. | Korelasyonlu SubPlan satır sayısıyla doğrusal yavaşlar (EXPLAIN ile doğrulandı, §11.4). | Revizyon 1.1 |
| K40 | Super Admin = içerik hattı (uygulama içi admin yok): global egzersizler ve `is_system` şablonları migration ile; PT önerileri `exercise_suggestions` → `private.review_exercise_suggestion()`; PT sistem şablonunu `clone_system_template()` ile kopyalar. | PRD §3 yetki matrisi; ekransız ama denetlenebilir yönetim. | Revizyon 1.1 |

---

## 1. Stack ve kütüphaneler

### 1.1 Kurulum ilkeleri

- Expo modülleri ve native kütüphaneler **yalnızca `npx expo install <paket>`** ile kurulur (SDK 57 uyumlu sürümü seçer). `npm i react-native-webview` gibi doğrudan kurulum YASAK (npm'deki 14.x SDK 57'nin 13.16.1'i ile uyumsuz).
- Saf JS paketleri `npm i <paket>@<sürüm>` ile tam sürümle eklenir.
- Her dependency değişikliğinden sonra `npx expo install --check` ve `npx expo-doctor` temiz geçmeli.
- "Expo Go" sütunu: **Hayır** olan paketler dev build gerektirir. Proje zaten K1 gereği dev build kullanır.

### 1.2 Mevcut iskelette kurulu olanlar (değiştirilmez)

| Paket | Sürüm | Not |
|---|---|---|
| `expo` | ~57.0.22 | |
| `expo-router` | ~57.0.21 | `Stack.Protected`, `usePreventRemove` export'ları mevcut |
| `react` / `react-dom` | 19.2.3 | |
| `react-native` | 0.86.3 | New Architecture |
| `react-native-reanimated` / `react-native-worklets` | 4.5.1 / 0.10.1 | |
| `react-native-gesture-handler` | ~2.32.0 | RNGH 3'e geçiş YASAK (sortables uyumu doğrulanmadıkça) |
| `react-native-screens` / `react-native-safe-area-context` | ~4.26.0 / ~5.7.0 | |
| `expo-image`, `expo-web-browser`, `expo-linking`, `expo-splash-screen`, `expo-constants`, `expo-device`, `expo-symbols`, `expo-system-ui`, `expo-status-bar`, `expo-font`, `@expo/ui` | SDK 57 | |
| `typescript` | ~6.0.3 | |
| `supabase` (CLI, devDependency) | 2.117 (npm latest 2.117.0) | `npx supabase …` |

### 1.3 Eklenecek paketler

| Paket | Kurulum | Doğrulanan sürüm | SDK 57 uyumu / not | Expo Go |
|---|---|---|---|---|
| `@supabase/supabase-js` | `npm i @supabase/supabase-js@2.116.0` | 2.116.0 (latest) | Saf JS; `processLock`, `isAuthRetryableFetchError`, `signInWithIdToken`, `getClaims`, `signOut({scope:'local'\|'global'\|'others'})` doğrulandı | Evet |
| `expo-sqlite` | `npx expo install expo-sqlite` | ~57.0.3 | `localStorage/install`, `kv-store`, `withExclusiveTransactionAsync`, change listener | Evet |
| `expo-secure-store` | `npx expo install expo-secure-store` | ~57.0.4 | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` sabiti mevcut | Evet |
| `expo-crypto` | `npx expo install expo-crypto` | ~57.0.3 | `randomUUID`, `digestStringAsync`, `AESEncryptionKey`, `aesEncryptAsync`, `aesDecryptAsync`, `AESSealedData.fromCombined` | Evet |
| `expo-dev-client` | `npx expo install expo-dev-client` | ~57.0.19 | Dev build | — |
| `react-native-nitro-google-signin` | `npx expo install react-native-nitro-google-signin react-native-nitro-modules` | 2.2.0 (peer: expo ≥49, RN ≥0.76, nitro-modules ≥0.36) | Config plugin var; `configure({ webClientId, nonce })` — nonce **SHA-256 hex** bekler (tip tanımında doğrulandı); `signIn/createAccount/presentExplicitSignIn/signOut` | Hayır |
| `react-native-nitro-modules` | (yukarıda) | 0.37.1 | peer ≥0.36.0 karşılanır | Hayır |
| `expo-apple-authentication` | `npx expo install expo-apple-authentication` | ~57.0.2 | `app.config.ts` → `ios.usesAppleSignIn: true` | Kısmi (gerçek cihaz/dev build önerilir) |
| `expo-notifications` | `npx expo install expo-notifications` | ~57.0.18 | `SchedulableTriggerInputTypes.DATE`, `useLastNotificationResponse`, `getExpoPushTokenAsync({projectId})`; Android remote push Expo Go'da yok | Hayır (remote) |
| `expo-background-task` + `expo-task-manager` | `npx expo install expo-background-task expo-task-manager` | ~57.0.17 / ~57.0.17 | Min aralık 15 dk, garanti yok (best-effort flush) | Evet |
| `expo-localization` | `npx expo install expo-localization` | ~57.0.2 | `getCalendars()[0].timeZone` | Evet |
| `expo-network` | `npx expo install expo-network` | ~57.0.2 | `addNetworkStateListener`, `isInternetReachable` | Evet |
| `expo-keep-awake` | `npx expo install expo-keep-awake` | ~57.0.2 | `useKeepAwake` | Evet |
| `expo-haptics` | `npx expo install expo-haptics` | ~57.0.3 | `notificationAsync`, `selectionAsync`, `performAndroidHapticsAsync(AndroidHaptics.Confirm)` | Evet |
| `expo-audio` | `npx expo install expo-audio` | ~57.0.5 | Opsiyonel bip (`interruptionMode: 'duckOthers'`) | Evet |
| `expo-clipboard` | `npx expo install expo-clipboard` | ~57.0.2 | `ClipboardPasteButton` (iOS 16+), `getStringAsync` | Evet |
| `expo-intent-launcher` | `npx expo install expo-intent-launcher` | ~57.0.1 | Android exact alarm ayar ekranı | Evet |
| `expo-application` | `npx expo install expo-application` | ~57.0.3 | Sürüm / cache buster | Evet |
| `react-native-webview` | `npx expo install react-native-webview` | 13.16.1 (npm latest 14.0.1 — KURULMAZ) | Video modalı | Evet |
| `react-native-keyboard-controller` | `npx expo install react-native-keyboard-controller` | 1.21.9 | `KeyboardProvider`, `KeyboardAwareScrollView`, `KeyboardStickyView` | Hayır |
| `react-native-sortables` | `npm i react-native-sortables@1.10.0` | 1.10.0 (peer: reanimated ≥3, RNGH ≥2) | `customHandle` + `Sortable.Handle` doğrulandı; iOS New Arch'ta ekran detach/attach senaryosu gerçek cihazda test edilir. Yedek: `react-native-reorderable-list@0.18.1` | Evet |
| `@tanstack/react-query` | `npm i @tanstack/react-query@5.102.8` | 5.102.8 (peer react ^18‖^19) | | Evet |
| `@tanstack/react-query-persist-client` | `npm i @tanstack/react-query-persist-client@5.102.8` | 5.102.8 | | Evet |
| `@tanstack/query-async-storage-persister` | `npm i @tanstack/query-async-storage-persister@5.102.8` | 5.102.8 | Storage: `expo-sqlite/kv-store` | Evet |
| `zustand` | `npm i zustand@5.0.15` | 5.0.15 | Aktif antrenman UI store'u | Evet |
| `zod` | `npm i zod@4.6.5` | 4.6.5 | Form ve RPC yanıt doğrulama | Evet |
| `i18next` / `react-i18next` | `npm i i18next@26.4.2 react-i18next@17.0.14` | 26.4.2 / 17.0.14 (peer TS ^5‖^6‖^7) | | Evet |
| `@sentry/react-native` | `npx expo install @sentry/react-native` | ~7.11.0 (SDK 57 bundled; npm latest 8.x KURULMAZ) | Config plugin | Hayır |
| `jest-expo` + `jest` | `npx expo install -- --save-dev jest-expo jest @types/jest` | jest-expo ~57.0.5 (bağımlılıkları jest **29.x**; jest 30 KURULMAZ) | `src/domain` birim testleri | — |
| `@testing-library/react-native` | `npm i -D @testing-library/react-native@14.0.1 test-renderer@1.2.0` | 14.0.1 (peer test-renderer ^1, jest ≥29, RN ≥0.78) | Bileşen testleri | — |
| `eslint-config-expo` | `npx expo lint` (ilk çalıştırmada kurar) | 57.0.2 | + `no-restricted-imports` katman kuralı (§2.3) | — |
| Maestro CLI | `curl -Ls "https://get.maestro.mobile.dev" \\| bash` (npm paketi değil) | — | E2E akışları `.maestro/` | — |

**Edge Functions (Deno 2):** `npm:@supabase/supabase-js@2.116.0`, `npm:jose@6.2.12` (Apple client secret JWT). `SUPABASE_SECRET_KEYS` JSON'dan `default` anahtarı kullanılır; `SUPABASE_SERVICE_ROLE_KEY` YASAK (legacy).

**Kullanılmayacaklar (YASAK):** `@react-native-google-signin/google-signin` ücretsiz sürümü (deprecated Android SDK, nonce yok), `react-native-youtube-iframe` (üçüncü taraf GitHub Pages HTML'ine bağımlı), `react-native-draggable-flatlist` (Reanimated 4 uyumu belgesiz), PowerSync/WatermelonDB (v1 kapsam dışı), `@react-native-async-storage/async-storage` (yerine `expo-sqlite/kv-store`).

### 1.4 `app.config.ts` (app.json yerine; varyant bazlı)

```ts
// app.config.ts
import type { ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';
const variant = (process.env.APP_VARIANT ?? 'development') as Variant;

const ids = {
  development: { bundle: 'app.pulsecoach.dev', name: 'PulseCoach Dev', iosGoogleScheme: process.env.GOOGLE_IOS_URL_SCHEME_DEV },
  preview: { bundle: 'app.pulsecoach.preview', name: 'PulseCoach Beta', iosGoogleScheme: process.env.GOOGLE_IOS_URL_SCHEME_PREVIEW },
  production: { bundle: 'app.pulsecoach', name: 'PulseCoach', iosGoogleScheme: process.env.GOOGLE_IOS_URL_SCHEME_PROD },
}[variant];

const config: ExpoConfig = {
  name: ids.name,
  slug: 'pulsecoach',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'pulsecoach',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: ids.bundle,
    usesAppleSignIn: true,
    icon: './assets/expo.icon',
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: ids.bundle,
    permissions: ['android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.USE_EXACT_ALARM'],
    predictiveBackGestureEnabled: false,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json', // FCM V1 (EAS file env var)
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  web: { output: 'single', favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#208AEF', image: './assets/images/splash-icon.png', imageWidth: 76 }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-apple-authentication',
    ['expo-notifications', { color: '#208AEF' }],
    'expo-localization',
    ['react-native-nitro-google-signin', { iosUrlScheme: ids.iosGoogleScheme }],
    '@sentry/react-native/expo',
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID }, appVariant: variant },
};
export default config;
```

### 1.5 Ortam değişkenleri

| Değişken | Nerede | Örnek / kaynak |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env.development` / EAS env | Yerel: `http://<LAN-IP>:54321` (127.0.0.1 cihazdan erişilemez) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | aynı | `sb_publishable_…` (`npx supabase status`) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | aynı | Google Cloud Web client |
| `EXPO_PUBLIC_REQUIRED_DOC_VERSIONS` | aynı | `{"terms":"terms-2026-09","privacy":"privacy-2026-09","health":"health-2026-09","share":"share-2026-09"}` |
| `EXPO_PUBLIC_LEGAL_BASE_URL` | aynı | `https://pulsecoach.app/legal` |
| `EXPO_PUBLIC_SENTRY_DSN` | aynı | |
| `GOOGLE_IOS_URL_SCHEME_{DEV,PREVIEW,PROD}` | EAS build env | reversed iOS client ID |
| `EAS_PROJECT_ID`, `APP_VARIANT` | EAS | |
| `GOOGLE_SERVICES_JSON` | EAS **file** environment variable (her ortam) | Firebase `google-services.json` yolu (Android FCM V1 push token alımı) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | yalnızca yönetici terminali (`scripts/create-review-users.ts`) | CI'a ve repoya KONMAZ |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `…_SECRET` | `supabase/.env` (yerel), hosted: `config push` env | Web ID **ilk sırada**, virgülle |
| `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` | aynı | Apple client secret (web akışı gerekmedikçe boş olabilir) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` | hosted | Transactional sağlayıcı |
| Edge secrets: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_P8`, `APPLE_CLIENT_IDS` (virgüllü: `app.pulsecoach,app.pulsecoach.preview,app.pulsecoach.dev`), `PUSH_WORKER_SECRET`, `EXPO_ACCESS_TOKEN`, `REVIEW_LOGIN_ENABLED`, `REVIEW_LOGIN_EMAILS`, `REVIEW_LOGIN_PASSCODE` | `npx supabase secrets set …` | Hiçbiri `EXPO_PUBLIC_` önekli OLAMAZ. `PUSH_WORKER_SECRET` ve `REVIEW_LOGIN_PASSCODE` ≥ 32 karakter (değilse fonksiyon 503 döner, fail-closed) |
| Vault: `project_url`, `push_worker_secret` | hosted SQL editor (migration'a YAZILMAZ) | `select vault.create_secret('https://<ref>.supabase.co', 'project_url');` |

`.gitignore`'a eklenecek satırlar (ZORUNLU): `.env`, `.env.*`, `!.env.example`, `supabase/.env`, `supabase/functions/.env`, `google-services.json`, `*firebase-adminsdk*.json` (FCM V1 service account anahtarı).

---

## 2. Proje klasör yapısı ve katman kuralları

### 2.1 Ağaç

Template'in route kökü `src/app`'tir. Rol alanları için route **grubu değil gerçek path segmenti** (`client/`, `pt/`) kullanılır: iki grupta aynı URL (`/`) oluşup Expo Router çakışması yaşanmasın ve push deep link'leri (`/pt/alerts/<id>`) sabit olsun.

```
pulsecoach/
├─ app.config.ts                     # §1.4
├─ eas.json                          # development | preview | production profilleri
├─ .env.example
├─ .maestro/                         # E2E: otp-login.yaml, invite-pair.yaml, log-session.yaml
├─ scripts/create-review-users.ts    # §3.12 (yönetici terminali; admin API, idempotent)
├─ docs/
│  ├─ adr/                           # 0001-google-signin, 0002-session-storage, 0003-offline-scope, 0004-hosting-region
│  ├─ data-inventory.md              # KVKK aydınlatma + store beyanları için tek envanter
│  └─ store/app-review.md            # §3.12 App Store Connect + Play "App access" talimatları
├─ src/
│  ├─ app/                           # SADECE ekran/route (ince), iş mantığı YOK
│  │  ├─ _layout.tsx                 # Provider'lar + Stack.Protected guard + SplashScreen
│  │  ├─ +not-found.tsx
│  │  ├─ (auth)/_layout.tsx
│  │  ├─ (auth)/sign-in.tsx          # A1  → /sign-in
│  │  ├─ (auth)/verify.tsx           # A2  → /verify
│  │  ├─ onboarding/_layout.tsx
│  │  ├─ onboarding/role.tsx         # A3  → /onboarding/role
│  │  ├─ onboarding/consent.tsx      # A4  → /onboarding/consent
│  │  ├─ offline-gate.tsx            # rol cache'i yok + çevrimdışı
│  │  ├─ invite/[code].tsx           # pulsecoach://invite/ABC123 → kodu saklar, yönlendirir
│  │  ├─ client/_layout.tsx          # Stack (tabs + tam ekran workout akışı)
│  │  ├─ client/(tabs)/_layout.tsx   # Tabs: Ana Sayfa | Antrenmanlarım | Profil
│  │  ├─ client/(tabs)/index.tsx     # C1  → /client
│  │  ├─ client/(tabs)/workouts.tsx  # C7  → /client/workouts
│  │  ├─ client/(tabs)/profile.tsx   # C6  → /client/profile
│  │  ├─ client/workout/checkin.tsx  # C2 (modal)
│  │  ├─ client/workout/prepare.tsx  # C3
│  │  ├─ client/workout/active.tsx   # C4 (gestureEnabled:false)
│  │  ├─ client/workout/summary.tsx  # C5
│  │  ├─ client/history/[workoutLogId].tsx
│  │  ├─ client/measurements.tsx     # grafikler + kilo ekle
│  │  ├─ client/pairing.tsx          # kod gir / önizle / rıza / sonlandır
│  │  ├─ client/templates/[templateId].tsx   # C7 editör
│  │  ├─ client/exercises/new.tsx
│  │  ├─ client/settings/notifications.tsx
│  │  ├─ client/settings/privacy.tsx # rızalar, hesap silme
│  │  ├─ pt/_layout.tsx
│  │  ├─ pt/(tabs)/_layout.tsx       # Tabs: Panel | Danışanlar | Programlar | Egzersizler | Profil
│  │  ├─ pt/(tabs)/index.tsx         # P1  → /pt
│  │  ├─ pt/(tabs)/clients.tsx       # P2 liste
│  │  ├─ pt/(tabs)/programs.tsx      # P4 liste
│  │  ├─ pt/(tabs)/exercises.tsx     # P5 liste
│  │  ├─ pt/(tabs)/profile.tsx       # P6
│  │  ├─ pt/clients/[clientId]/index.tsx          # P2 detay
│  │  ├─ pt/clients/[clientId]/workouts/[workoutLogId].tsx
│  │  ├─ pt/clients/[clientId]/assessment.tsx     # P3
│  │  ├─ pt/programs/[programId].tsx              # P4 program editörü
│  │  ├─ pt/templates/[templateId].tsx            # P4 şablon tasarımcısı
│  │  ├─ pt/exercises/[exerciseId].tsx            # P5 form (new = 'new')
│  │  ├─ pt/alerts/[alertId].tsx                  # push deep link hedefi
│  │  └─ pt/settings/{notifications,privacy}.tsx
│  ├─ features/                      # dikey dilimler: api.ts (query/mutation hook), components/, hooks/, schemas.ts
│  │  ├─ auth/  onboarding/  pairing/  consents/  profile/  account/
│  │  ├─ exercises/  templates/  programs/
│  │  ├─ workout-session/            # C2–C5: store, outbox op'ları, rest timer, bileşenler
│  │  ├─ readiness/  measurements/  history/  alerts/  radar/  dashboard/
│  │  └─ notifications/  video/
│  ├─ domain/                        # SAF TypeScript: RN/Expo/Supabase import YASAK
│  │  ├─ readiness.ts  guardrail.ts  deload.ts  e1rm.ts  pr.ts  volume.ts  radar.ts
│  │  ├─ session-flow.ts  time-budget.ts  warmup.ts  streak.ts  rotation.ts
│  │  ├─ units.ts (gram, parseDecimalInput)  invite-code.ts  video-url.ts  errors.ts
│  │  └─ __tests__/*.test.ts         # §7 vektörleri birebir
│  ├─ lib/
│  │  ├─ supabase/client.native.ts  client.web.ts  large-secure-store.ts  errors.ts
│  │  ├─ db/sqlite.ts  migrations.ts  outbox.ts  kv.ts
│  │  ├─ query/query-client.ts  persister.native.ts  persister.web.ts  keys.ts
│  │  ├─ net/online.ts  time/timezone.ts  i18n/index.ts  i18n/tr.json
│  │  ├─ notifications/channels.ts  push-token.ts  local.ts
│  │  ├─ theme/tokens.ts  telemetry/sentry.ts
│  ├─ components/ui/                 # tasarım sistemi: Button, Stepper, SegmentedRating, Badge, ScreenState, Sheet…
│  └─ types/database.ts              # `supabase gen types typescript --local` çıktısı (elle düzenleme YASAK)
└─ supabase/
   ├─ config.toml                    # §3.2
   ├─ templates/otp.html             # §3.3
   ├─ migrations/
   │  ├─ 20260915000100_foundation.sql
   │  ├─ 20260915000200_tables.sql
   │  ├─ 20260915000300_security.sql
   │  ├─ 20260915000400_logic.sql
   │  └─ 20260915000500_jobs.sql
   ├─ seed.sql                       # referans verisi (§6.6)
   ├─ seed-demo.sql                  # yalnızca staging/review (§3.12)
   ├─ tests/database/001_core.test.sql   # §11.3
   ├─ tests/perf/rls_explain.sql     # §11.4 (RLS EXPLAIN kabul kriteri)
   └─ functions/
      ├─ _shared/{cors.ts,json.ts,admin.ts,apple.ts}
      ├─ delete-account/index.ts     # verify_jwt = true
      ├─ review-login/index.ts       # verify_jwt = false
      └─ send-push/index.ts          # verify_jwt = false (pg_net, worker secret)
```

### 2.2 Katman kuralları (ZORUNLU)

1. `src/domain` hiçbir şey import etmez (yalnızca kendi dosyaları). Tüm fonksiyonlar saf, deterministik, `number` ağırlıkları **gram tamsayıya** çevirerek çalışır.
2. `src/lib` → `src/domain` import edebilir; `src/features` import EDEMEZ.
3. `src/features/*` → `lib`, `domain`, `components/ui` import eder; başka feature'ın yalnızca `index.ts` public API'sini kullanır.
4. `src/app/**` route dosyaları yalnızca `features/*` ve `components/ui` import eder; doğrudan `supabase` çağrısı YASAK.
5. Supabase çağrıları yalnızca `features/*/api.ts` içinde yapılır; her RPC yanıtı `zod` şemasıyla parse edilir.
6. Yazma yolları: aktif antrenman içi yazımlar yalnızca `lib/db/outbox.ts` üzerinden; diğer yazımlar TanStack `useMutation` (online).
7. Platforma özel kod `.native.ts` / `.web.ts` uzantılarıyla ayrılır (`if (Platform.OS)` dallanması yalnızca küçük stil farkları için).

### 2.3 ESLint katman kuralı

```js
// eslint.config.js (eslint-config-expo flat config üzerine)
const expoConfig = require('eslint-config-expo/flat');
module.exports = [
  ...expoConfig,
  { files: ['src/domain/**'], rules: { 'no-restricted-imports': ['error', { patterns: ['react', 'react-native', 'expo*', '@supabase/*', '@/lib/*', '@/features/*'] }] } },
  { files: ['src/lib/**'], rules: { 'no-restricted-imports': ['error', { patterns: ['@/features/*', '@/app/*'] }] } },
  { files: ['src/app/**'], rules: { 'no-restricted-imports': ['error', { paths: [{ name: '@/lib/supabase/client', message: 'Route dosyaları supabase çağırmaz; features/*/api.ts kullan.' }] }] } },
];
```

---

## 3. Kimlik doğrulama ve oturum

### 3.1 Akış (metin diyagramı)

```
[Soğuk açılış]
  SplashScreen.preventAutoHideAsync()
  → supabase.auth.getSession()            (ağ gerektirmez; LargeSecureStore'dan okur)
      ├─ session yok ─────────────────────────────────────────────► A1 /sign-in
      └─ session var
           → kv 'role-cache' oku {userId, role, onboarded, updatedAt}
           → profiles fetch (arka planda, 10 sn timeout)
               ├─ OK → cache güncelle
               ├─ AuthRetryableFetchError / ağ hatası → çevrimdışı mod (cache ile devam, "Çevrimdışı" bandı)
               └─ refresh_token_not_found | session_not_found → signOut(local) → A1 ("Oturum başka cihazdan sonlandırıldı")
           → yönlendirme kararı (§3.8)
  SplashScreen.hideAsync()  (karar verildikten sonra)

[A1] Google ────► nitro signIn(nonce=sha256hex(raw)) → signInWithIdToken({provider:'google', token, nonce: raw}) ─┐
[A1] Apple (iOS) ► AppleAuthentication.signInAsync(nonce=sha256hex(raw)) → signInWithIdToken({provider:'apple',…}) ┤
[A1] E-posta ───► signInWithOtp({email, options:{shouldCreateUser:true}}) → [A2] verifyOtp({email, token, type:'email'}) ┤
                                                                                                                 ▼
                                                                          onAuthStateChange(SIGNED_IN) → yönlendirme
[Yönlendirme]
  profile yok / role NULL / full_name NULL  → A3 /onboarding/role → A4 /onboarding/consent → complete_onboarding() RPC
  role='pt'                                  → /pt
  role='client' ve açık oturum (yerel SQLite) → /client/workout/active
  role='client'                              → /client
  bekleyen davet kodu (kv 'pending-invite')  → client ise /client/pairing?code=…
```

### 3.2 `supabase/config.toml` (yalnızca değişen/eklenen bölümler — tam değerler)

```toml
[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]      # "private" ASLA eklenmez
extra_search_path = ["public", "extensions"]
max_rows = 1000
auto_expose_new_tables = false

[auth]
enabled = true
site_url = "env(SUPABASE_AUTH_SITE_URL)"   # yerel: http://127.0.0.1:3000 ; hosted: https://pulsecoach.app
additional_redirect_urls = ["env(SUPABASE_AUTH_REDIRECT_APP)"]   # pulsecoach://auth/callback (yalnızca tarayıcı yedek akışı için)
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = true
enable_anonymous_sign_ins = false
enable_manual_linking = false               # hesap bağlama ekranı v1.1

[auth.rate_limit]
email_sent = 150          # hosted'da custom SMTP ile; gerçek trafiğe göre ayarlanır
sign_in_sign_ups = 30
token_verifications = 30
token_refresh = 150

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = true                 # hosted ile aynı: yeni kullanıcıya "confirmation" şablonu gider
secure_password_change = true
max_frequency = "60s"
otp_length = 6
otp_expiry = 300

[auth.email.template.confirmation]
subject = "PulseCoach giriş kodun: {{ .Token }}"
content_path = "./supabase/templates/otp.html"

[auth.email.template.magic_link]
subject = "PulseCoach giriş kodun: {{ .Token }}"
content_path = "./supabase/templates/otp.html"

# Hosted için (yerelde Mailpit kullanılır; bu blok yalnızca remote config'te dolu olur)
# [auth.email.smtp]
# enabled = true
# host = "env(SMTP_HOST)"
# port = 587
# user = "env(SMTP_USER)"
# pass = "env(SMTP_PASS)"
# admin_email = "env(SMTP_ADMIN_EMAIL)"     # no-reply@mail.pulsecoach.app (SPF/DKIM/DMARC'lı alt alan)
# sender_name = "PulseCoach"

# [auth.captcha]                            # K37: public lansman öncesi açılır
# enabled = true
# provider = "turnstile"
# secret = "env(SUPABASE_AUTH_CAPTCHA_SECRET)"

[auth.sessions]
# timebox ve inactivity_timeout KAPALI (kalıcı oturum vaadi). Pro planda kayıp cihaz riski için 90 gün inactivity değerlendirilebilir (§12).

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"   # "<WEB>,<IOS_DEV>,<IOS_PREVIEW>,<IOS_PROD>" — WEB İLK SIRADA
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = false

[auth.external.apple]
enabled = true
client_id = "app.pulsecoach,app.pulsecoach.preview,app.pulsecoach.dev"     # native: bundle ID'ler
secret = "env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)"
skip_nonce_check = false

[functions.delete-account]
verify_jwt = true

[functions.review-login]
verify_jwt = false

[functions.send-push]
verify_jwt = false
```

Hosted senkron (ZORUNLU sıra): `npx supabase link --project-ref <ref>` → `npx supabase config diff` (çıktı PR'da incelenir; CI'da diff boş değilse uyarı) → `npx supabase config push`. `config push` başarısızsa yedek: Management API `PATCH /v1/projects/{ref}/config/auth`. Hosted'da "Confirm email" KAPATILMAZ (autoconfirm kodu doğrulanmadan kullanıcıyı confirmed yapar).

### 3.3 `supabase/templates/otp.html`

```html
<!doctype html>
<html lang="tr">
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f7fa;padding:24px">
    <table role="presentation" style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:32px">
      <tr><td>
        <h1 style="font-size:20px;margin:0 0 12px">PulseCoach giriş kodun</h1>
        <p style="font-size:15px;color:#333">Uygulamaya aşağıdaki 6 haneli kodu gir. Kod 5 dakika geçerlidir.</p>
        <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:24px 0">{{ .Token }}</p>
        <p style="font-size:13px;color:#666">Bu isteği sen yapmadıysan e-postayı yok sayabilirsin. Kodu kimseyle paylaşma.</p>
      </td></tr>
    </table>
  </body>
</html>
```

Şablonlarda `{{ .ConfirmationURL }}`, `{{ .TokenHash }}`, `{{ .SiteURL }}` YASAK. E2E testi (Maestro + Mailpit API `http://127.0.0.1:54324/api/v1/messages`): (a) hiç kayıtlı olmayan e-posta, (b) kayıtlı e-posta → her ikisinde de 6 haneli kod gelmeli.

### 3.4 Google native giriş (K2)

ADR-0001 varsayılanı `react-native-nitro-google-signin`. Sprint 0 PoC kabul kriteri: iOS + Android dev build'de nonce'lu `signInWithIdToken` başarılı, `skip_nonce_check=false`. PoC başarısızsa sıradaki yol: tarayıcı PKCE (`flowType:'pkce'`, `WebBrowser.openAuthSessionAsync`, `exchangeCodeForSession`, callback `pulsecoach://auth/callback`). `skip_nonce_check=true` YASAK.

```ts
// src/features/auth/google.native.ts
import * as Crypto from 'expo-crypto';
import {
  GoogleOneTapSignIn, isSuccessResponse, isNoSavedCredentialFoundResponse,
} from 'react-native-nitro-google-signin';
import { supabase } from '@/lib/supabase/client';

export async function signInWithGoogle(): Promise<'ok' | 'cancelled'> {
  const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce); // hex
  await GoogleOneTapSignIn.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!, nonce: hashedNonce });
  await GoogleOneTapSignIn.checkPlayServices();
  let res = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(res)) res = await GoogleOneTapSignIn.createAccount();
  if (isNoSavedCredentialFoundResponse(res)) res = await GoogleOneTapSignIn.presentExplicitSignIn();
  if (!isSuccessResponse(res) || !res.data.idToken) return 'cancelled';
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: res.data.idToken, nonce: rawNonce });
  if (error) throw error;
  return 'ok';
}
```

Client ID matrisi (ZORUNLU, `docs/adr/0001` içinde tablo olarak tutulur):

| Varyant | Bundle / package | iOS client ID | Android OAuth client'ları (SHA-1) |
|---|---|---|---|
| development | `app.pulsecoach.dev` | IOS_DEV | debug keystore, EAS dev credentials |
| preview | `app.pulsecoach.preview` | IOS_PREVIEW | EAS upload key, Play App Signing (internal) |
| production | `app.pulsecoach` | IOS_PROD | EAS upload key, **Play App Signing key** (ilk internal yüklemeden sonra eklenir; Play'den indirilen build'de test ZORUNLU) |

Supabase Google provider `client_id` = `WEB,IOS_DEV,IOS_PREVIEW,IOS_PROD` (Android client ID'leri ID token audience olarak web ID'yi kullanır). Consent screen: yalnızca `openid email profile`; gizlilik/şartlar URL'leri; yayın durumu **In production**; marka doğrulaması store gönderiminden 2 hafta önce başlatılır.

### 3.5 Apple ile giriş (yalnızca iOS)

```ts
// src/features/auth/apple.ios.ts
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase/client';

export async function signInWithApple(): Promise<'ok' | 'cancelled'> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) throw new Error('apple_no_identity_token');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
  if (name.length >= 2) {
    // Apple adı yalnızca ilk girişte verir: metadata'ya yaz → auth trigger boş full_name'i doldurur
    await supabase.auth.updateUser({ data: { full_name: name } });
  }
  return 'ok';
}
```

- `credential.email` `@privaterelay.appleid.com` ile bitiyorsa A1'de tek seferlik bilgi: "Daha önce Google veya e-posta ile giriş yaptıysan önce o yöntemle gir; aksi halde ayrı hesap oluşur." (AUTH-15)
- Apple refresh token SAKLANMAZ; hesap silmede yeniden `signInAsync` ile `authorizationCode` alınır (§3.11).

### 3.6 Supabase istemcisi ve oturum depolama (K4)

```ts
// src/lib/supabase/large-secure-store.ts  (native)
import 'expo-sqlite/localStorage/install';
import * as SecureStore from 'expo-secure-store';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';

const KEY_PREFIX = 'pc_sess_key_';
const toB64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const skey = (name: string) => KEY_PREFIX + name.replace(/[^A-Za-z0-9._-]/g, '_');

export class LargeSecureStore {
  private async key(name: string, create: boolean): Promise<AESEncryptionKey | null> {
    const hex = await SecureStore.getItemAsync(skey(name));
    if (hex) return AESEncryptionKey.import(hex, 'hex');
    if (!create) return null;
    const k = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(skey(name), await k.encoded('hex'), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return k;
  }
  async getItem(name: string): Promise<string | null> {
    const blob = globalThis.localStorage.getItem(name);
    if (!blob) return null;
    try {
      const k = await this.key(name, false);
      if (!k) throw new Error('missing_key');
      const plain = await aesDecryptAsync(AESSealedData.fromCombined(fromB64(blob)), k);
      return new TextDecoder().decode(plain as Uint8Array);
    } catch {
      // Çözülemeyen değer (yeniden kurulum, Android backup geri yükleme): temizle, oturum yok say
      await this.removeItem(name);
      return null;
    }
  }
  async setItem(name: string, value: string): Promise<void> {
    const k = await this.key(name, true);
    const sealed = await aesEncryptAsync(new TextEncoder().encode(value), k!);
    globalThis.localStorage.setItem(name, toB64(await sealed.combined()));
  }
  async removeItem(name: string): Promise<void> {
    globalThis.localStorage.removeItem(name);
    await SecureStore.deleteItemAsync(skey(name));
  }
}
```

> Not: `aesDecryptAsync` çıktısının varsayılan tipi (Uint8Array) ve `combined()` imzası Sprint 0'da SDK 57 tip tanımıyla birebir doğrulanır; farklıysa `{ output: 'base64' }` seçeneği + `atob` kullanılır. Birim testi: 5 KB'lık oturum JSON'u yaz → oku → eşit.

```ts
// src/lib/supabase/client.native.ts
import { AppState } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { LargeSecureStore } from './large-secure-store';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: new LargeSecureStore(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);

// Tek singleton; arka plan görevleri de BU örneği kullanır (yeni client YASAK — refresh reuse detection)
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

```ts
// src/lib/supabase/client.web.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
export const supabase = createClient<Database>(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: typeof window !== 'undefined', autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});
```

### 3.7 Oturum sağlayıcısı kuralları

- `onAuthStateChange` callback'i **senkron** olur; içinde başka supabase çağrısı `await` edilmez (deadlock). Olay yalnızca store'a yazılır (`setAuthEvent(event, session)`); yan etkiler `useEffect` içinde.
- `TOKEN_REFRESHED` içinde `refreshSession()` YASAK.
- Login'e yönlendirme yalnızca: `SIGNED_OUT` olayı, veya `getSession/refresh` hatası `refresh_token_not_found` / `session_not_found` ise. `isAuthRetryableFetchError(error)` → çevrimdışı mod.
- Rol cache'i: `expo-sqlite/kv-store` anahtarı `role-cache` = `{userId, role, fullName, onboardedAt, updatedAt}`; her başarılı profil fetch'inde güncellenir; logout'ta silinir.

### 3.8 Kök layout ve route guard

```tsx
// src/app/_layout.tsx (özet — tam uygulama bu kurallara uyar)
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppProviders /* QueryClient(persist), i18n, Theme, KeyboardProvider, GestureHandlerRootView, Sentry */>
      <RootNavigator />
    </AppProviders>
  );
}

function RootNavigator() {
  const auth = useAuthBootstrap(); // {status:'loading'|'signedOut'|'signedIn', offline, role, needsOnboarding, hasOpenLocalWorkout}
  useEffect(() => { if (auth.status !== 'loading') SplashScreen.hideAsync(); }, [auth.status]);
  if (auth.status === 'loading') return null;
  const signedIn = auth.status === 'signedIn';
  const noRoleOffline = signedIn && auth.role == null && auth.offline;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={noRoleOffline}>
        <Stack.Screen name="offline-gate" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !noRoleOffline && auth.needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !auth.needsOnboarding && auth.role === 'client'}>
        <Stack.Screen name="client" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !auth.needsOnboarding && auth.role === 'pt'}>
        <Stack.Screen name="pt" />
      </Stack.Protected>
      <Stack.Screen name="invite/[code]" />
    </Stack>
  );
}
```

- `needsOnboarding = profile == null || role == null || full_name == null`.
- `client` guard açıldığında `client/_layout.tsx` yerel SQLite'ta 6 saatten yeni açık oturum varsa `router.replace('/client/workout/active')`; 6 saatten eskiyse C1'de `ResumeWorkoutCard` üç seçenekle açılır: "Devam et" / "Önceki antrenmanı bitir" (`complete_workout`; `nothing_logged` ise iptal önerilir) / "İptal et" (`abandon_workout`). Aynı seçenekler C2'de `session_in_progress` yanıtında da gösterilir (§9 C1/C2).
- Rol cache'i yok + çevrimdışı → `offline-gate` ("Bağlantı gerekli · Tekrar dene"); sonsuz spinner YASAK.

### 3.9 Onboarding (A3 + A4)

- A3: zorunlu "Adın" (2–100 karakter; Google/Apple metadata'sından önceden dolu) + iki rol kartı. Seçim yalnızca yerel state'tir.
- A4: aydınlatma metni linki, kullanım şartları kabulü (zorunlu), "18 yaşından büyüğüm" (zorunlu), sağlık verisi açık rızası (ayrı onay kutusu; **danışan için isteğe bağlı ama readiness/ölçüm/eşleşme için gerekli**; PT'de gösterilmez).
- "Devam" → `rpc('complete_onboarding', { p_role, p_full_name, p_terms_version, p_privacy_version, p_is_adult: true, p_health_data_version })`. Başarıda `role-cache` yazılır, `refetch profile`, guard otomatik yönlendirir. `already_onboarded` hatası → profil yeniden okunur ve yönlendirilir.
- Doküman sürümleri `EXPO_PUBLIC_REQUIRED_DOC_VERSIONS`'tan gelir; açılışta kullanıcının aktif `terms`/`privacy_notice` rızası farklı sürümdeyse bloklayan "Güncellenen koşullar" ekranı → `accept_document_versions()`.

### 3.10 Çıkış

Sıra (ZORUNLU): (1) outbox'ta `pending/failed` varsa bloklayan dialog, varsayılan eylem "Önce senkronla" (flush dene; başarısızsa "Yine de çık (N kayıt kaybolur)" onayı); (2) `supabase.removeAllChannels()`; (3) `unregister_push_token(token)` (online ise); (4) `supabase.auth.signOut({ scope: 'local' })`; (5) Google: `GoogleOneTapSignIn.signOut()`; (6) bekleyen yerel bildirimleri iptal et; (7) `queryClient.clear()` + persister temizliği + `role-cache`, `pending-invite`, SQLite `local_*` ve `outbox` tabloları temizlenir; (8) `router.replace('/sign-in')`.
P6/C6'da ayrıca **"Tüm cihazlardan çıkış"** = `signOut({ scope: 'global' })` + aynı yerel temizlik.

### 3.11 Hesap silme

İstemci (C6/P6 → Gizlilik → "Hesabımı Sil"): açıklama ekranı (silinecek/kalacak veriler) → "SİL" yazarak onay → iOS'ta hesapta Apple kimliği varsa `AppleAuthentication.signInAsync()` ile yeni `authorizationCode` → `supabase.functions.invoke('delete-account', { body: { apple_authorization_code, bundle_id: Application.applicationId } })` (`expo-application`; kodu üreten varyantın bundle ID'si — dev/preview/prod aynı staging projesini kullanabildiği için ZORUNLU) → başarıda §3.10 yerel temizlik + A1. Yanıtta `apple_revoke !== 'revoked'` ise son ekranda bilgi: "Apple Kimliği ayarlarından (Ayarlar → Apple Hesabı → Apple ile Giriş) PulseCoach'u da kaldırabilirsin."

```ts
// supabase/functions/delete-account/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { SignJWT, importPKCS8 } from 'npm:jose@6.2.12';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// Authorization code, onu üreten uygulamanın bundle ID'siyle takas edilmek ZORUNDA (aksi halde invalid_client/invalid_grant).
const APPLE_CLIENT_IDS = (Deno.env.get('APPLE_CLIENT_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

async function appleClientSecret(clientId: string) {
  const key = await importPKCS8(Deno.env.get('APPLE_PRIVATE_KEY_P8')!, 'ES256');
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: Deno.env.get('APPLE_KEY_ID')! })
    .setIssuer(Deno.env.get('APPLE_TEAM_ID')!)
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)                       // client_secret.sub = client_id = varyant bundle ID
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

type RevokeResult = 'revoked' | 'token_exchange_failed' | 'revoke_failed' | 'network_error' | 'invalid_bundle_id' | 'misconfigured';

// Hata FIRLATMAZ, sonuç kodu döner: revoke hatası hesap silmeyi bloklamaz (ürün kararı §12 S17)
async function revokeApple(code: string, bundleId: unknown): Promise<RevokeResult> {
  if (typeof bundleId !== 'string' || !APPLE_CLIENT_IDS.includes(bundleId)) return 'invalid_bundle_id';
  if (!Deno.env.get('APPLE_PRIVATE_KEY_P8') || !Deno.env.get('APPLE_KEY_ID') || !Deno.env.get('APPLE_TEAM_ID')) return 'misconfigured';
  try {
    const secret = await appleClientSecret(bundleId);
    const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: bundleId, client_secret: secret, code, grant_type: 'authorization_code' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) return 'token_exchange_failed';
    const { refresh_token } = await tokenRes.json();
    const revokeRes = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: bundleId, client_secret: secret, token: refresh_token, token_type_hint: 'refresh_token' }),
      signal: AbortSignal.timeout(8000),
    });
    return revokeRes.ok ? 'revoked' : 'revoke_failed';
  } catch {
    return 'network_error';
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  if (!secretKeys['default']) return json(503, { error: 'misconfigured' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKeys['default'], { auth: { persistSession: false, autoRefreshToken: false } });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: claimsData, error: claimsError } = await admin.auth.getClaims(jwt);
  const uid = claimsData?.claims?.sub;
  if (claimsError || !uid) return json(401, { error: 'unauthorized' });

  const body = await req.json().catch(() => ({}));
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(uid);
  if (userErr || !userData.user) return json(404, { error: 'user_not_found' });

  let appleRevoke: RevokeResult | null = null;
  const hasApple = (userData.user.identities ?? []).some((i) => i.provider === 'apple');
  if (hasApple) {
    // Kullanıcı Apple yeniden doğrulamasını iptal ettiyse silme akışı da iptal edilir (istemci bu durumda çağırmaz)
    if (typeof body.apple_authorization_code !== 'string') return json(400, { error: 'apple_reauth_required' });
    appleRevoke = await revokeApple(body.apple_authorization_code, body.bundle_id);
    if (appleRevoke !== 'revoked') {
      await admin.rpc('admin_audit_event', {
        p_action: 'apple_revoke_failed', p_actor_id: uid, p_row_id: uid,
        p_details: { reason: appleRevoke, bundle_id: typeof body.bundle_id === 'string' ? body.bundle_id : null },
      });
    }
  }

  const { error: prepErr } = await admin.rpc('admin_prepare_account_deletion', { p_user_id: uid });
  if (prepErr) return json(500, { error: 'prepare_failed' });
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return json(500, { error: 'delete_failed' });
  return json(200, { ok: true, apple_revoke: appleRevoke });
});
```

Loglarda JWT, e-posta, gövde YAZILMAZ. Google Play için `https://pulsecoach.app/account-deletion` statik sayfası (form → destek e-postası; kimlik doğrulaması e-posta ile) Play Console "Delete account URL" alanına girilir.

**Silme sonucu (pgTAP ile doğrulandı, §11.3 bölüm 12):** Danışan: profil, rızalar, oturumlar, setler, readiness, ölçümler, bests, PR'lar, notlar, eşleşmeler, alarmlar, egzersiz önerileri CASCADE silinir. PT: eşleşmeler ve PT'nin alarmları silinir; kütüphane program/şablonları silinir; danışanlara kopyalanmış programlar/şablonlar danışanda kalır (`owner_id = NULL`); PT'nin girdiği ölçüm oturumları danışanda kalır (`recorded_by = NULL`).

**Özel egzersizler (PT ve danışan):** hazırlık adımında SİLİNMEZ; `auth.users` silinince `owner_id = NULL` olur. Başka bir kullanıcının şablonunda/logunda/PR kaydında kullanılıyorsa kalır (atanmış danışan okumaya devam eder). Kullanıcının kendi şablon/log referansları CASCADE ile gittikten sonra hiçbir yerde kullanılmıyorsa `pc-daily-cleanup` en geç ~24 saat içinde siler (aydınlatma metninde belirtilir, §12 S21). Test edilen senaryolar: (a) özel egzersizi kendi şablonunda olan danışan, (b) özel egzersizi yalnızca kendi loglarında geçen danışan, (c) özel egzersizi danışan kopyası şablonda bulunan PT. Üçünde de hazırlık + `auth.users` silme başarılı; ardından temizlik yalnızca artık kullanılmayanları siler. (v1.0'daki hazırlık adımı egzersizi silmeye çalışıp kullanıcının kendi referansları yüzünden 23503 ile hesap silmeyi kilitliyordu.)

### 3.12 App Review girişi (K30)

```ts
// supabase/functions/review-login/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const enc = new TextEncoder();
async function safeEqual(a: string, b: string) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb); let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0;
}
const hits = new Map<string, { n: number; t: number }>(); // izolat başı kaba sınır: IP başına 10 dk'da 5

Deno.serve(async (req) => {
  const enabled = Deno.env.get('REVIEW_LOGIN_ENABLED') === 'true';
  if (req.method === 'GET') return json(200, { enabled });            // A1 "Demo erişimi" görünürlüğü
  if (!enabled) return json(404, { error: 'not_found' });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Fail-closed: secret eksik/zayıfsa hiçbir istek kabul edilmez (boş passcode ile eşleşme imkânsız)
  const passcodeSecret = Deno.env.get('REVIEW_LOGIN_PASSCODE') ?? '';
  const allowed = (Deno.env.get('REVIEW_LOGIN_EMAILS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  const pubKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
  if (passcodeSecret.length < 32 || allowed.length === 0 || !keys['default'] || !pubKeys['default']) {
    return json(503, { error: 'misconfigured' });
  }
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, keys['default'], { auth: { persistSession: false } });
  // private.audit_log'a PII'siz kayıt (e-posta, IP, gövde YAZILMAZ)
  const audit = (action: 'review_login_success' | 'review_login_failed', details: Record<string, unknown>, actor: string | null = null) =>
    admin.rpc('admin_audit_event', { p_action: action, p_actor_id: actor, p_row_id: actor, p_details: details });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now(); const h = hits.get(ip);
  if (h && now - h.t < 600_000 && h.n >= 5) { await audit('review_login_failed', { reason: 'rate_limited' }); return json(429, { error: 'rate_limited' }); }
  hits.set(ip, h && now - h.t < 600_000 ? { n: h.n + 1, t: h.t } : { n: 1, t: now });

  const { email, passcode } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !allowed.includes(email.toLowerCase())) {
    await audit('review_login_failed', { reason: 'email_not_allowed' });
    return json(401, { error: 'unauthorized' });
  }
  if (typeof passcode !== 'string' || passcode.length === 0 || !(await safeEqual(passcode, passcodeSecret))) {
    await audit('review_login_failed', { reason: 'bad_passcode' });
    return json(401, { error: 'unauthorized' });
  }

  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link.properties?.email_otp) { await audit('review_login_failed', { reason: 'link_failed' }); return json(500, { error: 'link_failed' }); }
  const pub = createClient(url, pubKeys['default'], { auth: { persistSession: false } });
  const { data: session, error: vErr } = await pub.auth.verifyOtp({ email, token: link.properties.email_otp, type: 'email' });
  if (vErr || !session.session) { await audit('review_login_failed', { reason: 'verify_failed' }); return json(500, { error: 'verify_failed' }); }
  await audit('review_login_success', {}, session.session.user.id);
  return json(200, { access_token: session.session.access_token, refresh_token: session.session.refresh_token });
});
```

İstemci: A1 açılışında `GET /functions/v1/review-login` (1 saat cache) `enabled:true` dönerse ekranın altında küçük ama **görünür** "Demo erişimi" bağlantısı gösterilir (e-posta + erişim kodu formu) → `POST` → `supabase.auth.setSession(tokens)`. Gizli jest (ör. logoya 7 dokunuş) YASAK: App Review Guideline 2.3.1 gizli/belgelenmemiş özellikleri yasaklar. `REVIEW_LOGIN_ENABLED` yalnızca inceleme süresince `true`; kapalıyken bağlantı görünmez ve POST 404 döner. Başarılı/başarısız her deneme `private.audit_log`'a `review_login_success` / `review_login_failed` (+ neden kodu) olarak yazılır. `SUPABASE_PUBLISHABLE_KEYS` ortam değişkeninin varlığı Sprint 0'da doğrulanır; yoksa publishable anahtar `REVIEW_PUBLISHABLE_KEY` secret'ı olarak verilir.

**Demo verisi — uygulama yöntemi (ZORUNLU sıra, yalnızca staging/review projesi):**

1. Yönetici terminalinde iki kullanıcıyı admin API ile oluştur (idempotent):

```ts
// scripts/create-review-users.ts
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_… deno run --allow-net --allow-env scripts/create-review-users.ts
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
for (const email of ['review-pt@pulsecoach.app', 'review-client@pulsecoach.app']) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error && error.code !== 'email_exists') throw error;   // tekrar çalıştırmada mevcut kullanıcı hata değildir
  console.log(email, error ? 'mevcut' : `oluşturuldu ${data.user?.id}`);
}
```

2. `psql "$REVIEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed-demo.sql` (`postgres` rolü; dashboard bağlantı dizesi, pooler değil doğrudan bağlantı). Script iki hesabın uygulama verisini sıfırlayıp **gerçek RPC ve RLS yollarıyla** yeniden üretir: onboarding + rızalar → PT kütüphanesi (A/B şablonu, süperset) → davet → geçmişi paylaşımlı eşleşme → 6 haftalık blok ataması (3 hafta önce başlamış) → son 3 haftaya yayılmış 6 tamamlanmış oturum (1 düşük readiness + deload reddi, 1 teyitli overload seti) → PR'lar → PT ölçümleri (kilo, bel, fonksiyonel skor, Y-Balance) + danışan kilo girişi. Docker'da iki kez üst üste çalıştırılarak doğrulandı: 6 oturum (6 ayrı gün), 1 `OVERLOAD_RISK` + 1 `LOW_READINESS`, 10 PR, 5 en iyi, `clock_skew_suspect` 0; ikinci çalıştırmada sayılar aynı.
3. `REVIEW_LOGIN_EMAILS=review-pt@pulsecoach.app,review-client@pulsecoach.app`, `REVIEW_LOGIN_PASSCODE=<≥32 karakter>` secret'ları ve `REVIEW_LOGIN_ENABLED=true`. İnceleme bitince `false`. İnceleyici demo hesabı silerse 1–2 tekrarlanır.

```sql
-- =====================================================================
-- supabase/seed-demo.sql — YALNIZCA staging / App Review projesi. Gerçek kullanıcı verisi olan ortamda ÇALIŞTIRILMAZ.
-- Uygulama (postgres rolü, tek transaction):
--   psql "$REVIEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed-demo.sql
-- Önkoşul: iki auth kullanıcısı admin API ile oluşturulmuş olmalı (scripts/create-review-users.ts):
--   review-pt@pulsecoach.app, review-client@pulsecoach.app  (email_confirm: true)
-- İdempotent: her çalıştırmada YALNIZCA bu iki hesabın uygulama verisini silip gerçek RPC/RLS yollarıyla yeniden üretir
-- (onboarding → davet → eşleşme → program ataması → 6 oturum → overload + düşük readiness alarmı, PR'lar, ölçümler).
-- `supabase db reset` bu dosyayı ÇALIŞTIRMAZ (config.toml [db.seed] yalnızca seed.sql).
-- =====================================================================
begin;

select set_config('demo.pt', coalesce((select id::text from auth.users where email = 'review-pt@pulsecoach.app'), ''), true);
select set_config('demo.client', coalesce((select id::text from auth.users where email = 'review-client@pulsecoach.app'), ''), true);

-- 1) Sıfırla (yalnızca iki demo hesabı)
do $$
declare
  v_ids uuid[];
begin
  if current_setting('demo.pt') = '' or current_setting('demo.client') = '' then
    raise exception 'demo_users_missing: önce scripts/create-review-users.ts çalıştırın';
  end if;
  v_ids := array[current_setting('demo.pt')::uuid, current_setting('demo.client')::uuid];
  delete from public.pt_client_pairs where pt_id = any(v_ids) or client_id = any(v_ids);
  delete from public.programs where owner_id = any(v_ids) or client_id = any(v_ids);
  delete from public.workout_logs where user_id = any(v_ids);
  delete from public.workout_templates where owner_id = any(v_ids) or client_id = any(v_ids);
  delete from public.readiness_logs where user_id = any(v_ids);
  delete from public.exercise_bests where user_id = any(v_ids);
  delete from public.user_exercise_notes where user_id = any(v_ids);
  delete from public.measurement_sessions where client_id = any(v_ids) or recorded_by = any(v_ids);
  delete from public.radar_evaluations where client_id = any(v_ids);
  delete from public.pairing_invites where pt_id = any(v_ids);
  delete from public.exercise_suggestions where suggested_by = any(v_ids);
  delete from public.consents where user_id = any(v_ids);
  delete from public.exercises where scope = 'custom' and owner_id = any(v_ids);
  delete from public.push_tokens where user_id = any(v_ids);
  delete from public.notification_preferences where user_id = any(v_ids);
  delete from private.pairing_attempts where user_id = any(v_ids);
  insert into public.profiles (id) select unnest(v_ids) on conflict (id) do nothing;
  update public.profiles set role = null, onboarded_at = null, full_name = null, phone_e164 = null where id = any(v_ids);
end $$;

-- 2) PT: onboarding, kütüphane şablonları, program, davet kodu (RLS altında)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('demo.pt'), 'role', 'authenticated')::text, true);
select public.complete_onboarding('pt', 'Demo Antrenör', 'terms-2026-09', 'privacy-2026-09', true, null);

insert into public.workout_templates (id, owner_id, title, tolerance_pct, tolerance_abs_kg) values
  ('de000000-0000-4000-8000-000000000001', current_setting('demo.pt')::uuid, 'Üst Vücut A', 20, 5),
  ('de000000-0000-4000-8000-000000000002', current_setting('demo.pt')::uuid, 'Alt Vücut B', 20, 5);
insert into public.template_blocks (id, template_id, position, block_type, rest_after_round_sec) values
  ('de100000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 1, 'single', null),
  ('de100000-0000-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000001', 2, 'superset', 60),
  ('de100000-0000-4000-8000-000000000003', 'de000000-0000-4000-8000-000000000002', 1, 'single', null),
  ('de100000-0000-4000-8000-000000000004', 'de000000-0000-4000-8000-000000000002', 2, 'single', null);
insert into public.template_exercises (id, block_id, position_in_block, exercise_id, is_priority)
select v.id, v.block_id, v.pos, e.id, v.prio
  from (values
    ('de200000-0000-4000-8000-000000000001'::uuid, 'de100000-0000-4000-8000-000000000001'::uuid, 1, 'Barbell Bench Press', true),
    ('de200000-0000-4000-8000-000000000002'::uuid, 'de100000-0000-4000-8000-000000000002'::uuid, 1, 'Incline Dumbbell Curl', false),
    ('de200000-0000-4000-8000-000000000003'::uuid, 'de100000-0000-4000-8000-000000000002'::uuid, 2, 'Triceps Rope Pushdown', false),
    ('de200000-0000-4000-8000-000000000004'::uuid, 'de100000-0000-4000-8000-000000000003'::uuid, 1, 'Barbell Back Squat', true),
    ('de200000-0000-4000-8000-000000000005'::uuid, 'de100000-0000-4000-8000-000000000004'::uuid, 1, 'Barbell Deadlift', true)
  ) v(id, block_id, pos, title, prio)
  join public.exercises e on e.scope = 'global' and e.title = v.title and e.archived_at is null;
insert into public.template_exercise_sets (template_exercise_id, set_type, set_number, target_reps_min, target_reps_max, target_weight_kg, rest_seconds) values
  ('de200000-0000-4000-8000-000000000001', 'warmup',  1, 10, 10,  20, null),
  ('de200000-0000-4000-8000-000000000001', 'working', 1,  8,  8,  60,   90),
  ('de200000-0000-4000-8000-000000000001', 'working', 2,  8,  8,  60,   90),
  ('de200000-0000-4000-8000-000000000001', 'working', 3,  8,  8,  60,   90),
  ('de200000-0000-4000-8000-000000000002', 'working', 1, 12, 12,  12, null),
  ('de200000-0000-4000-8000-000000000002', 'working', 2, 12, 12,  12, null),
  ('de200000-0000-4000-8000-000000000003', 'working', 1, 12, 12,  25, null),
  ('de200000-0000-4000-8000-000000000003', 'working', 2, 12, 12,  25, null),
  ('de200000-0000-4000-8000-000000000004', 'working', 1,  5,  5,  80,  180),
  ('de200000-0000-4000-8000-000000000004', 'working', 2,  5,  5,  80,  180),
  ('de200000-0000-4000-8000-000000000004', 'working', 3,  5,  5,  80,  180),
  ('de200000-0000-4000-8000-000000000005', 'working', 1,  5,  5, 100,  180),
  ('de200000-0000-4000-8000-000000000005', 'working', 2,  5,  5, 100,  180);
insert into public.programs (id, owner_id, title, description, status, duration_weeks, days_per_week) values
  ('de300000-0000-4000-8000-000000000001', current_setting('demo.pt')::uuid, 'Demo Hipertrofi Bloğu', '6 haftalık A/B rotasyonu', 'draft', 6, 2);
insert into public.program_workouts (program_id, template_id, day_order, day_label) values
  ('de300000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 1, 'A'),
  ('de300000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 2, 'B');
select set_config('demo.code', public.create_pairing_invite() ->> 'code', true);

-- 3) Danışan: onboarding + sağlık rızası + eşleşme (geçmiş paylaşımlı)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('demo.client'), 'role', 'authenticated')::text, true);
select public.complete_onboarding('client', 'Demo Danışan', 'terms-2026-09', 'privacy-2026-09', true, 'health-2026-09');
do $$
declare
  r jsonb;
begin
  r := public.redeem_pairing_invite(current_setting('demo.code'), 'share-2026-09', true);
  if not coalesce((r ->> 'ok')::boolean, false) then
    raise exception 'demo_redeem_failed: %', r;
  end if;
end $$;
insert into public.user_exercise_notes (user_id, exercise_id, note)
select current_setting('demo.client')::uuid, e.id, 'Sehpa 3. delik; skapulaları sık.'
  from public.exercises e where e.scope = 'global' and e.title = 'Barbell Bench Press';

-- 4) PT: program ataması (3 hafta önce başladı) + ölçümler
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('demo.pt'), 'role', 'authenticated')::text, true);
select set_config('demo.program', public.assign_program('de300000-0000-4000-8000-000000000001', current_setting('demo.client')::uuid, current_date - 21) ->> 'program_id', true);
insert into public.measurement_sessions (id, client_id, recorded_by, recorded_by_role, measured_at, pt_notes) values
  ('de400000-0000-4000-8000-000000000001', current_setting('demo.client')::uuid, current_setting('demo.pt')::uuid, 'pt', now() - interval '20 days', 'Başlangıç değerlendirmesi.'),
  ('de400000-0000-4000-8000-000000000002', current_setting('demo.client')::uuid, current_setting('demo.pt')::uuid, 'pt', now() - interval '2 days', '3. hafta kontrolü.');
insert into public.measurements (session_id, type_code, side, value) values
  ('de400000-0000-4000-8000-000000000001', 'weight_kg', null, 82),
  ('de400000-0000-4000-8000-000000000001', 'waist_cm', null, 90),
  ('de400000-0000-4000-8000-000000000001', 'overhead_squat_score', null, 1),
  ('de400000-0000-4000-8000-000000000002', 'weight_kg', null, 80.5),
  ('de400000-0000-4000-8000-000000000002', 'waist_cm', null, 88),
  ('de400000-0000-4000-8000-000000000002', 'overhead_squat_score', null, 2),
  ('de400000-0000-4000-8000-000000000002', 'leg_length_cm', 'left', 92),
  ('de400000-0000-4000-8000-000000000002', 'y_balance_anterior_cm', 'left', 62),
  ('de400000-0000-4000-8000-000000000002', 'y_balance_posteromedial_cm', 'left', 101),
  ('de400000-0000-4000-8000-000000000002', 'y_balance_posterolateral_cm', 'left', 97);

-- 5) Danışan: son 3 haftaya yayılmış 6 oturum (gerçek RPC yolları), ardından postgres olarak geriye tarihleme
reset role;
do $$
declare
  v_client uuid := current_setting('demo.client')::uuid;
  v_tz     text := 'Europe/Istanbul';
  i        integer;
  v_ts     timestamptz;
  v_rl     uuid;
  v_wl     uuid;
  v_pw     uuid;
  v_home   jsonb;
  v_pl     jsonb;
  x        jsonb;
  s        jsonb;
  v_w      numeric;
  v_sleep  int[] := array[4, 4, 3, 4, 2, 4];
  v_energy int[] := array[4, 4, 4, 4, 2, 4];
  v_sore   int[] := array[2, 2, 2, 2, 4, 2];
  v_stress int[] := array[2, 2, 3, 3, 4, 2];
  r        record;
begin
  for i in 1..6 loop
    v_ts := date_trunc('day', now()) - make_interval(days => 22 - i * 3) + interval '8 hours';

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_client, 'role', 'authenticated')::text, true);

    v_rl := gen_random_uuid();
    insert into public.readiness_logs (id, user_id, sleep_rating, energy_rating, soreness_rating, stress_rating, pain_regions)
    values (v_rl, v_client, v_sleep[i], v_energy[i], v_sore[i], v_stress[i],
            case when i = 5 then '{shoulder}'::public.body_region[] else '{}'::public.body_region[] end);

    v_home := public.get_client_home();
    v_pw := (v_home -> 'next_workout' ->> 'program_workout_id')::uuid;
    v_wl := gen_random_uuid();
    v_pl := public.start_workout(v_wl, v_pw, null, v_rl, 'decline');
    if not coalesce((v_pl ->> 'ok')::boolean, false) then
      raise exception 'demo_start_failed: %', v_pl;
    end if;

    for x in select * from jsonb_array_elements(v_pl -> 'exercises') loop
      for s in select * from jsonb_array_elements(x -> 'planned_sets') loop
        -- Kademeli ilerleme: her 2 oturumda bir artış adımı (guardrail sınırı içinde)
        v_w := (s ->> 'original_weight_kg')::numeric
               + case when s ->> 'set_type' = 'working' then floor((i - 1) / 2.0) * (x ->> 'load_increment_kg')::numeric else 0 end;
        -- 5. oturum (A günü) bench son set: hedef 60, sınır 72 → 85 kg (teyitli) → OVERLOAD_RISK alarmı
        if i = 5 and x ->> 'title' = 'Barbell Bench Press' and s ->> 'set_type' = 'working' and (s ->> 'set_number')::int = 3 then
          v_w := 85;
        end if;
        insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number,
                                     reps_completed, weight_kg, overload_confirmed_at, performed_at)
        values (gen_random_uuid(), v_wl, v_client, (x ->> 'id')::uuid, (x ->> 'exercise_id')::uuid,
                (s ->> 'set_type')::public.set_type, (s ->> 'set_number')::int, (s ->> 'reps_min')::int, v_w,
                case when v_w = 85 then now() end, now());
      end loop;
    end loop;
    perform public.complete_workout(v_wl, (6 + i % 3)::smallint, 'normal', 3::smallint, null);

    -- Geriye tarihleme (postgres): önce oturum, sonra setler (performed_at clamp'i started_at'e göre)
    perform set_config('role', 'none', true);
    update public.readiness_logs
       set checked_in_at = v_ts - interval '10 minutes', local_date = (v_ts at time zone v_tz)::date
     where id = v_rl;
    update public.workout_logs
       set started_at = v_ts, last_activity_at = v_ts + interval '55 minutes', completed_at = v_ts + interval '55 minutes',
           local_date = (v_ts at time zone v_tz)::date
     where id = v_wl;
    update public.set_logs sl
       set performed_at = v_ts + make_interval(mins => 3 * o.rn::int), clock_skew_suspect = false
      from (select s2.id, row_number() over (order by w.position, s2.set_type, s2.set_number) as rn
              from public.set_logs s2 join public.workout_log_exercises w on w.id = s2.workout_log_exercise_id
             where s2.workout_log_id = v_wl) o
     where sl.id = o.id;
    update public.pr_events pe set achieved_at = sl.performed_at
      from public.set_logs sl where sl.id = pe.set_log_id and pe.workout_log_id = v_wl;
    update public.pt_alerts
       set first_occurred_at = v_ts + interval '40 minutes', last_occurred_at = v_ts + interval '40 minutes',
           payload = case when alert_type = 'LOW_READINESS'
                          then payload || jsonb_build_object('local_date', (v_ts at time zone v_tz)::date)
                          else payload || jsonb_build_object('server_received_at', v_ts + interval '40 minutes',
                                                             'performed_at', v_ts + interval '40 minutes') end
     where client_id = v_client and (workout_log_id = v_wl or readiness_log_id = v_rl);
  end loop;

  for r in select distinct exercise_id from public.set_logs where user_id = v_client loop
    perform private.recompute_exercise_best(v_client, r.exercise_id);
  end loop;
end $$;

-- 6) Danışanın kendi kilo girişi (dün)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('demo.client'), 'role', 'authenticated')::text, true);
insert into public.measurement_sessions (id, client_id, recorded_by, recorded_by_role, measured_at) values
  ('de400000-0000-4000-8000-000000000003', current_setting('demo.client')::uuid, current_setting('demo.client')::uuid, 'client', now() - interval '1 day');
insert into public.measurements (session_id, type_code, value) values ('de400000-0000-4000-8000-000000000003', 'weight_kg', 80.2);
reset role;

select 'demo_ready' as status,
       (select count(*) from public.workout_logs where user_id = current_setting('demo.client')::uuid and status = 'completed') as sessions,
       (select count(*) from public.pt_alerts where client_id = current_setting('demo.client')::uuid) as alerts,
       (select count(*) from public.pr_events where user_id = current_setting('demo.client')::uuid) as prs;
commit;
```

**Mağaza inceleme talimatları (`docs/store/app-review.md`; inceleyiciler için İngilizce):**

*App Store Connect → App Review Information:* Sign-in required = Yes; User name = `review-client@pulsecoach.app`; Password = `REVIEW_LOGIN_PASSCODE` değeri (yalnızca App Store Connect'e girilir, repoya yazılmaz). Notes:

```text
PulseCoach uses passwordless sign-in (email one-time code, Google, Sign in with Apple). Because reviewers cannot
receive our email codes, a review-only sign-in is enabled for the duration of the review.

How to sign in
1. Open the app. On the first screen tap "Demo erişimi" (Demo access) at the bottom.
2. Enter the email and access code from the Sign-In Information fields, then tap "Giriş" (Sign in).
   - Client account:  review-client@pulsecoach.app
   - Trainer account: review-pt@pulsecoach.app (same access code)

Client account - what to try
- "Ana Sayfa" (Home): next workout, week 4 of 6, weekly streak, latest measurement changes.
- "Başla" (Start) -> answer 4 readiness questions -> reorder/skip exercises -> "Antrenmana Başla" (Start workout).
- Log a set with the +/- buttons and "Seti Tamamla" (Complete set). Entering a weight far above the trainer's
  target (e.g. 90 kg on a 60 kg target) shows a confirmation dialog and creates an alert for the trainer.
- Profile -> Gizlilik (Privacy) -> "Hesabımı Sil" (Delete my account) shows in-app account deletion. Please do not
  complete it on the demo account; if you do, tell us and we will restore the demo data.

Trainer account - what to try
- "Panel" (Dashboard): critical over-target alert, low readiness alert, personal records.
- "Danışanlar" (Clients) -> "Demo Danışan": history, volume charts, measurements (incl. balance scores).

The app has no in-app purchases. Health data is processed only with the user's explicit consent.
```

*Google Play Console → App content → App access:* "All or some functionality in my app is restricted" → iki talimat ekle: **Client demo** (username `review-client@pulsecoach.app`, password = erişim kodu, "Any other info": yukarıdaki "How to sign in" + "Client account" adımları) ve **Trainer demo** (`review-pt@pulsecoach.app`, aynı kod, "Trainer account" adımları). Play incelemesi tarih belirtmediği için `REVIEW_LOGIN_ENABLED` üretim sürümü incelemesi tamamlanana kadar açık kalır; kapatıldığında Play'de talimat güncellenir. Kod değiştiğinde iki mağazada da güncellenir.

### 3.13 A2 OTP UX sözleşmesi ve hata eşlemesi

- Tek gizli `TextInput` + 6 görsel hücre. Prop'lar: `textContentType="oneTimeCode"`, `autoComplete="one-time-code"`, `keyboardType="number-pad"`, `maxLength={6}`, `autoFocus`.
- `onChangeText(t)`: `d = t.replace(/\D/g,'').slice(0,6)`; `d.length===6 && !verifyingRef.current` → kilit al, input `editable={false}`, `verifyOtp`. Aynı token ikinci kez GÖNDERİLMEZ (`lastSubmittedRef`).
- Yönlendirme `SIGNED_IN` olayıyla yapılır (verify yanıtını beklemeden navigate YASAK).
- Sayaçlar timestamp tabanlı; `{email, sentAt}` kv'ye yazılır (`otp-pending`); açılışta `sentAt + 300 s > now` ise A2'ye dönülür. Geçerlilik: `sentAt + 300_000 − Date.now()`; tekrar gönder: `sentAt + 60_000 − Date.now()` (0'a kadar pasif, "Tekrar gönder (0:42)"). Yeniden gönderimde `sentAt` güncellenir; "En son gelen kodu kullan" notu.
- iOS 16+: `ClipboardPasteButton`; Android: "Kodu yapıştır" → `Clipboard.getStringAsync()` → `/\d{6}/`.

| Supabase `error.code` | Kullanıcı mesajı (tr.json anahtarı) | Eylem |
|---|---|---|
| `otp_expired` | `auth.otp.invalidOrExpired` "Kod hatalı ya da süresi doldu." | Hücreleri temizle, haptik hata, refocus |
| `over_email_send_rate_limit` | `auth.otp.resendWait` "Yeni kod için {{s}} sn bekle." | Resend sayacını 60 sn'ye kur |
| `over_request_rate_limit` | `auth.rateLimited` "Çok fazla deneme. Biraz sonra tekrar dene." | 60 sn tüm butonlar pasif |
| `validation_failed` | `auth.email.invalid` | A1'e dön |
| ağ hatası | `common.offline` | Tekrar dene |

### 3.14 Lansman kontrol listesi (auth)

Custom SMTP + SPF/DKIM/DMARC + ekip dışı adrese gönderim testi + saatlik limit testi · `config diff` boş · Google consent "In production" · Play App Signing SHA-1 eklendi ve Play build'de giriş testi · Apple Sign in capability + Services ID/Key · Supabase Pro plan (duraklatma yok), staging ve prod ayrı projeler · legacy anahtarlar devre dışı · `REVIEW_LOGIN_ENABLED` inceleme bitince `false` · Captcha entegrasyonu flag'de hazır · Firebase projesi + `google-services.json` (EAS file env) + `eas credentials` ile FCM V1 service account (Android) ve APNs key (iOS) yüklendi, iki platformda gerçek cihaz push smoke testi geçti · `REVIEW_LOGIN_PASSCODE` ve `PUSH_WORKER_SECRET` ≥ 32 karakter · review projesinde `create-review-users.ts` + `seed-demo.sql` çalıştırıldı, mağaza talimatları girildi.

---

## 4. Veri modeli

### 4.1 Genel kurallar

- Tüm FK/durum kolonları `NOT NULL`; durumlar enum; metinler `text + CHECK (char_length …)`; `created_at/updated_at timestamptz NOT NULL DEFAULT now()` + `private.set_updated_at()` trigger'ı.
- Çevrimdışı yazılabilen tabloların id'si **istemcide** `Crypto.randomUUID()` ile üretilir (`set_logs`, `readiness_logs`, `workout_logs` — sonuncusu `start_workout`'a parametre); `DEFAULT gen_random_uuid()` yedektir.
- Ağırlıklar `numeric(6,2)`, 0–999.99, **0.25 katı** (CHECK). e1RM `numeric(7,2)`. Guardrail sınırı `numeric(8,3)`.
- Geçmiş koruyan referanslar (egzersiz → set/snapshot/PR) `ON DELETE NO ACTION`; egzersizler silinmez, `archived_at` ile arşivlenir.
- `private` şemasındaki tablolar (deneme kaydı, push kuyruğu, audit) Data API'ye hiç açılmaz.

### 4.2 Varlık ilişkileri (özet)

```
auth.users 1─1 profiles
profiles(pt) 1─* pairing_invites
profiles(pt) 1─* pt_client_pairs *─1 profiles(client)      [client başına ≤1 active]
profiles 1─* consents (share_with_pt → pair_id)
profiles(owner) 1─* exercises(custom) ; exercises(global, owner NULL)
profiles 1─* user_exercise_notes *─1 exercises
profiles(pt) 1─* exercise_suggestions *─0..1 exercises (snapshot'lı)
workout_templates (owner, client NULL = kütüphane | client = kopya/kendi | is_system = sistem şablonu) 1─* template_blocks 1─* template_exercises 1─* template_exercise_sets
programs (owner, client NULL = kütüphane | client = atanmış) 1─* program_workouts *─1 workout_templates
profiles(client) 1─* readiness_logs
profiles(client) 1─* workout_logs ─ readiness_logs(0..1), programs, program_workouts, workout_templates, pt_client_pairs(guardrail bağlamı)
workout_logs 1─* workout_log_exercises 1─* set_logs
profiles 1─* exercise_bests (user, exercise) ; workout_logs 1─* pr_events
pt_client_pairs 1─* pt_alerts ─ workout_logs / workout_log_exercises / set_logs / readiness_logs (SET NULL)
measurement_types 1─* measurements *─1 measurement_sessions *─1 profiles(client)
profiles(client) 1─* radar_evaluations ; profiles 1─* push_tokens ; profiles 1─1 notification_preferences
private: pairing_attempts, push_outbox, audit_log
```

### 4.3 Migration 1 — foundation

```sql
-- =====================================================================
-- 20260915000100_foundation.sql
-- Uzantılar, varsayılan yetki sıkılaştırması, private şema, enum'lar,
-- ortak yardımcı fonksiyonlar.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Yerel CLI ile hosted proje aynı davransın: postgres'in bundan sonra
-- oluşturacağı nesnelere anon/authenticated otomatik yetki almaz.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Enum'lar (public: supabase gen types TS union üretir)
-- ---------------------------------------------------------------------
create type public.app_role as enum ('pt', 'client');
create type public.pair_status as enum ('active', 'ended');
create type public.deload_mode as enum ('off', 'auto', 'confirm');
create type public.consent_type as enum ('terms', 'privacy_notice', 'adult_declaration', 'health_data', 'share_with_pt');
create type public.exercise_scope as enum ('global', 'custom');
create type public.exercise_category as enum ('warmup', 'compound', 'isolation', 'cooldown');
create type public.tracking_type as enum ('weight_reps', 'bodyweight_reps', 'duration');
create type public.load_mode as enum ('total', 'per_side');
create type public.body_region as enum ('neck', 'shoulder', 'upper_back', 'lower_back', 'elbow', 'wrist', 'hip', 'knee', 'ankle');
create type public.video_provider as enum ('youtube', 'vimeo');
create type public.program_status as enum ('draft', 'active', 'archived');
create type public.block_type as enum ('single', 'superset');
create type public.set_type as enum ('warmup', 'working');
create type public.workout_status as enum ('in_progress', 'completed', 'abandoned');
create type public.readiness_outcome as enum ('skipped_checkin', 'above_threshold', 'auto_applied', 'offered_accepted', 'offered_declined', 'mode_off');
create type public.session_exercise_status as enum ('planned', 'done', 'skipped', 'time_crunched');
create type public.skip_reason as enum ('machine_busy', 'pain', 'no_time', 'equipment_missing', 'fatigue', 'other');
create type public.completion_type as enum ('full', 'partial', 'failed');
create type public.end_energy as enum ('exhausted', 'tired', 'normal', 'energized');
create type public.alert_type as enum ('OVERLOAD_RISK', 'LOW_READINESS', 'DELOAD_RECOMMENDED');
create type public.alert_severity as enum ('critical', 'warning', 'info');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved', 'archived');
create type public.measurement_category as enum ('body', 'circumference', 'balance', 'functional');
create type public.measurement_unit as enum ('kg', 'percent', 'cm', 'sec', 'score', 'reps');
create type public.body_side as enum ('left', 'right');
create type public.recorder_role as enum ('pt', 'client');
create type public.push_platform as enum ('ios', 'android');
create type public.radar_result as enum ('insufficient_data', 'no_signal', 'triggered', 'cooldown');
create type public.suggestion_status as enum ('pending', 'accepted', 'rejected');

-- ---------------------------------------------------------------------
-- Ortak trigger: updated_at
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Saf hesap fonksiyonları (TS domain modülüyle birebir aynı test vektörleri)
-- ---------------------------------------------------------------------

-- Epley e1RM: yalnızca weight_reps + working + full + 1..12 tekrar + ağırlık>0
create or replace function private.epley_e1rm(
  p_tracking public.tracking_type,
  p_set_type public.set_type,
  p_completion public.completion_type,
  p_reps integer,
  p_weight numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tracking <> 'weight_reps' or p_set_type <> 'working' or p_completion <> 'full'
      or p_reps is null or p_weight is null or p_reps < 1 or p_reps > 12 or p_weight <= 0 then null
    when p_reps = 1 then round(p_weight, 2)
    else round(p_weight * (1 + p_reps / 30.0), 2)
  end;
$$;

-- Auto-deload ağırlığı: %15 düşür, artış adımına AŞAĞI yuvarla,
-- min yükün altına ya da 0'a düşerse orijinal ağırlığı koru.
create or replace function private.deload_weight(p_weight numeric, p_increment numeric, p_min_load numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_weight is null then null
    when floor(p_weight * 0.85 / p_increment) * p_increment <= 0
      or floor(p_weight * 0.85 / p_increment) * p_increment < p_min_load then p_weight
    else floor(p_weight * 0.85 / p_increment) * p_increment
  end;
$$;

-- Deload'da korunacak çalışma seti / tur sayısı: max(1, round(n*2/3))
create or replace function private.deload_keep_sets(p_n integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_n is null or p_n <= 0 then 0 else greatest(1, round(p_n * 2 / 3.0))::integer end;
$$;

-- Guardrail üst sınırı: hedef + max(hedef × pct/100, abs_kg)
create or replace function private.guardrail_allowed_max(p_target numeric, p_pct numeric, p_abs_kg numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_target is null or p_pct is null or p_abs_kg is null then null
    else p_target + greatest(p_target * p_pct / 100, p_abs_kg)
  end;
$$;

-- ISO hafta başı (Pazartesi) — oturum saat diliminden bağımsız saf tarih aritmetiği
create or replace function private.iso_week_start(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - (extract(isodow from p_date)::integer - 1);
$$;

-- Akıllı ısınma önerisi (§7.8). Sunucu, SessionPayload.exercises[].warmup_suggestions alanını bununla üretir;
-- src/domain/warmup.ts aynı vektörlerle test edilir (§11.3). Yüzdeler artış adımına AŞAĞI yuvarlanır, bar altı → bar;
-- bir öncekine eşit/altı ya da çalışma ağırlığına bir artıştan yakın adım atılır.
create or replace function private.warmup_suggestions(
  p_working_kg numeric,
  p_is_barbell boolean,
  p_is_compound boolean,
  p_is_first_for_muscle boolean,
  p_increment_kg numeric,
  p_bar_kg numeric default 20
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_pcts numeric[];
  v_reps integer[];
  v_out  jsonb;
  v_prev numeric;
  v_w    numeric;
  i      integer;
begin
  if p_working_kg is null or p_working_kg < 40
     or not coalesce(p_is_barbell, false) or not coalesce(p_is_compound, false)
     or not coalesce(p_is_first_for_muscle, false)
     or p_increment_kg is null or p_increment_kg <= 0 or p_bar_kg is null then
    return '[]'::jsonb;
  end if;
  if p_working_kg < 80 then
    v_pcts := array[0.65]; v_reps := array[5];
  elsif p_working_kg < 120 then
    v_pcts := array[0.50, 0.75]; v_reps := array[5, 3];
  else
    v_pcts := array[0.40, 0.60, 0.80]; v_reps := array[5, 3, 2];
  end if;
  v_out := jsonb_build_array(jsonb_build_object('weight_kg', p_bar_kg, 'reps', 10));
  v_prev := p_bar_kg;
  for i in 1..array_length(v_pcts, 1) loop
    v_w := greatest(floor(p_working_kg * v_pcts[i] / p_increment_kg) * p_increment_kg, p_bar_kg);
    continue when v_w <= v_prev or p_working_kg - v_w < p_increment_kg;
    v_out := v_out || jsonb_build_array(jsonb_build_object('weight_kg', v_w, 'reps', v_reps[i]));
    v_prev := v_w;
  end loop;
  return v_out;
end;
$$;
```

### 4.4 Migration 2 — tablolar, kısıtlar, index'ler

```sql
-- =====================================================================
-- 20260915000200_tables.sql
-- Tüm tablolar, kısıtlar, index'ler, updated_at trigger'ları.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFİLLER
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.app_role,                        -- NULL = onboarding bekliyor
  full_name     text,
  avatar_url    text,                                   -- yalnızca OAuth trigger'ı yazar
  phone_e164    text,
  timezone      text not null default 'Europe/Istanbul',-- yalnızca set_my_timezone() yazar
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_role_onboarded_chk check ((role is null) = (onboarded_at is null)),
  constraint profiles_full_name_chk check (full_name is null or char_length(btrim(full_name)) between 2 and 100),
  constraint profiles_onboarded_name_chk check (onboarded_at is null or full_name is not null),
  constraint profiles_phone_chk check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint profiles_avatar_chk check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url ~ '^https://[A-Za-z0-9.-]+\.googleusercontent\.com/')),
  constraint profiles_timezone_chk check (char_length(timezone) between 1 and 64)
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. EŞLEŞME: davet kodları + eşleşmeler
-- ---------------------------------------------------------------------
create table public.pairing_invites (
  id           uuid primary key default gen_random_uuid(),
  pt_id        uuid not null references public.profiles (id) on delete cascade,
  code         text not null,
  expires_at   timestamptz not null,
  redeemed_by  uuid references public.profiles (id) on delete set null,
  redeemed_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint pairing_invites_code_chk check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  constraint pairing_invites_redeem_chk check (redeemed_by is null or redeemed_at is not null),
  constraint pairing_invites_expiry_chk check (expires_at > created_at)
);
create unique index pairing_invites_open_code_uq on public.pairing_invites (code)
  where redeemed_at is null and revoked_at is null;
create index pairing_invites_pt_idx on public.pairing_invites (pt_id, created_at desc);
create index pairing_invites_redeemed_by_idx on public.pairing_invites (redeemed_by) where redeemed_by is not null;

create table public.pt_client_pairs (
  id                 uuid primary key default gen_random_uuid(),
  pt_id              uuid not null references public.profiles (id) on delete cascade,
  client_id          uuid not null references public.profiles (id) on delete cascade,
  invite_id          uuid references public.pairing_invites (id) on delete set null,
  status             public.pair_status not null default 'active',
  deload_mode        public.deload_mode not null default 'confirm',
  data_visible_from  timestamptz not null,               -- '-infinity' = geçmiş paylaşıldı
  activated_at       timestamptz not null default now(),
  ended_at           timestamptz,
  ended_by           uuid,                               -- audit değeri, FK yok
  end_reason         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint pt_client_pairs_not_self_chk check (pt_id <> client_id),
  constraint pt_client_pairs_ended_chk check ((status = 'ended') = (ended_at is not null)),
  constraint pt_client_pairs_reason_chk check (end_reason is null or char_length(end_reason) <= 280)
);
create unique index pt_client_pairs_one_active_pt_per_client on public.pt_client_pairs (client_id) where status = 'active';
create index pt_client_pairs_pt_active_idx on public.pt_client_pairs (pt_id) where status = 'active';
create index pt_client_pairs_pt_idx on public.pt_client_pairs (pt_id);
create index pt_client_pairs_client_idx on public.pt_client_pairs (client_id);
create index pt_client_pairs_invite_idx on public.pt_client_pairs (invite_id) where invite_id is not null;
create trigger pt_client_pairs_set_updated_at before update on public.pt_client_pairs
  for each row execute function private.set_updated_at();

create table private.pairing_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  attempted_at  timestamptz not null default now(),
  success       boolean not null
);
create index pairing_attempts_user_time_idx on private.pairing_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------
-- 3. RIZALAR (KVKK)
-- ---------------------------------------------------------------------
create table public.consents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  consent_type      public.consent_type not null,
  document_version  text not null,
  pair_id           uuid references public.pt_client_pairs (id) on delete set null,
  share_history     boolean,
  granted_at        timestamptz not null default now(),
  withdrawn_at      timestamptz,
  constraint consents_version_chk check (char_length(document_version) between 1 and 32),
  constraint consents_share_history_chk check ((consent_type = 'share_with_pt') = (share_history is not null)),
  constraint consents_pair_type_chk check (pair_id is null or consent_type = 'share_with_pt'),
  constraint consents_withdrawn_chk check (withdrawn_at is null or withdrawn_at >= granted_at)
);
create unique index consents_one_active_per_type on public.consents (user_id, consent_type)
  where withdrawn_at is null and consent_type <> 'share_with_pt';
create unique index consents_one_active_share_per_pair on public.consents (pair_id)
  where withdrawn_at is null and consent_type = 'share_with_pt';
create index consents_user_idx on public.consents (user_id);
create index consents_pair_idx on public.consents (pair_id) where pair_id is not null;   -- pair silinince SET NULL taraması

-- ---------------------------------------------------------------------
-- 4. EGZERSİZ KÜTÜPHANESİ
-- ---------------------------------------------------------------------
create table public.exercises (
  id                 uuid primary key default gen_random_uuid(),
  scope              public.exercise_scope not null default 'custom',
  owner_id           uuid references public.profiles (id) on delete set null,
  title              text not null,
  category           public.exercise_category not null,
  target_muscle      text not null,
  primary_regions    public.body_region[] not null,           -- DEFAULT YOK: CHECK 1..4 ile çelişmesin, gen types'ta zorunlu alan
  tracking_type      public.tracking_type not null default 'weight_reps',
  load_mode          public.load_mode not null default 'total',
  load_increment_kg  numeric(4,2) not null default 2.5,
  min_load_kg        numeric(5,2) not null default 0,
  video_provider     public.video_provider,
  video_id           text,
  video_hash         text,                                   -- yalnızca liste dışı (unlisted) Vimeo: ?h=<hash>
  video_start_sec    integer,                                -- YouTube start= / Vimeo #t=
  cues_and_tips      text,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint exercises_title_chk check (char_length(btrim(title)) between 2 and 120),
  constraint exercises_target_muscle_chk check (char_length(btrim(target_muscle)) between 2 and 60),
  constraint exercises_scope_owner_chk check (scope = 'custom' or owner_id is null),
  constraint exercises_regions_chk check (cardinality(primary_regions) between 1 and 4),
  constraint exercises_increment_chk check (load_increment_kg > 0 and load_increment_kg <= 20),
  constraint exercises_min_load_chk check (min_load_kg >= 0 and min_load_kg <= 100),
  constraint exercises_video_pair_chk check ((video_provider is null) = (video_id is null)),
  constraint exercises_video_id_chk check (
    video_provider is null
    or (video_provider = 'youtube' and video_id ~ '^[A-Za-z0-9_-]{11}$')
    or (video_provider = 'vimeo' and video_id ~ '^[0-9]{6,12}$')
  ),
  constraint exercises_video_hash_chk check (video_hash is null or (video_provider = 'vimeo' and video_hash ~ '^[0-9a-f]{10}$')),
  constraint exercises_video_start_chk check (video_start_sec is null or (video_provider is not null and video_start_sec between 0 and 21600)),
  constraint exercises_cues_chk check (cues_and_tips is null or char_length(cues_and_tips) <= 2000)
);
create unique index exercises_global_title_uq on public.exercises (lower(title)) where scope = 'global' and archived_at is null;
create index exercises_owner_idx on public.exercises (owner_id) where owner_id is not null;
create index exercises_regions_gin on public.exercises using gin (primary_regions);
create trigger exercises_set_updated_at before update on public.exercises
  for each row execute function private.set_updated_at();

create table public.user_exercise_notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  note         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint user_exercise_notes_note_chk check (char_length(btrim(note)) between 1 and 280),
  constraint user_exercise_notes_uq unique (user_id, exercise_id)
);
create index user_exercise_notes_exercise_idx on public.user_exercise_notes (exercise_id);
create trigger user_exercise_notes_set_updated_at before update on public.user_exercise_notes
  for each row execute function private.set_updated_at();

-- PT → global kütüphane önerisi (PRD §3 "öneri yapabilir"); inceleme içerik hattında (§6.8)
create table public.exercise_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  exercise_id        uuid references public.exercises (id) on delete set null,
  suggested_by       uuid not null references public.profiles (id) on delete cascade,
  exercise_snapshot  jsonb not null,
  note               text,
  status             public.suggestion_status not null default 'pending',
  review_note        text,
  created_at         timestamptz not null default now(),
  reviewed_at        timestamptz,
  constraint exercise_suggestions_snapshot_chk check (jsonb_typeof(exercise_snapshot) = 'object'),
  constraint exercise_suggestions_note_chk check (note is null or char_length(note) <= 500),
  constraint exercise_suggestions_review_note_chk check (review_note is null or char_length(review_note) <= 500),
  constraint exercise_suggestions_reviewed_chk check ((status = 'pending') = (reviewed_at is null))
);
create unique index exercise_suggestions_one_pending_uq on public.exercise_suggestions (exercise_id) where status = 'pending';
create index exercise_suggestions_user_idx on public.exercise_suggestions (suggested_by, created_at desc);
create index exercise_suggestions_exercise_idx on public.exercise_suggestions (exercise_id) where exercise_id is not null;

-- ---------------------------------------------------------------------
-- 5. ŞABLONLAR (blok → egzersiz → set)
-- ---------------------------------------------------------------------
create table public.workout_templates (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references public.profiles (id) on delete set null,
  client_id           uuid references public.profiles (id) on delete cascade,  -- NULL = sahibinin kütüphanesi
  source_template_id  uuid references public.workout_templates (id) on delete set null,
  title               text not null,
  description         text,
  tolerance_pct       numeric(5,2) not null default 20,
  tolerance_abs_kg    numeric(6,2) not null default 5,
  is_system           boolean not null default false,          -- Super Admin içerik hattı şablonu (§3 / §6.8); yalnızca migration yazar
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint workout_templates_title_chk check (char_length(btrim(title)) between 2 and 100),
  constraint workout_templates_description_chk check (description is null or char_length(description) <= 1000),
  constraint workout_templates_tol_pct_chk check (tolerance_pct between 0 and 500),
  constraint workout_templates_tol_abs_chk check (tolerance_abs_kg between 0 and 100),
  constraint workout_templates_system_chk check (not is_system or (owner_id is null and client_id is null))
);
create index workout_templates_system_idx on public.workout_templates (title) where is_system and archived_at is null;
create index workout_templates_owner_idx on public.workout_templates (owner_id);
create index workout_templates_client_idx on public.workout_templates (client_id) where client_id is not null;
create index workout_templates_source_idx on public.workout_templates (source_template_id) where source_template_id is not null;
create trigger workout_templates_set_updated_at before update on public.workout_templates
  for each row execute function private.set_updated_at();

create table public.template_blocks (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null references public.workout_templates (id) on delete cascade,
  position              smallint not null,
  block_type            public.block_type not null default 'single',
  rest_after_round_sec  smallint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint template_blocks_position_chk check (position between 1 and 50),
  constraint template_blocks_rest_chk check (rest_after_round_sec is null or rest_after_round_sec between 0 and 900),
  constraint template_blocks_superset_rest_chk check (block_type = 'single' or rest_after_round_sec is not null),
  constraint template_blocks_position_uq unique (template_id, position) deferrable initially immediate,
  constraint template_blocks_id_template_uq unique (id, template_id)
);
create trigger template_blocks_set_updated_at before update on public.template_blocks
  for each row execute function private.set_updated_at();

create table public.template_exercises (
  id                 uuid primary key default gen_random_uuid(),
  template_id        uuid not null,
  block_id           uuid not null,
  position_in_block  smallint not null,
  exercise_id        uuid not null references public.exercises (id) on delete no action,
  is_priority        boolean not null default true,
  tolerance_pct      numeric(5,2),
  tolerance_abs_kg   numeric(6,2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint template_exercises_block_fk foreign key (block_id, template_id)
    references public.template_blocks (id, template_id) on delete cascade,
  constraint template_exercises_template_fk foreign key (template_id)
    references public.workout_templates (id) on delete cascade,
  constraint template_exercises_pos_chk check (position_in_block between 1 and 4),
  constraint template_exercises_tol_pct_chk check (tolerance_pct is null or tolerance_pct between 0 and 500),
  constraint template_exercises_tol_abs_chk check (tolerance_abs_kg is null or tolerance_abs_kg between 0 and 100),
  constraint template_exercises_block_pos_uq unique (block_id, position_in_block) deferrable initially immediate,
  constraint template_exercises_id_template_uq unique (id, template_id)
);
create index template_exercises_template_idx on public.template_exercises (template_id);
create index template_exercises_exercise_idx on public.template_exercises (exercise_id);
create trigger template_exercises_set_updated_at before update on public.template_exercises
  for each row execute function private.set_updated_at();

create table public.template_exercise_sets (
  id                    uuid primary key default gen_random_uuid(),
  template_exercise_id  uuid not null,
  template_id           uuid not null,
  set_type              public.set_type not null default 'working',
  set_number            smallint not null,
  target_reps_min       smallint,
  target_reps_max       smallint,
  target_duration_sec   integer,
  target_weight_kg      numeric(6,2),
  is_amrap              boolean not null default false,
  rest_seconds          smallint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint tes_template_exercise_fk foreign key (template_exercise_id, template_id)
    references public.template_exercises (id, template_id) on delete cascade,
  constraint tes_set_number_chk check (set_number between 1 and 20),
  constraint tes_reps_min_chk check (target_reps_min is null or target_reps_min between 1 and 100),
  constraint tes_reps_max_chk check (target_reps_max is null or target_reps_max between 1 and 100),
  constraint tes_reps_order_chk check (target_reps_max is null or target_reps_min is null or target_reps_max >= target_reps_min),
  constraint tes_duration_chk check (target_duration_sec is null or target_duration_sec between 1 and 7200),
  constraint tes_target_present_chk check (target_reps_min is not null or target_duration_sec is not null),
  constraint tes_weight_chk check (target_weight_kg is null or (target_weight_kg between 0 and 999.99 and target_weight_kg * 4 = trunc(target_weight_kg * 4))),
  constraint tes_rest_chk check (rest_seconds is null or rest_seconds between 0 and 900),
  constraint tes_set_uq unique (template_exercise_id, set_type, set_number)
);
create index template_exercise_sets_template_idx on public.template_exercise_sets (template_id);
create trigger template_exercise_sets_set_updated_at before update on public.template_exercise_sets
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. PROGRAMLAR (sıralı rotasyon)
-- ---------------------------------------------------------------------
create table public.programs (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid references public.profiles (id) on delete set null,
  client_id          uuid references public.profiles (id) on delete cascade,   -- NULL = kütüphane programı
  source_program_id  uuid references public.programs (id) on delete set null,
  title              text not null,
  description        text,
  status             public.program_status not null default 'draft',
  starts_on          date,
  duration_weeks     smallint,                               -- blok süresi (v1 blok planlama); NULL = süresiz
  days_per_week      smallint,                               -- haftalık frekans hedefi (seri hedefi); NULL = gün sayısı
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint programs_title_chk check (char_length(btrim(title)) between 2 and 100),
  constraint programs_description_chk check (description is null or char_length(description) <= 1000),
  constraint programs_active_client_chk check (status <> 'active' or client_id is not null),
  constraint programs_archived_chk check ((status = 'archived') = (archived_at is not null)),
  constraint programs_duration_chk check (duration_weeks is null or duration_weeks between 1 and 52),
  constraint programs_days_per_week_chk check (days_per_week is null or days_per_week between 1 and 7)
);
create unique index programs_one_active_per_client on public.programs (client_id) where status = 'active';
create index programs_owner_idx on public.programs (owner_id);
create index programs_client_idx on public.programs (client_id) where client_id is not null;
create index programs_source_idx on public.programs (source_program_id) where source_program_id is not null;
create trigger programs_set_updated_at before update on public.programs
  for each row execute function private.set_updated_at();

create table public.program_workouts (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references public.programs (id) on delete cascade,
  template_id  uuid not null references public.workout_templates (id) on delete cascade,
  day_order    smallint not null,
  day_label    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint program_workouts_day_order_chk check (day_order between 1 and 14),
  constraint program_workouts_label_chk check (day_label is null or char_length(day_label) <= 40),
  constraint program_workouts_order_uq unique (program_id, day_order) deferrable initially immediate
);
create index program_workouts_template_idx on public.program_workouts (template_id);
create trigger program_workouts_set_updated_at before update on public.program_workouts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. READINESS
-- ---------------------------------------------------------------------
create table public.readiness_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  checked_in_at    timestamptz not null default now(),
  local_date       date not null,
  sleep_rating     smallint not null,
  energy_rating    smallint not null,
  soreness_rating  smallint not null,
  stress_rating    smallint not null,
  score            smallint generated always as ((sleep_rating + energy_rating + (6 - soreness_rating) + (6 - stress_rating)) * 5) stored,
  pain_regions     public.body_region[] not null default '{}',
  created_at       timestamptz not null default now(),
  constraint readiness_sleep_chk check (sleep_rating between 1 and 5),
  constraint readiness_energy_chk check (energy_rating between 1 and 5),
  constraint readiness_soreness_chk check (soreness_rating between 1 and 5),
  constraint readiness_stress_chk check (stress_rating between 1 and 5),
  constraint readiness_pain_regions_chk check (cardinality(pain_regions) <= 9)
);
comment on column public.readiness_logs.sleep_rating is '1 = çok kötü, 5 = çok iyi';
comment on column public.readiness_logs.energy_rating is '1 = çok düşük, 5 = çok yüksek';
comment on column public.readiness_logs.soreness_rating is '1 = ağrı yok, 5 = şiddetli';
comment on column public.readiness_logs.stress_rating is '1 = stres yok, 5 = çok yüksek';
comment on column public.readiness_logs.score is '20..100; eşik: score < 60';
create index readiness_logs_user_date_idx on public.readiness_logs (user_id, local_date desc);
create index readiness_logs_user_time_idx on public.readiness_logs (user_id, checked_in_at desc);

-- ---------------------------------------------------------------------
-- 8. ANTRENMAN OTURUMLARI
-- ---------------------------------------------------------------------
create table public.workout_logs (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  pair_id                  uuid references public.pt_client_pairs (id) on delete set null,
  program_id               uuid references public.programs (id) on delete set null,
  program_workout_id       uuid references public.program_workouts (id) on delete set null,
  template_id              uuid references public.workout_templates (id) on delete set null,
  template_title_snapshot  text not null,
  status                   public.workout_status not null default 'in_progress',
  started_at               timestamptz not null default now(),
  completed_at             timestamptz,
  last_activity_at         timestamptz not null default now(),
  local_date               date not null,
  auto_closed              boolean not null default false,
  readiness_log_id         uuid references public.readiness_logs (id) on delete set null,
  readiness_outcome        public.readiness_outcome not null,
  deload_multiplier        numeric(4,3) not null default 1,
  guardrail_enabled        boolean not null default false,
  time_crunch_used         boolean not null default false,
  time_budget_min          smallint,
  session_rpe              smallint,
  end_energy               public.end_energy,
  water_intake_count       smallint not null default 0,
  client_updated_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint workout_logs_completed_chk check ((status = 'completed') = (completed_at is not null)),
  constraint workout_logs_completed_after_start_chk check (completed_at is null or completed_at >= started_at),
  constraint workout_logs_deload_chk check (deload_multiplier in (1, 0.85)),
  constraint workout_logs_budget_chk check (time_budget_min is null or time_budget_min between 5 and 180),
  constraint workout_logs_rpe_chk check (session_rpe is null or session_rpe between 1 and 10),
  constraint workout_logs_water_chk check (water_intake_count between 0 and 50),
  constraint workout_logs_title_chk check (char_length(template_title_snapshot) between 1 and 100),
  constraint workout_logs_readiness_uq unique (readiness_log_id),
  constraint workout_logs_id_user_uq unique (id, user_id)
);
create unique index workout_logs_one_open_per_user on public.workout_logs (user_id) where status = 'in_progress';
create index workout_logs_user_date_idx on public.workout_logs (user_id, local_date desc);
create index workout_logs_user_started_idx on public.workout_logs (user_id, started_at desc);
create index workout_logs_open_activity_idx on public.workout_logs (last_activity_at) where status = 'in_progress';
create index workout_logs_pair_idx on public.workout_logs (pair_id) where pair_id is not null;
create index workout_logs_program_idx on public.workout_logs (program_id) where program_id is not null;
create index workout_logs_program_workout_idx on public.workout_logs (program_workout_id) where program_workout_id is not null;
create index workout_logs_template_idx on public.workout_logs (template_id) where template_id is not null;
create trigger workout_logs_set_updated_at before update on public.workout_logs
  for each row execute function private.set_updated_at();

create table public.workout_log_exercises (
  id                       uuid primary key default gen_random_uuid(),
  workout_log_id           uuid not null,
  user_id                  uuid not null,
  template_exercise_id     uuid references public.template_exercises (id) on delete set null,
  exercise_id              uuid not null references public.exercises (id) on delete no action,
  exercise_title_snapshot  text not null,
  tracking_type            public.tracking_type not null,
  load_mode                public.load_mode not null,
  load_increment_kg        numeric(4,2) not null,
  block_index              smallint not null,
  block_type               public.block_type not null,
  rest_after_round_sec     smallint,
  position                 smallint not null,
  position_in_block        smallint not null,
  is_priority              boolean not null,
  tolerance_pct            numeric(5,2),
  tolerance_abs_kg         numeric(6,2),
  planned_sets             jsonb not null default '[]'::jsonb,
  working_sets_cap         smallint,
  pain_flag                boolean not null default false,
  status                   public.session_exercise_status not null default 'planned',
  skip_reason              public.skip_reason,
  skip_note                text,
  client_updated_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint wle_log_fk foreign key (workout_log_id, user_id)
    references public.workout_logs (id, user_id) on delete cascade,
  constraint wle_planned_sets_chk check (jsonb_typeof(planned_sets) = 'array'),
  constraint wle_block_index_chk check (block_index >= 1),
  constraint wle_position_chk check (position >= 1),
  constraint wle_cap_chk check (working_sets_cap is null or working_sets_cap between 1 and 20),
  constraint wle_skip_chk check ((status = 'skipped') = (skip_reason is not null)),
  constraint wle_skip_note_chk check (skip_note is null or char_length(skip_note) <= 280),
  constraint wle_tolerance_pair_chk check ((tolerance_pct is null) = (tolerance_abs_kg is null)),
  constraint wle_position_uq unique (workout_log_id, position) deferrable initially immediate,
  constraint wle_id_log_uq unique (id, workout_log_id)
);
create index wle_user_exercise_idx on public.workout_log_exercises (user_id, exercise_id);
create index wle_exercise_idx on public.workout_log_exercises (exercise_id);
create index wle_template_exercise_idx on public.workout_log_exercises (template_exercise_id) where template_exercise_id is not null;
create trigger wle_set_updated_at before update on public.workout_log_exercises
  for each row execute function private.set_updated_at();

create table public.set_logs (
  id                          uuid primary key default gen_random_uuid(),
  workout_log_id              uuid not null,
  user_id                     uuid not null,
  workout_log_exercise_id     uuid not null,
  exercise_id                 uuid not null references public.exercises (id) on delete no action,
  set_type                    public.set_type not null default 'working',
  set_number                  smallint not null,
  completion_type             public.completion_type not null default 'full',
  reps_completed              smallint,
  weight_kg                   numeric(6,2),
  duration_seconds            integer,
  target_reps_min             smallint,
  target_reps_max             smallint,
  target_weight_kg            numeric(6,2),
  adjusted_target_weight_kg   numeric(6,2),
  allowed_max_weight_kg       numeric(8,3),
  deviation_pct               numeric(8,1) generated always as (
    case when target_weight_kg > 0 and weight_kg is not null
      then round((weight_kg - target_weight_kg) / target_weight_kg * 100, 1) end
  ) stored,
  overload_flag               boolean not null default false,
  overload_confirmed_at       timestamptz,
  deload_ignored              boolean not null default false,
  estimated_1rm               numeric(7,2),
  pt_reviewed_at              timestamptz,
  performed_at                timestamptz not null,
  clock_skew_suspect          boolean not null default false,
  client_updated_at           timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint set_logs_wle_fk foreign key (workout_log_exercise_id, workout_log_id)
    references public.workout_log_exercises (id, workout_log_id) on delete cascade,
  constraint set_logs_log_fk foreign key (workout_log_id, user_id)
    references public.workout_logs (id, user_id) on delete cascade,
  constraint set_logs_set_number_chk check (set_number between 1 and 30),
  constraint set_logs_reps_chk check (reps_completed is null or reps_completed between 0 and 100),
  constraint set_logs_weight_chk check (weight_kg is null or (weight_kg between 0 and 999.99 and weight_kg * 4 = trunc(weight_kg * 4))),
  constraint set_logs_duration_chk check (duration_seconds is null or duration_seconds between 1 and 7200),
  constraint set_logs_measure_chk check (reps_completed is not null or duration_seconds is not null),
  constraint set_logs_natural_uq unique (workout_log_exercise_id, set_type, set_number)
);
create index set_logs_workout_idx on public.set_logs (workout_log_id);
create index set_logs_user_exercise_time_idx on public.set_logs (user_id, exercise_id, performed_at desc);
create index set_logs_user_exercise_e1rm_idx on public.set_logs (user_id, exercise_id, estimated_1rm desc) where estimated_1rm is not null;
create index set_logs_exercise_idx on public.set_logs (exercise_id);
create trigger set_logs_set_updated_at before update on public.set_logs
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 9. PR & EN İYİLER
-- ---------------------------------------------------------------------
create table public.exercise_bests (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  exercise_id      uuid not null references public.exercises (id) on delete cascade,
  best_e1rm        numeric(7,2) not null,
  best_set_log_id  uuid references public.set_logs (id) on delete set null,
  achieved_at      timestamptz not null,
  updated_at       timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index exercise_bests_exercise_idx on public.exercise_bests (exercise_id);
create index exercise_bests_set_idx on public.exercise_bests (best_set_log_id) where best_set_log_id is not null;

create table public.pr_events (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  exercise_id              uuid not null references public.exercises (id) on delete no action,
  workout_log_id           uuid not null references public.workout_logs (id) on delete cascade,
  set_log_id               uuid references public.set_logs (id) on delete set null,
  exercise_title_snapshot  text not null,
  estimated_1rm            numeric(7,2) not null,
  achieved_at              timestamptz not null,
  created_at               timestamptz not null default now(),
  constraint pr_events_once_uq unique (workout_log_id, exercise_id)
);
create index pr_events_user_time_idx on public.pr_events (user_id, achieved_at desc);
create index pr_events_exercise_idx on public.pr_events (exercise_id);
create index pr_events_set_idx on public.pr_events (set_log_id) where set_log_id is not null;

-- ---------------------------------------------------------------------
-- 10. PT ALARMLARI
-- ---------------------------------------------------------------------
create table public.pt_alerts (
  id                       uuid primary key default gen_random_uuid(),
  pair_id                  uuid not null references public.pt_client_pairs (id) on delete cascade,
  pt_id                    uuid not null references public.profiles (id) on delete cascade,
  client_id                uuid not null references public.profiles (id) on delete cascade,
  alert_type               public.alert_type not null,
  severity                 public.alert_severity not null,
  status                   public.alert_status not null default 'open',
  workout_log_id           uuid references public.workout_logs (id) on delete set null,
  workout_log_exercise_id  uuid references public.workout_log_exercises (id) on delete set null,
  set_log_id               uuid references public.set_logs (id) on delete set null,
  readiness_log_id         uuid references public.readiness_logs (id) on delete set null,
  payload                  jsonb not null default '{}'::jsonb,
  dedupe_key               text not null,
  occurrences              integer not null default 1,
  first_occurred_at        timestamptz not null default now(),
  last_occurred_at         timestamptz not null default now(),
  read_at                  timestamptz,
  resolved_at              timestamptz,
  resolution               text,
  resolution_note          text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint pt_alerts_payload_chk check (jsonb_typeof(payload) = 'object'),
  constraint pt_alerts_dedupe_chk check (char_length(dedupe_key) between 1 and 200),
  constraint pt_alerts_occurrences_chk check (occurrences >= 1),
  constraint pt_alerts_resolution_chk check (resolution is null or resolution in ('acknowledged', 'set_approved', 'target_updated')),
  constraint pt_alerts_resolution_note_chk check (resolution_note is null or char_length(resolution_note) <= 280),
  constraint pt_alerts_dedupe_uq unique (pt_id, dedupe_key)
);
create index pt_alerts_inbox_idx on public.pt_alerts (pt_id, status, last_occurred_at desc);
create index pt_alerts_pair_idx on public.pt_alerts (pair_id);
create index pt_alerts_client_idx on public.pt_alerts (client_id);
create index pt_alerts_workout_idx on public.pt_alerts (workout_log_id) where workout_log_id is not null;
create index pt_alerts_wle_idx on public.pt_alerts (workout_log_exercise_id) where workout_log_exercise_id is not null;
create index pt_alerts_set_idx on public.pt_alerts (set_log_id) where set_log_id is not null;
create index pt_alerts_readiness_idx on public.pt_alerts (readiness_log_id) where readiness_log_id is not null;
create trigger pt_alerts_set_updated_at before update on public.pt_alerts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 11. ÖLÇÜMLER
-- ---------------------------------------------------------------------
create table public.measurement_types (
  code             text primary key,
  category         public.measurement_category not null,
  unit             public.measurement_unit not null,
  has_side         boolean not null default false,
  client_writable  boolean not null default false,
  is_derived       boolean not null default false,          -- sunucu hesaplar (ör. Y-Balance bileşik); kimse doğrudan yazamaz
  min_value        numeric(7,2) not null,
  max_value        numeric(7,2) not null,
  sort_order       smallint not null default 100,
  constraint measurement_types_code_chk check (code ~ '^[a-z][a-z0-9_]{1,48}$'),
  constraint measurement_types_range_chk check (max_value > min_value)
);

create table public.measurement_sessions (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.profiles (id) on delete cascade,
  recorded_by       uuid references public.profiles (id) on delete set null,
  recorded_by_role  public.recorder_role not null,
  measured_at       timestamptz not null default now(),
  posture_notes     text,
  pt_notes          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint measurement_sessions_posture_chk check (posture_notes is null or char_length(posture_notes) <= 1000),
  constraint measurement_sessions_notes_chk check (pt_notes is null or char_length(pt_notes) <= 1000),
  constraint measurement_sessions_client_notes_chk check (recorded_by_role = 'pt' or (posture_notes is null and pt_notes is null))
);
create index measurement_sessions_client_time_idx on public.measurement_sessions (client_id, measured_at desc);
create index measurement_sessions_recorded_by_idx on public.measurement_sessions (recorded_by) where recorded_by is not null;
create trigger measurement_sessions_set_updated_at before update on public.measurement_sessions
  for each row execute function private.set_updated_at();

create table public.measurements (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.measurement_sessions (id) on delete cascade,
  client_id   uuid not null references public.profiles (id) on delete cascade,
  type_code   text not null references public.measurement_types (code) on delete no action,
  side        public.body_side,
  value       numeric(7,2) not null,
  created_at  timestamptz not null default now(),
  constraint measurements_uq unique nulls not distinct (session_id, type_code, side)
);
create index measurements_client_type_idx on public.measurements (client_id, type_code);
create index measurements_type_idx on public.measurements (type_code);

-- ---------------------------------------------------------------------
-- 12. DELOAD RADARI, PUSH, AUDIT
-- ---------------------------------------------------------------------
create table public.radar_evaluations (
  client_id        uuid not null references public.profiles (id) on delete cascade,
  week_start       date not null,                       -- değerlendirilen son tamamlanmış ISO hafta (W0)
  window_start     timestamptz not null,                -- W−2 Pazartesi 00:00 (kullanıcı saat dilimi); PT görünürlük filtresi
  pair_id          uuid references public.pt_client_pairs (id) on delete set null,
  result           public.radar_result not null,
  metrics          jsonb not null default '{}'::jsonb,
  evaluated_at     timestamptz not null default now(),
  dismissed_at     timestamptz,
  primary key (client_id, week_start),
  constraint radar_week_start_chk check (extract(isodow from week_start) = 1)
);
create index radar_evaluations_pair_idx on public.radar_evaluations (pair_id) where pair_id is not null;

create table public.push_tokens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  expo_push_token  text not null unique,
  platform         public.push_platform not null,
  device_id        text,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  constraint push_tokens_token_chk check (expo_push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$'),
  constraint push_tokens_device_chk check (device_id is null or char_length(device_id) <= 128)
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.notification_preferences (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  overload_push            boolean not null default true,
  program_assigned_push    boolean not null default true,
  low_readiness_push       boolean not null default false,
  rest_timer_sound         boolean not null default false,
  rest_timer_haptics       boolean not null default true,
  updated_at               timestamptz not null default now()
);
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

create table private.push_outbox (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('overload_alert', 'low_readiness_alert', 'program_assigned', 'program_updated')),
  title_key     text not null,
  body_key      text not null,
  data          jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts      smallint not null default 0,
  claimed_at    timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index push_outbox_pending_idx on private.push_outbox (created_at) where status in ('pending', 'sending');
create index push_outbox_user_idx on private.push_outbox (user_id);   -- auth.users CASCADE taraması

create table private.audit_log (
  id                 bigint generated always as identity primary key,
  occurred_at        timestamptz not null default now(),
  actor_id           uuid,
  action             text not null,
  table_name         text,
  row_id             uuid,
  subject_client_id  uuid,
  details            jsonb not null default '{}'::jsonb
);
create index audit_log_time_idx on private.audit_log (occurred_at desc);
create index audit_log_subject_idx on private.audit_log (subject_client_id, occurred_at desc) where subject_client_id is not null;
```

### 4.5 ON DELETE davranış tablosu

| FK | Davranış | Neden |
|---|---|---|
| `profiles.id → auth.users` | CASCADE | Hesap silme |
| `pt_client_pairs.pt_id / client_id → profiles` | CASCADE | Taraf silinince ilişki biter |
| `pairing_invites.pt_id` CASCADE; `redeemed_by` SET NULL | | |
| `consents.user_id` CASCADE; `pair_id` SET NULL | | Rıza kaydı kullanıcıyla yaşar |
| `exercises.owner_id → profiles` | SET NULL (+`scope` görünürlüğü korur) | Özel egzersiz global'e terfi ETMEZ; hesap silmede SİLİNMEZ, kullanılmayan sahipsizleri `daily_cleanup` siler (§3.11) |
| `set_logs / workout_log_exercises / template_exercises / pr_events .exercise_id` | NO ACTION | Geçmiş silinmez; egzersiz arşivlenir |
| `user_exercise_notes.exercise_id`, `exercise_bests.exercise_id` | CASCADE | Türetilmiş/kişisel |
| `exercise_suggestions.exercise_id` SET NULL; `suggested_by` CASCADE | | Öneri anlık görüntüsü (`exercise_snapshot`) kalır |
| `workout_templates.owner_id` SET NULL; `client_id` CASCADE | | PT silinse de danışan programı kalır |
| `template_blocks/template_exercises/template_exercise_sets` | CASCADE (kompozit FK) | Şablonun parçası |
| `programs.owner_id` SET NULL; `client_id` CASCADE | | |
| `program_workouts.program_id` CASCADE; `template_id` **CASCADE** | Cascade zincirinde NO ACTION hesap silmeyi kilitliyordu (test ile tespit edildi); kütüphane şablonunun programda kullanılırken silinmesi RLS delete politikasıyla engellenir |
| `workout_logs.user_id` CASCADE; `pair_id/program_id/program_workout_id/template_id/readiness_log_id` SET NULL | | Log kalır, bağlam snapshot'ta |
| `workout_log_exercises → workout_logs(id,user_id)`; `set_logs → workout_logs(id,user_id)` ve `→ workout_log_exercises(id,workout_log_id)` | CASCADE (kompozit) | Sahiplik tutarlılığı DB düzeyinde |
| `pt_alerts.pair_id/pt_id/client_id` CASCADE; olay referansları SET NULL | | |
| `measurement_sessions.client_id` CASCADE; `recorded_by` SET NULL | | PT silinse de ölçüm danışanda kalır |
| `push_tokens / notification_preferences / radar_evaluations .user/client` | CASCADE | |

### 4.6 JSON sözleşmeleri

**`workout_log_exercises.planned_sets[]` elemanı** (sunucu üretir, istemci salt okur):

```ts
type PlannedSet = {
  set_type: 'warmup' | 'working';
  set_number: number;            // set_type içinde 1..n
  reps_min: number | null;
  reps_max: number | null;
  duration_sec: number | null;
  is_amrap: boolean;
  original_weight_kg: number | null;   // PT reçetesi (guardrail referansı)
  adjusted_weight_kg: number | null;   // deload uygulandıysa, değilse null
  rest_seconds: number;                // sunucu doldurur (TEK KURAL): ısınma null→60 (single VE süperset); single çalışma null→90;
                                       // süperset çalışma 0 (tur dinlenmesi rest_after_round_sec). İstemci null görmez.
  trimmed: boolean;                    // deload ile kırpıldı
};
```

**`pt_alerts.payload`:**

| alert_type | Alanlar |
|---|---|
| `OVERLOAD_RISK` | `exercise_id, exercise_title, set_type, set_number, target_weight_kg, adjusted_target_weight_kg, allowed_max_weight_kg, logged_weight_kg, max_logged_weight_kg, reps_completed, deviation_pct, client_confirmed, performed_at, server_received_at` (+ `new_target_kg` çözümde). Tekrarda son sete göre `logged_weight_kg, deviation_pct, set_number, client_confirmed, performed_at, server_received_at` güncellenir, `max_logged_weight_kg` büyür. **Geç senkron kuralı (P1):** `server_received_at − performed_at > 10 dk` ise kartta "… önce yapıldı, şimdi senkronlandı" etiketi |
| `LOW_READINESS` | `score, pain_regions[], local_date, sleep, energy, soreness, stress` |
| `DELOAD_RECOMMENDED` | `week_starts[3], tonnage_kg[3], avg_readiness[3], checkins[3]`; yalnızca `window_start ≥ data_visible_from` iken üretilir ve yalnızca bu tarihten sonraki verilerle hesaplanır (§7.6) |

**`start_workout` / `get_session_payload` / `reorder_session_exercises` / `apply_time_crunch` yanıtı (`SessionPayload`):**

```ts
type SessionPayload = {
  ok: true;
  workout: {
    id: string; status: 'in_progress'|'completed'|'abandoned'; started_at: string; completed_at: string|null;
    local_date: string; template_id: string|null; program_workout_id: string|null; template_title: string;
    guardrail_enabled: boolean; deload_multiplier: number; readiness_outcome: ReadinessOutcome;
    readiness_score: number|null; pain_regions: BodyRegion[]; time_crunch_used: boolean;
    time_budget_min: number|null; water_intake_count: number; pt_name: string|null;
  };
  exercises: Array<{
    id: string; exercise_id: string; title: string; category: ExerciseCategory; target_muscle: string;
    primary_regions: BodyRegion[]; tracking_type: TrackingType; load_mode: 'total'|'per_side';
    load_increment_kg: number; min_load_kg: number; video_provider: 'youtube'|'vimeo'|null; video_id: string|null;
    video_hash: string|null; video_start_sec: number|null;
    cues_and_tips: string|null; setup_note: string|null; block_index: number; block_type: 'single'|'superset';
    rest_after_round_sec: number|null; position: number; position_in_block: number; is_priority: boolean;
    tolerance_pct: number|null; tolerance_abs_kg: number|null; planned_sets: PlannedSet[];
    working_sets_cap: number|null;
    best_e1rm_at_start: number|null;   // okuma anında: bu oturumdan önce başlamış tamamlanmış oturumlar (tabloda saklanmaz)
    warmup_suggestions: Array<{ weight_kg: number; reps: number }>;   // §7.8 sunucu önerisi; planlı ısınma varsa []
    pain_flag: boolean;
    status: 'planned'|'done'|'skipped'|'time_crunched'; skip_reason: SkipReason|null; skip_note: string|null;
    logged_sets: Array<{ id: string; set_type: SetType; set_number: number; completion_type: CompletionType;
      reps_completed: number|null; weight_kg: number|null; duration_seconds: number|null;
      overload_flag: boolean; estimated_1rm: number|null; performed_at: string }>;
  }>;
} | { ok: false; error: 'session_in_progress'; workout_log_id: string }
  | { ok: false; error: 'deload_choice_required'; readiness_score: number };
```

**`get_client_home()` yanıtı (`ClientHome`):**

```ts
type ClientHome = {
  today: string;
  in_progress: { workout_log_id: string; started_at: string; title: string; last_activity_at: string } | null;
  program: {
    id: string; title: string; is_pt_assigned: boolean; starts_on: string | null;
    duration_weeks: number | null; days_per_week: number | null;
    week_index: number | null;          // (bugün − starts_on) / 7 + 1
    block_completed: boolean;           // duration_weeks doluysa bugün ≥ starts_on + duration_weeks × 7
    can_leave: boolean;                 // leave_program() izinli mi (sahip aktif PT değilse)
  } | null;
  weekly_target: number;                // §7.9: days_per_week ?? program gün sayısı ?? 2
  next_workout: { program_workout_id: string; template_id: string; title: string; day_order: number;
                  day_label: string | null; exercise_count: number } | null;
  completed_today: boolean;
  pair: { pair_id: string; deload_mode: 'off' | 'auto' | 'confirm'; pt_name: string | null } | null;
  has_health_consent: boolean;
  radar_card: { week_start: string; metrics: unknown } | null;
};
```

---

## 5. Güvenlik

### 5.1 İlkeler

1. **Varsayılan kapalı:** anon'a hiçbir tablo/fonksiyon yetkisi yok (pgTAP ile test edilir). `authenticated`'a tablo başına en az yetki; kolon düzeyinde INSERT/UPDATE GRANT'leri hesaplanan alanları (`overload_flag`, `estimated_1rm`, hedef snapshot'ları, `role`, `avatar_url`, `timezone`) istemciye kapatır.
2. **RLS her public tabloda açık**, tüm politikalar `TO authenticated`, `auth.uid()` her zaman `(select auth.uid())`.
3. Rol/ilişki kontrolleri `private.*` SECURITY DEFINER STABLE fonksiyonlarla yapılır; politikalar `profiles`'ı doğrudan sorgulamaz (recursion yok).
4. Hesaplanan değerler ve alarmlar yalnızca sunucu tarafında üretilir; istemci beyanı yok sayılır.
5. PT → danışan verisi yalnızca `status='active'` eşleşmede ve `data_visible_from` sonrası satırlarda görünür.
6. SECURITY DEFINER fonksiyonlarda `set search_path = ''` ve tam nitelikli isimler ZORUNLU. **İstisna:** `private.set_logs_before_write` bilinçli olarak `SECURITY INVOKER`dır: `current_user = 'authenticated'` ile istemci yazımını, definer RPC/cron bağlamını (`current_user = postgres`) ayırt eder (overload setinin değiştirilemezliği buna dayanır; DEFINER yapılırsa koruma sessizce kalkar — test bunu yakaladı). `private.template_exercises_check_exercise` aynı gerekçeyle INVOKER'dır.
7. `super_admin` / "is_super_admin()" hiçbir danışan verisi politikasında geçmez; v1'de uygulama içi admin yoktur.
8. **Danışan verisi SELECT politikaları** (`readiness_logs, workout_logs, workout_log_exercises, set_logs, exercise_bests, pr_events, measurement_sessions, radar_evaluations`) iki ayrı politikadır: `*_select_own` (`user_id = (select auth.uid())`) ve `*_select_pt` (`<zaman kolonu> >= ((select private.my_client_visibility_map()) ->> user_id::text)::timestamptz`). PT dalında korelasyonlu `EXISTS (select … from private.fn() …)` YASAK (satır başına definer Function Scan). İstemci PT sorgularında `.eq('user_id', clientId)` ZORUNLU (index koşulu istemci filtresinden gelir).
9. **Kolon gizliliği:** `profiles` için `authenticated`'a yalnızca kimlik kolonlarında SELECT yetkisi vardır; `phone_e164` ve `timezone` yalnızca `get_my_profile()` (kendi) ve `get_client_contact()` (aktif PT, rızalı) ile okunur. `select('*')` YASAK (42501).
10. **Yazımla görünürlük genişletilemez:** `template_exercises.exercise_id` ekleme/değiştirme `private.exercise_usable_in_template()` kontrolünden geçer; okunamayan özel egzersiz UUID'si bilinse bile şablona eklenemez (`exercise_not_available`).

### 5.2 RLS matrisi

Kısaltmalar: **Sahip** = satırın kullanıcısı; **PT(a)** = aktif eşleşmedeki PT, satır zamanı `data_visible_from` sonrası; **—** = yetki yok; **RPC** = yalnızca SECURITY DEFINER fonksiyon üzerinden.

| Tablo | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Sahip; aktif eşleşmedeki karşı taraf (PT↔danışan). **Kolon yetkisi:** yalnızca `id, role, full_name, avatar_url, onboarded_at, created_at, updated_at`; `phone_e164`, `timezone` → `get_my_profile()` (kendi) / `get_client_contact()` (aktif PT) | trigger / RPC | Sahip: yalnızca `full_name, phone_e164` | — |
| `pairing_invites` | Sahip PT | RPC `create_pairing_invite` | RPC `revoke_pairing_invite` / `redeem` | — |
| `pt_client_pairs` | PT veya danışan tarafı (aktif+biten) | RPC `redeem_pairing_invite` | RPC `end_pairing`, `set_pair_deload_mode` | — |
| `consents` | Sahip | RPC | RPC (`withdraw_consent`, …) | — |
| `exercises` | `global`; sahip; aktif PT'nin özel egzersizleri; aktif danışanların özel egzersizleri; bana atanmış şablonlardaki egzersizler (bu dal yazımla genişletilemez: şablona ekleme `exercise_usable_in_template` kontrolünden geçer) | Onboarded kullanıcı: `scope='custom' AND owner_id=uid` | Sahip (custom) — `archived_at` dahil | — (arşiv) |
| `user_exercise_notes` | Sahip; PT(a) (zaman filtresi yok) | Sahip | Sahip | Sahip |
| `workout_templates` | Sahip (kütüphane/kendi); danışan (client_id=uid); PT(a) (danışan kopyaları + danışanın kendi şablonları); sistem şablonları (`is_system`, herkes) | PT: kütüphane veya aktif danışan kopyası; danışan: kendi | `can_edit_template`: sahip ve (kütüphane PT / kendi / aktif danışan) | aynı + programda kullanılmıyor |
| `template_blocks`, `template_exercises`, `template_exercise_sets` | Şablon okunabilirse | `can_edit_template`; `template_exercises.exercise_id` ayrıca `exercise_usable_in_template` (arşivsiz VE global / kendi / şablonun danışanının / danışanın aktif PT'sinin) → aksi `exercise_not_available` (42501) | `can_edit_template` (kolon GRANT'li; `exercise_id` değişimi aynı kontrol) | `can_edit_template` |
| `programs` | Sahip (kütüphane/kendi); danışan; PT(a) | PT: kütüphane (active değil); danışan: kendi | `can_edit_program`; danışan PT'den kalan programı RPC `leave_program` ile arşivler | `can_edit_program` ve active değil |
| `program_workouts` | Program okunabilirse | `can_edit_program` (+trigger: aynı sahip/danışan) | `day_label` | `can_edit_program` |
| `readiness_logs` | Sahip; PT(a) | Sahip + **aktif sağlık rızası** | — (değişmez) | — |
| `workout_logs` | Sahip; PT(a) | RPC `start_workout` | Sahip, `workout_is_open` (in_progress / completed ≤24 saat / auto_closed abandoned ≤24 saat): `water_intake_count, client_updated_at`; diğerleri RPC | — |
| `workout_log_exercises` | Sahip; PT(a) | RPC | Sahip, oturum in_progress: `status, skip_reason, skip_note, working_sets_cap` | — |
| `set_logs` | Sahip; PT(a) | Sahip (hesaplanan kolonlar hariç) | Sahip, `workout_is_open` — trigger penceresiyle BİREBİR aynı (in_progress / completed ≤24 saat / auto_closed abandoned ≤24 saat); overload seti değiştirilemez (trigger) | Sahip, oturum in_progress, `overload_flag=false` |
| `exercise_bests`, `pr_events` | Sahip; PT(a) | trigger / RPC | trigger | — |
| `pt_alerts` | PT, yalnızca **aktif** eşleşmeye ait | trigger / cron | RPC `mark_alerts_read`, `resolve_alert` | — |
| `measurement_types` | Herkes (authenticated) | migration/seed | — | — |
| `measurement_sessions` | Danışan; PT(a) (kendi girdikleri zaman filtresiz) | Danışan: `recorded_by_role='client'` + sağlık rızası; PT: aktif danışanı için | Kayıt sahibi (PT ise aktif eşleşmede) | aynı |
| `measurements` | Oturum okunabilirse | `can_write_measurement` (danışan yalnızca `client_writable` tipler; `is_derived` tipler kimseye yazılamaz — Y-Balance bileşik skorunu trigger üretir) | aynı | aynı |
| `radar_evaluations` | Danışan; aktif PT yalnızca `window_start ≥ data_visible_from` (KVKK) | cron | Danışan: `dismissed_at` | — |
| `push_tokens` | Sahip | RPC `register_push_token` | RPC | RPC `unregister_push_token` |
| `notification_preferences` | Sahip | Sahip | Sahip | — |
| `exercise_suggestions` | Öneren PT | RPC `suggest_exercise_to_global` | içerik hattı (`private.review_exercise_suggestion`) | — |
| `session_volume`, `weekly_client_load`, `measurement_latest_deltas` (view) | `security_invoker` → alttaki tabloların RLS'i | — | — | — |
| `realtime.messages` | topic = `pt:<uid>:feed` | — (istemci yayın yapamaz) | — | — |
| `private.*` | — | — | — | — |

**İletişim bilgisi:** Danışanın e-postası (`profiles`'ta kolon yok) ve telefonu (`phone_e164`, kolon yetkisiyle kapalı) PT'ye yalnızca `get_client_contact()` RPC'siyle aktif eşleşmede döner; eşleşme rıza ekranında "PT e-posta ve (girdiysen) telefonunu görebilir" diye belirtilir. PT'nin telefonu ve saat dilimi danışana hiçbir yoldan gösterilmez (§12 S22). Davranış pgTAP'te kolon yetkisi hatasıyla (42501) test edilir.

### 5.3 Migration 3 — auth trigger'ları, kolon koruma, RLS yardımcıları, GRANT, politikalar

```sql
-- =====================================================================
-- 20260915000300_security.sql
-- auth.users trigger'ları, kolon koruma, RLS yardımcıları, GRANT'ler,
-- RLS politikaları, Realtime yetkisi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- auth.users → profiles
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text;
  v_avatar text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  if v_name is not null then
    v_name := left(v_name, 100);
    if char_length(v_name) < 2 then v_name := null; end if;
  end if;

  v_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
  if v_avatar is null or char_length(v_avatar) > 500
     or v_avatar !~ '^https://[A-Za-z0-9.-]+\.googleusercontent\.com/' then
    v_avatar := null;
  end if;

  -- role ve yetki alanları ASLA metadata'dan okunmaz
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, v_name, v_avatar)
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Kayıt akışını asla kilitleme; profil complete_onboarding() içinde de upsert edilir.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Sonradan bağlanan Google/Apple kimliği boş ad/avatar alanlarını doldurur
create or replace function private.handle_user_metadata_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text;
  v_avatar text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  if v_name is not null then
    v_name := left(v_name, 100);
    if char_length(v_name) < 2 then v_name := null; end if;
  end if;
  v_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
  if v_avatar is null or char_length(v_avatar) > 500
     or v_avatar !~ '^https://[A-Za-z0-9.-]+\.googleusercontent\.com/' then
    v_avatar := null;
  end if;

  update public.profiles p
     set full_name  = coalesce(p.full_name, v_name),
         avatar_url = coalesce(p.avatar_url, v_avatar)
   where p.id = new.id
     and ((p.full_name is null and v_name is not null) or (p.avatar_url is null and v_avatar is not null));
  return new;
exception when others then
  raise warning 'handle_user_metadata_update failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function private.handle_user_metadata_update();

-- ---------------------------------------------------------------------
-- Kolon koruma (GRANT'e ek emniyet kemeri)
-- ---------------------------------------------------------------------
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id <> old.id
       or new.role is distinct from old.role
       or new.onboarded_at is distinct from old.onboarded_at
       or new.avatar_url is distinct from old.avatar_url
       or new.timezone is distinct from old.timezone then
      raise exception 'profile_protected_column' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------------
-- RLS yardımcıları (private, SECURITY DEFINER, STABLE)
-- ---------------------------------------------------------------------
create or replace function private.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function private.my_active_client_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.client_id from public.pt_client_pairs p
   where p.pt_id = (select auth.uid()) and p.status = 'active';
$$;

create or replace function private.my_active_pt_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.pt_id from public.pt_client_pairs p
   where p.client_id = (select auth.uid()) and p.status = 'active';
$$;

create or replace function private.my_active_pair_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.pt_client_pairs p
   where p.pt_id = (select auth.uid()) and p.status = 'active';
$$;

-- PT'nin aktif danışanları → görünürlük başlangıcı haritası {"<client_id>": data_visible_from}.
-- Politikalarda YALNIZCA `(select private.my_client_visibility_map())` biçiminde kullanılır: korelasyonsuz
-- InitPlan olarak sorgu başına BİR kez çalışır, satır başına yalnızca jsonb anahtar araması yapılır
-- (önceki EXISTS(my_client_visibility()) kalıbı satır başına definer Function Scan üretiyordu).
create or replace function private.my_client_visibility_map()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(p.client_id::text, p.data_visible_from), '{}'::jsonb)
    from public.pt_client_pairs p
   where p.pt_id = (select auth.uid()) and p.status = 'active';
$$;

create or replace function private.is_active_pt_of(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pt_client_pairs p
     where p.pt_id = (select auth.uid()) and p.client_id = p_client and p.status = 'active'
  );
$$;

create or replace function private.has_active_consent(p_type public.consent_type)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consents c
     where c.user_id = (select auth.uid()) and c.consent_type = p_type and c.withdrawn_at is null
  );
$$;

-- Okunabilir şablonlar: sahibi, danışanın kopyası, PT'nin aktif danışanlarına ait şablonlar
create or replace function private.readable_template_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select t.id from public.workout_templates t
   where (t.owner_id = (select auth.uid()) and (t.client_id is null or t.client_id = (select auth.uid())))
      or t.client_id = (select auth.uid())
      or t.client_id in (select p.client_id from public.pt_client_pairs p
                          where p.pt_id = (select auth.uid()) and p.status = 'active')
      or (t.is_system and t.archived_at is null);
$$;

create or replace function private.can_edit_template(p_template_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workout_templates t
     where t.id = p_template_id
       and t.owner_id = (select auth.uid())
       and (
         (t.client_id is null and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role = 'pt'))
         or t.client_id = (select auth.uid())
         or exists (select 1 from public.pt_client_pairs p
                     where p.pt_id = (select auth.uid()) and p.client_id = t.client_id and p.status = 'active')
       )
  );
$$;

create or replace function private.readable_program_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select pg.id from public.programs pg
   where (pg.owner_id = (select auth.uid()) and (pg.client_id is null or pg.client_id = (select auth.uid())))
      or pg.client_id = (select auth.uid())
      or pg.client_id in (select p.client_id from public.pt_client_pairs p
                           where p.pt_id = (select auth.uid()) and p.status = 'active');
$$;

create or replace function private.can_edit_program(p_program_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.programs pg
     where pg.id = p_program_id
       and pg.owner_id = (select auth.uid())
       and (
         (pg.client_id is null and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role = 'pt'))
         or pg.client_id = (select auth.uid())
         or exists (select 1 from public.pt_client_pairs p
                     where p.pt_id = (select auth.uid()) and p.client_id = pg.client_id and p.status = 'active')
       )
  );
$$;

-- Bana atanmış (kopyalanmış) şablonlarda geçen egzersizler; eşleşme bitse de C4 çalışır
create or replace function private.my_assigned_exercise_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct te.exercise_id
    from public.template_exercises te
    join public.workout_templates t on t.id = te.template_id
   where t.client_id = (select auth.uid());
$$;

-- İstemci yazma penceresi: private.set_logs_before_write içindeki pencereyle BİREBİR aynı olmalı
-- (RLS reddi PostgREST'te hata değil 0 satır döner; pencere farkı sessiz veri kaybı demektir — §8.2).
create or replace function private.workout_is_open(p_workout_log_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workout_logs wl
     where wl.id = p_workout_log_id
       and wl.user_id = (select auth.uid())
       and (
         wl.status = 'in_progress'
         or (wl.status = 'completed' and wl.completed_at > now() - interval '24 hours')
         or (wl.status = 'abandoned' and wl.auto_closed and wl.last_activity_at > now() - interval '24 hours')
       )
  );
$$;

create or replace function private.workout_is_in_progress(p_workout_log_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workout_logs wl
     where wl.id = p_workout_log_id and wl.user_id = (select auth.uid()) and wl.status = 'in_progress'
  );
$$;

create or replace function private.can_write_measurement(p_session_id uuid, p_type_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.measurement_sessions s
      join public.measurement_types mt on mt.code = p_type_code
     where s.id = p_session_id
       and s.recorded_by = (select auth.uid())
       and not mt.is_derived
       and (
         (s.recorded_by_role = 'client' and s.client_id = (select auth.uid()) and mt.client_writable)
         or (s.recorded_by_role = 'pt' and exists (
               select 1 from public.pt_client_pairs p
                where p.pt_id = (select auth.uid()) and p.client_id = s.client_id and p.status = 'active'))
       )
  );
$$;

-- Şablona eklenebilir egzersiz (§5.2): arşivlenmemiş VE (global | çağıranın kendi | şablonun danışanının
-- [PT danışan kopyasını düzenlerken] | çağıranın aktif PT'sinin [danışan kendi şablonunda]).
-- PT kütüphane şablonuna danışan egzersizi EKLENEMEZ (atama ile üçüncü kişiye sızmasın).
create or replace function private.exercise_usable_in_template(p_exercise_id uuid, p_template_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.exercises e
      join public.workout_templates t on t.id = p_template_id
     where e.id = p_exercise_id
       and e.archived_at is null
       and (
         e.scope = 'global'
         or e.owner_id = (select auth.uid())
         or (t.client_id is not null and e.owner_id = t.client_id)
         or (t.client_id = (select auth.uid()) and e.owner_id in (
               select p.pt_id from public.pt_client_pairs p
                where p.client_id = (select auth.uid()) and p.status = 'active'))
       )
  );
$$;

revoke all on function
  private.current_app_role(), private.my_active_client_ids(), private.my_active_pt_ids(),
  private.my_active_pair_ids(), private.my_client_visibility_map(), private.is_active_pt_of(uuid),
  private.has_active_consent(public.consent_type), private.readable_template_ids(),
  private.can_edit_template(uuid), private.readable_program_ids(), private.can_edit_program(uuid),
  private.my_assigned_exercise_ids(), private.workout_is_open(uuid), private.workout_is_in_progress(uuid),
  private.can_write_measurement(uuid, text), private.exercise_usable_in_template(uuid, uuid)
from public, anon;

-- set_logs BEFORE trigger'ı SECURITY INVOKER çalışır; kullandığı saf fonksiyonlar:
grant execute on function
  private.epley_e1rm(public.tracking_type, public.set_type, public.completion_type, integer, numeric),
  private.guardrail_allowed_max(numeric, numeric, numeric)
to authenticated;

grant execute on function
  private.current_app_role(), private.my_active_client_ids(), private.my_active_pt_ids(),
  private.my_active_pair_ids(), private.my_client_visibility_map(), private.is_active_pt_of(uuid),
  private.has_active_consent(public.consent_type), private.readable_template_ids(),
  private.can_edit_template(uuid), private.readable_program_ids(), private.can_edit_program(uuid),
  private.my_assigned_exercise_ids(), private.workout_is_open(uuid), private.workout_is_in_progress(uuid),
  private.can_write_measurement(uuid, text), private.exercise_usable_in_template(uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- RLS AÇ (her public tablo) — private tablolara hiç grant yok
-- ---------------------------------------------------------------------
alter table public.profiles                 enable row level security;
alter table public.pairing_invites          enable row level security;
alter table public.pt_client_pairs          enable row level security;
alter table public.consents                 enable row level security;
alter table public.exercises                enable row level security;
alter table public.user_exercise_notes      enable row level security;
alter table public.exercise_suggestions     enable row level security;
alter table public.workout_templates        enable row level security;
alter table public.template_blocks          enable row level security;
alter table public.template_exercises       enable row level security;
alter table public.template_exercise_sets   enable row level security;
alter table public.programs                 enable row level security;
alter table public.program_workouts         enable row level security;
alter table public.readiness_logs           enable row level security;
alter table public.workout_logs             enable row level security;
alter table public.workout_log_exercises    enable row level security;
alter table public.set_logs                 enable row level security;
alter table public.exercise_bests           enable row level security;
alter table public.pr_events                enable row level security;
alter table public.pt_alerts                enable row level security;
alter table public.measurement_types        enable row level security;
alter table public.measurement_sessions     enable row level security;
alter table public.measurements             enable row level security;
alter table public.radar_evaluations        enable row level security;
alter table public.push_tokens              enable row level security;
alter table public.notification_preferences enable row level security;

-- ---------------------------------------------------------------------
-- GRANT'ler (anon: hiçbir şey; authenticated: en az yetki)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- Kolon düzeyi: aktif eşleşmedeki karşı taraf yalnızca kimlik alanlarını görür. phone_e164 ve timezone
-- yalnızca get_my_profile() (kendi satırı) ve get_client_contact() (aktif PT, eşleşme rızasıyla) ile okunur.
-- ZORUNLU: istemci profiles'ı select('*') ile OKUMAZ (42501); kolon listesi verir.
grant select (id, role, full_name, avatar_url, onboarded_at, created_at, updated_at) on public.profiles to authenticated;
grant update (full_name, phone_e164) on public.profiles to authenticated;

grant select on public.pairing_invites to authenticated;
grant select on public.pt_client_pairs to authenticated;
grant select on public.consents to authenticated;

grant select on public.exercises to authenticated;
grant insert (id, title, category, target_muscle, primary_regions, tracking_type, load_mode, load_increment_kg, min_load_kg, video_provider, video_id, video_hash, video_start_sec, cues_and_tips, owner_id, scope)
  on public.exercises to authenticated;
grant update (title, category, target_muscle, primary_regions, tracking_type, load_mode, load_increment_kg, min_load_kg, video_provider, video_id, video_hash, video_start_sec, cues_and_tips, archived_at)
  on public.exercises to authenticated;

grant select, insert, update, delete on public.user_exercise_notes to authenticated;
grant select on public.exercise_suggestions to authenticated;

grant select, delete on public.workout_templates to authenticated;
grant insert (id, owner_id, client_id, title, description, tolerance_pct, tolerance_abs_kg) on public.workout_templates to authenticated;
grant update (title, description, tolerance_pct, tolerance_abs_kg, archived_at) on public.workout_templates to authenticated;

grant select, delete on public.template_blocks to authenticated;
grant insert (id, template_id, position, block_type, rest_after_round_sec) on public.template_blocks to authenticated;
grant update (block_type, rest_after_round_sec) on public.template_blocks to authenticated;

grant select, delete on public.template_exercises to authenticated;
grant insert (id, block_id, template_id, position_in_block, exercise_id, is_priority, tolerance_pct, tolerance_abs_kg) on public.template_exercises to authenticated;
grant update (exercise_id, is_priority, tolerance_pct, tolerance_abs_kg) on public.template_exercises to authenticated;

grant select, delete on public.template_exercise_sets to authenticated;
grant insert (id, template_exercise_id, template_id, set_type, set_number, target_reps_min, target_reps_max, target_duration_sec, target_weight_kg, is_amrap, rest_seconds) on public.template_exercise_sets to authenticated;
grant update (target_reps_min, target_reps_max, target_duration_sec, target_weight_kg, is_amrap, rest_seconds) on public.template_exercise_sets to authenticated;

grant select, delete on public.programs to authenticated;
grant insert (id, owner_id, client_id, title, description, status, starts_on, duration_weeks, days_per_week) on public.programs to authenticated;
grant update (title, description, status, starts_on, duration_weeks, days_per_week, archived_at) on public.programs to authenticated;

grant select, delete on public.program_workouts to authenticated;
grant insert (id, program_id, template_id, day_order, day_label) on public.program_workouts to authenticated;
grant update (day_label) on public.program_workouts to authenticated;

grant select on public.readiness_logs to authenticated;
grant insert (id, user_id, sleep_rating, energy_rating, soreness_rating, stress_rating, pain_regions) on public.readiness_logs to authenticated;

grant select on public.workout_logs to authenticated;
grant update (water_intake_count, client_updated_at) on public.workout_logs to authenticated;

grant select on public.workout_log_exercises to authenticated;
grant update (status, skip_reason, skip_note, working_sets_cap, client_updated_at) on public.workout_log_exercises to authenticated;

grant select, delete on public.set_logs to authenticated;
grant insert (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, completion_type, reps_completed, weight_kg, duration_seconds, overload_confirmed_at, performed_at, client_updated_at)
  on public.set_logs to authenticated;
grant update (completion_type, reps_completed, weight_kg, duration_seconds, overload_confirmed_at, performed_at, client_updated_at)
  on public.set_logs to authenticated;

grant select on public.exercise_bests to authenticated;
grant select on public.pr_events to authenticated;
grant select on public.pt_alerts to authenticated;
grant select on public.measurement_types to authenticated;

grant select, delete on public.measurement_sessions to authenticated;
grant insert (id, client_id, recorded_by, recorded_by_role, measured_at, posture_notes, pt_notes) on public.measurement_sessions to authenticated;
grant update (measured_at, posture_notes, pt_notes) on public.measurement_sessions to authenticated;

grant select, delete on public.measurements to authenticated;
grant insert (id, session_id, client_id, type_code, side, value) on public.measurements to authenticated;
grant update (value) on public.measurements to authenticated;

grant select on public.radar_evaluations to authenticated;
grant update (dismissed_at) on public.radar_evaluations to authenticated;
grant select on public.push_tokens to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

-- service_role (Edge Function'lar) RLS'i zaten bypass eder; tablo yetkisi yine de açık yazılır
grant all on all tables in schema public to service_role;
grant usage on schema private to service_role;
grant select, update on private.push_outbox to service_role;

-- ---------------------------------------------------------------------
-- POLİTİKALAR
-- Kural: tüm politikalar TO authenticated; auth.uid() her zaman (select auth.uid())
-- ---------------------------------------------------------------------

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.my_active_client_ids())
    or id in (select private.my_active_pt_ids())
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- pairing_invites (yazma yalnızca RPC)
create policy pairing_invites_select_own on public.pairing_invites for select to authenticated
  using (pt_id = (select auth.uid()));

-- pt_client_pairs (yazma yalnızca RPC)
create policy pt_client_pairs_select_party on public.pt_client_pairs for select to authenticated
  using (pt_id = (select auth.uid()) or client_id = (select auth.uid()));

-- consents (yazma yalnızca RPC)
create policy consents_select_own on public.consents for select to authenticated
  using (user_id = (select auth.uid()));

-- exercises
create policy exercises_select on public.exercises for select to authenticated
  using (
    scope = 'global'
    or owner_id = (select auth.uid())
    or owner_id in (select private.my_active_pt_ids())
    or owner_id in (select private.my_active_client_ids())
    or id in (select private.my_assigned_exercise_ids())
  );
create policy exercises_insert_custom on public.exercises for insert to authenticated
  with check (
    scope = 'custom'
    and owner_id = (select auth.uid())
    and (select private.current_app_role()) is not null
  );
create policy exercises_update_own on public.exercises for update to authenticated
  using (scope = 'custom' and owner_id = (select auth.uid()))
  with check (scope = 'custom' and owner_id = (select auth.uid()));

-- user_exercise_notes: danışan yazar, aktif PT okur
create policy notes_select on public.user_exercise_notes for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select private.my_active_client_ids()));
create policy notes_insert_own on public.user_exercise_notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notes_update_own on public.user_exercise_notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notes_delete_own on public.user_exercise_notes for delete to authenticated
  using (user_id = (select auth.uid()));

-- exercise_suggestions: öneren PT yalnızca kendi önerilerini okur; yazma yalnızca RPC
create policy exercise_suggestions_select_own on public.exercise_suggestions for select to authenticated
  using (suggested_by = (select auth.uid()));

-- workout_templates
create policy templates_select on public.workout_templates for select to authenticated
  using (id in (select private.readable_template_ids()));
create policy templates_insert on public.workout_templates for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      (client_id is null and (select private.current_app_role()) = 'pt')
      or (client_id = (select auth.uid()) and (select private.current_app_role()) = 'client')
      or ((select private.current_app_role()) = 'pt' and private.is_active_pt_of(client_id))
    )
  );
create policy templates_update on public.workout_templates for update to authenticated
  using (private.can_edit_template(id)) with check (private.can_edit_template(id));
create policy templates_delete on public.workout_templates for delete to authenticated
  using (
    private.can_edit_template(id)
    and not exists (select 1 from public.program_workouts pw where pw.template_id = workout_templates.id)
  );

-- template_blocks / template_exercises / template_exercise_sets
create policy blocks_select on public.template_blocks for select to authenticated
  using (template_id in (select private.readable_template_ids()));
create policy blocks_insert on public.template_blocks for insert to authenticated
  with check (private.can_edit_template(template_id));
create policy blocks_update on public.template_blocks for update to authenticated
  using (private.can_edit_template(template_id)) with check (private.can_edit_template(template_id));
create policy blocks_delete on public.template_blocks for delete to authenticated
  using (private.can_edit_template(template_id));

create policy template_exercises_select on public.template_exercises for select to authenticated
  using (template_id in (select private.readable_template_ids()));
create policy template_exercises_insert on public.template_exercises for insert to authenticated
  with check (private.can_edit_template(template_id));
create policy template_exercises_update on public.template_exercises for update to authenticated
  using (private.can_edit_template(template_id)) with check (private.can_edit_template(template_id));
create policy template_exercises_delete on public.template_exercises for delete to authenticated
  using (private.can_edit_template(template_id));

create policy template_sets_select on public.template_exercise_sets for select to authenticated
  using (template_id in (select private.readable_template_ids()));
create policy template_sets_insert on public.template_exercise_sets for insert to authenticated
  with check (private.can_edit_template(template_id));
create policy template_sets_update on public.template_exercise_sets for update to authenticated
  using (private.can_edit_template(template_id)) with check (private.can_edit_template(template_id));
create policy template_sets_delete on public.template_exercise_sets for delete to authenticated
  using (private.can_edit_template(template_id));

-- programs / program_workouts
create policy programs_select on public.programs for select to authenticated
  using (id in (select private.readable_program_ids()));
create policy programs_insert on public.programs for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      (client_id is null and (select private.current_app_role()) = 'pt' and status <> 'active')
      or (client_id = (select auth.uid()) and (select private.current_app_role()) = 'client')
    )
  );
create policy programs_update on public.programs for update to authenticated
  using (private.can_edit_program(id)) with check (private.can_edit_program(id));
create policy programs_delete on public.programs for delete to authenticated
  using (private.can_edit_program(id) and status <> 'active');

create policy program_workouts_select on public.program_workouts for select to authenticated
  using (program_id in (select private.readable_program_ids()));
create policy program_workouts_insert on public.program_workouts for insert to authenticated
  with check (private.can_edit_program(program_id));
create policy program_workouts_update on public.program_workouts for update to authenticated
  using (private.can_edit_program(program_id)) with check (private.can_edit_program(program_id));
create policy program_workouts_delete on public.program_workouts for delete to authenticated
  using (private.can_edit_program(program_id));

-- readiness_logs (sağlık verisi: rıza şartı; değiştirilemez)
-- Sahip ve PT dalları AYRI politikalar. PT dalı: korelasyonsuz InitPlan + jsonb anahtar araması
-- (satır başına definer çağrısı YOK; §5.3 performans notu, §11.2 EXPLAIN kabul kriteri).
create policy readiness_select_own on public.readiness_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy readiness_select_pt on public.readiness_logs for select to authenticated
  using (checked_in_at >= (((select private.my_client_visibility_map()) ->> user_id::text)::timestamptz));
create policy readiness_insert_own on public.readiness_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.has_active_consent('health_data')));

-- workout_logs (insert yalnızca start_workout RPC)
create policy workout_logs_select_own on public.workout_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy workout_logs_select_pt on public.workout_logs for select to authenticated
  using (started_at >= (((select private.my_client_visibility_map()) ->> user_id::text)::timestamptz));
create policy workout_logs_update_own on public.workout_logs for update to authenticated
  using (user_id = (select auth.uid()) and private.workout_is_open(id))
  with check (user_id = (select auth.uid()));

-- workout_log_exercises (insert yalnızca start_workout RPC)
create policy wle_select_own on public.workout_log_exercises for select to authenticated
  using (user_id = (select auth.uid()));
create policy wle_select_pt on public.workout_log_exercises for select to authenticated
  using (created_at >= (((select private.my_client_visibility_map()) ->> user_id::text)::timestamptz));
create policy wle_update_own on public.workout_log_exercises for update to authenticated
  using (user_id = (select auth.uid()) and private.workout_is_in_progress(workout_log_id))
  with check (user_id = (select auth.uid()));

-- set_logs
create policy set_logs_select_own on public.set_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy set_logs_select_pt on public.set_logs for select to authenticated
  using (performed_at >= (((select private.my_client_visibility_map()) ->> user_id::text)::timestamptz));
create policy set_logs_insert_own on public.set_logs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy set_logs_update_own on public.set_logs for update to authenticated
  using (user_id = (select auth.uid()) and private.workout_is_open(workout_log_id))
  with check (user_id = (select auth.uid()));
create policy set_logs_delete_own on public.set_logs for delete to authenticated
  using (user_id = (select auth.uid()) and overload_flag = false and private.workout_is_in_progress(workout_log_id));

-- exercise_bests / pr_events
create policy exercise_bests_select_own on public.exercise_bests for select to authenticated
  using (user_id = (select auth.uid()));
create policy exercise_bests_select_pt on public.exercise_bests for select to authenticated
  using (achieved_at >= (((select private.my_client_visibility_map()) ->> user_id::text)::timestamptz));
create policy pr_events_select_own on public.pr_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy pr_events_select_pt on public.pr_events for select to authenticated
  using (achieved_at >= (((select private.my_client_visibility_map()) ->> user_id::text)::timestamptz));

-- pt_alerts: yalnızca aktif eşleşmedeki PT okur; yazma yok (trigger/RPC)
create policy pt_alerts_select_pt on public.pt_alerts for select to authenticated
  using (pt_id = (select auth.uid()) and pair_id in (select private.my_active_pair_ids()));

-- measurement_types
create policy measurement_types_select on public.measurement_types for select to authenticated
  using (true);

-- measurement_sessions
create policy msessions_select_own on public.measurement_sessions for select to authenticated
  using (client_id = (select auth.uid()));
create policy msessions_select_pt on public.measurement_sessions for select to authenticated
  using (
    measured_at >= (((select private.my_client_visibility_map()) ->> client_id::text)::timestamptz)
    or (recorded_by = (select auth.uid()) and (select private.my_client_visibility_map()) ? client_id::text)
  );
create policy msessions_insert on public.measurement_sessions for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and (
      (recorded_by_role = 'client' and client_id = (select auth.uid())
        and (select private.has_active_consent('health_data')))
      or (recorded_by_role = 'pt' and (select private.current_app_role()) = 'pt' and private.is_active_pt_of(client_id))
    )
  );
create policy msessions_update on public.measurement_sessions for update to authenticated
  using (
    recorded_by = (select auth.uid())
    and (recorded_by_role = 'client' or private.is_active_pt_of(client_id))
  )
  with check (recorded_by = (select auth.uid()));
create policy msessions_delete on public.measurement_sessions for delete to authenticated
  using (
    recorded_by = (select auth.uid())
    and (recorded_by_role = 'client' or private.is_active_pt_of(client_id))
  );

-- measurements
create policy measurements_select on public.measurements for select to authenticated
  using (session_id in (select s.id from public.measurement_sessions s));
create policy measurements_insert on public.measurements for insert to authenticated
  with check (private.can_write_measurement(session_id, type_code));
create policy measurements_update on public.measurements for update to authenticated
  using (private.can_write_measurement(session_id, type_code))
  with check (private.can_write_measurement(session_id, type_code));
create policy measurements_delete on public.measurements for delete to authenticated
  using (private.can_write_measurement(session_id, type_code));

-- radar_evaluations
create policy radar_select_own on public.radar_evaluations for select to authenticated
  using (client_id = (select auth.uid()));
-- KVKK (K9): PT yalnızca penceresi (W−2 Pazartesi) eşleşmenin data_visible_from'undan sonra başlayan değerlendirmeyi görür
create policy radar_select_pt on public.radar_evaluations for select to authenticated
  using (window_start >= (((select private.my_client_visibility_map()) ->> client_id::text)::timestamptz));
create policy radar_dismiss_own on public.radar_evaluations for update to authenticated
  using (client_id = (select auth.uid())) with check (client_id = (select auth.uid()));

-- push_tokens (yazma RPC), notification_preferences
create policy push_tokens_select_own on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy notif_prefs_select_own on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy notif_prefs_insert_own on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notif_prefs_update_own on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Realtime: PT yalnızca kendi özel feed topic'ini dinler; istemci yayın YAPAMAZ
-- ---------------------------------------------------------------------
create policy pt_feed_receive on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'pt:' || (select auth.uid())::text || ':feed'
  );
```

### 5.4 RPC kataloğu

Tüm RPC'ler `public`, SECURITY DEFINER, `search_path=''`; EXECUTE `authenticated`'a (admin_* yalnızca `service_role`). İstemci çağrısı: `supabase.rpc('<ad>', { p_… })`.

| RPC | Çağıran | Dönüş | İş kuralları / hata kodları |
|---|---|---|---|
| `complete_onboarding(p_role app_role, p_full_name text, p_terms_version text, p_privacy_version text, p_is_adult bool, p_health_data_version text = null)` | Onboarding bekleyen herkes | `profiles` satırı | Tek seferlik (`already_onboarded`), `invalid_full_name`, `adult_declaration_required`, `documents_required`; rızaları + bildirim tercihlerini yazar |
| `set_my_timezone(p_tz text)` | authenticated | `text` (geçerli tz) | IANA değilse mevcut korunur |
| `grant_health_consent(p_version text)` | authenticated | void | Farklı sürüm varsa eskisini kapatır |
| `accept_document_versions(p_terms_version, p_privacy_version)` | authenticated | void | Sürüm değişince yeniden onay |
| `withdraw_consent(p_type consent_type)` | authenticated | void | Yalnızca `health_data`/`share_with_pt`; aktif eşleşmeyi bitirir |
| `create_pairing_invite()` | PT | `{invite_id, code, expires_at}` | `pt_role_required`, `too_many_open_invites` (≥5); reddetme örneklemeli kod |
| `revoke_pairing_invite(p_invite_id)` | PT | void | `invite_not_found` |
| `preview_pairing_invite(p_code)` | Danışan | `{ok, pt:{full_name, avatar_url}, shared_data[], consent_document}` / `{ok:false, error}` | `client_role_required`, `health_consent_required`, `already_paired`, `rate_limited` (+`retry_after_seconds`), `code_invalid`, `code_used`, `code_expired`. Başarısız deneme **kalıcı** yazılır |
| `redeem_pairing_invite(p_code, p_share_consent_version, p_share_history bool)` | Danışan | `{ok, pair_id, pt}` / `{ok:false, error}` | Önizlemedeki tüm kontroller + `consent_required`; atomik (FOR UPDATE); `data_visible_from = share_history ? -infinity : now()` |
| `end_pairing(p_pair_id, p_reason = null)` | PT veya danışan | void | `pair_not_found`; rızayı kapatır, açık alarmları arşivler |
| `set_pair_deload_mode(p_pair_id, p_mode deload_mode)` | PT | void | |
| `get_client_contact(p_client_id)` | PT(a) | `{email, phone_e164}` | `not_allowed` |
| `assign_program(p_program_id, p_client_id, p_starts_on date = null)` | PT | `{program_id}` | `not_allowed`, `program_not_found`, `program_empty`; mevcut aktif programı arşivler, derin kopyalar, push kuyruğa |
| `reorder_template_blocks(p_template_id, p_block_ids uuid[])` | Şablon editörü | void | `invalid_block_order`; tek UPDATE (deferrable unique) |
| `start_workout(p_workout_log_id, p_program_workout_id = null, p_template_id = null, p_readiness_log_id = null, p_deload_choice text = null)` | Danışan | `SessionPayload` | İdempotent (aynı id); `session_in_progress`, `deload_choice_required`, `program_workout_not_found`, `template_not_found`, `template_empty`, `readiness_not_found` (3 saatten eski/kullanılmış) |
| `get_session_payload(p_workout_log_id)` | Danışan | `SessionPayload` | `workout_not_found` |
| `reorder_session_exercises(p_workout_log_id, p_ids uuid[])` | Danışan | `SessionPayload` | `workout_not_in_progress`, `invalid_order`, `done_exercise_locked`, `block_split_not_allowed` |
| `apply_time_crunch(p_workout_log_id, p_enable bool, p_budget_min smallint = null)` | Danışan | `SessionPayload` | Öncelikli üyesi olmayan bloklar `time_crunched` |
| `complete_workout(p_workout_log_id, p_session_rpe smallint, p_end_energy end_energy, p_water_intake_count smallint, p_completed_at timestamptz)` | Danışan | `{ok, workout_log_id, status, duration_sec, tonnage_kg, hard_sets, prs[], first_records[]}` | İdempotent (completed ise özet döner); `workout_abandoned`; **`nothing_logged`** (çalışma seti yok, durum değişmez → istemci `abandon_workout` önerir); PR olaylarını üretir; `prs[].previous_best_e1rm` okuma anında hesaplanır |
| `abandon_workout(p_workout_log_id)` | Danışan | void | `workout_not_in_progress`; oturum setlerinin `exercise_bests` katkısı geri alınır |
| `get_client_home()` | Danışan | `ClientHome` (§4.6): `{today, in_progress, program{…, duration_weeks, days_per_week, week_index, block_completed, can_leave}, weekly_target, next_workout, completed_today, pair, has_health_consent, radar_card}` | Rotasyon §7.12; seri hedefi §7.9 |
| `mark_alerts_read(p_alert_ids uuid[])` | PT | `int` | |
| `resolve_alert(p_alert_id, p_action 'acknowledge'\|'approve_set'\|'update_target', p_new_target_kg = null, p_note = null)` | PT | void | `alert_not_found`, `action_not_supported`, `invalid_target`, `template_not_editable`, `invalid_action` |
| `register_push_token(p_token, p_platform, p_device_id = null)` / `unregister_push_token(p_token)` | authenticated | void | Token başka kullanıcıdaysa devralınır |
| `get_my_profile()` | authenticated | `{id, role, full_name, avatar_url, phone_e164, timezone, onboarded_at, email}` | Kendi satırı; `['profile']` sorgusu bunu kullanır |
| `leave_program(p_program_id)` | Danışan | void | `program_not_found`, `program_managed_by_pt` (programın sahibi hâlâ aktif PT) |
| `clone_system_template(p_template_id)` | PT | `{template_id}` | `pt_role_required`, `template_not_found`; sistem şablonunu PT kütüphanesine derin kopyalar |
| `suggest_exercise_to_global(p_exercise_id, p_note = null)` | PT | `{suggestion_id}` | `pt_role_required`, `exercise_not_found` (yalnızca kendi arşivsiz özel egzersizi), `suggestion_pending`, `too_many_suggestions` (24 saatte 10) |
| `admin_prepare_account_deletion(p_user_id)` | service_role | `{pairs_ended, library_programs_deleted, library_templates_deleted}` | §3.11; egzersiz SİLMEZ |
| `admin_claim_push(p_outbox_id bigint)` / `admin_finish_push(p_outbox_id, p_ok, p_error, p_invalid_tokens text[])` | service_role | jsonb / void | §6.5 |
| `admin_audit_event(p_action, p_actor_id, p_row_id, p_details)` | service_role | void | `invalid_action`; Edge Function audit (e-posta/IP/gövde YASAK) |
| `private.review_exercise_suggestion(p_suggestion_id, p_accept, p_review_note)` | yalnızca içerik hattı (migration, `postgres`) | yeni global egzersiz id / null | `suggestion_not_found`; §6.8 |

**Hata sözleşmesi (istemci eşlemesi):** PostgREST `error.code`: `P0001` → `error.message` iş kuralı kodu (tr.json `errors.<kod>`); `42501` → "Bu işlem için yetkin yok"; `23505` → çakışma; `23514` → geçersiz değer. Eşleşme uçları hata fırlatmaz, `{ok:false,error}` döner (başarısız deneme kaydı rollback olmasın diye).

### 5.5 Migration 4 — iş mantığı trigger'ları, RPC'ler, analitik view'lar

```sql
-- =====================================================================
-- 20260915000400_logic.sql
-- İş mantığı trigger'ları + RPC'ler.
-- Hata sözleşmesi:
--   * İş kuralı ihlali: RAISE EXCEPTION '<snake_case_kod>' USING ERRCODE = 'P0001' (yetki: '42501')
--   * Eşleşme ve kod uçları: jsonb {ok:false, error:'<kod>'} döner (deneme kaydı rollback olmasın)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Audit yardımcı
-- ---------------------------------------------------------------------
create or replace function private.audit(
  p_action text, p_table text, p_row_id uuid, p_subject_client uuid, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_log (actor_id, action, table_name, row_id, subject_client_id, details)
  values ((select auth.uid()), p_action, p_table, p_row_id, p_subject_client, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- Realtime yayın + push kuyruğu yardımcıları
-- ---------------------------------------------------------------------
create or replace function private.broadcast_to_pt(p_pt_id uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, 'pt:' || p_pt_id::text || ':feed', true);
exception when others then
  raise warning 'broadcast_to_pt failed: %', sqlerrm;
end;
$$;

create or replace function private.enqueue_push(p_user_id uuid, p_kind text, p_title_key text, p_body_key text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  select case p_kind
           when 'overload_alert' then coalesce(np.overload_push, true)
           when 'low_readiness_alert' then coalesce(np.low_readiness_push, false)
           when 'program_assigned' then coalesce(np.program_assigned_push, true)
           when 'program_updated' then coalesce(np.program_assigned_push, true)
           else false end
    into v_allowed
    from (select 1) d
    left join public.notification_preferences np on np.user_id = p_user_id;

  if not v_allowed or not exists (select 1 from public.push_tokens t where t.user_id = p_user_id) then
    return;
  end if;

  insert into private.push_outbox (user_id, kind, title_key, body_key, data)
  values (p_user_id, p_kind, p_title_key, p_body_key, coalesce(p_data, '{}'::jsonb));
end;
$$;

-- push_outbox INSERT → pg_net ile send-push Edge Function'ını hemen dürt (async, commit sonrası)
create or replace function private.kick_push_worker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_worker_secret';
  if v_url is null or v_secret is null then
    return null;  -- yerel test / yapılandırılmamış ortam: cron süpürücüsü bekler
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/send-push',
    body := jsonb_build_object('outbox_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-worker-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return null;
exception when others then
  raise warning 'kick_push_worker failed: %', sqlerrm;
  return null;
end;
$$;

create trigger push_outbox_kick
  after insert on private.push_outbox
  for each row execute function private.kick_push_worker();

-- ---------------------------------------------------------------------
-- Şablon denormalizasyonu ve bütünlüğü
-- ---------------------------------------------------------------------
create or replace function private.template_exercises_fill_template_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select b.template_id into new.template_id from public.template_blocks b where b.id = new.block_id;
  if new.template_id is null then
    raise exception 'block_not_found' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger template_exercises_fill_template_id
  before insert on public.template_exercises
  for each row execute function private.template_exercises_fill_template_id();

-- Egzersiz görünürlüğü yazımda da zorunlu (§5.2): istemci okuyamadığı özel egzersizi (UUID biliniyor olsa bile)
-- şablona ekleyip my_assigned_exercise_ids() üzerinden görünür kılamaz. SECURITY INVOKER (bilinçli): definer RPC
-- (copy_template/assign_program) bağlamında current_user = postgres olduğundan kontrol atlanır.
create or replace function private.template_exercises_check_exercise()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' or new.exercise_id is distinct from old.exercise_id)
     and not private.exercise_usable_in_template(new.exercise_id, new.template_id) then
    raise exception 'exercise_not_available' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Ad sırası önemli: BEFORE trigger'lar alfabetik çalışır → *_fill_template_id, *_set_updated_at, *_validate_exercise
create trigger template_exercises_validate_exercise
  before insert or update of exercise_id on public.template_exercises
  for each row execute function private.template_exercises_check_exercise();

create or replace function private.template_sets_fill_template_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select te.template_id into new.template_id from public.template_exercises te where te.id = new.template_exercise_id;
  if new.template_id is null then
    raise exception 'template_exercise_not_found' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger template_sets_fill_template_id
  before insert on public.template_exercise_sets
  for each row execute function private.template_sets_fill_template_id();

-- Program günü, aynı sahip ve aynı danışana ait şablonu göstermeli
create or replace function private.validate_program_workout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.programs%rowtype;
  v_tpl  public.workout_templates%rowtype;
begin
  select * into v_prog from public.programs where id = new.program_id;
  select * into v_tpl from public.workout_templates where id = new.template_id;
  if v_tpl.id is null or v_prog.id is null then
    raise exception 'program_or_template_not_found' using errcode = 'P0001';
  end if;
  if v_tpl.client_id is distinct from v_prog.client_id or v_tpl.owner_id is distinct from v_prog.owner_id then
    raise exception 'template_program_mismatch' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger program_workouts_validate
  before insert or update of template_id, program_id on public.program_workouts
  for each row execute function private.validate_program_workout();

-- ---------------------------------------------------------------------
-- Readiness
-- ---------------------------------------------------------------------
create or replace function private.readiness_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  select p.timezone into v_tz from public.profiles p where p.id = new.user_id;
  new.checked_in_at := now();
  new.local_date := (now() at time zone coalesce(v_tz, 'Europe/Istanbul'))::date;
  new.pain_regions := coalesce((select array_agg(distinct r order by r) from unnest(new.pain_regions) r), '{}');
  return new;
end;
$$;

create trigger readiness_before_insert
  before insert on public.readiness_logs
  for each row execute function private.readiness_before_insert();

create or replace function private.readiness_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pt_client_pairs%rowtype;
  v_id   uuid;
begin
  if new.score >= 60 then
    return null;
  end if;
  select * into v_pair from public.pt_client_pairs where client_id = new.user_id and status = 'active';
  if not found then
    return null;
  end if;

  insert into public.pt_alerts (pair_id, pt_id, client_id, alert_type, severity, readiness_log_id, payload, dedupe_key)
  values (
    v_pair.id, v_pair.pt_id, v_pair.client_id, 'LOW_READINESS', 'warning', new.id,
    jsonb_build_object('score', new.score, 'pain_regions', to_jsonb(new.pain_regions), 'local_date', new.local_date,
                       'sleep', new.sleep_rating, 'energy', new.energy_rating, 'soreness', new.soreness_rating, 'stress', new.stress_rating),
    'low_readiness:' || new.user_id::text || ':' || new.local_date::text   -- danışan başına yerel gün başına 1
  )
  on conflict (pt_id, dedupe_key) do nothing
  returning id into v_id;

  return null;
end;
$$;

create trigger readiness_after_insert
  after insert on public.readiness_logs
  for each row execute function private.readiness_after_insert();

-- ---------------------------------------------------------------------
-- En iyi e1RM yeniden hesap
-- ---------------------------------------------------------------------
create or replace function private.recompute_exercise_best(p_user uuid, p_exercise uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_e1rm numeric;
  v_at   timestamptz;
begin
  select s.id, s.estimated_1rm, s.performed_at
    into v_id, v_e1rm, v_at
    from public.set_logs s
    join public.workout_logs wl on wl.id = s.workout_log_id
   where s.user_id = p_user
     and s.exercise_id = p_exercise
     and s.estimated_1rm is not null
     and (not s.overload_flag or s.pt_reviewed_at is not null)
     and wl.status <> 'abandoned'
   order by s.estimated_1rm desc, s.performed_at asc
   limit 1;

  if v_id is null then
    delete from public.exercise_bests where user_id = p_user and exercise_id = p_exercise;
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    return;
  end if;

  insert into public.exercise_bests (user_id, exercise_id, best_e1rm, best_set_log_id, achieved_at, updated_at)
  values (p_user, p_exercise, v_e1rm, v_id, v_at, now())
  on conflict (user_id, exercise_id) do update
    set best_e1rm = excluded.best_e1rm,
        best_set_log_id = excluded.best_set_log_id,
        achieved_at = excluded.achieved_at,
        updated_at = now();
end;
$$;

-- Oturum öncesi en iyi e1RM (§7.4): bu oturumdan ÖNCE başlamış TAMAMLANMIŞ oturumlar; onaysız overload hariç.
-- PR kararı (compute_pr_events) ile aynı taban. Değer tabloda SAKLANMAZ: PT'ye eşleşme öncesi en iyiyi
-- sızdırmamak için yalnızca sahip RPC'lerinde (build_session_payload, session_summary) okuma anında hesaplanır.
create or replace function private.best_e1rm_before(p_user uuid, p_exercise uuid, p_before timestamptz, p_exclude_workout uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select max(s.estimated_1rm)
    from public.set_logs s
    join public.workout_logs wl on wl.id = s.workout_log_id
   where s.user_id = p_user
     and s.exercise_id = p_exercise
     and s.estimated_1rm is not null
     and (not s.overload_flag or s.pt_reviewed_at is not null)
     and wl.status = 'completed'
     and wl.id <> p_exclude_workout
     and wl.started_at < p_before;
$$;

-- ---------------------------------------------------------------------
-- set_logs: sunucu otoriter hesaplar (guardrail, e1RM, hedef snapshot)
-- ---------------------------------------------------------------------
-- SECURITY INVOKER (bilinçli): current_user = 'authenticated' → istemci yazımı; RPC/cron (definer) → ayrıcalıklı
create or replace function private.set_logs_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_priv    boolean := current_user not in ('authenticated', 'anon');
  v_wl      public.workout_logs%rowtype;
  v_wle     public.workout_log_exercises%rowtype;
  v_plan    jsonb;
  v_orig    numeric;
  v_adj     numeric;
  v_allowed numeric;
  v_over    boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.workout_log_id <> old.workout_log_id or new.user_id <> old.user_id
       or new.workout_log_exercise_id <> old.workout_log_exercise_id
       or new.set_type <> old.set_type or new.set_number <> old.set_number then
      raise exception 'set_identity_immutable' using errcode = '42501';
    end if;
    if old.overload_flag and not v_priv and (
         new.weight_kg is distinct from old.weight_kg
      or new.reps_completed is distinct from old.reps_completed
      or new.duration_seconds is distinct from old.duration_seconds
      or new.completion_type is distinct from old.completion_type
      or new.performed_at is distinct from old.performed_at) then
      raise exception 'overload_set_immutable' using errcode = '42501';
    end if;
  end if;

  select * into v_wl from public.workout_logs where id = new.workout_log_id;
  if v_wl.id is null or v_wl.user_id <> new.user_id then
    raise exception 'workout_not_found' using errcode = 'P0001';
  end if;

  select * into v_wle from public.workout_log_exercises
   where id = new.workout_log_exercise_id and workout_log_id = new.workout_log_id;
  if v_wle.id is null then
    raise exception 'session_exercise_not_found' using errcode = 'P0001';
  end if;

  if not v_priv and not (
       v_wl.status = 'in_progress'
    or (v_wl.status = 'completed' and v_wl.completed_at > now() - interval '24 hours')
    or (v_wl.status = 'abandoned' and v_wl.auto_closed and v_wl.last_activity_at > now() - interval '24 hours')
  ) then
    raise exception 'workout_locked' using errcode = 'P0001';
  end if;

  new.exercise_id := v_wle.exercise_id;

  -- İstemci saati: çevrimdışı gecikmeye tolerans, saat kaymasına clamp
  if new.performed_at > now() + interval '5 minutes' then
    new.performed_at := now();
    new.clock_skew_suspect := true;
  elsif new.performed_at < v_wl.started_at - interval '5 minutes' then
    new.performed_at := v_wl.started_at;
    new.clock_skew_suspect := true;
  end if;

  -- tracking_type'a göre zorunlu alanlar
  if v_wle.tracking_type = 'weight_reps' then
    if new.reps_completed is null or new.weight_kg is null then
      raise exception 'reps_and_weight_required' using errcode = 'P0001';
    end if;
    new.duration_seconds := null;
  elsif v_wle.tracking_type = 'bodyweight_reps' then
    if new.reps_completed is null then
      raise exception 'reps_required' using errcode = 'P0001';
    end if;
    new.duration_seconds := null;
  else
    if new.duration_seconds is null then
      raise exception 'duration_required' using errcode = 'P0001';
    end if;
    new.reps_completed := null;
  end if;

  -- Hedef snapshot'ı (planlanmamış ekstra çalışma setleri son planlı çalışma setinin hedefini alır)
  select e into v_plan
    from jsonb_array_elements(v_wle.planned_sets) e
   where e ->> 'set_type' = new.set_type::text and (e ->> 'set_number')::integer = new.set_number
   limit 1;
  if v_plan is null and new.set_type = 'working' then
    select e into v_plan
      from jsonb_array_elements(v_wle.planned_sets) e
     where e ->> 'set_type' = 'working'
     order by (e ->> 'set_number')::integer desc
     limit 1;
  end if;

  new.target_reps_min := (v_plan ->> 'reps_min')::smallint;
  new.target_reps_max := (v_plan ->> 'reps_max')::smallint;
  v_orig := (v_plan ->> 'original_weight_kg')::numeric;
  v_adj  := (v_plan ->> 'adjusted_weight_kg')::numeric;
  new.target_weight_kg := v_orig;
  new.adjusted_target_weight_kg := v_adj;

  -- Guardrail: referans HER ZAMAN PT'nin orijinal hedefi
  v_allowed := null;
  if v_wl.guardrail_enabled and v_wle.tolerance_pct is not null and new.set_type = 'working'
     and v_wle.tracking_type = 'weight_reps' and v_orig is not null then
    v_allowed := private.guardrail_allowed_max(v_orig, v_wle.tolerance_pct, v_wle.tolerance_abs_kg);
    v_over := new.weight_kg > v_allowed;
  end if;
  if tg_op = 'UPDATE' and old.overload_flag then
    v_over := true;
  end if;

  new.allowed_max_weight_kg := v_allowed;
  new.overload_flag := v_over;
  new.deload_ignored := (not v_over and v_adj is not null and v_orig is not null and v_adj < v_orig
                         and new.weight_kg is not null and new.weight_kg > v_adj);
  new.estimated_1rm := private.epley_e1rm(v_wle.tracking_type, new.set_type, new.completion_type,
                                          new.reps_completed, new.weight_kg);
  if not v_priv then
    new.pt_reviewed_at := case when tg_op = 'UPDATE' then old.pt_reviewed_at else null end;
  end if;
  return new;
end;
$$;

create trigger set_logs_before_write
  before insert or update on public.set_logs
  for each row execute function private.set_logs_before_write();

create or replace function private.set_logs_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wl   public.workout_logs%rowtype;
  v_wle  public.workout_log_exercises%rowtype;
  v_pair public.pt_client_pairs%rowtype;
begin
  if tg_op = 'DELETE' then
    perform private.recompute_exercise_best(old.user_id, old.exercise_id);
    return null;
  end if;

  perform private.recompute_exercise_best(new.user_id, new.exercise_id);

  update public.workout_logs wl
     set last_activity_at = greatest(wl.last_activity_at, new.performed_at),
         status = case when wl.status = 'abandoned' and wl.auto_closed and new.set_type = 'working'
                       then 'completed'::public.workout_status else wl.status end,
         completed_at = case
                          when wl.status = 'abandoned' and wl.auto_closed and new.set_type = 'working'
                            then greatest(wl.last_activity_at, new.performed_at, wl.started_at)
                          when wl.status = 'completed' and wl.auto_closed
                            then greatest(wl.completed_at, new.performed_at)
                          else wl.completed_at end
   where wl.id = new.workout_log_id
   returning * into v_wl;

  if new.set_type = 'working' then
    update public.workout_log_exercises
       set status = 'done', skip_reason = null
     where id = new.workout_log_exercise_id and status <> 'done';
  end if;

  if v_wl.pair_id is not null then
    select * into v_pair from public.pt_client_pairs where id = v_wl.pair_id and status = 'active';
  end if;

  if new.overload_flag and (tg_op = 'INSERT' or not old.overload_flag) and v_pair.id is not null then
    select * into v_wle from public.workout_log_exercises where id = new.workout_log_exercise_id;
    insert into public.pt_alerts (
      pair_id, pt_id, client_id, alert_type, severity,
      workout_log_id, workout_log_exercise_id, set_log_id, payload, dedupe_key
    ) values (
      v_pair.id, v_pair.pt_id, v_pair.client_id, 'OVERLOAD_RISK', 'critical',
      new.workout_log_id, new.workout_log_exercise_id, new.id,
      jsonb_build_object(
        'exercise_id', new.exercise_id,
        'exercise_title', v_wle.exercise_title_snapshot,
        'set_type', new.set_type,
        'set_number', new.set_number,
        'target_weight_kg', new.target_weight_kg,
        'adjusted_target_weight_kg', new.adjusted_target_weight_kg,
        'allowed_max_weight_kg', new.allowed_max_weight_kg,
        'logged_weight_kg', new.weight_kg,
        'max_logged_weight_kg', new.weight_kg,
        'reps_completed', new.reps_completed,
        'deviation_pct', new.deviation_pct,
        'client_confirmed', new.overload_confirmed_at is not null,
        'performed_at', new.performed_at,
        'server_received_at', now()          -- P1 "geç senkron" kuralı: server_received_at − performed_at > 10 dk
      ),
      'overload:' || new.workout_log_exercise_id::text
    )
    on conflict (pt_id, dedupe_key) do update
      set occurrences = public.pt_alerts.occurrences + 1,
          last_occurred_at = now(),
          set_log_id = excluded.set_log_id,
          status = case when public.pt_alerts.status = 'archived' then public.pt_alerts.status
                        else 'open'::public.alert_status end,
          read_at = case when public.pt_alerts.status = 'archived' then public.pt_alerts.read_at else null end,
          payload = public.pt_alerts.payload
            || jsonb_build_object(
                 'logged_weight_kg', excluded.payload -> 'logged_weight_kg',
                 'deviation_pct', excluded.payload -> 'deviation_pct',
                 'set_number', excluded.payload -> 'set_number',
                 'client_confirmed', excluded.payload -> 'client_confirmed',
                 'performed_at', excluded.payload -> 'performed_at',
                 'server_received_at', excluded.payload -> 'server_received_at',
                 'max_logged_weight_kg', greatest(
                    (public.pt_alerts.payload ->> 'max_logged_weight_kg')::numeric,
                    (excluded.payload ->> 'logged_weight_kg')::numeric));
  end if;

  -- Canlı PR adayı (PRD §4.4 "PT paneline başarı logu"): yalnızca id içeren anlık sinyal.
  -- Kesin PR oturum kapanışında pr_events'e yazılır (§7.4); ilk kayıt aday sayılmaz.
  if tg_op = 'INSERT' and v_pair.id is not null and new.estimated_1rm is not null and not new.overload_flag
     and new.estimated_1rm > coalesce(private.best_e1rm_before(new.user_id, new.exercise_id, v_wl.started_at, v_wl.id),
                                      'infinity'::numeric) then
    perform private.broadcast_to_pt(v_pair.pt_id, 'pr_candidate',
      jsonb_build_object('workout_log_id', new.workout_log_id, 'client_id', new.user_id, 'set_log_id', new.id));
  end if;

  return null;
end;
$$;

create trigger set_logs_after_write
  after insert or update or delete on public.set_logs
  for each row execute function private.set_logs_after_write();

-- ---------------------------------------------------------------------
-- pt_alerts: realtime + push
-- ---------------------------------------------------------------------
create or replace function private.pt_alerts_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.broadcast_to_pt(new.pt_id, 'alert_created',
      jsonb_build_object('alert_id', new.id, 'alert_type', new.alert_type, 'client_id', new.client_id));
    if new.alert_type = 'OVERLOAD_RISK' then
      perform private.enqueue_push(new.pt_id, 'overload_alert', 'push.overload.title', 'push.overload.body',
        jsonb_build_object('url', '/pt/alerts/' || new.id::text, 'alert_id', new.id));
    elsif new.alert_type = 'LOW_READINESS' then
      perform private.enqueue_push(new.pt_id, 'low_readiness_alert', 'push.low_readiness.title', 'push.low_readiness.body',
        jsonb_build_object('url', '/pt/alerts/' || new.id::text, 'alert_id', new.id));
    end if;
  elsif tg_op = 'UPDATE' and (new.occurrences <> old.occurrences or (new.status = 'open' and old.status <> 'open')) then
    perform private.broadcast_to_pt(new.pt_id, 'alert_updated',
      jsonb_build_object('alert_id', new.id, 'alert_type', new.alert_type, 'client_id', new.client_id));
  end if;
  return null;
end;
$$;

create trigger pt_alerts_after_write
  after insert or update on public.pt_alerts
  for each row execute function private.pt_alerts_after_write();

-- pr_events → aktif PT'ye anlık sinyal (içerik yok, yalnızca id)
create or replace function private.pr_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pt uuid;
begin
  select p.pt_id into v_pt from public.pt_client_pairs p where p.client_id = new.user_id and p.status = 'active';
  if v_pt is not null then
    perform private.broadcast_to_pt(v_pt, 'pr_achieved',
      jsonb_build_object('pr_event_id', new.id, 'client_id', new.user_id, 'workout_log_id', new.workout_log_id));
  end if;
  return null;
end;
$$;

create trigger pr_events_after_insert
  after insert on public.pr_events
  for each row execute function private.pr_events_after_insert();

-- workout_logs durum değişimi → aktif PT radarına sinyal (içerik yok, sadece id)
create or replace function private.workout_logs_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pt uuid;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return null;
  end if;
  select p.pt_id into v_pt from public.pt_client_pairs p where p.client_id = new.user_id and p.status = 'active';
  if v_pt is not null then
    perform private.broadcast_to_pt(v_pt, 'session_' || new.status::text,
      jsonb_build_object('workout_log_id', new.id, 'client_id', new.user_id));
  end if;
  return null;
end;
$$;

create trigger workout_logs_after_status
  after insert or update of status on public.workout_logs
  for each row execute function private.workout_logs_after_status();

-- ---------------------------------------------------------------------
-- Ölçüm doğrulama + audit (klinik not içeriği audit'e KOPYALANMAZ)
-- ---------------------------------------------------------------------
create or replace function private.measurements_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type    public.measurement_types%rowtype;
  v_session public.measurement_sessions%rowtype;
begin
  select * into v_type from public.measurement_types where code = new.type_code;
  select * into v_session from public.measurement_sessions where id = new.session_id;
  if v_session.id is null then
    raise exception 'measurement_session_not_found' using errcode = 'P0001';
  end if;
  new.client_id := v_session.client_id;
  if v_type.has_side and new.side is null then
    raise exception 'measurement_side_required' using errcode = 'P0001';
  end if;
  if not v_type.has_side and new.side is not null then
    raise exception 'measurement_side_not_allowed' using errcode = 'P0001';
  end if;
  if new.value < v_type.min_value or new.value > v_type.max_value then
    raise exception 'measurement_out_of_range' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger measurements_before_write
  before insert or update on public.measurements
  for each row execute function private.measurements_before_write();

-- Y-Balance bileşik skoru (%) = (anterior + posteromedial + posterolateral) / (3 × bacak boyu) × 100, taraf başına.
-- Türetilmiş tip (measurement_types.is_derived) istemciye kapalıdır; girdiler değişince sunucu yeniden hesaplar/siler.
create or replace function private.measurements_derive_y_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.measurements%rowtype;
  v_type public.measurement_types%rowtype;
  v_a    numeric;
  v_pm   numeric;
  v_pl   numeric;
  v_ll   numeric;
  v_val  numeric;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.type_code not in ('y_balance_anterior_cm', 'y_balance_posteromedial_cm', 'y_balance_posterolateral_cm', 'leg_length_cm') then
    return null;
  end if;
  select max(m.value) filter (where m.type_code = 'y_balance_anterior_cm'),
         max(m.value) filter (where m.type_code = 'y_balance_posteromedial_cm'),
         max(m.value) filter (where m.type_code = 'y_balance_posterolateral_cm'),
         max(m.value) filter (where m.type_code = 'leg_length_cm')
    into v_a, v_pm, v_pl, v_ll
    from public.measurements m
   where m.session_id = v_row.session_id and m.side is not distinct from v_row.side;
  select * into v_type from public.measurement_types where code = 'y_balance_composite_pct';
  if v_type.code is not null and v_a is not null and v_pm is not null and v_pl is not null and v_ll > 0 then
    v_val := round((v_a + v_pm + v_pl) / (3 * v_ll) * 100, 2);
  end if;
  if v_val is null or v_val < v_type.min_value or v_val > v_type.max_value
     or not exists (select 1 from public.measurement_sessions s where s.id = v_row.session_id) then
    delete from public.measurements
     where session_id = v_row.session_id and type_code = 'y_balance_composite_pct' and side is not distinct from v_row.side;
  else
    insert into public.measurements (session_id, client_id, type_code, side, value)
    values (v_row.session_id, v_row.client_id, 'y_balance_composite_pct', v_row.side, v_val)
    on conflict (session_id, type_code, side) do update set value = excluded.value;
  end if;
  return null;
end;
$$;

create trigger measurements_derive_y_balance
  after insert or update or delete on public.measurements
  for each row execute function private.measurements_derive_y_balance();

create or replace function private.measurement_sessions_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.measurement_sessions%rowtype;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  perform private.audit('measurement_session_' || lower(tg_op), 'measurement_sessions', v_row.id, v_row.client_id,
    jsonb_build_object(
      'recorded_by_role', v_row.recorded_by_role,
      'pt_notes_changed', case when tg_op = 'UPDATE' then new.pt_notes is distinct from old.pt_notes else v_row.pt_notes is not null end,
      'posture_notes_changed', case when tg_op = 'UPDATE' then new.posture_notes is distinct from old.posture_notes else v_row.posture_notes is not null end));
  return null;
end;
$$;

create trigger measurement_sessions_audit
  after insert or update or delete on public.measurement_sessions
  for each row execute function private.measurement_sessions_audit();

-- =====================================================================
-- RPC'LER
-- =====================================================================

-- ---------------------------------------------------------------------
-- Onboarding (A3 + A4 tek atomik çağrı)
-- ---------------------------------------------------------------------
create or replace function public.complete_onboarding(
  p_role public.app_role,
  p_full_name text,
  p_terms_version text,
  p_privacy_version text,
  p_is_adult boolean,
  p_health_data_version text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_full_name, ''));
  v_row  public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'role_required' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 2 and 100 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  if coalesce(p_is_adult, false) = false then
    raise exception 'adult_declaration_required' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_terms_version, '')), '') is null or nullif(btrim(coalesce(p_privacy_version, '')), '') is null then
    raise exception 'documents_required' using errcode = 'P0001';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  update public.profiles
     set role = p_role, full_name = v_name, onboarded_at = now()
   where id = v_uid and role is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'already_onboarded' using errcode = 'P0001';
  end if;

  insert into public.consents (user_id, consent_type, document_version) values
    (v_uid, 'terms', p_terms_version),
    (v_uid, 'privacy_notice', p_privacy_version),
    (v_uid, 'adult_declaration', 'v1');
  if nullif(btrim(coalesce(p_health_data_version, '')), '') is not null then
    insert into public.consents (user_id, consent_type, document_version) values (v_uid, 'health_data', p_health_data_version);
  end if;
  insert into public.notification_preferences (user_id) values (v_uid) on conflict (user_id) do nothing;

  perform private.audit('onboarding_completed', 'profiles', v_uid, null, jsonb_build_object('role', p_role));
  return v_row;
end;
$$;

create or replace function public.set_my_timezone(p_tz text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_tz is not null and char_length(p_tz) <= 64
     and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    update public.profiles set timezone = p_tz where id = v_uid and timezone <> p_tz;
  end if;
  return (select timezone from public.profiles where id = v_uid);
end;
$$;

create or replace function public.grant_health_consent(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_version, '')), '') is null then raise exception 'documents_required' using errcode = 'P0001'; end if;
  update public.consents set withdrawn_at = now()
   where user_id = v_uid and consent_type = 'health_data' and withdrawn_at is null and document_version <> p_version;
  insert into public.consents (user_id, consent_type, document_version)
  select v_uid, 'health_data', p_version
   where not exists (select 1 from public.consents where user_id = v_uid and consent_type = 'health_data' and withdrawn_at is null);
end;
$$;

create or replace function public.accept_document_versions(p_terms_version text, p_privacy_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.consents set withdrawn_at = now()
   where user_id = v_uid and withdrawn_at is null
     and ((consent_type = 'terms' and document_version <> p_terms_version)
       or (consent_type = 'privacy_notice' and document_version <> p_privacy_version));
  insert into public.consents (user_id, consent_type, document_version)
  select v_uid, t.ct, t.v from (values ('terms'::public.consent_type, p_terms_version), ('privacy_notice'::public.consent_type, p_privacy_version)) t(ct, v)
   where not exists (select 1 from public.consents c where c.user_id = v_uid and c.consent_type = t.ct and c.withdrawn_at is null);
end;
$$;

-- ---------------------------------------------------------------------
-- Eşleşme
-- ---------------------------------------------------------------------
create or replace function public.create_pairing_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31 karakter; I, L, O, 0, 1 yok
  v_bytes    bytea;
  v_code     text;
  v_idx      integer;
  v_byte     integer;
  v_id       uuid;
  v_expires  timestamptz;
begin
  if (select private.current_app_role()) is distinct from 'pt' then
    raise exception 'pt_role_required' using errcode = '42501';
  end if;
  if (select count(*) from public.pairing_invites
       where pt_id = v_uid and redeemed_at is null and revoked_at is null and expires_at > now()) >= 5 then
    raise exception 'too_many_open_invites' using errcode = 'P0001';
  end if;

  for attempt in 1..10 loop
    v_code := '';
    v_bytes := extensions.gen_random_bytes(32);
    v_idx := 0;
    while char_length(v_code) < 6 loop
      if v_idx >= 32 then
        v_bytes := extensions.gen_random_bytes(32);
        v_idx := 0;
      end if;
      v_byte := get_byte(v_bytes, v_idx);
      v_idx := v_idx + 1;
      if v_byte < 248 then  -- 31*8: modulo yanlılığını önleyen reddetme örneklemesi
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
      end if;
    end loop;

    begin
      insert into public.pairing_invites (pt_id, code, expires_at)
      values (v_uid, v_code, now() + interval '24 hours')
      returning id, expires_at into v_id, v_expires;
      perform private.audit('pairing_invite_created', 'pairing_invites', v_id, null, '{}'::jsonb);
      return jsonb_build_object('invite_id', v_id, 'code', v_code, 'expires_at', v_expires);
    exception when unique_violation then
      null;  -- çakışma: yeniden dene
    end;
  end loop;
  raise exception 'code_generation_failed' using errcode = 'P0001';
end;
$$;

create or replace function public.revoke_pairing_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pairing_invites set revoked_at = now()
   where id = p_invite_id and pt_id = (select auth.uid()) and redeemed_at is null and revoked_at is null;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Ortak: kod normalize + oran sınırı + kod çözümleme. Başarısız denemeyi KALICI yazar.
create or replace function private.resolve_invite_code(p_code text, p_lock boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_code    text := upper(regexp_replace(translate(coalesce(p_code, ''), 'ıİ', 'II'), '[^A-Za-z0-9]', '', 'g'));
  v_t5      timestamptz;
  v_t20     timestamptz;
  v_retry   integer;
  v_inv     public.pairing_invites%rowtype;
  v_last    public.pairing_invites%rowtype;
  v_error   text;
begin
  if (select private.current_app_role()) is distinct from 'client' then
    return jsonb_build_object('ok', false, 'error', 'client_role_required');
  end if;
  if not (select private.has_active_consent('health_data')) then
    return jsonb_build_object('ok', false, 'error', 'health_consent_required');
  end if;
  if exists (select 1 from public.pt_client_pairs where client_id = v_uid and status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'already_paired');
  end if;

  -- 15 dk'da 5 veya 24 saatte 20 başarısız deneme → rate_limited
  select attempted_at into v_t5 from private.pairing_attempts
   where user_id = v_uid and success = false and attempted_at > now() - interval '15 minutes'
   order by attempted_at desc offset 4 limit 1;
  select attempted_at into v_t20 from private.pairing_attempts
   where user_id = v_uid and success = false and attempted_at > now() - interval '24 hours'
   order by attempted_at desc offset 19 limit 1;
  if v_t5 is not null or v_t20 is not null then
    v_retry := greatest(
      coalesce(ceil(extract(epoch from (v_t5 + interval '15 minutes' - now())))::integer, 0),
      coalesce(ceil(extract(epoch from (v_t20 + interval '24 hours' - now())))::integer, 0), 1);
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', v_retry);
  end if;

  if v_code ~ '^[A-HJKMNP-Z2-9]{6}$' then
    if p_lock then
      select * into v_inv from public.pairing_invites
       where code = v_code and redeemed_at is null and revoked_at is null and expires_at > now()
       for update;
    else
      select * into v_inv from public.pairing_invites
       where code = v_code and redeemed_at is null and revoked_at is null and expires_at > now();
    end if;
  end if;

  if v_inv.id is null or v_inv.pt_id = v_uid
     or not exists (select 1 from public.profiles where id = v_inv.pt_id and role = 'pt') then
    insert into private.pairing_attempts (user_id, success) values (v_uid, false);
    select * into v_last from public.pairing_invites where code = v_code order by created_at desc limit 1;
    v_error := case
      when v_last.id is null then 'code_invalid'
      when v_last.redeemed_at is not null then 'code_used'
      when v_last.expires_at <= now() then 'code_expired'
      when v_last.revoked_at is not null then 'code_invalid'
      else 'code_invalid' end;
    return jsonb_build_object('ok', false, 'error', v_error);
  end if;

  return jsonb_build_object('ok', true, 'invite_id', v_inv.id, 'pt_id', v_inv.pt_id);
end;
$$;

create or replace function public.preview_pairing_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
  v_pt  public.profiles%rowtype;
begin
  v_res := private.resolve_invite_code(p_code, false);
  if not (v_res ->> 'ok')::boolean then
    return v_res;
  end if;
  select * into v_pt from public.profiles where id = (v_res ->> 'pt_id')::uuid;
  return jsonb_build_object(
    'ok', true,
    'pt', jsonb_build_object('full_name', v_pt.full_name, 'avatar_url', v_pt.avatar_url),
    'shared_data', jsonb_build_array('workouts', 'sets', 'readiness', 'pain_regions', 'measurements', 'exercise_notes', 'profile_name', 'phone'),
    'consent_document', 'share_with_pt'
  );
end;
$$;

create or replace function public.redeem_pairing_invite(p_code text, p_share_consent_version text, p_share_history boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_res     jsonb;
  v_pair_id uuid;
  v_pt      public.profiles%rowtype;
begin
  if nullif(btrim(coalesce(p_share_consent_version, '')), '') is null or p_share_history is null then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  v_res := private.resolve_invite_code(p_code, true);
  if not (v_res ->> 'ok')::boolean then
    return v_res;
  end if;

  begin
    update public.pairing_invites set redeemed_by = v_uid, redeemed_at = now()
     where id = (v_res ->> 'invite_id')::uuid;

    insert into public.pt_client_pairs (pt_id, client_id, invite_id, data_visible_from)
    values ((v_res ->> 'pt_id')::uuid, v_uid, (v_res ->> 'invite_id')::uuid,
            case when p_share_history then '-infinity'::timestamptz else now() end)
    returning id into v_pair_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_paired');
  end;

  insert into public.consents (user_id, consent_type, document_version, pair_id, share_history)
  values (v_uid, 'share_with_pt', p_share_consent_version, v_pair_id, p_share_history);
  insert into private.pairing_attempts (user_id, success) values (v_uid, true);

  select * into v_pt from public.profiles where id = (v_res ->> 'pt_id')::uuid;
  perform private.audit('pairing_activated', 'pt_client_pairs', v_pair_id, v_uid,
    jsonb_build_object('pt_id', v_pt.id, 'share_history', p_share_history));

  return jsonb_build_object('ok', true, 'pair_id', v_pair_id,
    'pt', jsonb_build_object('id', v_pt.id, 'full_name', v_pt.full_name, 'avatar_url', v_pt.avatar_url));
end;
$$;

create or replace function public.end_pairing(p_pair_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_pair public.pt_client_pairs%rowtype;
begin
  update public.pt_client_pairs
     set status = 'ended', ended_at = now(), ended_by = v_uid, end_reason = left(p_reason, 280)
   where id = p_pair_id and status = 'active' and (pt_id = v_uid or client_id = v_uid)
  returning * into v_pair;
  if v_pair.id is null then
    raise exception 'pair_not_found' using errcode = 'P0001';
  end if;

  update public.consents set withdrawn_at = now() where pair_id = p_pair_id and withdrawn_at is null;
  update public.pt_alerts set status = 'archived' where pair_id = p_pair_id and status in ('open', 'acknowledged');

  perform private.audit('pairing_ended', 'pt_client_pairs', v_pair.id, v_pair.client_id,
    jsonb_build_object('ended_by_role', case when v_uid = v_pair.pt_id then 'pt' else 'client' end));
end;
$$;

create or replace function public.withdraw_consent(p_type public.consent_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_pair_id uuid;
begin
  if p_type not in ('health_data', 'share_with_pt') then
    raise exception 'consent_not_withdrawable' using errcode = 'P0001';  -- şartlar/aydınlatma: hesap silme ile
  end if;
  select id into v_pair_id from public.pt_client_pairs where client_id = v_uid and status = 'active';
  if v_pair_id is not null then
    perform public.end_pairing(v_pair_id, 'consent_withdrawn');
  end if;
  update public.consents set withdrawn_at = now()
   where user_id = v_uid and consent_type = p_type and withdrawn_at is null;
end;
$$;

create or replace function public.set_pair_deload_mode(p_pair_id uuid, p_mode public.deload_mode)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pt_client_pairs set deload_mode = p_mode
   where id = p_pair_id and pt_id = (select auth.uid()) and status = 'active';
  if not found then
    raise exception 'pair_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.get_client_contact(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_pt_of(p_client_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return (select jsonb_build_object('email', u.email, 'phone_e164', p.phone_e164)
            from auth.users u join public.profiles p on p.id = u.id where u.id = p_client_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Şablon / program
-- ---------------------------------------------------------------------
create or replace function private.copy_template(p_template_id uuid, p_client_id uuid, p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid;
begin
  insert into public.workout_templates (owner_id, client_id, source_template_id, title, description, tolerance_pct, tolerance_abs_kg)
  select p_owner_id, p_client_id, t.id, t.title, t.description, t.tolerance_pct, t.tolerance_abs_kg
    from public.workout_templates t where t.id = p_template_id
  returning id into v_new;

  insert into public.template_blocks (template_id, position, block_type, rest_after_round_sec)
  select v_new, b.position, b.block_type, b.rest_after_round_sec
    from public.template_blocks b where b.template_id = p_template_id;

  insert into public.template_exercises (template_id, block_id, position_in_block, exercise_id, is_priority, tolerance_pct, tolerance_abs_kg)
  select v_new, nb.id, te.position_in_block, te.exercise_id, te.is_priority, te.tolerance_pct, te.tolerance_abs_kg
    from public.template_exercises te
    join public.template_blocks ob on ob.id = te.block_id
    join public.template_blocks nb on nb.template_id = v_new and nb.position = ob.position
   where te.template_id = p_template_id;

  insert into public.template_exercise_sets (template_exercise_id, template_id, set_type, set_number, target_reps_min,
    target_reps_max, target_duration_sec, target_weight_kg, is_amrap, rest_seconds)
  select nte.id, v_new, s.set_type, s.set_number, s.target_reps_min, s.target_reps_max, s.target_duration_sec,
         s.target_weight_kg, s.is_amrap, s.rest_seconds
    from public.template_exercise_sets s
    join public.template_exercises ote on ote.id = s.template_exercise_id
    join public.template_blocks ob on ob.id = ote.block_id
    join public.template_blocks nb on nb.template_id = v_new and nb.position = ob.position
    join public.template_exercises nte on nte.block_id = nb.id and nte.position_in_block = ote.position_in_block
   where s.template_id = p_template_id;

  return v_new;
end;
$$;

create or replace function public.assign_program(p_program_id uuid, p_client_id uuid, p_starts_on date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_src    public.programs%rowtype;
  v_new_id uuid;
  v_tpl    uuid;
  r        record;
begin
  if (select private.current_app_role()) is distinct from 'pt' or not private.is_active_pt_of(p_client_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_src from public.programs
   where id = p_program_id and owner_id = v_uid and client_id is null and archived_at is null;
  if v_src.id is null then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.program_workouts where program_id = p_program_id) then
    raise exception 'program_empty' using errcode = 'P0001';
  end if;

  update public.programs set status = 'archived', archived_at = now()
   where client_id = p_client_id and status = 'active';

  insert into public.programs (owner_id, client_id, source_program_id, title, description, status, starts_on,
                               duration_weeks, days_per_week)
  values (v_uid, p_client_id, v_src.id, v_src.title, v_src.description, 'active', coalesce(p_starts_on, current_date),
          v_src.duration_weeks, v_src.days_per_week)
  returning id into v_new_id;

  for r in select pw.* from public.program_workouts pw where pw.program_id = p_program_id order by pw.day_order loop
    v_tpl := private.copy_template(r.template_id, p_client_id, v_uid);
    insert into public.program_workouts (program_id, template_id, day_order, day_label)
    values (v_new_id, v_tpl, r.day_order, r.day_label);
  end loop;

  perform private.enqueue_push(p_client_id, 'program_assigned', 'push.program_assigned.title', 'push.program_assigned.body',
    jsonb_build_object('url', '/client', 'program_id', v_new_id));
  perform private.audit('program_assigned', 'programs', v_new_id, p_client_id, jsonb_build_object('source_program_id', v_src.id));
  return jsonb_build_object('program_id', v_new_id);
end;
$$;

create or replace function public.reorder_template_blocks(p_template_id uuid, p_block_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_edit_template(p_template_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(array_length(p_block_ids, 1), 0) <> (select count(*) from public.template_blocks where template_id = p_template_id)
     or (select count(distinct x) from unnest(p_block_ids) x) <> coalesce(array_length(p_block_ids, 1), 0)
     or exists (select 1 from unnest(p_block_ids) x where x not in (select id from public.template_blocks where template_id = p_template_id)) then
    raise exception 'invalid_block_order' using errcode = 'P0001';
  end if;
  update public.template_blocks b
     set position = o.ord
    from unnest(p_block_ids) with ordinality as o(id, ord)
   where b.id = o.id and b.template_id = p_template_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Oturum (C1–C5)
-- ---------------------------------------------------------------------
create or replace function private.build_session_payload(p_workout_log_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'workout', jsonb_build_object(
      'id', wl.id, 'status', wl.status, 'started_at', wl.started_at, 'completed_at', wl.completed_at,
      'local_date', wl.local_date, 'template_id', wl.template_id, 'program_workout_id', wl.program_workout_id,
      'template_title', wl.template_title_snapshot, 'guardrail_enabled', wl.guardrail_enabled,
      'deload_multiplier', wl.deload_multiplier, 'readiness_outcome', wl.readiness_outcome,
      'readiness_score', rl.score, 'pain_regions', coalesce(to_jsonb(rl.pain_regions), '[]'::jsonb),
      'time_crunch_used', wl.time_crunch_used, 'time_budget_min', wl.time_budget_min,
      'water_intake_count', wl.water_intake_count, 'pt_name', ptp.full_name
    ),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'exercise_id', w.exercise_id, 'title', w.exercise_title_snapshot,
        'category', e.category, 'target_muscle', e.target_muscle, 'primary_regions', to_jsonb(e.primary_regions),
        'tracking_type', w.tracking_type, 'load_mode', w.load_mode, 'load_increment_kg', w.load_increment_kg,
        'min_load_kg', e.min_load_kg, 'video_provider', e.video_provider, 'video_id', e.video_id,
        'video_hash', e.video_hash, 'video_start_sec', e.video_start_sec,
        'cues_and_tips', e.cues_and_tips, 'setup_note', n.note,
        'block_index', w.block_index, 'block_type', w.block_type, 'rest_after_round_sec', w.rest_after_round_sec,
        'position', w.position, 'position_in_block', w.position_in_block, 'is_priority', w.is_priority,
        'tolerance_pct', w.tolerance_pct, 'tolerance_abs_kg', w.tolerance_abs_kg,
        'planned_sets', w.planned_sets, 'working_sets_cap', w.working_sets_cap,
        -- Okuma anında hesaplanır (tabloda saklanmaz → PT'ye eşleşme öncesi en iyi sızmaz)
        'best_e1rm_at_start', private.best_e1rm_before(w.user_id, w.exercise_id, wl.started_at, wl.id),
        -- §7.8: planlı ısınma yoksa sunucu önerisi; "kas grubunun ilk hareketi" güncel sıraya (DND/skip) göre
        'warmup_suggestions', case
           when w.tracking_type <> 'weight_reps'
             or exists (select 1 from jsonb_array_elements(w.planned_sets) ps where ps ->> 'set_type' = 'warmup')
             then '[]'::jsonb
           else private.warmup_suggestions(
             (select coalesce((ps ->> 'adjusted_weight_kg')::numeric, (ps ->> 'original_weight_kg')::numeric)
                from jsonb_array_elements(w.planned_sets) ps
               where ps ->> 'set_type' = 'working' and not (ps ->> 'trimmed')::boolean
               order by (ps ->> 'set_number')::integer
               limit 1),
             e.min_load_kg >= 20,
             e.category = 'compound',
             not exists (select 1
                           from public.workout_log_exercises w2
                           join public.exercises e2 on e2.id = w2.exercise_id
                          where w2.workout_log_id = w.workout_log_id
                            and w2.position < w.position
                            and w2.status not in ('skipped', 'time_crunched')
                            and lower(e2.target_muscle) = lower(e.target_muscle)),
             w.load_increment_kg,
             e.min_load_kg)
         end,
        'pain_flag', w.pain_flag,
        'status', w.status, 'skip_reason', w.skip_reason, 'skip_note', w.skip_note,
        'logged_sets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'set_type', s.set_type, 'set_number', s.set_number, 'completion_type', s.completion_type,
            'reps_completed', s.reps_completed, 'weight_kg', s.weight_kg, 'duration_seconds', s.duration_seconds,
            'overload_flag', s.overload_flag, 'estimated_1rm', s.estimated_1rm, 'performed_at', s.performed_at
          ) order by s.set_type, s.set_number)
          from public.set_logs s where s.workout_log_exercise_id = w.id), '[]'::jsonb)
      ) order by w.position)
      from public.workout_log_exercises w
      join public.exercises e on e.id = w.exercise_id
      left join public.user_exercise_notes n on n.user_id = w.user_id and n.exercise_id = w.exercise_id
      where w.workout_log_id = wl.id), '[]'::jsonb)
  )
  from public.workout_logs wl
  left join public.readiness_logs rl on rl.id = wl.readiness_log_id
  left join public.pt_client_pairs p on p.id = wl.pair_id
  left join public.profiles ptp on ptp.id = p.pt_id
  where wl.id = p_workout_log_id;
$$;

create or replace function public.get_session_payload(p_workout_log_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workout_logs where id = p_workout_log_id and user_id = (select auth.uid())) then
    raise exception 'workout_not_found' using errcode = 'P0001';
  end if;
  return private.build_session_payload(p_workout_log_id);
end;
$$;

create or replace function public.start_workout(
  p_workout_log_id uuid,
  p_program_workout_id uuid default null,
  p_template_id uuid default null,
  p_readiness_log_id uuid default null,
  p_deload_choice text default null        -- 'accept' | 'decline' | null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_tpl        public.workout_templates%rowtype;
  v_pw         public.program_workouts%rowtype;
  v_program_id uuid;
  v_pair       public.pt_client_pairs%rowtype;
  v_guardrail  boolean := false;
  v_rl         public.readiness_logs%rowtype;
  v_mode       public.deload_mode;
  v_outcome    public.readiness_outcome;
  v_mult       numeric := 1;
  v_pain       public.body_region[] := '{}';
  v_tz         text;
  v_open_id    uuid;
begin
  if (select private.current_app_role()) is distinct from 'client' then
    raise exception 'client_role_required' using errcode = '42501';
  end if;
  if p_workout_log_id is null then
    raise exception 'workout_id_required' using errcode = 'P0001';
  end if;

  -- İdempotent: aynı id ikinci kez gelirse mevcut payload döner
  if exists (select 1 from public.workout_logs where id = p_workout_log_id and user_id = v_uid) then
    return private.build_session_payload(p_workout_log_id);
  end if;

  select id into v_open_id from public.workout_logs where user_id = v_uid and status = 'in_progress';
  if v_open_id is not null then
    return jsonb_build_object('ok', false, 'error', 'session_in_progress', 'workout_log_id', v_open_id);
  end if;

  if p_program_workout_id is not null then
    select pw.* into v_pw
      from public.program_workouts pw join public.programs pg on pg.id = pw.program_id
     where pw.id = p_program_workout_id and pg.client_id = v_uid and pg.status = 'active';
    if v_pw.id is null then
      raise exception 'program_workout_not_found' using errcode = 'P0001';
    end if;
    v_program_id := v_pw.program_id;
    select * into v_tpl from public.workout_templates where id = v_pw.template_id;
  elsif p_template_id is not null then
    select * into v_tpl from public.workout_templates
     where id = p_template_id and client_id = v_uid and archived_at is null;
  end if;
  if v_tpl.id is null or v_tpl.client_id is distinct from v_uid then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.template_exercises where template_id = v_tpl.id) then
    raise exception 'template_empty' using errcode = 'P0001';
  end if;

  -- Guardrail yalnızca şablon sahibi danışanın AKTİF PT'si ise
  if v_tpl.owner_id is not null and v_tpl.owner_id <> v_uid then
    select * into v_pair from public.pt_client_pairs
     where client_id = v_uid and pt_id = v_tpl.owner_id and status = 'active';
    v_guardrail := v_pair.id is not null;
  end if;

  -- Readiness → deload kararı
  if p_readiness_log_id is not null then
    select * into v_rl from public.readiness_logs
     where id = p_readiness_log_id and user_id = v_uid and checked_in_at > now() - interval '3 hours'
       and not exists (select 1 from public.workout_logs x where x.readiness_log_id = p_readiness_log_id);
    if v_rl.id is null then
      raise exception 'readiness_not_found' using errcode = 'P0001';
    end if;
    v_pain := v_rl.pain_regions;
  end if;

  v_mode := case when v_guardrail then v_pair.deload_mode else 'confirm'::public.deload_mode end;

  if v_rl.id is null then
    v_outcome := 'skipped_checkin';
  elsif v_rl.score >= 60 then
    v_outcome := 'above_threshold';
  elsif v_mode = 'off' then
    v_outcome := 'mode_off';
  elsif v_mode = 'auto' then
    v_outcome := 'auto_applied'; v_mult := 0.85;
  elsif p_deload_choice = 'accept' then
    v_outcome := 'offered_accepted'; v_mult := 0.85;
  elsif p_deload_choice = 'decline' then
    v_outcome := 'offered_declined';
  else
    return jsonb_build_object('ok', false, 'error', 'deload_choice_required', 'readiness_score', v_rl.score);
  end if;

  select timezone into v_tz from public.profiles where id = v_uid;

  insert into public.workout_logs (
    id, user_id, pair_id, program_id, program_workout_id, template_id, template_title_snapshot,
    status, started_at, last_activity_at, local_date, readiness_log_id, readiness_outcome,
    deload_multiplier, guardrail_enabled
  ) values (
    p_workout_log_id, v_uid, v_pair.id, v_program_id, v_pw.id, v_tpl.id, v_tpl.title,
    'in_progress', now(), now(), (now() at time zone coalesce(v_tz, 'Europe/Istanbul'))::date, v_rl.id, v_outcome,
    v_mult, v_guardrail
  );

  with te as (
    select te.id as te_id, te.exercise_id, te.is_priority, te.tolerance_pct, te.tolerance_abs_kg,
           b.position as block_pos, b.block_type, b.rest_after_round_sec, te.position_in_block,
           e.title, e.tracking_type, e.load_mode, e.load_increment_kg, e.min_load_kg, e.primary_regions,
           (select count(*) from public.template_exercise_sets s
             where s.template_exercise_id = te.id and s.set_type = 'working')::integer as n_working
      from public.template_exercises te
      join public.template_blocks b on b.id = te.block_id
      join public.exercises e on e.id = te.exercise_id
     where te.template_id = v_tpl.id
  ), blk as (
    select block_pos, max(n_working) as max_working from te group by block_pos
  ), ordered as (
    select te.*,
           row_number() over (order by te.block_pos, te.position_in_block)::smallint as pos,
           dense_rank() over (order by te.block_pos)::smallint as block_index,
           case when v_mult < 1 then private.deload_keep_sets(blk.max_working) end as keep_working
      from te join blk using (block_pos)
  )
  insert into public.workout_log_exercises (
    workout_log_id, user_id, template_exercise_id, exercise_id, exercise_title_snapshot, tracking_type,
    load_mode, load_increment_kg, block_index, block_type, rest_after_round_sec, position, position_in_block,
    is_priority, tolerance_pct, tolerance_abs_kg, planned_sets, pain_flag
  )
  select
    p_workout_log_id, v_uid, o.te_id, o.exercise_id, o.title, o.tracking_type,
    o.load_mode, o.load_increment_kg, o.block_index, o.block_type, o.rest_after_round_sec, o.pos, o.position_in_block,
    o.is_priority,
    case when v_guardrail then coalesce(o.tolerance_pct, v_tpl.tolerance_pct) end,
    case when v_guardrail then coalesce(o.tolerance_abs_kg, v_tpl.tolerance_abs_kg) end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'set_type', s.set_type,
        'set_number', s.set_number,
        'reps_min', s.target_reps_min,
        'reps_max', s.target_reps_max,
        'duration_sec', s.target_duration_sec,
        'is_amrap', s.is_amrap,
        'original_weight_kg', s.target_weight_kg,
        'adjusted_weight_kg', case when v_mult < 1 and o.tracking_type = 'weight_reps' and s.target_weight_kg is not null
                                   then private.deload_weight(s.target_weight_kg, o.load_increment_kg, o.min_load_kg) end,
        -- Tek kural (§4.6/§7.7): ısınma null→60 (single ve süperset); single çalışma null→90; süperset çalışma 0 (tur dinlenmesi bloktan)
        'rest_seconds', case when s.set_type = 'warmup' then coalesce(s.rest_seconds, 60)
                             when o.block_type = 'single' then coalesce(s.rest_seconds, 90)
                             else 0 end,
        'trimmed', (o.keep_working is not null and s.set_type = 'working' and s.set_number > o.keep_working)
      ) order by s.set_type, s.set_number)
      from public.template_exercise_sets s where s.template_exercise_id = o.te_id
    ), '[]'::jsonb),
    (o.primary_regions && v_pain)
  from ordered o;

  return private.build_session_payload(p_workout_log_id);
end;
$$;

create or replace function public.reorder_session_exercises(p_workout_log_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not private.workout_is_in_progress(p_workout_log_id) then
    raise exception 'workout_not_in_progress' using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.workout_log_exercises where workout_log_id = p_workout_log_id;
  if coalesce(array_length(p_ids, 1), 0) <> v_n
     or (select count(distinct x) from unnest(p_ids) x) <> v_n
     or exists (select 1 from unnest(p_ids) x
                 where x not in (select id from public.workout_log_exercises where workout_log_id = p_workout_log_id)) then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  -- Tamamlanmış egzersizler yerinde kalır
  if exists (
    select 1
      from public.workout_log_exercises w
      join unnest(p_ids) with ordinality as o(id, ord) on o.id = w.id
     where w.workout_log_id = p_workout_log_id and w.status = 'done' and w.position <> o.ord
  ) then
    raise exception 'done_exercise_locked' using errcode = 'P0001';
  end if;

  -- Süperset/blok üyeleri bitişik kalmalı
  if exists (
    select 1
      from public.workout_log_exercises w
      join unnest(p_ids) with ordinality as o(id, ord) on o.id = w.id
     where w.workout_log_id = p_workout_log_id
     group by w.block_index
    having max(o.ord) - min(o.ord) + 1 <> count(*)
  ) then
    raise exception 'block_split_not_allowed' using errcode = 'P0001';
  end if;

  with n as (
    select w.id, w.block_index, o.ord::smallint as new_pos
      from public.workout_log_exercises w
      join unnest(p_ids) with ordinality as o(id, ord) on o.id = w.id
     where w.workout_log_id = p_workout_log_id
  ), m as (
    select block_index, min(new_pos) as min_pos from n group by block_index
  ), x as (
    select n.id, n.new_pos,
           dense_rank() over (order by m.min_pos)::smallint as new_block,
           row_number() over (partition by n.block_index order by n.new_pos)::smallint as new_pib
      from n join m using (block_index)
  )
  update public.workout_log_exercises w
     set position = x.new_pos,
         block_index = x.new_block,
         position_in_block = x.new_pib,
         client_updated_at = now()
    from x
   where w.id = x.id;

  return private.build_session_payload(p_workout_log_id);
end;
$$;

create or replace function public.apply_time_crunch(p_workout_log_id uuid, p_enable boolean, p_budget_min smallint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.workout_is_in_progress(p_workout_log_id) then
    raise exception 'workout_not_in_progress' using errcode = 'P0001';
  end if;

  update public.workout_logs
     set time_crunch_used = p_enable or time_crunch_used,
         time_budget_min = case when p_enable then p_budget_min else time_budget_min end
   where id = p_workout_log_id;

  if p_enable then
    update public.workout_log_exercises w
       set status = 'time_crunched', client_updated_at = now()
     where w.workout_log_id = p_workout_log_id
       and w.status = 'planned'
       and not exists (
         select 1 from public.workout_log_exercises x
          where x.workout_log_id = w.workout_log_id and x.block_index = w.block_index and x.is_priority);
  else
    update public.workout_log_exercises
       set status = 'planned', working_sets_cap = null, client_updated_at = now()
     where workout_log_id = p_workout_log_id and status = 'time_crunched';
  end if;

  return private.build_session_payload(p_workout_log_id);
end;
$$;

create or replace function private.compute_pr_events(p_workout_log_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wl    public.workout_logs%rowtype;
  v_count integer := 0;
begin
  select * into v_wl from public.workout_logs where id = p_workout_log_id and status = 'completed';
  if v_wl.id is null then
    return 0;
  end if;

  with session_best as (
    select distinct on (s.exercise_id) s.exercise_id, s.id as set_log_id, s.estimated_1rm, s.performed_at, w.exercise_title_snapshot
      from public.set_logs s
      join public.workout_log_exercises w on w.id = s.workout_log_exercise_id
     where s.workout_log_id = p_workout_log_id
       and s.estimated_1rm is not null
       and (not s.overload_flag or s.pt_reviewed_at is not null)
     order by s.exercise_id, s.estimated_1rm desc, s.performed_at asc
  ), baseline as (
    select sb.exercise_id, max(s.estimated_1rm) as best
      from session_best sb
      join public.set_logs s on s.user_id = v_wl.user_id and s.exercise_id = sb.exercise_id
      join public.workout_logs wl on wl.id = s.workout_log_id
     where wl.status = 'completed' and wl.id <> p_workout_log_id and wl.started_at < v_wl.started_at
       and s.estimated_1rm is not null
       and (not s.overload_flag or s.pt_reviewed_at is not null)
     group by sb.exercise_id
  ), ins as (
    insert into public.pr_events (user_id, exercise_id, workout_log_id, set_log_id, exercise_title_snapshot,
                                  estimated_1rm, achieved_at)
    select v_wl.user_id, sb.exercise_id, p_workout_log_id, sb.set_log_id, sb.exercise_title_snapshot,
           sb.estimated_1rm, sb.performed_at
      from session_best sb join baseline b using (exercise_id)
     where sb.estimated_1rm > b.best
    on conflict (workout_log_id, exercise_id) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Analitik view'lar (RLS'e tabi: security_invoker)
-- ---------------------------------------------------------------------
create or replace view public.session_volume with (security_invoker = true) as
select
  wl.id as workout_log_id,
  wl.user_id,
  wl.local_date,
  wl.status,
  coalesce(sum(s.reps_completed * s.weight_kg * case when w.load_mode = 'per_side' then 2 else 1 end)
    filter (where s.set_type = 'working' and s.completion_type <> 'failed' and w.tracking_type = 'weight_reps'
                  and s.reps_completed >= 1 and s.weight_kg is not null), 0)::numeric(12,2) as tonnage_kg,
  count(s.id) filter (where s.set_type = 'working' and s.completion_type <> 'failed'
                        and coalesce(s.reps_completed, 1) >= 1)::integer as hard_sets,
  count(s.id) filter (where s.overload_flag and s.pt_reviewed_at is null)::integer as unreviewed_overload_sets
from public.workout_logs wl
left join public.set_logs s on s.workout_log_id = wl.id
left join public.workout_log_exercises w on w.id = s.workout_log_exercise_id
group by wl.id, wl.user_id, wl.local_date, wl.status;

create or replace view public.weekly_client_load with (security_invoker = true) as
with v as (
  select user_id, private.iso_week_start(local_date) as week_start,
         sum(tonnage_kg)::numeric(14,2) as tonnage_kg, sum(hard_sets)::integer as hard_sets, count(*)::integer as session_count
    from public.session_volume
   where status = 'completed'
   group by 1, 2
), r as (
  select user_id, private.iso_week_start(local_date) as week_start,
         round(avg(score), 1) as avg_readiness, count(*)::integer as checkin_count
    from public.readiness_logs
   group by 1, 2
)
select coalesce(v.user_id, r.user_id) as user_id,
       coalesce(v.week_start, r.week_start) as week_start,
       coalesce(v.tonnage_kg, 0) as tonnage_kg,
       coalesce(v.hard_sets, 0) as hard_sets,
       coalesce(v.session_count, 0) as session_count,
       r.avg_readiness,
       coalesce(r.checkin_count, 0) as checkin_count
  from v full join r on r.user_id = v.user_id and r.week_start = v.week_start;

grant execute on function private.iso_week_start(date) to authenticated;
grant select on public.session_volume, public.weekly_client_load to authenticated;

-- C1 "Son Ölçüm Değişimleri": tip + taraf başına son iki ölçüm ve fark. security_invoker → RLS'e tabi
-- (PT yalnızca data_visible_from sonrası / kendi girdiği oturumları görür).
create or replace view public.measurement_latest_deltas with (security_invoker = true) as
with ranked as (
  select m.client_id, m.type_code, m.side, m.value, s.measured_at,
         row_number() over (partition by m.client_id, m.type_code, m.side
                            order by s.measured_at desc, m.created_at desc) as rn
    from public.measurements m
    join public.measurement_sessions s on s.id = m.session_id
)
select cur.client_id, cur.type_code, cur.side,
       cur.value as latest_value, cur.measured_at as latest_measured_at,
       prev.value as previous_value, prev.measured_at as previous_measured_at,
       case when prev.value is not null then cur.value - prev.value end as delta
  from ranked cur
  left join ranked prev
    on prev.client_id = cur.client_id and prev.type_code = cur.type_code
   and prev.side is not distinct from cur.side and prev.rn = 2
 where cur.rn = 1;

grant select on public.measurement_latest_deltas to authenticated;

create or replace function private.session_summary(p_workout_log_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'workout_log_id', wl.id,
    'status', wl.status,
    'duration_sec', extract(epoch from (coalesce(wl.completed_at, now()) - wl.started_at))::integer,
    'tonnage_kg', sv.tonnage_kg,
    'hard_sets', sv.hard_sets,
    'prs', coalesce((select jsonb_agg(jsonb_build_object('exercise_id', pe.exercise_id, 'title', pe.exercise_title_snapshot,
                       'estimated_1rm', pe.estimated_1rm,
                       'previous_best_e1rm', private.best_e1rm_before(wl.user_id, pe.exercise_id, wl.started_at, wl.id)))
                     from public.pr_events pe where pe.workout_log_id = wl.id), '[]'::jsonb),
    'first_records', coalesce((
      select jsonb_agg(x.exercise_id)
        from (select distinct s.exercise_id
                from public.set_logs s
               where s.workout_log_id = wl.id and s.estimated_1rm is not null
                 and (not s.overload_flag or s.pt_reviewed_at is not null)) x
       where private.best_e1rm_before(wl.user_id, x.exercise_id, wl.started_at, wl.id) is null), '[]'::jsonb)
  )
  from public.workout_logs wl
  join public.session_volume sv on sv.workout_log_id = wl.id
  where wl.id = p_workout_log_id;
$$;

create or replace function public.complete_workout(
  p_workout_log_id uuid,
  p_session_rpe smallint default null,
  p_end_energy public.end_energy default null,
  p_water_intake_count smallint default null,
  p_completed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_wl  public.workout_logs%rowtype;
begin
  select * into v_wl from public.workout_logs where id = p_workout_log_id and user_id = v_uid for update;
  if v_wl.id is null then
    raise exception 'workout_not_found' using errcode = 'P0001';
  end if;
  if v_wl.status = 'abandoned' and not v_wl.auto_closed then
    raise exception 'workout_abandoned' using errcode = 'P0001';
  end if;
  -- Çalışma seti olmayan oturum tamamlanamaz (close_stale_workouts ile aynı kural; §6.3). İstemci C5'te
  -- "Antrenmanı iptal et" (abandon_workout) sunar. Zaten completed ise idempotent özet döner.
  if v_wl.status <> 'completed'
     and not exists (select 1 from public.set_logs s where s.workout_log_id = p_workout_log_id and s.set_type = 'working') then
    raise exception 'nothing_logged' using errcode = 'P0001';
  end if;

  update public.workout_logs
     set status = 'completed',
         completed_at = case when status = 'completed' then completed_at
                             else least(greatest(coalesce(p_completed_at, now()), started_at, last_activity_at), now()) end,
         session_rpe = coalesce(p_session_rpe, session_rpe),
         end_energy = coalesce(p_end_energy, end_energy),
         water_intake_count = coalesce(p_water_intake_count, water_intake_count),
         client_updated_at = now()
   where id = p_workout_log_id;

  perform private.compute_pr_events(p_workout_log_id);
  return private.session_summary(p_workout_log_id);
end;
$$;

create or replace function public.abandon_workout(p_workout_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  r     record;
begin
  update public.workout_logs set status = 'abandoned', client_updated_at = now()
   where id = p_workout_log_id and user_id = v_uid and status = 'in_progress';
  if not found then
    raise exception 'workout_not_in_progress' using errcode = 'P0001';
  end if;
  -- İptal edilen oturumun setleri exercise_bests'ten düşmeli (recompute abandoned oturumları hariç tutar)
  for r in select distinct s.exercise_id from public.set_logs s
            where s.workout_log_id = p_workout_log_id and s.estimated_1rm is not null loop
    perform private.recompute_exercise_best(v_uid, r.exercise_id);
  end loop;
end;
$$;

create or replace function public.get_client_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_tz    text;
  v_today date;
  v_prog  public.programs%rowtype;
  v_pair  public.pt_client_pairs%rowtype;
  v_next  jsonb;
  v_last_order smallint;
  v_days  integer;
begin
  select timezone into v_tz from public.profiles where id = v_uid;
  v_today := (now() at time zone coalesce(v_tz, 'Europe/Istanbul'))::date;
  select * into v_prog from public.programs where client_id = v_uid and status = 'active';
  select * into v_pair from public.pt_client_pairs where client_id = v_uid and status = 'active';

  if v_prog.id is not null then
    select pw.day_order into v_last_order
      from public.workout_logs wl join public.program_workouts pw on pw.id = wl.program_workout_id
     where wl.user_id = v_uid and wl.program_id = v_prog.id and wl.status = 'completed'
     order by wl.started_at desc limit 1;

    select jsonb_build_object('program_workout_id', pw.id, 'template_id', pw.template_id, 'title', t.title,
                              'day_order', pw.day_order, 'day_label', pw.day_label,
                              'exercise_count', (select count(*) from public.template_exercises te where te.template_id = t.id))
      into v_next
      from public.program_workouts pw join public.workout_templates t on t.id = pw.template_id
     where pw.program_id = v_prog.id
     order by (pw.day_order <= coalesce(v_last_order, 0)), pw.day_order
     limit 1;
    select count(*)::integer into v_days from public.program_workouts where program_id = v_prog.id;
  end if;

  return jsonb_build_object(
    'today', v_today,
    'in_progress', (select jsonb_build_object('workout_log_id', wl.id, 'started_at', wl.started_at, 'title', wl.template_title_snapshot,
                                              'last_activity_at', wl.last_activity_at)
                      from public.workout_logs wl where wl.user_id = v_uid and wl.status = 'in_progress'),
    'program', case when v_prog.id is null then null else jsonb_build_object(
                 'id', v_prog.id, 'title', v_prog.title, 'is_pt_assigned', v_prog.owner_id is distinct from v_uid,
                 'starts_on', v_prog.starts_on, 'duration_weeks', v_prog.duration_weeks, 'days_per_week', v_prog.days_per_week,
                 'week_index', case when v_prog.starts_on is not null and v_today >= v_prog.starts_on
                                    then ((v_today - v_prog.starts_on) / 7) + 1 end,
                 'block_completed', coalesce(v_prog.duration_weeks is not null and v_prog.starts_on is not null
                                             and v_today >= v_prog.starts_on + v_prog.duration_weeks * 7, false),
                 -- leave_program() yalnızca programın sahibi aktif PT DEĞİLSE izinli (§6.3)
                 'can_leave', v_prog.owner_id is null or v_prog.owner_id = v_uid
                              or v_pair.pt_id is distinct from v_prog.owner_id) end,
    'weekly_target', coalesce(v_prog.days_per_week, nullif(v_days, 0), 2),
    'next_workout', v_next,
    'completed_today', exists (select 1 from public.workout_logs wl where wl.user_id = v_uid and wl.status = 'completed' and wl.local_date = v_today),
    'pair', case when v_pair.id is null then null else jsonb_build_object(
              'pair_id', v_pair.id, 'deload_mode', v_pair.deload_mode,
              'pt_name', (select full_name from public.profiles where id = v_pair.pt_id)) end,
    'has_health_consent', (select private.has_active_consent('health_data')),
    'radar_card', (select jsonb_build_object('week_start', r.week_start, 'metrics', r.metrics)
                     from public.radar_evaluations r
                    where r.client_id = v_uid and r.result = 'triggered' and r.dismissed_at is null
                      and r.week_start >= v_today - 14
                    order by r.week_start desc limit 1)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Alarm aksiyonları (PT)
-- ---------------------------------------------------------------------
create or replace function public.mark_alerts_read(p_alert_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.pt_alerts set read_at = coalesce(read_at, now())
   where id = any(p_alert_ids) and pt_id = (select auth.uid())
     and pair_id in (select private.my_active_pair_ids());
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.resolve_alert(
  p_alert_id uuid,
  p_action text,                 -- 'acknowledge' | 'approve_set' | 'update_target'
  p_new_target_kg numeric default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_alert public.pt_alerts%rowtype;
  v_te_id uuid;
begin
  select a.* into v_alert from public.pt_alerts a
   where a.id = p_alert_id and a.pt_id = v_uid and a.pair_id in (select private.my_active_pair_ids())
   for update;
  if v_alert.id is null then
    raise exception 'alert_not_found' using errcode = 'P0001';
  end if;

  if p_action = 'acknowledge' then
    update public.pt_alerts
       set status = 'acknowledged', read_at = coalesce(read_at, now()), resolution = 'acknowledged',
           resolution_note = left(p_note, 280)
     where id = p_alert_id;
    return;
  end if;

  if v_alert.alert_type <> 'OVERLOAD_RISK' or v_alert.workout_log_exercise_id is null then
    raise exception 'action_not_supported' using errcode = 'P0001';
  end if;

  update public.set_logs set pt_reviewed_at = now()
   where workout_log_exercise_id = v_alert.workout_log_exercise_id and overload_flag and pt_reviewed_at is null;

  if p_action = 'approve_set' then
    update public.pt_alerts
       set status = 'resolved', resolved_at = now(), read_at = coalesce(read_at, now()),
           resolution = 'set_approved', resolution_note = left(p_note, 280)
     where id = p_alert_id;
  elsif p_action = 'update_target' then
    if p_new_target_kg is null or p_new_target_kg <= 0 or p_new_target_kg > 999.99
       or p_new_target_kg * 4 <> trunc(p_new_target_kg * 4) then
      raise exception 'invalid_target' using errcode = 'P0001';
    end if;
    select w.template_exercise_id into v_te_id from public.workout_log_exercises w where w.id = v_alert.workout_log_exercise_id;
    update public.template_exercise_sets s
       set target_weight_kg = p_new_target_kg
      from public.template_exercises te
      join public.workout_templates t on t.id = te.template_id
     where s.template_exercise_id = te.id and te.id = v_te_id and s.set_type = 'working'
       and t.client_id = v_alert.client_id and t.owner_id = v_uid;
    if not found then
      raise exception 'template_not_editable' using errcode = 'P0001';
    end if;
    update public.pt_alerts
       set status = 'resolved', resolved_at = now(), read_at = coalesce(read_at, now()),
           resolution = 'target_updated', resolution_note = left(p_note, 280),
           payload = payload || jsonb_build_object('new_target_kg', p_new_target_kg)
     where id = p_alert_id;
    perform private.enqueue_push(v_alert.client_id, 'program_updated', 'push.program_updated.title', 'push.program_updated.body',
      jsonb_build_object('url', '/client'));
  else
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;

  perform private.audit('alert_resolved', 'pt_alerts', p_alert_id, v_alert.client_id, jsonb_build_object('action', p_action));
end;
$$;

-- ---------------------------------------------------------------------
-- Push token
-- ---------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform public.push_platform, p_device_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.push_tokens (user_id, expo_push_token, platform, device_id, last_seen_at)
  values (v_uid, p_token, p_platform, left(p_device_id, 128), now())
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, device_id = excluded.device_id, last_seen_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where expo_push_token = p_token and user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Program bırakma (eşleşme bitince / PT hesabı silinince danışanda kalan program; §6.3 ürün kararı)
-- ---------------------------------------------------------------------
create or replace function public.leave_program(p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_prog public.programs%rowtype;
begin
  select * into v_prog from public.programs
   where id = p_program_id and client_id = v_uid and status = 'active'
   for update;
  if v_prog.id is null then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;
  if v_prog.owner_id is not null and v_prog.owner_id <> v_uid
     and exists (select 1 from public.pt_client_pairs p
                  where p.client_id = v_uid and p.pt_id = v_prog.owner_id and p.status = 'active') then
    raise exception 'program_managed_by_pt' using errcode = 'P0001';
  end if;
  update public.programs set status = 'archived', archived_at = now() where id = p_program_id;
  perform private.audit('program_left', 'programs', p_program_id, v_uid, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- Super Admin içerik hattı: sistem şablonu kopyalama, global kütüphane önerisi (§6.8)
-- ---------------------------------------------------------------------
create or replace function public.clone_system_template(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_new uuid;
begin
  if (select private.current_app_role()) is distinct from 'pt' then
    raise exception 'pt_role_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workout_templates where id = p_template_id and is_system and archived_at is null) then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  v_new := private.copy_template(p_template_id, null, v_uid);
  perform private.audit('system_template_cloned', 'workout_templates', v_new, null,
                        jsonb_build_object('source_template_id', p_template_id));
  return jsonb_build_object('template_id', v_new);
end;
$$;

create or replace function public.suggest_exercise_to_global(p_exercise_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ex  public.exercises%rowtype;
  v_id  uuid;
begin
  if (select private.current_app_role()) is distinct from 'pt' then
    raise exception 'pt_role_required' using errcode = '42501';
  end if;
  select * into v_ex from public.exercises
   where id = p_exercise_id and scope = 'custom' and owner_id = v_uid and archived_at is null;
  if v_ex.id is null then
    raise exception 'exercise_not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.exercise_suggestions
       where suggested_by = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_suggestions' using errcode = 'P0001';
  end if;
  begin
    insert into public.exercise_suggestions (exercise_id, suggested_by, exercise_snapshot, note)
    values (v_ex.id, v_uid,
            jsonb_build_object(
              'title', v_ex.title, 'category', v_ex.category, 'target_muscle', v_ex.target_muscle,
              'primary_regions', to_jsonb(v_ex.primary_regions), 'tracking_type', v_ex.tracking_type,
              'load_mode', v_ex.load_mode, 'load_increment_kg', v_ex.load_increment_kg, 'min_load_kg', v_ex.min_load_kg,
              'video_provider', v_ex.video_provider, 'video_id', v_ex.video_id, 'video_hash', v_ex.video_hash,
              'video_start_sec', v_ex.video_start_sec, 'cues_and_tips', v_ex.cues_and_tips),
            left(nullif(btrim(p_note), ''), 500))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'suggestion_pending' using errcode = 'P0001';
  end;
  perform private.audit('exercise_suggested', 'exercise_suggestions', v_id, null, jsonb_build_object('exercise_id', v_ex.id));
  return jsonb_build_object('suggestion_id', v_id);
end;
$$;

-- Yalnızca içerik hattı (migration / SQL editor, postgres) çağırır; istemciye ve service_role'e KAPALI
create or replace function private.review_exercise_suggestion(p_suggestion_id uuid, p_accept boolean, p_review_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s   public.exercise_suggestions%rowtype;
  v_new uuid;
begin
  select * into v_s from public.exercise_suggestions where id = p_suggestion_id and status = 'pending' for update;
  if v_s.id is null then
    raise exception 'suggestion_not_found' using errcode = 'P0001';
  end if;
  if p_accept then
    insert into public.exercises (scope, owner_id, title, category, target_muscle, primary_regions, tracking_type, load_mode,
                                  load_increment_kg, min_load_kg, video_provider, video_id, video_hash, video_start_sec, cues_and_tips)
    select 'global', null, x.s ->> 'title', (x.s ->> 'category')::public.exercise_category, x.s ->> 'target_muscle',
           array(select jsonb_array_elements_text(x.s -> 'primary_regions'))::public.body_region[],
           (x.s ->> 'tracking_type')::public.tracking_type, (x.s ->> 'load_mode')::public.load_mode,
           (x.s ->> 'load_increment_kg')::numeric, (x.s ->> 'min_load_kg')::numeric,
           (x.s ->> 'video_provider')::public.video_provider, x.s ->> 'video_id', x.s ->> 'video_hash',
           (x.s ->> 'video_start_sec')::integer, x.s ->> 'cues_and_tips'
      from (select v_s.exercise_snapshot as s) x
    returning id into v_new;
  end if;
  update public.exercise_suggestions
     set status = (case when p_accept then 'accepted' else 'rejected' end)::public.suggestion_status,
         reviewed_at = now(), review_note = left(p_review_note, 500)
   where id = p_suggestion_id;
  perform private.audit(case when p_accept then 'exercise_suggestion_accepted' else 'exercise_suggestion_rejected' end,
                        'exercise_suggestions', p_suggestion_id, null, jsonb_build_object('global_exercise_id', v_new));
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- Kendi profili (telefon/saat dilimi/e-posta dahil) — profiles kolon yetkisi bunları karşı tarafa kapatır
-- ---------------------------------------------------------------------
create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'role', p.role, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
                            'phone_e164', p.phone_e164, 'timezone', p.timezone, 'onboarded_at', p.onboarded_at,
                            'email', u.email)
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Hesap silme hazırlığı (yalnızca service_role / delete-account Edge Function)
-- Özel egzersizler BURADA SİLİNMEZ: exercises.owner_id ON DELETE SET NULL; kullanıcının kendi şablon/log
-- satırları deleteUser CASCADE'i ile gider; hiçbir yerde kullanılmayan sahipsiz egzersizleri daily_cleanup siler.
-- (Önceki sürüm burada DELETE deniyordu; kullanıcının KENDİ referansları henüz silinmediği için 23503 ile
-- hesap silmeyi kilitliyordu — §11.3'te özel egzersizli PT ve danışan senaryolarıyla test edilir.)
-- ---------------------------------------------------------------------
create or replace function public.admin_prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pairs integer; v_programs integer; v_templates integer;
begin
  update public.pt_client_pairs
     set status = 'ended', ended_at = now(), ended_by = p_user_id, end_reason = 'account_deleted'
   where status = 'active' and (pt_id = p_user_id or client_id = p_user_id);
  get diagnostics v_pairs = row_count;

  update public.pairing_invites set revoked_at = now()
   where pt_id = p_user_id and redeemed_at is null and revoked_at is null;

  delete from public.programs where owner_id = p_user_id and client_id is null;
  get diagnostics v_programs = row_count;

  delete from public.workout_templates t
   where t.owner_id = p_user_id and t.client_id is null
     and not exists (select 1 from public.program_workouts pw where pw.template_id = t.id);
  get diagnostics v_templates = row_count;

  delete from public.push_tokens where user_id = p_user_id;

  insert into private.audit_log (actor_id, action, table_name, row_id, details)
  values (null, 'account_deletion_prepared', 'auth.users', p_user_id,
          jsonb_build_object('pairs_ended', v_pairs, 'library_programs_deleted', v_programs,
                             'library_templates_deleted', v_templates));

  return jsonb_build_object('pairs_ended', v_pairs, 'library_programs_deleted', v_programs,
                            'library_templates_deleted', v_templates);
end;
$$;

-- Edge Function audit kaydı (review-login, delete-account). PII YAZILMAZ (e-posta, IP, gövde yok).
create or replace function public.admin_audit_event(p_action text, p_actor_id uuid default null, p_row_id uuid default null,
                                                    p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action is null or p_action !~ '^[a-z][a-z0-9_]{2,60}$' then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  insert into private.audit_log (actor_id, action, table_name, row_id, details)
  values (p_actor_id, p_action, 'edge_function', p_row_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------
-- RPC EXECUTE yetkileri
-- ---------------------------------------------------------------------
revoke execute on function
  public.complete_onboarding(public.app_role, text, text, text, boolean, text),
  public.set_my_timezone(text),
  public.grant_health_consent(text),
  public.accept_document_versions(text, text),
  public.create_pairing_invite(),
  public.revoke_pairing_invite(uuid),
  public.preview_pairing_invite(text),
  public.redeem_pairing_invite(text, text, boolean),
  public.end_pairing(uuid, text),
  public.withdraw_consent(public.consent_type),
  public.set_pair_deload_mode(uuid, public.deload_mode),
  public.get_client_contact(uuid),
  public.assign_program(uuid, uuid, date),
  public.reorder_template_blocks(uuid, uuid[]),
  public.get_session_payload(uuid),
  public.start_workout(uuid, uuid, uuid, uuid, text),
  public.reorder_session_exercises(uuid, uuid[]),
  public.apply_time_crunch(uuid, boolean, smallint),
  public.complete_workout(uuid, smallint, public.end_energy, smallint, timestamptz),
  public.abandon_workout(uuid),
  public.get_client_home(),
  public.mark_alerts_read(uuid[]),
  public.resolve_alert(uuid, text, numeric, text),
  public.register_push_token(text, public.push_platform, text),
  public.unregister_push_token(text),
  public.leave_program(uuid),
  public.clone_system_template(uuid),
  public.suggest_exercise_to_global(uuid, text),
  public.get_my_profile(),
  public.admin_prepare_account_deletion(uuid),
  public.admin_audit_event(text, uuid, uuid, jsonb)
from public, anon;

grant execute on function
  public.complete_onboarding(public.app_role, text, text, text, boolean, text),
  public.set_my_timezone(text),
  public.grant_health_consent(text),
  public.accept_document_versions(text, text),
  public.create_pairing_invite(),
  public.revoke_pairing_invite(uuid),
  public.preview_pairing_invite(text),
  public.redeem_pairing_invite(text, text, boolean),
  public.end_pairing(uuid, text),
  public.withdraw_consent(public.consent_type),
  public.set_pair_deload_mode(uuid, public.deload_mode),
  public.get_client_contact(uuid),
  public.assign_program(uuid, uuid, date),
  public.reorder_template_blocks(uuid, uuid[]),
  public.get_session_payload(uuid),
  public.start_workout(uuid, uuid, uuid, uuid, text),
  public.reorder_session_exercises(uuid, uuid[]),
  public.apply_time_crunch(uuid, boolean, smallint),
  public.complete_workout(uuid, smallint, public.end_energy, smallint, timestamptz),
  public.abandon_workout(uuid),
  public.get_client_home(),
  public.mark_alerts_read(uuid[]),
  public.resolve_alert(uuid, text, numeric, text),
  public.register_push_token(text, public.push_platform, text),
  public.unregister_push_token(text),
  public.leave_program(uuid),
  public.clone_system_template(uuid),
  public.suggest_exercise_to_global(uuid, text),
  public.get_my_profile()
to authenticated;

revoke execute on function public.admin_prepare_account_deletion(uuid), public.admin_audit_event(text, uuid, uuid, jsonb) from authenticated;
grant execute on function public.admin_prepare_account_deletion(uuid), public.admin_audit_event(text, uuid, uuid, jsonb) to service_role;
revoke all on function private.review_exercise_suggestion(uuid, boolean, text) from public, anon, authenticated, service_role;
```

### 5.6 Anahtarlar ve sırlar

- İstemci yalnızca `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `EXPO_PUBLIC_` önekli değişkende secret YASAK.
- CI: `npx expo export --platform all` sonrası `grep -rE 'sb_secret_[A-Za-z0-9]|eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' dist/` eşleşirse build FAIL; `gitleaks` pre-commit + CI.
- Hosted projede legacy JWT tabanlı `anon`/`service_role` anahtarları devre dışı bırakılır.
- Edge Function'lar: kullanıcı çağrılı `delete-account` → `verify_jwt=true` + fonksiyon içinde `getClaims`; `send-push` → `verify_jwt=false` + `x-push-worker-secret` sabit zamanlı karşılaştırma (secret eksik/< 32 karakter → 503; boş header → 401; fail-closed); `review-login` → `verify_jwt=false` + passcode (≥ 32, fail-closed) + allowlist + rate limit + feature flag + audit.

### 5.7 Video / WebView güvenliği

- Şema yalnızca `video_provider ('youtube'|'vimeo') + video_id` saklar; liste dışı (unlisted) Vimeo için `video_hash` (`^[0-9a-f]{10}$`), başlangıç saniyesi için `video_start_sec` (0–21600) — hepsi CHECK'li. Serbest URL YASAK; P5 formu yapıştırılan linki istemcide `parseVideoUrl()` ile ayrıştırır (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `t=`/`start=`, `vimeo.com/<id>[/<hash>]`, `player.vimeo.com/video/<id>?h=<hash>#t=<s>s`; §7.10).
- Oynatıcı: C4'te inline WebView mount EDİLMEZ; `https://i.ytimg.com/vi/<id>/hqdefault.jpg` küçük görseli `expo-image` (disk cache) ile gösterilir; dokununca modal. Modal içinde `react-native-webview`:
  - `source={{ html: playerHtml(video), baseUrl: 'https://pulsecoach.app' }}`; iframe `src` = `https://www.youtube-nocookie.com/embed/<id>?playsinline=1&rel=0[&start=<s>]` veya `https://player.vimeo.com/video/<id>?playsinline=1[&h=<hash>][#t=<s>s]`, `referrerpolicy="strict-origin-when-cross-origin"`, `allow="encrypted-media; picture-in-picture; fullscreen"`.
  - **Navigasyon kuralı (ZORUNLU).** `react-native-webview` 13.16.1 kaynağında doğrulandı: `originWhitelist` kontrolü her `onShouldStartLoadWithRequest` olayında — iOS'ta **alt çerçeve** navigasyonları dahil — kullanıcı handler'ından ÖNCE uygulanır; eşleşmeyen URL `Linking.openURL` ile sistem tarayıcısında açılır ve yükleme iptal edilir (`about:blank` her zaman izinli). Dar bir whitelist bu yüzden YouTube/Vimeo oynatıcısının iç çerçevelerini (consent, hesap, reCAPTCHA sayfaları) kırar veya oynatma sırasında beklenmedik biçimde tarayıcı açar. Android'de olay yalnızca üst çerçeve için üretilir (`isTopFrame` her zaman `true`); iOS'ta alt çerçeveler `isTopFrame: false` gelir. Kural:

```tsx
// src/features/video/ExerciseVideoModal.native.tsx (özet)
const TOP_FRAME_HOSTS = new Set(['pulsecoach.app']);
<WebView
  source={{ html: playerHtml(video), baseUrl: 'https://pulsecoach.app' }}
  originWhitelist={['https://*']}                       // alt çerçeveleri kütüphane seviyesinde KESME
  onShouldStartLoadWithRequest={(req) => {
    if (!req.isTopFrame || req.url === 'about:blank') return true;          // oynatıcı iç çerçeveleri serbest
    if (TOP_FRAME_HOSTS.has(hostOf(req.url))) return true;                  // hostOf: src/domain/video-url.ts (regex; RN URL polyfill'ine güvenme)
    void WebBrowser.openBrowserAsync(req.url);                              // üst çerçevede izinsiz host → uygulama içi tarayıcı
    return false;
  }}
  onOpenWindow={(e) => { void WebBrowser.openBrowserAsync(e.nativeEvent.targetUrl); }}   // target=_blank ("YouTube'da izle")
  allowsInlineMediaPlayback
  allowsFullscreenVideo
  javaScriptCanOpenWindowsAutomatically={false}
/>
```

  - `onMessage` / `injectedJavaScript` YASAK.
  - Oynatılamazsa / çevrimdışı: "Video için bağlantı gerekli" + "YouTube'da aç" / "Vimeo'da aç" + `cues_and_tips` düz `Text`.
- Web: `ExerciseVideo.web.tsx` düz `<iframe>`. Release checklist: iOS + Android gerçek cihazda YouTube (Error 153 yok, consent çerçevesi açılabiliyor, oynatma sırasında harici tarayıcı açılmıyor, "YouTube'da izle" uygulama içi tarayıcıda açılıyor) ve Vimeo (herkese açık + liste dışı `h=`) smoke testi.

### 5.8 Audit, telemetri, log

- `private.audit_log`: onboarding, davet oluşturma, eşleşme aktivasyonu/sonlandırma, program atama, alarm çözümü, ölçüm oturumu I/U/D (not **içeriği değil**, yalnızca "değişti" bayrağı), hesap silme hazırlığı, program bırakma, sistem şablonu kopyalama, egzersiz önerisi ve incelemesi, `review_login_success` / `review_login_failed` (neden kodu; e-posta/IP yok), `apple_revoke_failed` (neden kodu, bundle ID). Saklama 2 yıl (günlük cron; süre hukukla teyit, §12).
- Sentry: `sendDefaultPii: false`, `beforeSend` ile request body/breadcrumb data temizliği; kullanıcı kimliği yalnızca hash'lenmiş id. Analitik olayları v1.1; olaylarda sağlık değeri YASAK.
- Edge Function'larda JWT, e-posta, request body loglanmaz.

### 5.9 Uyum kontrol listesi (KVKK / mağaza)

`docs/data-inventory.md` tek envanter → aydınlatma metni, App Store App Privacy (Health & Fitness, Contact Info, Identifiers), Google Play Data safety + **Health apps declaration** (Activity & Fitness), gizlilik politikası URL'si, hesap silme URL'si. Barındırma bölgesi ve yurt dışı aktarım dayanağı (§12 S2) hukuk onayı olmadan prod proje oluşturulmaz. P3'te "Danışan bu notları görebilir; tanı/ilaç bilgisi girme" uyarısı; `pt_notes` ≤ 1000 karakter.

**KVKK süreç kontrol listesi (lansman öncesi; hukuk teyidi ZORUNLU, §12 S2/S20):**

| Konu | Uygulama |
|---|---|
| İlgili kişi başvuruları (KVKK m.11, m.13) | Başvuru kanalı: `kvkk@pulsecoach.app` + gizlilik sayfasındaki form; uygulama içi Gizlilik ekranında bağlantı. Başvuru en geç **30 gün** içinde sonuçlandırılır (kural olarak ücretsiz). Kimlik doğrulama hesap e-postasıyla; başvuru kaydı repoda değil destek sisteminde tutulur. v1'de erişim/taşıma talepleri destek ekibinin SQL raporuyla yanıtlanır; uygulama içi dışa aktarım v1.1. |
| VERBİS | Kayıt yükümlülüğü ve istisna durumu hukukçu tarafından değerlendirilir; **özel nitelikli (sağlık) veri işleme** ana faaliyet kapsamında görülürse istisnadan yararlanılamayabilir. Karar (ve gerekiyorsa kayıt) prod lansmanından önce tamamlanır; envanter `docs/data-inventory.md` ile uyumlu tutulur. |
| Yurt dışı aktarım (KVKK m.9) | Supabase (AB bölgesi), SMTP sağlayıcısı, Sentry, Expo Push/FCM/APNs için dayanak belirlenir. Standart sözleşme kullanılırsa Kurul'un ilan ettiği metin değiştirilmeden imzalanır ve **imzadan itibaren 5 iş günü içinde Kurum'a bildirilir**. **Düzenli/tekrarlayan aktarım açık rızaya dayandırılmaz** (açık rıza yalnızca arızi aktarım için dayanaktır); onboarding'deki sağlık verisi rızası aktarım dayanağı olarak KULLANILMAZ. |
| Aydınlatma metni | Veri kategorileri, amaçlar, aktarım alıcıları ve ülkeleri, saklama süreleri (§12 S15), PT ile paylaşım kapsamı (`data_visible_from`, türetilmiş özetler dahil), hesap silme sonrası kullanılmayan özel egzersizlerin ≤ 24 saat içinde temizlenmesi (§12 S21). |
| Veri ihlali | Kurul'a en geç **72 saat** içinde bildirim; etkilenen kişilere makul sürede bildirim; olay müdahale runbook'u `docs/runbooks/data-breach.md` (F5). |
| Rıza kayıtları | `consents` sürümlü; geri çekme `withdraw_consent`; rıza metinleri sürüm etiketiyle arşivlenir. |

---

## 6. Sunucu tarafı iş mantığı

### 6.1 `set_logs` yazım hattı

**BEFORE INSERT/UPDATE — `private.set_logs_before_write` (SECURITY INVOKER):**

1. UPDATE'te kimlik kolonları (`id, workout_log_id, user_id, workout_log_exercise_id, set_type, set_number`) değişemez (`set_identity_immutable`). `OLD.overload_flag = true` iken istemci (`current_user='authenticated'`) ağırlık/tekrar/süre/tamamlanma tipi/zaman değiştiremez (`overload_set_immutable`).
2. Oturum ve snapshot satırı bulunur; sahiplik doğrulanır (kompozit FK'lar ayrıca garanti eder).
3. Yazma penceresi (istemci için): oturum `in_progress`, veya `completed` ve `completed_at` son 24 saat, veya cron tarafından `abandoned` yapılmış (`auto_closed`) ve son aktivite 24 saat içinde (geç senkron). Aksi halde `workout_locked`. RLS UPDATE politikaları (`set_logs_update_own`, `workout_logs_update_own`) aynı pencereyi `private.workout_is_open()` ile uygular; PostgREST RLS reddinde hata değil **0 satır** döndüğü için outbox güncellemeleri `.select('id')` ile doğrulanır (§8.2).
4. `exercise_id` snapshot'tan ezilir (istemci değeri yok sayılır).
5. `performed_at` (istemci saati): `now()+5 dk` sonrası → `now()`; `started_at−5 dk` öncesi → `started_at`; her iki durumda `clock_skew_suspect = true`.
6. `tracking_type`'a göre zorunlu alanlar: `weight_reps` → reps + ağırlık; `bodyweight_reps` → reps (ağırlık = ek yük, opsiyonel); `duration` → süre.
7. Hedef snapshot'ı `planned_sets`'ten `(set_type, set_number)` ile; planlanmamış ekstra çalışma seti son planlı çalışma setinin hedefini alır.
8. Guardrail (§7.2): `guardrail_enabled AND tolerans dolu AND set_type='working' AND tracking_type='weight_reps' AND original_weight_kg NOT NULL` ise `allowed_max = private.guardrail_allowed_max(original, pct, abs)`, `overload_flag = weight_kg > allowed_max`. Bir kez `true` olan bayrak `false`'a dönmez. Teyit (`overload_confirmed_at`) yoksa bile satır kabul edilir.
9. `deload_ignored = !overload AND adjusted < original AND weight > adjusted`.
10. `estimated_1rm = private.epley_e1rm(...)` (§7.4).
11. `pt_reviewed_at` istemci tarafından set edilemez.

**AFTER INSERT/UPDATE/DELETE — `private.set_logs_after_write` (DEFINER):**

1. `private.recompute_exercise_best(user, exercise)` → `exercise_bests` (uygun setler: e1RM dolu, onaysız overload değil, oturum abandoned değil).
2. `workout_logs.last_activity_at = greatest(…, performed_at)`; `auto_closed` oturum çalışma seti gelirse `completed`'e döner.
3. Çalışma seti → snapshot `status='done'` (skip gerekçesi temizlenir).
4. Yeni overload + oturumun `pair_id`'si hâlâ aktif → `pt_alerts` upsert (payload'a `server_received_at = now()` yazılır): `dedupe_key = 'overload:' || workout_log_exercise_id` (egzersiz başına oturumda **tek kart**), çakışmada `occurrences+1`, `max_logged_weight_kg` güncellenir, kapanmış kart yeniden `open` olur (arşivlenmiş kalır).
5. `pt_alerts` AFTER INSERT → `realtime.send` (`alert_created`) + push kuyruğu; UPDATE'te (tekrar/yeniden açılma) `alert_updated` yayını (push yok).
6. INSERT'te set e1RM'i, bu oturumdan önce başlamış tamamlanmış oturumların en iyisini (`private.best_e1rm_before`) aşıyorsa ve eşleşme aktifse PT feed'ine `pr_candidate` yayını (yalnızca id). İlk kayıt aday değildir; kesin PR kapanışta `pr_events` → `pr_achieved`.

### 6.2 Readiness

- BEFORE INSERT: `checked_in_at = now()` (sunucu), `local_date = (now() at time zone profiles.timezone)::date`, `pain_regions` tekilleştirilir. `score` generated column (istemci yazamaz).
- AFTER INSERT: `score < 60` ve aktif eşleşme → `LOW_READINESS` (`warning`), `dedupe_key = 'low_readiness:' || user_id || ':' || local_date` → **danışan başına yerel gün başına en fazla 1** (`pt_alerts_dedupe_uq` PT başına benzersizdir; v1.0'da danışan kimliği anahtarda olmadığı için aynı PT'nin ikinci danışanının alarmı kayboluyordu — pgTAP 11b). Push yalnızca PT tercihi açıksa (VARSAYILAN kapalı).
- Deload kararı `start_workout` içinde verilir (§7.3); check-in atlanırsa `readiness_outcome='skipped_checkin'` yazılır ve P2 log detayında görünür.

### 6.3 Oturum yaşam döngüsü ve cron işleri

| İş | Zamanlama (UTC) | Fonksiyon | Davranış |
|---|---|---|---|
| `pc-close-stale-workouts` | `*/15 * * * *` | `private.close_stale_workouts()` | `in_progress` ve `last_activity_at < now()-3h` → çalışma seti varsa `completed` (`completed_at = last_activity_at`, `auto_closed`, PR hesap), yoksa `abandoned` — `complete_workout` ile aynı kural |
| `pc-deload-radar` | `7 * * * *` | `private.run_deload_radar()` | §7.6; kullanıcı saat dilimindeki son tamamlanmış ISO haftası başına bir kez; PT alarmı yalnızca pencere `data_visible_from` sonrasıysa |
| `pc-expire-invites` | `3 * * * *` | `private.expire_invites()` | Süresi dolan açık kodlar `revoked_at = expires_at` (kod uzayı serbest kalır) |
| `pc-push-sweeper` | `* * * * *` | `private.sweep_push_outbox()` | 1 dk'dan eski bekleyen push'ları yeniden dürter; 5 denemeden sonra `failed` |
| `pc-daily-cleanup` | `30 2 * * *` | `private.daily_cleanup()` | 30 gün+ deneme kaydı, 7 gün+ gönderilmiş push, sahipsiz kütüphane program/şablonları (sistem şablonları hariç), sahipsiz kullanılmayan özel egzersizler (hesap silmede egzersiz temizliği YALNIZCA burada), 24 saatten eski **doğrulanmamış** OTP kullanıcıları, 2 yıl+ audit |

**Oturum kapanış kuralı (tek kural):** Bir oturum yalnızca en az bir **çalışma seti** (`set_type='working'`, tamamlanma tipi fark etmez) varsa `completed` olur. `complete_workout` çalışma seti yoksa `nothing_logged` döner ve durumu değiştirmez; C5 bu durumda "Kaydet ve Bitir" yerine "Antrenmanı iptal et" (`abandon_workout`) gösterir. Cron aynı kuralla `completed`/`abandoned` ayırır. Böylece rotasyon (§7.12), haftalık seri (§7.9) ve radar (§7.6) yalnızca gerçek antrenmanları sayar.

**Program yaşam döngüsü (ürün kararı, §12 S18):** Eşleşme bittiğinde veya PT hesabını sildiğinde atanmış program danışanda `active` kalır (antrenman sürekliliği; guardrail kapanır). C1/C6'daki "Programı bırak" aksiyonu `get_client_home().program.can_leave` true iken görünür ve `leave_program()` ile programı arşivler; programın sahibi hâlâ aktif PT ise `program_managed_by_pt`. Yeni PT `assign_program` ile atadığında eski aktif program zaten arşivlenir. Danışanın kendi oluşturduğu program `programs_update` ile de arşivlenebilir.

**Neden pg_cron (Edge Function değil):** radar ve kapatma işleri tamamen veritabanındaki veriye dayanır; SQL içinde RLS'siz (definer) ve ağ gecikmesiz çalışır, secret key gerektirmez, idempotenttir (`radar_evaluations` PK). Edge Function yalnızca dış servis (Expo Push API, Apple) gerektiğinde kullanılır. Not: hosted ortam `auth.users` üzerinde doğrudan DELETE'e izin vermezse `daily_cleanup` içindeki doğrulanmamış kullanıcı temizliği `cleanup-unverified` Edge Function'ına (admin API `deleteUser`) taşınır; Sprint 0'da staging'de doğrulanır.

### 6.4 Realtime

- Sunucu: `private.broadcast_to_pt(pt_id, event, payload)` → `realtime.send(payload, event, 'pt:'||pt_id||':feed', true)`. Olaylar: `alert_created`, `alert_updated`, `session_in_progress`, `session_completed`, `session_abandoned`, `pr_candidate` (set anında, §6.1 #6), `pr_achieved` (`pr_events` INSERT). Payload yalnızca id içerir.
- `realtime.messages` SELECT politikası yalnızca kendi topic'i; INSERT politikası YOK. Hosted: Realtime ayarlarında "Allow public access" KAPALI.
- Hiçbir tablo `supabase_realtime` publication'a eklenmez; `REPLICA IDENTITY FULL` YASAK.

### 6.5 Push teslimi

```
pt_alerts INSERT / assign_program / resolve_alert(update_target)
  → private.enqueue_push(user, kind, title_key, body_key, data)   [tercih + token kontrolü]
  → private.push_outbox INSERT
  → trigger kick_push_worker: net.http_post(project_url/functions/v1/send-push, {outbox_id}, x-push-worker-secret)  (async)
  → send-push: admin_claim_push(id) → Expo Push API → admin_finish_push(id, ok, error, invalid_tokens)
  → cron pc-push-sweeper: takılanları yeniden dürter
```

Vault kurulumu (her hosted ortamda bir kez, migration'a YAZILMAZ):

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<64 hex rastgele>', 'push_worker_secret');   -- aynı değer: supabase secrets set PUSH_WORKER_SECRET=...
```

```ts
// supabase/functions/send-push/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const TEXT: Record<string, string> = {                 // genel içerik; isim/sağlık detayı YASAK (SEC-20)
  'push.overload.title': 'Kritik alarm',
  'push.overload.body': 'Bir danışanında hedefin üzerinde ağırlık kaydedildi. İncelemek için dokun.',
  'push.low_readiness.title': 'Düşük hazır oluşluk',
  'push.low_readiness.body': 'Bir danışanın bugün düşük hazır oluşluk bildirdi.',
  'push.program_assigned.title': 'Yeni programın hazır',
  'push.program_assigned.body': 'Antrenörün sana yeni bir program atadı.',
  'push.program_updated.title': 'Programın güncellendi',
  'push.program_updated.body': 'Antrenörün hedeflerini güncelledi.',
};
const CHANNEL: Record<string, string> = { overload_alert: 'pt-alerts', low_readiness_alert: 'pt-alerts', program_assigned: 'general', program_updated: 'general' };

const enc = new TextEncoder();
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]; return d === 0;
}

Deno.serve(async (req) => {
  const expected = Deno.env.get('PUSH_WORKER_SECRET') ?? '';
  if (expected.length < 32) return new Response('misconfigured', { status: 503 });          // fail-closed: secret yoksa kimse geçemez
  const secret = req.headers.get('x-push-worker-secret') ?? '';
  if (!secret || !(await safeEqual(secret, expected))) return new Response('unauthorized', { status: 401 });
  const { outbox_id } = await req.json().catch(() => ({}));
  if (typeof outbox_id !== 'number') return new Response('bad_request', { status: 400 });

  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, keys['default'], { auth: { persistSession: false } });
  const { data: job, error } = await admin.rpc('admin_claim_push', { p_outbox_id: outbox_id });
  if (error) return new Response('claim_failed', { status: 500 });
  if (!job) return new Response('nothing_to_do', { status: 200 });
  if (!job.tokens.length) { await admin.rpc('admin_finish_push', { p_outbox_id: outbox_id, p_ok: true, p_error: 'no_tokens' }); return new Response('ok'); }

  const messages = job.tokens.map((to: string) => ({
    to, title: TEXT[job.title_key], body: TEXT[job.body_key], data: job.data,
    sound: 'default', priority: 'high', channelId: CHANNEL[job.kind] ?? 'general',
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}) },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    await admin.rpc('admin_finish_push', { p_outbox_id: outbox_id, p_ok: false, p_error: `http_${res.status}` });
    return new Response('retry', { status: 502 });
  }
  const { data: tickets } = await res.json();
  const invalid = (tickets as any[]).map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? job.tokens[i] : null)).filter(Boolean);
  const anyOk = (tickets as any[]).some((t) => t.status === 'ok');
  await admin.rpc('admin_finish_push', { p_outbox_id: outbox_id, p_ok: anyOk || invalid.length === job.tokens.length, p_error: anyOk ? null : 'all_tickets_failed', p_invalid_tokens: invalid });
  return new Response('ok');
});
```

Push receipt (`getReceipts`) kontrolü v1.1. İstemci bildirime dokununca `data.url`'e yönlenir (§8.4).

### 6.6 Migration 5 — cron işleri, radar, push uçları

```sql
-- =====================================================================
-- 20260915000500_jobs.sql
-- pg_cron işleri: yarım oturum kapatma, deload radarı, davet süresi,
-- push süpürücü, günlük temizlik. Cron her zaman UTC (GMT) yorumlanır.
-- =====================================================================

create or replace function private.close_stale_workouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  v_n      integer := 0;
  v_work   boolean;
begin
  for r in
    select wl.id from public.workout_logs wl
     where wl.status = 'in_progress' and wl.last_activity_at < now() - interval '3 hours'
     for update skip locked
  loop
    -- complete_workout ile AYNI kural: çalışma seti yoksa oturum tamamlanmış sayılmaz (§6.3)
    v_work := exists (select 1 from public.set_logs s where s.workout_log_id = r.id and s.set_type = 'working');
    if v_work then
      update public.workout_logs
         set status = 'completed', completed_at = greatest(last_activity_at, started_at), auto_closed = true
       where id = r.id;
      perform private.compute_pr_events(r.id);
    else
      update public.workout_logs set status = 'abandoned', auto_closed = true where id = r.id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Deload radarı: kullanıcının saat dilimindeki son TAMAMLANMIŞ ISO haftası W0; W-2, W-1, W0 karşılaştırılır.
-- p_visible_from: yalnızca bu andan sonra başlayan oturumlar ve check-in'ler sayılır (PT'ye giden değerlendirmede
-- eşleşmenin data_visible_from'u; danışanın kendi kaydında '-infinity').
create or replace function private.evaluate_radar(p_client_id uuid, p_w0 date, p_visible_from timestamptz default '-infinity')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vol numeric[] := array[0, 0, 0];
  v_avg numeric[] := array[null, null, null]::numeric[];
  v_cnt integer[] := array[0, 0, 0];
  i     integer;
  v_ws  date;
  v_tv  numeric;
  v_ta  numeric;
  v_tc  integer;
  v_result public.radar_result;
begin
  for i in 1..3 loop
    v_ws := p_w0 - (3 - i) * 7;
    select coalesce(sum(sv.tonnage_kg), 0) into v_tv
      from public.session_volume sv
      join public.workout_logs wl on wl.id = sv.workout_log_id
     where sv.user_id = p_client_id and sv.status = 'completed'
       and sv.local_date between v_ws and v_ws + 6
       and wl.started_at >= p_visible_from;
    select avg(rl.score), count(*)::integer into v_ta, v_tc
      from public.readiness_logs rl
     where rl.user_id = p_client_id and rl.local_date between v_ws and v_ws + 6
       and rl.checked_in_at >= p_visible_from;
    v_vol[i] := v_tv;
    v_avg[i] := v_ta;
    v_cnt[i] := v_tc;
  end loop;

  if v_cnt[1] < 2 or v_cnt[2] < 2 or v_cnt[3] < 2 or v_vol[1] = 0 or v_vol[2] = 0 or v_vol[3] = 0 then
    v_result := 'insufficient_data';
  elsif v_vol[2] >= v_vol[1] and v_vol[3] >= v_vol[1]
        and v_avg[1] > v_avg[2] and v_avg[2] > v_avg[3] and (v_avg[1] - v_avg[3]) >= 10 then
    v_result := 'triggered';
  else
    v_result := 'no_signal';
  end if;

  return jsonb_build_object(
    'result', v_result,
    'week_starts', jsonb_build_array(p_w0 - 14, p_w0 - 7, p_w0),
    'tonnage_kg', to_jsonb(v_vol),
    'avg_readiness', to_jsonb(array[round(v_avg[1], 1), round(v_avg[2], 1), round(v_avg[3], 1)]),
    'checkins', to_jsonb(v_cnt)
  );
end;
$$;

-- p_now yalnızca test ve yeniden oynatma içindir; cron parametresiz çağırır.
-- KVKK (K9): PT'ye giden sonuç — DELOAD_RECOMMENDED alarmı ve radar_evaluations satırının PT görünürlüğü
-- (radar_select_pt: window_start >= data_visible_from) — yalnızca pencere başı (W−2 Pazartesi 00:00, kullanıcı
-- saat dilimi) eşleşmenin data_visible_from'undan sonra ise üretilir. Aksi halde danışanın kendi kaydı yazılır, alarm yok.
create or replace function private.run_deload_radar(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r            record;
  v_w0         date;
  v_window     timestamptz;
  v_pt_visible boolean;
  v_eval       jsonb;
  v_result     public.radar_result;
  v_n          integer := 0;
begin
  for r in
    select pr.id as client_id, pr.timezone, p.id as pair_id, p.pt_id, p.data_visible_from
      from public.profiles pr
      left join public.pt_client_pairs p on p.client_id = pr.id and p.status = 'active'
     where pr.role = 'client'
       and exists (select 1 from public.workout_logs wl
                    where wl.user_id = pr.id and wl.status = 'completed'
                      and wl.started_at > p_now - interval '28 days' and wl.started_at <= p_now)
  loop
    v_w0 := private.iso_week_start((p_now at time zone r.timezone)::date) - 7;
    continue when exists (select 1 from public.radar_evaluations e where e.client_id = r.client_id and e.week_start = v_w0);

    v_window := (v_w0 - 14)::timestamp at time zone r.timezone;
    v_pt_visible := r.pair_id is not null and v_window >= r.data_visible_from;

    v_eval := private.evaluate_radar(r.client_id, v_w0,
                case when v_pt_visible then r.data_visible_from else '-infinity'::timestamptz end);
    v_result := (v_eval ->> 'result')::public.radar_result;

    -- Cooldown (≈14 gün): önceki iki haftalık değerlendirmeden biri triggered ise
    if v_result = 'triggered' and exists (
         select 1 from public.radar_evaluations e
          where e.client_id = r.client_id and e.result = 'triggered'
            and e.week_start >= v_w0 - 14 and e.week_start < v_w0) then
      v_result := 'cooldown';
    end if;

    insert into public.radar_evaluations (client_id, week_start, window_start, pair_id, result, metrics)
    values (r.client_id, v_w0, v_window, r.pair_id, v_result, v_eval - 'result')
    on conflict (client_id, week_start) do nothing;

    if v_result = 'triggered' and v_pt_visible then
      insert into public.pt_alerts (pair_id, pt_id, client_id, alert_type, severity, payload, dedupe_key)
      values (r.pair_id, r.pt_id, r.client_id, 'DELOAD_RECOMMENDED', 'info', v_eval - 'result',
              'deload:' || r.client_id::text || ':' || v_w0::text)     -- danışan başına hafta başına 1
      on conflict (pt_id, dedupe_key) do nothing;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function private.expire_invites()
returns integer
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.pairing_invites set revoked_at = expires_at
     where redeemed_at is null and revoked_at is null and expires_at <= now()
    returning 1
  ) select count(*)::integer from u;
$$;

create or replace function private.sweep_push_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  r        record;
  v_n      integer := 0;
begin
  update private.push_outbox set status = 'failed', last_error = coalesce(last_error, 'max_attempts')
   where status in ('pending', 'sending') and attempts >= 5;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_worker_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  for r in
    select id from private.push_outbox
     where status in ('pending', 'sending') and created_at < now() - interval '1 minute' and attempts < 5
     order by id limit 100
  loop
    perform net.http_post(
      url := v_url || '/functions/v1/send-push',
      body := jsonb_build_object('outbox_id', r.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-worker-secret', v_secret),
      timeout_milliseconds := 5000
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function private.daily_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.pairing_attempts where attempted_at < now() - interval '30 days';
  delete from private.push_outbox where created_at < now() - interval '7 days' and status in ('sent', 'failed', 'skipped');
  delete from public.pairing_invites where redeemed_at is null and created_at < now() - interval '30 days';

  -- Sahibi silinmiş kütüphane programları/şablonları (PT hesabı hazırlıksız silindiyse)
  delete from public.programs where owner_id is null and client_id is null;
  delete from public.workout_templates t
   where t.owner_id is null and t.client_id is null and not t.is_system
     and not exists (select 1 from public.program_workouts pw where pw.template_id = t.id);

  -- Sahibi silinmiş (hesap silme → owner_id SET NULL) ve hiçbir yerde kullanılmayan özel egzersizler.
  -- Hesap silmede özel egzersiz silme işi YALNIZCA burada yapılır (§3.11).
  delete from public.exercises e
   where e.scope = 'custom' and e.owner_id is null
     and not exists (select 1 from public.template_exercises x where x.exercise_id = e.id)
     and not exists (select 1 from public.workout_log_exercises x where x.exercise_id = e.id)
     and not exists (select 1 from public.set_logs x where x.exercise_id = e.id)
     and not exists (select 1 from public.pr_events x where x.exercise_id = e.id);

  -- 24 saatten eski, hiç doğrulanmamış e-posta OTP kayıtları (AUTH-13/AUTH-18)
  delete from auth.users u
   where u.email_confirmed_at is null and u.phone_confirmed_at is null and u.last_sign_in_at is null
     and u.created_at < now() - interval '24 hours'
     and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email');

  delete from private.audit_log where occurred_at < now() - interval '2 years';
end;
$$;

-- send-push Edge Function (secret key) için talep/bitir uçları
create or replace function public.admin_claim_push(p_outbox_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.push_outbox%rowtype;
begin
  update private.push_outbox
     set status = 'sending', attempts = attempts + 1, claimed_at = now()
   where id = p_outbox_id
     and attempts < 5
     and (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '2 minutes'))
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_row.id, 'kind', v_row.kind, 'title_key', v_row.title_key, 'body_key', v_row.body_key, 'data', v_row.data,
    'tokens', coalesce((select jsonb_agg(t.expo_push_token) from public.push_tokens t where t.user_id = v_row.user_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_finish_push(p_outbox_id bigint, p_ok boolean, p_error text default null, p_invalid_tokens text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.push_outbox
     set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() else sent_at end,
         last_error = left(p_error, 500)
   where id = p_outbox_id;
  delete from public.push_tokens where expo_push_token = any(coalesce(p_invalid_tokens, '{}'));
end;
$$;

revoke execute on function public.admin_claim_push(bigint), public.admin_finish_push(bigint, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.admin_claim_push(bigint), public.admin_finish_push(bigint, boolean, text, text[]) to service_role;

revoke all on function
  private.close_stale_workouts(), private.evaluate_radar(uuid, date, timestamptz), private.run_deload_radar(timestamptz),
  private.expire_invites(), private.sweep_push_outbox(), private.daily_cleanup()
from public, anon, authenticated;

select cron.schedule('pc-close-stale-workouts', '*/15 * * * *', $$select private.close_stale_workouts()$$);
select cron.schedule('pc-deload-radar', '7 * * * *', $$select private.run_deload_radar()$$);
select cron.schedule('pc-expire-invites', '3 * * * *', $$select private.expire_invites()$$);
select cron.schedule('pc-push-sweeper', '* * * * *', $$select private.sweep_push_outbox()$$);
select cron.schedule('pc-daily-cleanup', '30 2 * * *', $$select private.daily_cleanup()$$);
```

### 6.7 `supabase/seed.sql` (referans verisi)

```sql
-- =====================================================================
-- supabase/seed.sql  (yalnızca referans verisi; demo verisi ayrı script)
-- =====================================================================

insert into public.measurement_types (code, category, unit, has_side, client_writable, is_derived, min_value, max_value, sort_order) values
  ('weight_kg',                   'body',          'kg',      false, true,  false,  20,   400,  10),
  ('body_fat_pct',                'body',          'percent', false, true,  false,   2,    70,  20),
  ('arm_cm',                      'circumference', 'cm',      true,  false, false,  10,    80, 100),
  ('shoulder_cm',                 'circumference', 'cm',      false, false, false,  60,   180, 110),
  ('chest_cm',                    'circumference', 'cm',      false, false, false,  50,   200, 120),
  ('waist_cm',                    'circumference', 'cm',      false, false, false,  40,   200, 130),
  ('hip_cm',                      'circumference', 'cm',      false, false, false,  50,   200, 140),
  ('thigh_cm',                    'circumference', 'cm',      true,  false, false,  25,   120, 150),
  ('single_leg_eyes_open_sec',    'balance',       'sec',     true,  false, false,   0,   300, 200),
  ('single_leg_eyes_closed_sec',  'balance',       'sec',     true,  false, false,   0,   300, 210),
  ('leg_length_cm',               'balance',       'cm',      true,  false, false,  50,   130, 220),
  ('y_balance_anterior_cm',       'balance',       'cm',      true,  false, false,   0,   150, 230),
  ('y_balance_posteromedial_cm',  'balance',       'cm',      true,  false, false,   0,   170, 240),
  ('y_balance_posterolateral_cm', 'balance',       'cm',      true,  false, false,   0,   170, 250),
  ('y_balance_composite_pct',     'balance',       'percent', true,  false, true,    0,   250, 260),
  -- Fonksiyonel değerlendirme (P3): 0–3 hareket kalitesi skorları + saha testleri
  ('overhead_squat_score',        'functional',    'score',   false, false, false,   0,     3, 300),
  ('single_leg_squat_score',      'functional',    'score',   true,  false, false,   0,     3, 310),
  ('hip_hinge_score',             'functional',    'score',   false, false, false,   0,     3, 320),
  ('push_up_max_reps',            'functional',    'reps',    false, false, false,   0,   200, 330),
  ('sit_and_reach_cm',            'functional',    'cm',      false, false, false, -40,    60, 340),
  ('side_plank_hold_sec',         'functional',    'sec',     true,  false, false,   0,   600, 350)
on conflict (code) do nothing;

-- Global egzersiz örnekleri (tam kütüphane içerik iş kalemi: Faz 0). video alanları içerik ekibince doldurulur.
insert into public.exercises (scope, owner_id, title, category, target_muscle, primary_regions, tracking_type, load_mode, load_increment_kg, min_load_kg, cues_and_tips) values
  ('global', null, 'Barbell Back Squat',     'compound',  'Quadriceps',  '{knee,hip,lower_back}', 'weight_reps',     'total',    2.5, 20, 'Ayaklar omuz genişliğinde; göğüs dik; dizler ayak ucu yönünde.'),
  ('global', null, 'Barbell Deadlift',       'compound',  'Posterior zincir', '{lower_back,hip}', 'weight_reps',   'total',    2.5, 20, 'Bar ayak ortası üzerinde; sırt nötr; kalça ve omuz birlikte kalkar.'),
  ('global', null, 'Barbell Bench Press',    'compound',  'Göğüs',       '{shoulder,elbow}',      'weight_reps',     'total',    2.5, 20, 'Skapulaları sık; ayaklar yerde; bar göğüs altına iner.'),
  ('global', null, 'Overhead Press',         'compound',  'Omuz',        '{shoulder,lower_back}', 'weight_reps',     'total',    2.5, 20, 'Karın sıkı; bel boşluğunu artırma.'),
  ('global', null, 'Barbell Row',            'compound',  'Sırt',        '{upper_back,lower_back}','weight_reps',    'total',    2.5, 20, 'Gövde 45°; bar göbeğe çekilir.'),
  ('global', null, 'Pull-up',                'compound',  'Sırt',        '{shoulder,elbow}',      'bodyweight_reps', 'total',    2.5,  0, 'Tam asılı pozisyondan başla; çene bar üstüne.'),
  ('global', null, 'Incline Dumbbell Curl',  'isolation', 'Biceps',      '{elbow}',               'weight_reps',     'per_side', 2,    0, 'Dirsekleri sabit tut.'),
  ('global', null, 'Triceps Rope Pushdown',  'isolation', 'Triceps',     '{elbow}',               'weight_reps',     'total',    2.5,  0, 'Dirsekler gövdeye yakın.'),
  ('global', null, 'Plank',                  'cooldown',  'Core',        '{lower_back,shoulder}', 'duration',        'total',    2.5,  0, 'Kalça düşmesin; nefesi tutma.'),
  ('global', null, 'Stationary Bike',        'warmup',    'Kardiyo',     '{knee,hip}',            'duration',        'total',    2.5,  0, 'Hafif-orta tempo.')
on conflict do nothing;

-- Sistem (Super Admin içerik hattı) şablonu örneği: yalnızca migration/seed yazar; PT'ler clone_system_template() ile
-- kütüphanelerine kopyalar. Sistem şablonlarında yalnızca global egzersiz kullanılır (pgTAP kontrol eder).
insert into public.workout_templates (id, owner_id, client_id, title, description, is_system) values
  ('00000000-0000-4000-8000-00000000a001', null, null, 'Tam Vücut Başlangıç', 'Haftada 2–3 gün; temel bileşik hareketler. Hedef ağırlıkları PT belirler.', true)
on conflict (id) do nothing;
insert into public.template_blocks (id, template_id, position, block_type, rest_after_round_sec) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 1, 'single', null),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a001', 2, 'single', null),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000a001', 3, 'single', null)
on conflict (id) do nothing;
insert into public.template_exercises (id, block_id, position_in_block, exercise_id, is_priority)
select v.id, v.block_id, 1, e.id, v.is_priority
  from (values
    ('00000000-0000-4000-8000-00000000c001'::uuid, '00000000-0000-4000-8000-00000000b001'::uuid, 'Barbell Back Squat', true),
    ('00000000-0000-4000-8000-00000000c002'::uuid, '00000000-0000-4000-8000-00000000b002'::uuid, 'Barbell Bench Press', true),
    ('00000000-0000-4000-8000-00000000c003'::uuid, '00000000-0000-4000-8000-00000000b003'::uuid, 'Barbell Row', false)
  ) v(id, block_id, title, is_priority)
  join public.exercises e on e.scope = 'global' and e.title = v.title
on conflict (id) do nothing;
insert into public.template_exercise_sets (template_exercise_id, set_type, set_number, target_reps_min, target_reps_max, rest_seconds)
select te.id, 'working', n, 8, 10, 120
  from public.template_exercises te
 cross join generate_series(1, 3) n
 where te.template_id = '00000000-0000-4000-8000-00000000a001'
on conflict (template_exercise_id, set_type, set_number) do nothing;
```

Global egzersiz kütüphanesinin tamamı (başlık, kategori, bölgeler, takip tipi, artış adımı, min yük, püf noktaları, video id) **Faz 0 içerik iş kalemidir**; her kayıtta ≥1 `primary_regions` zorunludur (squat/deadlift için `lower_back` dahil). Video id'leri içerik ekibince doğrulanır, CI'da haftalık oEmbed kontrolü (v1.1).

### 6.8 İçerik hattı (Super Admin) — global kütüphane, sistem şablonları, öneriler

v1'de uygulama içi admin ekranı yoktur. PRD'deki **Super Admin** yetkileri bir *süreç rolü* olarak uygulanır: `supabase/migrations` üzerinde PR onayı ve prod migration hakkı olan içerik sorumluları (en az iki kişi; tek kişi kendi PR'ını onaylayamaz). Prod'da Studio ile elle veri değiştirmek YASAK (yalnızca staging'de deneme).

| PRD yetkisi | v1 uygulaması |
|---|---|
| Global egzersiz ekleme/düzenleme | `supabase/migrations/<ts>_content_exercises_<konu>.sql`: `insert … scope='global'`, `update`, arşiv (`archived_at`). Her kayıtta ≥ 1 `primary_regions`, doğrulanmış `video_provider/video_id` (liste dışı Vimeo için `video_hash`). Başlık tekilliği `exercises_global_title_uq`. |
| Antrenman şablonu tasarlama (global) | `workout_templates.is_system = true` (owner/client NULL — CHECK), yalnızca global egzersiz (pgTAP kontrolü). PT'ler P4 "Hazır şablonlardan başla" ile `clone_system_template()` çağırıp kütüphanelerine **derin kopyalar**; kopya bağımsızdır. `daily_cleanup` sistem şablonlarını silmez; kaldırma `archived_at` ile. |
| PT'nin global kütüphaneye önerisi | P5 "Global kütüphaneye öner" → `suggest_exercise_to_global()` (yalnızca PT, kendi arşivsiz özel egzersizi, 24 saatte 10, egzersiz başına tek bekleyen öneri). Öneri `exercise_snapshot` saklar; PT kendi önerilerinin durumunu görür. İnceleme migration içinde: `select private.review_exercise_suggestion('<id>', true, '<not>');` — kabulde snapshot'tan global egzersiz oluşturulur; öneren PT'nin özel egzersizi değişmez. |

Uygulama içi inceleme ekranı ve PT'ye sonuç bildirimi v2.

---

## 7. Algoritmalar

Tüm fonksiyonlar `src/domain/*` içinde saf TS'dir; ağırlık aritmetiği gram tamsayı (`toG = kg => Math.round(kg*1000)`). Her tablo birebir Jest testi olur (`src/domain/__tests__`). Sunucu karşılığı olanlar pgTAP'te aynı vektörlerle test edilir (§11.3). **Sunucu ile istemci farklı sonuç verirse sunucu esastır**; istemci farkı Sentry'ye `domain_mismatch` olarak raporlar.

### 7.1 Readiness skoru

**Tanım:** `score = (sleep + energy + (6 − soreness) + (6 − stress)) × 5`; her puan 1–5 tamsayı (değilse hata); aralık **20–100**; `belowThreshold = score < 60`. Ölçek yönü: uyku/enerji 1=çok kötü, 5=çok iyi; ağrı/stres 1=yok, 5=şiddetli. UI'da ağrı/stres renk skalası ters (5 kırmızı). Bölgesel ağrı: `painRegions: BodyRegion[]`; egzersiz rozeti `exercise.primary_regions ∩ painRegions ≠ ∅` (sunucu `pain_flag` üretir).

```ts
export type Rating = 1 | 2 | 3 | 4 | 5;
export function readinessScore(r: { sleep: Rating; energy: Rating; soreness: Rating; stress: Rating }): { score: number; belowThreshold: boolean };
export function painBadge(exerciseRegions: BodyRegion[], painRegions: BodyRegion[]): boolean;
```

| uyku | enerji | ağrı | stres | score | < 60 |
|---|---|---|---|---|---|
| 1 | 1 | 5 | 5 | 20 | evet |
| 2 | 2 | 4 | 4 | 40 | evet |
| 4 | 4 | 5 | 5 | 50 | evet ("hepsi 5 = iyi" yanılgısı senaryosu) |
| 2 | 3 | 3 | 3 | 55 | evet |
| 3 | 3 | 3 | 3 | 60 | hayır |
| 1 | 5 | 1 | 1 | 80 | hayır |
| 4 | 4 | 2 | 2 | 80 | hayır |
| 5 | 5 | 1 | 1 | 100 | hayır |
| 0 veya 6 | – | – | – | hata `rating_out_of_range` | – |

| exerciseRegions | painRegions | rozet |
|---|---|---|
| `[lower_back, hip]` | `[lower_back]` | true |
| `[knee]` | `[lower_back]` | false |
| `[shoulder]` | `[]` | false |

### 7.2 Guardrail (aşırı yük)

**Tanım:** Değerlendirme yalnızca `enabled` (oturum aktif PT'nin şablonundan) ∧ `setType='working'` ∧ `trackingType='weight_reps'` ∧ `originalTargetKg != null` ∧ tolerans dolu iken. Aksi halde `no_target`.
`allowedMax = T + max(T × pct/100, abs)`; `overload = logged > allowedMax` (katı). Tamsayı biçimi: `L×10⁴ > T×10⁴ + max(T×round(pct×100), abs×10⁴)` (gram). `deviationPct = T>0 ? round1((L−T)/T×100) : null`. `deloadIgnored = !overload ∧ adj<T ∧ L>adj`. `suspiciousLow = T>0 ∧ L < T/2` (alarm YOK, yalnızca "Hedefin çok altında, doğru mu?" satır içi uyarı). Modal: egzersiz başına oturumda **bir kez** (ilk overload'da); aynı egzersizde sonraki overload setlerinde satır içi kırmızı bant, onaylanmış ağırlığa eşit/altındakilerde tekrar sorulmaz. Değerlendirme yalnızca "Seti Tamamla" anında (stepper değişiminde değil).

```ts
export type GuardrailInput = { enabled: boolean; setType: SetType; trackingType: TrackingType; originalTargetKg: number | null;
  tolerancePct: number | null; toleranceAbsKg: number | null; loggedKg: number; adjustedTargetKg: number | null };
export type GuardrailResult = { status: 'no_target' | 'ok' | 'over' | 'suspicious_low'; overload: boolean;
  allowedMaxKg: number | null; deviationPct: number | null; deloadIgnored: boolean; suspiciousLow: boolean };
export function evaluateGuardrail(i: GuardrailInput): GuardrailResult;
```

| T (kg) | L (kg) | pct | abs | adj | status | allowedMax | deviation% | deloadIgnored |
|---|---|---|---|---|---|---|---|---|
| 20 | 25 | 20 | 5 | – | ok | 25 | 25 | false |
| 20 | 25.5 | 20 | 5 | – | over | 25 | 27.5 | false |
| 20 | 50 | 20 | 5 | – | over | 25 | 150 | false |
| 2 | 7.5 | 20 | 5 | – | over | 7 | 275 | false |
| 200 | 240 | 20 | 5 | – | ok | 240 | 20 | false |
| 200 | 241 | 20 | 5 | – | over | 240 | 20.5 | false |
| 60 | 90 | 20 | 5 | – | over | 72 | 50 | false |
| 100 | 115 | 15 | 5 | – | ok | 115 | 15 | false |
| 100 | 115.5 | 15 | 5 | – | over | 115 | 15.5 | false |
| 62.5 | 70.25 | 12.5 | 5 | – | ok | 70.3125 | 12.4 | false |
| 62.5 | 70.5 | 12.5 | 5 | – | over | 70.3125 | 12.8 | false |
| 0 | 5 | 20 | 5 | – | ok | 5 | null | false |
| 0 | 10 | 20 | 5 | – | over | 5 | null | false |
| 60 | 62.5 | 20 | 5 | 50 | ok | 72 | 4.2 | true |
| 60 | 72.5 | 20 | 5 | 50 | over | 72 | 20.8 | false |
| 50 | 20 | 20 | 5 | – | suspicious_low | 60 | −60 | false |
| 50 | 25 | 20 | 5 | – | ok | 60 | −50 | false |
| null | 50 | 20 | 5 | – | no_target | null | null | false |
| 20 (warmup) | 50 | 20 | 5 | – | no_target | null | null | false |
| 20 (enabled=false, solo) | 50 | 20 | 5 | – | no_target | null | null | false |
| 50 | 57.5 | 15 | 5 | – | ok | 57.5 | 15 | false |
| 50 | 57.75 | 15 | 5 | – | over | 57.5 | 15.5 | false |
| 200 | 230 | 15 | 5 | – | ok | 230 | 15 | false |
| 200 | 230.25 | 15 | 5 | – | over | 230 | 15.1 | false |
| 20 | 24 | 20 | 5 | – | ok | 25 | 20 | false |

SQL karşılığı `private.guardrail_allowed_max`: (20,20,5)=25; (200,20,5)=240; (100,15,5)=115; (0,20,5)=5; (50,15,5)=57.5; (200,15,5)=230 (pgTAP bölüm 1'de sınır karşılaştırmalarıyla). Float tuzağı: sınır `T × (1 + pct/100)` biçiminde JS `number` ile hesaplanırsa `50 × 1.15 = 57.49999999999999` → 57.5 yanlışlıkla `over` olur; gram tamsayı aritmetiği ZORUNLU.

**Aynı egzersiz şablonda iki kez (ALGO-6):** karşılaştırma egzersize değil **snapshot satırına** (`workout_log_exercise_id` → o satırın `planned_sets`) göre yapılır. Plan [BP#1 1×5 @100, BP#2 1×8 @70], %20 / 5 kg: (BP#1, 100) → `ok` (sınır 120); (BP#2, 100) → `over` (sınır 84); alarm tekilleştirmesi `overload:<workout_log_exercise_id>` olduğundan yalnızca BP#2 kartı açılır. İstemci testi `GuardrailInput`'u satır bazında kurar; sunucu testi §11.3 bölüm 9b.

### 7.3 Auto-deload

**Karar (sunucu, `start_workout`):** check-in yok → `skipped_checkin`; `score ≥ 60` → `above_threshold`; mod `off` → `mode_off`; `auto` → `auto_applied` (×0.85); `confirm` → istemci seçimi `accept` → `offered_accepted` (×0.85), `decline` → `offered_declined`, seçim yoksa `{ok:false, error:'deload_choice_required'}`. Mod: aktif PT şablonu → `pt_client_pairs.deload_mode`; aksi halde `confirm`.

**Ağırlık:** `w' = floor(w×0.85 / inc) × inc` (gram tamsayı); `w' ≤ 0` veya `w' < minLoad` → `w` korunur. Isınma ağırlıklarına da uygulanır; bodyweight/duration'da ağırlık değişmez. Guardrail referansı değişmez (orijinal).
**Set sayısı:** blok için `R = max(üyelerin çalışma seti sayısı)`, `keep = max(1, round(R×2/3))`; her üyede `set_number > keep` olan çalışma setleri `trimmed=true` (silinmez). Isınma kırpılmaz.

```ts
export function deloadWeightKg(weightKg: number | null, incrementKg: number, minLoadKg: number): number | null;
export function deloadKeepSets(workingSetCount: number): number;
export function decideReadinessOutcome(i: { score: number | null; mode: 'off'|'auto'|'confirm'; choice: 'accept'|'decline'|null }):
  { outcome: ReadinessOutcome; multiplier: 1 | 0.85 } | { needsChoice: true };
```

| w | inc | min | w' |
|---|---|---|---|
| 60 | 2.5 | 20 | 50 |
| 100 | 2.5 | 20 | 85 |
| 47.5 | 2.5 | 20 | 40 |
| 25 | 2.5 | 0 | 20 |
| 22.5 | 2.5 | 20 | 22.5 (korunur) |
| 12 | 2 | 0 | 10 |
| 8 | 2 | 0 | 6 |
| 2 | 2 | 0 | 2 (korunur) |
| 17.5 | 1.25 | 0 | 13.75 |

| n (çalışma seti) | 1 | 2 | 3 | 4 | 5 | 6 | 8 |
|---|---|---|---|---|---|---|---|
| keep | 1 | 1 | 2 | 3 | 3 | 4 | 5 |

| score | mode | choice | sonuç |
|---|---|---|---|
| null | auto | – | skipped_checkin ×1 |
| 60 | auto | – | above_threshold ×1 |
| 40 | off | – | mode_off ×1 |
| 40 | auto | – | auto_applied ×0.85 |
| 40 | confirm | null | needsChoice |
| 40 | confirm | accept | offered_accepted ×0.85 |
| 40 | confirm | decline | offered_declined ×1 |

### 7.4 Tahmini 1RM ve PR

**e1RM:** `trackingType='weight_reps' ∧ setType='working' ∧ completion='full' ∧ 1 ≤ reps ≤ 12 ∧ weight > 0` değilse `null`; `reps=1 → weight`; aksi halde `round2(weight × (1 + reps/30))` (JS'te `Math.round(toG(w)×(30+r)/30/10)/100`; SQL'de `30.0` ZORUNLU).
**PR (sunucu, `complete_workout`):** egzersiz için oturumdaki en iyi uygun e1RM (onaysız overload setleri hariç) `>` **bu oturumdan önce başlamış tamamlanmış** oturumlardaki en iyi → `pr_events`. `session_summary.prs[].previous_best_e1rm` ve `first_records` okuma anında aynı tabandan (`private.best_e1rm_before`) hesaplanır; tabloda saklanmaz (PT'ye eşleşme öncesi en iyiyi sızdırmamak için). PT'ye set anında `pr_candidate`, kapanışta `pr_achieved` realtime sinyali gider (§6.4). Önceki kayıt yoksa `first_record` (kutlama "İlk kayıt", PT'ye bildirim yok). Eşitlik PR değildir (santi-kg tamsayı karşılaştırması).
**Canlı rozet (istemci, C4):** `best_e1rm_at_start` sunucu payload'ında okuma anında hesaplanır (PR tabanıyla aynı: önceki tamamlanmış oturumlar, onaysız overload hariç). Biliniyorsa ve set e1RM'i `max(best_at_start, oturumda o ana kadarki en iyi)`'yi aşıyorsa rozet; egzersiz başına ilk aşımda kutlama animasyonu, sonrakiler sessiz güncelleme; `best_e1rm_at_start == null` → "İlk kayıt". Sunucu PR demezse C5'te rozet gösterilmez.

```ts
export function epleyE1rm(i: { trackingType: TrackingType; setType: SetType; completionType: CompletionType; reps: number | null; weightKg: number | null }): number | null;
export function prDecision(i: { sessionBestE1rm: number | null; baselineE1rm: number | null }): 'pr' | 'first_record' | 'none';
```

| ağırlık × tekrar (working, full) | e1RM |
|---|---|
| 100 × 1 | 100 |
| 100 × 0 | null |
| 0 × 10 | null |
| 60 × 8 | 76 |
| 70 × 8 | 88.67 |
| 80 × 8 | 101.33 |
| 85 × 6 | 102 |
| 70 × 10 | 93.33 |
| 82.5 × 5 | 96.25 |
| 57.5 × 7 | 70.92 |
| 100 × 10 | 133.33 |
| 100 × 12 | 140 |
| 100 × 13 | null |
| 600 × 12 | 840 |
| 25 × 2 / 20 × 10 | 26.67 / 26.67 |
| 60 × 8 warmup / partial / bodyweight | null |

| sessionBest | baseline | karar |
|---|---|---|
| 93.33 | 88.67 | pr |
| 88.67 | 88.67 | none |
| 26.67 | 26.67 | none |
| 79.17 | null | first_record |
| null | 80 | none |

### 7.5 Hacim yükü (tonaj)

**Tanım:** `tonnage = Σ reps × weight × (loadMode='per_side' ? 2 : 1)` — yalnızca `setType='working'`, `completion≠'failed'`, `trackingType='weight_reps'`, `reps ≥ 1`, weight dolu. `hardSets = count(working ∧ completion≠'failed' ∧ (reps ?? 1) ≥ 1)`. Isınma dahil değil. Onaysız overload setleri tonaja dahildir, grafikte işaretlenir (`unreviewed_overload_sets`). Sunucu: `public.session_volume`, `public.weekly_client_load`.

```ts
export function sessionTonnage(sets: Array<{ setType: SetType; completionType: CompletionType; trackingType: TrackingType; loadMode: 'total'|'per_side'; reps: number | null; weightKg: number | null }>): { tonnageKg: number; hardSets: number };
```

| setler | tonnageKg | hardSets |
|---|---|---|
| 60×8, 60×7, 60×6 | 1260 | 3 |
| + ısınma 20×10 | 1260 | 3 |
| barfiks (bodyweight) 0×10 ×3 | 0 | 3 |
| 60×0 | 0 | 0 |
| 60×5 failed | 0 | 0 |
| dambıl per_side 12×12 | 288 | 1 |
| plank 60 sn (duration) | 0 | 1 |
| 70×8, 80×8, 85×6 | 1710 | 3 |

### 7.6 Deload radarı

**Tanım:** `W0` = kullanıcının saat diliminde **son tamamlanmış** ISO haftasının Pazartesi'si (`iso_week_start(bugün) − 7`). Haftalar `W−2, W−1, W0`. `V(w)` = tamamlanmış oturum tonajı toplamı; `R(w)` = readiness ortalaması; `n(w)` = check-in sayısı.
- `insufficient_data`: herhangi `n < 2` veya herhangi `V = 0`.
- `triggered`: `V(W−1) ≥ V(W−2) ∧ V(W0) ≥ V(W−2)` **ve** `R(W−2) > R(W−1) > R(W0)` **ve** `R(W−2) − R(W0) ≥ 10`.
- `cooldown`: triggered olacakken son 14 günde triggered kaydı var.
- Aksi `no_signal`.
Sonuç `radar_evaluations(client_id, week_start=W0)`'a bir kez yazılır. Aktif PT varsa `DELOAD_RECOMMENDED` (`info`, `dedupe 'deload:'||W0`); solo danışanda C1 kartı (`get_client_home().radar_card`, 14 gün, kapatılabilir). Mesaj metni: "{{ad}} son 2 haftadır yüksek hacimle çalışırken hazır oluşluğu düşüyor. Önümüzdeki hafta deload planlamayı değerlendir." Eşikler **başlangıç varsayımıdır** (§12 S8).

**KVKK görünürlük kuralı:** `window_start` = W−2 Pazartesi 00:00 (kullanıcının saat diliminde), `radar_evaluations`'a yazılır. Aktif PT'li danışanda PT'ye giden sonuç — `DELOAD_RECOMMENDED` alarmı ve `radar_evaluations` satırının PT tarafından okunması (`radar_select_pt`) — yalnızca `window_start ≥ pt_client_pairs.data_visible_from` iken vardır; bu durumda değerlendirme de yalnızca `data_visible_from` sonrası başlayan oturumlar ve check-in'lerle yapılır. Aksi halde (danışan geçmişi paylaşmadı ve pencere eşleşme öncesine uzanıyor) yalnızca danışanın kendi kaydı yazılır, alarm üretilmez; eşleşmeden ~3 hafta sonra normal akış başlar. Cooldown hafta bazlıdır: önceki iki haftalık değerlendirmeden biri `triggered` ise `cooldown`. `run_deload_radar(p_now)` parametresi yalnızca test/yeniden oynatma içindir. Test: §11.3 bölüm 11b (paylaşmayan danışan → PT 0 satır / 0 alarm, danışan kendi kaydını görür; paylaşan danışan → alarm ve metrikler 80 / 70 / 62.5).

```ts
export function evaluateRadar(weeks: [WeekMetrics, WeekMetrics, WeekMetrics]): { result: 'insufficient_data' | 'no_signal' | 'triggered'; avg?: [number, number, number] };
type WeekMetrics = { tonnageKg: number; readinessScores: number[] };
```

| W−2 (V; skorlar) | W−1 | W0 | sonuç |
|---|---|---|---|
| 10000; 80,80 | 11000; 70,72 | 10500; 62,64 | triggered (ort. 80/71/63) |
| 10000; 80,80 | 11000; 76,76 | 10500; 72,74 | no_signal (düşüş < 10) |
| 10000; 80,80 | 9000; 70,72 | 10500; 62,64 | no_signal (hacim düştü) |
| 10000; 80 | 11000; 70,72 | 10500; 62,64 | insufficient_data |
| 10000; 80,80 | 11000; 70,70 | 10500; 70,70 | no_signal (kesin düşüş yok) |

### 7.7 Oturum akışı (süperset/dinlenme) ve time-crunch

**Adım dizisi `buildSteps(plan)`:** blok sırasıyla; `skipped`/`time_crunched` üyeler çıkarılır; aktif setler = `trimmed=false` ve `≤ working_sets_cap`.
1. Bloktaki her üyenin ısınma setleri (üye sırasıyla) önce; dinlenme = `planned_sets.rest_seconds` (sunucu null→60 doldurur; **single ve süperset** bloklarda aynı).
2. `single`: çalışma setleri; her setten sonra dinlenme = `planned_sets.rest_seconds` (sunucu null→90 doldurur).
3. `superset`: tur `r = 1..R` (`R = max aktif set`); turda seti olan üyeler sırayla; tur içi geçişte dinlenme 0; turun son üyesinden sonra `rest_after_round_sec`. Seti biten üye sonraki turlarda atlanır. Üye atlanırsa grup kalan üyelerle devam eder.
4. Oturumun **son adımından** sonra dinlenme 0 (C5'e geçilir).

İstemci `rest_seconds` için null görmez; `start_workout` (§5.5), `PlannedSet` (§4.6) ve bu adımlar aynı kuralı uygular (pgTAP bölüm 7: ısınma null → 60, süperset çalışma seti 0).

**Süre tahmini:** `Σ adımlar (work + restAfter)`, `work = duration_sec != null ? duration_sec + 15 : 15 + 3 × (reps_max ?? reps_min)`.
**Time-crunch (`fitTimeBudget`):** öncelikli üyesi olmayan bloklar `time_crunched` (atomik). Tahmin > bütçe ise öneri: sondan başa öncelikli bloklarda en çok aktif seti olan üyelerin setini 1 azalt (min 1), her adımda yeniden hesapla, sığana ya da kırpılacak set kalmayana dek döngü. Kullanıcı onaylarsa `working_sets_cap` yazılır. Seçilebilir süreler: 15, 25, 35, 45 dk.

```ts
export function buildSteps(plan: PlanBlock[]): Array<{ exerciseId: string; kind: 'warmup' | 'working'; setNumber: number; round?: number; workSec: number; restAfterSec: number }>;
export function estimateSessionSeconds(plan: PlanBlock[]): number;
export function fitTimeBudget(plan: PlanBlock[], budgetMin: number): { crunchedExerciseIds: string[]; workingSetsCap: Record<string, number>; estimatedMin: number; fits: boolean };
```

| Plan | Beklenen |
|---|---|
| PRD §8.2: Bench 3×8 rest 90 + süperset(Curl 1×12, Pushdown 1×12, tur rest 60) | adımlar `bench1+90, bench2+90, bench3+90, curl1+0, push1+0`; tahmin 489 sn (9 dk) |
| Süperset A 3×10, B 2×10, tur rest 90 | `A1+0, B1+90, A2+0, B2+90, A3+0`; 405 sn |
| Tek blok: ısınma 1×10 (rest 60) + 2×8 (rest 90) | `W1+60, S1+90, S2+0` |
| Tek blok: ısınma 1×10 (rest **null**) + 2×8 (rest null) | `W1+60, S1+90, S2+0` (sunucu 60 / 90 doldurdu) |
| Süperset A (ısınma 1×10 rest null) 2×10 + B 2×10, tur rest 60 | `Aw1+60, A1+0, B1+60, A2+0, B2+0` |
| Süperset A 2×10 + B (skipped), tur rest 60 | `A1+60, A2+0` |
| Squat 3 set (3. trimmed), cap 2 | `sq1+180, sq2+0` |
| Plank 2×60 sn, rest 60 | 210 sn |
| Big: Squat 5×5 r180, Bench 4×8 r120 (öncelikli); süperset 3×12/3×12 r60 ve Row 4×10 r90 (öncelikli değil) | tam plan 2622 sn |
| Big, bütçe 45 | crunched: süperset + row; cap yok; 27 dk; fits |
| Big, bütçe 25 | crunched aynı; cap `{bench:3}`; 24 dk |
| Big, bütçe 20 | cap `{bench:3, squat:4}`; 20 dk |
| Big, bütçe 15 | cap `{bench:2, squat:3}`; 14 dk |
| Big, bütçe 10 | cap `{bench:1, squat:2}`; 8 dk |
| PRD §8.2, bütçe 25 | crunched: curl, pushdown; cap yok; 5 dk |

### 7.8 Akıllı ısınma önerisi

**Tanım:** Yalnızca (PT şablonda ısınma seti tanımlamadıysa) `min_load_kg ≥ 20` (barbell) ∧ `category='compound'` ∧ o `target_muscle`'ın oturumdaki ilk hareketi ∧ `workingKg ≥ 40`. `workingKg` = ilk aktif çalışma setinin `adjusted ?? original` ağırlığı. Şema: `<80` → [bar×10, %65×5]; `80–119.99` → [bar×10, %50×5, %75×3]; `≥120` → [bar×10, %40×5, %60×3, %80×2]. Yüzdeler `floor(w×p/inc)×inc`, bar altı → bar; bir öncekine eşit/altı veya çalışma ağırlığına bir artıştan yakın adım atılır. Öneriler saklanmaz: **sunucu** `SessionPayload.exercises[].warmup_suggestions` alanını her okumada `private.warmup_suggestions()` ile üretir (PRD §8.2 alanı); "kas grubunun ilk hareketi" güncel sıraya göre belirlenir (`skipped`/`time_crunched` önceki hareketler sayılmaz), `bar = min_load_kg`. İstemci aynı fonksiyonu yalnızca çevrimdışı DND/skip sonrası anlık gösterim için hesaplar; bağlantı gelince sunucu değeri esastır. Loglanırsa `set_type='warmup'`. SQL vektörleri pgTAP bölüm 1'de, payload testi bölüm 9b'de.

```ts
export function warmupSuggestions(i: { workingKg: number | null; isBarbell: boolean; isCompound: boolean; isFirstForMuscle: boolean; incrementKg?: number; barKg?: number }): Array<{ weightKg: number; reps: number }>;
```

| workingKg | öneri |
|---|---|
| 30 | [] |
| 40 | 20×10, 25×5 |
| 52.5 | 20×10, 32.5×5 |
| 60 | 20×10, 37.5×5 |
| 79.9 | 20×10, 50×5 |
| 80 | 20×10, 40×5, 60×3 |
| 100 | 20×10, 50×5, 75×3 |
| 120 | 20×10, 47.5×5, 70×3, 95×2 |
| 140 | 20×10, 55×5, 82.5×3, 110×2 |
| 100, ilk hareket değil | [] |
| 50 (60'ın deload'u) | 20×10, 32.5×5 |

### 7.9 Haftalık seri

**Tanım:** `weeklyTarget` = `get_client_home().weekly_target` = `programs.days_per_week` ?? aktif programdaki gün sayısı ?? 2. Haftalık sayım = o ISO haftasında `local_date`'i düşen `completed` (≥ 1 çalışma seti, §6.3) oturum sayısı. `current` = içinde bulunulan hafta hedefi karşıladıysa 1 + geriye doğru hedefi karşılayan ardışık tamamlanmış haftalar; içinde bulunulan hafta henüz karşılanmadıysa seri **kırılmaz**, önceki haftalardan sayılır.

```ts
export function weeklyStreak(i: { completedLocalDates: string[]; todayLocal: string; weeklyTarget: number }): { current: number; thisWeekCount: number; thisWeekMet: boolean };
```

Bugün = 2026-09-15 (Salı; hafta başı 2026-09-14):

| tamamlanan tarihler | hedef | current | thisWeekCount | thisWeekMet |
|---|---|---|---|---|
| 08-31, 09-02, 09-07, 09-09, 09-14 | 2 | 2 | 1 | false |
| 09-07, 09-14 | 2 | 0 | 1 | false |
| 08-31, 09-02, 09-07 | 2 | 0 | 0 | false |
| 08-31, 09-02, 09-07, 09-09, 09-14, 09-15 | 2 | 3 | 2 | true |
| 09-14 | 1 | 1 | 1 | true |
| 08-31, 09-07 | 1 | 2 | 0 | false |

`iso_week_start`: 2026-09-15 → 2026-09-14; 2026-09-13 (Pazar) → 2026-09-07. Europe/Istanbul 2026-09-14 00:30 başlayan oturum `local_date = 2026-09-14` (14 Eylül haftası).

### 7.10 Ondalık giriş, kod normalizasyonu, video URL

```ts
export function parseDecimalInput(s: string | null): number | null;   // ',' → '.', boşluk silinir, negatif/harf → null
export function roundToQuarterKg(kg: number): number;                // Math.round(kg*4)/4
export function normalizeInviteCode(s: string): string;             // NFKD, U+0307 sil, en-US büyük harf, [A-Z0-9], 6 karakter
export function parseVideoUrl(url: string): { provider: 'youtube' | 'vimeo'; id: string; hash: string | null; startSec: number | null } | null;
```

| girdi | parseDecimalInput | | girdi | normalizeInviteCode |
|---|---|---|---|---|
| "62,5" | 62.5 | | "abc-def" | "ABCDEF" |
| "62.5" | 62.5 | | "k7m2pq" | "K7M2PQ" |
| "62," | 62 | | "749 201" | "749201" |
| "" | null | | "İstanbul1" | "ISTANB" |
| " 1 000 " | 1000 | | | |
| "abc" / "-5" | null | | | |
| "0,25" | 0.25 | | | |

`roundToQuarterKg`: 61.3→61.25; 61.1→61; 62.6→62.5. Stepper: küçük adım `load_increment_kg`, büyük adım 2×; tekrar ±1; long-press auto-repeat.
`parseVideoUrl`: `https://www.youtube.com/watch?v=rT7DgCr-3pg` → youtube/`rT7DgCr-3pg`, hash null, startSec null; `https://youtu.be/rT7DgCr-3pg?t=4` → aynı id, **startSec 4**; `https://www.youtube.com/watch?v=rT7DgCr-3pg&t=1m5s` → startSec 65; `https://youtube.com/shorts/rT7DgCr-3pg` → aynı id; `https://www.youtube.com/embed/rT7DgCr-3pg?start=30` → startSec 30; `https://vimeo.com/76979871` → vimeo/`76979871`; `https://vimeo.com/76979871/40fbc4f6ba` (liste dışı) → hash `40fbc4f6ba`; `https://player.vimeo.com/video/76979871?h=40fbc4f6ba#t=90s` → hash + startSec 90; `https://vimeo.com/76979871/notahash` → null; `https://example.com/x` → null. Sunucu regex'i: youtube `^[A-Za-z0-9_-]{11}$`, vimeo `^[0-9]{6,12}$`, `video_hash` `^[0-9a-f]{10}$` (yalnızca vimeo), `video_start_sec` 0–21600. Hash biçimi Sprint 0'da gerçek liste dışı Vimeo linkleriyle doğrulanır (§12 S19).

### 7.11 Kod alfabesi (sunucu)

31 karakter `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; reddetme örneklemesi (`byte < 248`); regex `^[A-HJKMNP-Z2-9]{6}$`. Sunucu girdiyi `translate('ıİ','II')`, `upper`, alfanümerik dışı karakter silme ile normalize eder.

### 7.12 "Sıradaki antrenman" rotasyonu

**Tanım:** Aktif programda son `completed` (≥ 1 çalışma seti, §6.3) oturumun `program_workout.day_order = d` ise sıradaki = `day_order > d` olan en küçük; yoksa en küçük `day_order` (başa sar). Hiç tamamlanmış yoksa en küçük. `completed_today` (yerel gün) true ise C1 kartı "Bugün tamamlandı ✓ · Yine de başla" gösterir. Danışan listeden başka günü seçebilir. Program `duration_weeks` doluysa C1 "Hafta X/Y" gösterir (`week_index`); `block_completed` true ise "Blok tamamlandı" kartı (aktif PT'li: "Antrenörün yeni bloğu atayacak"; PT'siz ya da eşleşmesi bitmiş: "Devam et" / "Programı bırak").

```ts
export function nextWorkout(days: Array<{ id: string; dayOrder: number }>, lastCompletedDayOrder: number | null): string | null;
```

| günler | son tamamlanan | sıradaki |
|---|---|---|
| A1, B2, C3 | null | A |
| A1, B2, C3 | 2 (B) | C |
| A1, B2, C3 | 3 (C) | A |
| A1 | 1 | A |
| [] | – | null |

---

## 8. İstemci mimarisi

### 8.1 Veri katmanı (TanStack Query — yalnızca okuma)

```ts
// src/lib/query/query-client.ts
import { QueryClient, onlineManager, focusManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(!!s.isConnected)); // ipucu; gate değil
  return () => sub.remove();
});
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'offlineFirst', staleTime: 30_000, gcTime: 7 * 24 * 3600_000, retry: 3, retryDelay: (n) => Math.min(1000 * 2 ** n, 30_000) },
    mutations: { networkMode: 'online', retry: 0 },
  },
});
```

- Her `queryFn` `AbortSignal.timeout(10_000)` ile sarılır (`supabase.from(...).abortSignal(signal)`).
- Persister: `createAsyncStoragePersister({ storage: Storage /* expo-sqlite/kv-store */ })` (web: `window.localStorage`), `maxAge: 7 gün`, `buster: Application.nativeApplicationVersion`. `dehydrateOptions.shouldDehydrateQuery`: yalnızca anahtarı `['profile']`, `['client-home']`, `['session-payload', id]`, `['exercises','library']`, `['notes']`, `['bests']` ile başlayanlar.
- `fetchStatus === 'paused' && !data` → `<ScreenState status="offline-empty" />` (sonsuz skeleton YASAK).
- **PT tarafı danışan verisi sorguları:** `set_logs`, `workout_logs`, `workout_log_exercises`, `readiness_logs`, `exercise_bests`, `pr_events`, `measurement_sessions`, `radar_evaluations` sorgularında her zaman `.eq('user_id' | 'client_id', clientId)` ve mümkünse zaman aralığı gönderilir (RLS PT dalı yalnızca InitPlan'dır; index koşulu istemci filtresinden gelir — §5.1 #8, §11.4).
- **`profiles`:** yalnızca açık kolon listesiyle okunur (`select('id, full_name, avatar_url, role')`, embed'lerde de); kendi profilin tamamı `rpc('get_my_profile')`. `select('*')` 42501 döner.

| Query key | Kaynak | Kullanan |
|---|---|---|
| `['profile']` | `rpc get_my_profile` | guard, C6, P6 |
| `['consents']` | `consents` | A4, gizlilik |
| `['client-home']` | `rpc get_client_home` | C1 |
| `['weekly-load', userId]` | `weekly_client_load` (son 8 hafta) | C1, P2 |
| `['session-payload', workoutLogId]` | `rpc get_session_payload` | C3–C5 (yerel SQLite ile birleşir) |
| `['history', userId, cursor]` | `workout_logs` + `session_volume` | C6, P2 |
| `['exercises', 'library']` | `exercises` (archived_at null) | P4, P5, C7 |
| `['templates', scope]`, `['template', id]` | şablon tabloları | P4, C7 |
| `['programs']`, `['program', id]` | programlar | P4, P2 |
| `['pair']`, `['invites']` | `pt_client_pairs`, `pairing_invites` | C6, P2 |
| `['clients']` | `pt_client_pairs(active)` + `profiles` | P2 |
| `['radar-live']` | `workout_logs` in_progress, son 30 dk | P1 (60 sn refetchInterval odakta) |
| `['alerts', status]` | `pt_alerts` | P1 |
| `['achievements']` | `pr_events` son 7 gün | P1 |
| `['measurements', clientId]` | `measurement_sessions` + `measurements` | C6, P3 |
| `['bests', userId]` | `exercise_bests` | C4, P2 |
| `['measurement-deltas', clientId]` | `measurement_latest_deltas` | C1, P2 |
| `['system-templates']` | `workout_templates` (`is_system`, arşivsiz) | P4 |
| `['exercise-suggestions']` | `exercise_suggestions` (kendi) | P5 |

### 8.2 Çevrimdışı outbox (yazma yolu, K13)

**SQLite (`pulsecoach.db`, `openDatabaseAsync(..., { enableChangeListener: true })`):**

```sql
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,                 -- uuid
  seq INTEGER NOT NULL,                -- monoton sıra
  workout_log_id TEXT,                 -- gruplama
  op TEXT NOT NULL,                    -- aşağıdaki tablo
  payload TEXT NOT NULL,               -- JSON
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','inflight','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_seq ON outbox(status, seq);
CREATE TABLE IF NOT EXISTS local_session (          -- tek satır: aktif oturum durumu
  workout_log_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, machine_json TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_sets (             -- UI'ın anında gösterdiği setler
  id TEXT PRIMARY KEY, workout_log_id TEXT NOT NULL, workout_log_exercise_id TEXT NOT NULL,
  set_type TEXT NOT NULL, set_number INTEGER NOT NULL, row_json TEXT NOT NULL, sync_state TEXT NOT NULL DEFAULT 'pending'
);
```

| op | Supabase çağrısı | İdempotentlik |
|---|---|---|
| `set.insert` | `from('set_logs').upsert(row, { onConflict: 'id', ignoreDuplicates: true })` | PK (istemci UUID) |
| `set.update` | `from('set_logs').update(patch).eq('id', id).select('id')` — **0 satır → `failed` + `workout_locked`** (RLS reddi hata değil boş dizi döner) | aynı patch tekrar zararsız |
| `set.delete` | `from('set_logs').delete().eq('id', id).select('id')`; 0 satırsa `select('id').eq('id', id)` ile kontrol: satır yoksa başarı, varsa `failed` + `delete_not_allowed` (overload seti / oturum artık in_progress değil) | idempotent |
| `wle.update` | `from('workout_log_exercises').update({status, skip_reason, skip_note, working_sets_cap, client_updated_at}).eq('id', id).select('id')` — 0 satır → `failed` + `workout_locked` (oturum artık `in_progress` değil) | mutlak değer |
| `workout.water` | `from('workout_logs').update({ water_intake_count: n }).eq('id', id).select('id')` — 0 satır → `failed` + `workout_locked` | mutlak değer (artış YASAK) |
| `rpc.reorder` | `rpc('reorder_session_exercises', {...})` | aynı dizi aynı sonuç |
| `rpc.time_crunch` | `rpc('apply_time_crunch', {...})` | |
| `note.upsert` | `from('user_exercise_notes').upsert({user_id, exercise_id, note}, { onConflict: 'user_id,exercise_id' })` | |
| `rpc.complete` | `rpc('complete_workout', { …, p_completed_at: <istemci ISO> })`; `nothing_logged` → `failed` + C5'te "Antrenmanı iptal et" (`rpc.abandon`) önerisi | RPC idempotent |
| `rpc.abandon` | `rpc('abandon_workout', …)` | `workout_not_in_progress` = başarı say |

Kurallar:
- **Tek işçi, katı FIFO (`seq`)**; bir kayıt başarısız (retry) iken arkasındakiler beklenir; `failed` (kalıcı) kayıt kuyruğu durdurmaz, atlanır ve UI'da gösterilir.
- Sınıflandırma: ağ hatası/timeout (10 sn `AbortSignal`)/HTTP 5xx/408/429 → `pending`, `next_attempt_at = now + min(60 s, 1 s × 2^attempts) ± %20 jitter`; HTTP 401 → `refreshSession()` sonra tekrar; `42501`, `23xxx`, `P0001` (ör. `workout_locked`, `reps_and_weight_required`) → `failed` + `last_error` (`set_logs_natural_uq` 23505 → "Bu set numarası zaten kayıtlı").
- Tetikleyiciler: her enqueue, "Seti Tamamla", AppState `active`, `addNetworkStateListener` bağlandı, C5 "Antrenmanı Bitir", 15 sn periyodik (C4 açıkken), `expo-background-task` (best-effort, `minimumInterval: 15`), uygulama açılışında ilk iş.
- Aynı `set.insert` henüz `pending` iken gelen `set.update` → payload birleştirilir (tek insert).
- **Sessiz 0 satır YASAK:** PostgREST, RLS `USING` reddinde UPDATE/DELETE için hata döndürmez; bütün update/delete op'ları `.select('id')` ile etkilenen satırı doğrular. `workout_locked` / `delete_not_allowed` alan kayıt UI'da "Bu antrenman kilitlendi · değişiklik kaydedilemedi" olarak gösterilir ve kuyruğu durdurmaz. Birim testi: boş dizi yanıtı → `failed`.
- `useSyncStatus()` → `{pending, failed}` sayıları `addDatabaseChangeListener` ile canlı; global bant "Çevrimdışı · N kayıt bekliyor"; set satırı ikonları `pending/synced/failed` + "Tekrar dene".

### 8.3 Aktif antrenman durum makinesi

`src/domain/session-flow.ts` saf reducer; `src/features/workout-session/store.ts` (zustand) reducer'ı çağırır ve her geçişte `local_session.machine_json`'a yazar (uygulama öldürülse de kaldığı yerden devam).

```ts
type Machine =
  | { phase: 'exercising'; stepIndex: number; draft: { weightKg: number | null; reps: number | null; durationSec: number | null; completion: CompletionType } }
  | { phase: 'resting'; stepIndex: number; restEndsAt: number; restDurationSec: number; notificationId: string | null }
  | { phase: 'overload_confirm'; stepIndex: number; pending: PendingSet; guardrail: GuardrailResult }
  | { phase: 'finished' };

type Event =
  | { type: 'COMPLETE_SET'; now: number; setId: string }        // guardrail → overload_confirm | resting | exercising(next) | finished
  | { type: 'CONFIRM_OVERLOAD'; now: number } | { type: 'FIX_OVERLOAD' }
  | { type: 'REST_ADD_15' } | { type: 'REST_SKIP' } | { type: 'REST_ELAPSED'; now: number }
  | { type: 'SKIP_EXERCISE'; exerciseId: string; reason: SkipReason; note?: string }
  | { type: 'MOVE_TO_END'; exerciseId: string }                 // "makine dolu" → sıranın sonuna (rpc.reorder)
  | { type: 'JUMP_TO'; stepIndex: number } | { type: 'PLAN_CHANGED'; steps: Step[] } | { type: 'FINISH' };

export function sessionReducer(m: Machine, e: Event, ctx: { steps: Step[]; snapshot: SessionPayload }): { next: Machine; effects: Effect[] };
type Effect = { kind: 'enqueue'; op: OutboxOp } | { kind: 'schedule_rest_notification'; at: number } | { kind: 'cancel_notification'; id: string }
  | { kind: 'haptic'; style: 'success' | 'warning' | 'selection' } | { kind: 'celebrate_pr'; exerciseId: string };
```

- Adımlar `buildSteps(snapshot)` (§7.7); plan değişince (`skip`, `reorder`, `time_crunch`, `cap`) `PLAN_CHANGED` ile yeniden hesaplanır, mevcut adım exerciseId+set ile yeniden eşlenir.
- **Rest timer:** durum yalnızca `{restEndsAt, restDurationSec, notificationId}`; kalan = `max(0, restEndsAt − Date.now())` (her saniye yeniden hesap; sayaç azaltma YASAK). Başlarken `Notifications.scheduleNotificationAsync({ content: { title: t('rest.doneTitle'), sound: prefs.sound ? 'default' : undefined }, trigger: { type: SchedulableTriggerInputTypes.DATE, date: restEndsAt, channelId: 'rest-timer' } })`; `+15 sn`/`Atla`/oturum bitişinde iptal ve yeniden kurma.
- Bitiş uyarısı: görsel flash + "Hazırsın"; iOS `Haptics.notificationAsync(Success)`, Android `Haptics.performAndroidHapticsAsync(AndroidHaptics.Confirm)`; opsiyonel bip (`expo-audio`, `interruptionMode:'duckOthers'`, yalnızca çalarken). Ön plandayken `setNotificationHandler` rest-timer bildirimi için `shouldShowBanner:false, shouldShowList:false`.
- Erişilebilirlik: timer yalnızca 10 sn kala ve 0'da duyurur.
- C4 açıkken `useKeepAwake('workout')` (ayarlardan kapatılabilir).
- C4 ekranı `gestureEnabled:false`; `usePreventRemove(true, …)` (expo-router export'u) → alt sayfa "Duraklat ve çık / Antrenmanı bitir / Vazgeç" (varsayılan Vazgeç). Duraklatılan oturum C1'de "Devam eden antrenman" kartı.
- PR canlı rozeti §7.4; guardrail modalı §7.2 (birincil buton "Düzelt", ikincil "Onaylıyorum"; odak açılışta başlıkta).

### 8.4 Bildirimler

- Kanallar uygulama açılışında (Android): `pt-alerts` (MAX importance, ses), `rest-timer` (HIGH), `general` (DEFAULT). `setNotificationChannelAsync` token alımından ÖNCE.
- İzin isteme zamanı: PT → ilk davet kodu üretiminde veya P1 ilk açılışında açıklama kartı; danışan → ilk dinlenme sayacında. Reddedilirse ayarlarda açıklama + sistem ayarlarına link.
- Android exact alarm: `SCHEDULE_EXACT_ALARM` izni yoksa ve kullanıcı dinlenmede uygulamayı arka plana aldıysa, sonraki açılışta tek seferlik açıklama + `IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', { data: 'package:' + Application.applicationId })`.
- Push token: izin sonrası `getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId })` → `rpc('register_push_token', { p_token, p_platform, p_device_id })`; açılışta ve token değişiminde yenilenir; logout'ta `unregister_push_token`.
- Deep link: kök layout'ta `const r = Notifications.useLastNotificationResponse(); useEffect(() => { const url = r?.notification.request.content.data?.url; if (typeof url === 'string' && url.startsWith('/')) router.push(url); }, [r]);` — yalnızca uygulama içi path'ler kabul edilir.

### 8.5 Realtime (PT)

```ts
// src/features/alerts/use-pt-feed.ts
useEffect(() => {
  if (!userId) return;
  const channel = supabase.channel(`pt:${userId}:feed`, { config: { private: true } })
    .on('broadcast', { event: '*' }, ({ event }) => {
      if (event.startsWith('alert_')) queryClient.invalidateQueries({ queryKey: ['alerts'] });
      if (event.startsWith('session_')) queryClient.invalidateQueries({ queryKey: ['radar-live'] });
      if (event.startsWith('pr_')) { queryClient.invalidateQueries({ queryKey: ['achievements'] }); queryClient.invalidateQueries({ queryKey: ['radar-live'] }); }
    })
    .subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') queryClient.invalidateQueries({ queryKey: ['alerts'] }); // kaçırılanları telafi
    });
  return () => { supabase.removeChannel(channel); };
}, [userId]);
```

AppState `active` olduğunda `['alerts']`, `['radar-live']` invalidate. Kanal bağlı değilse P1'de "Canlı bağlantı yok · son güncelleme HH:MM" bandı.

### 8.6 i18n (tr)

- `i18next` init: `lng: 'tr'`, `fallbackLng: 'tr'`, `resources: { tr: { translation: require('./tr.json') } }`, `interpolation.escapeValue: false`, `returnNull: false`.
- Anahtar ad alanları: `common.*`, `auth.*`, `onboarding.*`, `consent.*`, `pairing.*`, `workout.*`, `rest.*`, `readiness.*`, `guardrail.*`, `alerts.*` (payload'dan: `alerts.overload = "{{client}}, {{exercise}} egzersizinde {{target}} kg hedef yerine {{logged}} kg girdi (+%{{deviation}})."`), `errors.<rpc_hata_kodu>`, `enums.<enum>.<değer>` (kategori, bölge, skip gerekçesi, bitiş enerjisi).
- Büyük harf dönüşümü `toLocaleUpperCase('tr-TR')`; sayı/tarih `Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })`, `Intl.DateTimeFormat('tr-TR', { timeZone: profile.timezone })`.
- Zaman dilimi: açılışta `getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone` → farklıysa `rpc('set_my_timezone')`.

### 8.7 Tema ve tasarım token'ları

```ts
// src/lib/theme/tokens.ts
export const tokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  touch: { min: 48, workout: 56 },            // C4 kontrolleri ≥ 56 pt
  font: { body: 16, bodyLg: 18, title: 22, display: 34, numericHuge: 44 },
  color: {
    light: { bg: '#F5F7FA', surface: '#FFFFFF', text: '#0F172A', textMuted: '#475569', primary: '#1D6FD8', onPrimary: '#FFFFFF',
             note: '#1D4ED8', noteBg: '#E8F0FE', warning: '#92400E', warningBg: '#FEF3C7', danger: '#B91C1C', dangerBg: '#FEE2E2',
             success: '#166534', successBg: '#DCFCE7', border: '#E2E8F0' },
    dark:  { bg: '#0B1220', surface: '#111A2E', text: '#E2E8F0', textMuted: '#94A3B8', primary: '#60A5FA', onPrimary: '#0B1220',
             note: '#93C5FD', noteBg: '#172554', warning: '#FCD34D', warningBg: '#3B2A06', danger: '#FCA5A5', dangerBg: '#450A0A',
             success: '#86EFAC', successBg: '#052E16', border: '#1E293B' },
  },
} as const;
```

Semantik rozetler: `note` (mavi + not ikonu + "Notun:") önceki not için; `warning` (amber + uyarı ikonu + "Dikkat: Alt bel") bölgesel ağrı için; `danger` (kırmızı + ikon + metin) overload için; `success` PR için. Tüm metin/zemin çiftleri ≥ 4.5:1 (CI'da token kontrast testi). **Renk tek başına anlam taşımaz** (ikon + metin ZORUNLU).

### 8.8 Erişilebilirlik kuralları (ZORUNLU)

- Dokunma hedefi ≥ 48×48 pt; C4 ve C2 ≥ 56×56 pt; alt başparmak bölgesinde birincil eylemler.
- Stepper grubu tek öğe: `accessibilityRole="adjustable"`, `accessibilityValue={{ text: '62,5 kilogram' }}`, `accessibilityActions=[increment, decrement]`.
- DND alternatifi: her kartta ▲▼ butonları + `accessibilityActions` (moveUp/moveDown) + taşıma sonrası `AccessibilityInfo.announceForAccessibility`.
- Dynamic Type: sayısal büyük metinlerde `maxFontSizeMultiplier={1.4}`, düzen kırılmaz (iPhone SE + en büyük yazı testi).
- `useReducedMotion()` true → mikro animasyonlar (su, PR konfeti) atlanır.
- RPE ve readiness girişleri slider DEĞİL segmentli butonlar (RPE 2×5 grid, readiness soru başına 5 segment).

### 8.9 Klavye ve giriş

`react-native-keyboard-controller`: kökte `KeyboardProvider`; A1/A2/formlarda `KeyboardAwareScrollView`; C4 değer girişi `KeyboardStickyView` üzerinde "Tamam" çubuğu; `keyboardType="decimal-pad"` + `parseDecimalInput` + `roundToQuarterKg`.

### 8.10 Web kapsamı

`web.output: "single"`. Web'de: A1 (Google `signInWithOAuth` + PKCE, e-posta OTP), yasal sayfalar, davet linki sayfası ("Uygulamayı indir · Kodun: ABC123"). `client/workout/*` web'de "Mobil uygulamayı kullan" yönlendirmesi. `lib/db/*.web.ts` no-op; COOP/COEP header'ları set EDİLMEZ.

---

## 9. Ekranlar

Ortak: her ekran `<ScreenState status="loading|offline-empty|empty|error|ready" />` kullanır; hata durumunda "Tekrar dene"; tüm metinler i18n. "KK" = kabul kriteri (Maestro/RNTL testine dönüşür).

### A1 — Giriş (`src/app/(auth)/sign-in.tsx`)
- **Veri:** `signInWithGoogle()`, `signInWithApple()` (iOS), `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
- **Bileşenler:** Logo, `GoogleButton`, `AppleButton` (`AppleAuthentication.AppleAuthenticationButton`, yalnızca iOS, Google ile eşit boy), ayırıcı "veya e-posta ile", e-posta input (`autoComplete="email"`, `keyboardType="email-address"`), "Giriş Kodu Gönder", yasal linkler, gizli review girişi (§3.12).
- **Durumlar:** gönderiliyor (buton disabled + spinner), çevrimdışı ("İnternet bağlantısı gerekli"), 429 (kalan süre), iptal (sessiz).
- **KK:** geçersiz e-posta butonu pasif tutar; başarılı OTP isteğinde `otp-pending {email,sentAt}` yazılır ve A2 açılır; Android'de Apple butonu yok; Google iptali hata göstermez.

### A2 — OTP doğrulama (`src/app/(auth)/verify.tsx`)
- **Veri:** `verifyOtp({ email, token, type: 'email' })`, tekrar gönderim `signInWithOtp`.
- **Bileşenler:** `OtpCodeField` (§3.13), geçerlilik sayacı (05:00), "Tekrar gönder (0:SS)", yapıştır butonu, "E-postayı değiştir".
- **KK:** kodu yapıştırmak tek istek atar; çift tetik ikinci istek üretmez; yanlış kodda hücreler temizlenir ve haptik; uygulama arka plandan dönünce sayaç doğru; süre dolunca hücreler pasif + "Yeni kod iste"; Mailpit E2E: yeni ve mevcut e-posta.

### A3 — Rol ve ad (`src/app/onboarding/role.tsx`)
- **Veri:** `['profile']` (metadata'dan dolu ad).
- **Bileşenler:** "Adın" input, `RoleCard` ×2 ("Antrenörüm (PT)", "Danışanım / Sporcuyum"), "Devam".
- **KK:** ad 2–100 karakter olmadan devam pasif; seçim A4'e state olarak taşınır (DB'ye yazılmaz).

### A4 — Aydınlatma ve rıza (`src/app/onboarding/consent.tsx`)
- **Veri:** `rpc('complete_onboarding', …)`.
- **Bileşenler:** aydınlatma metni linki (WebBrowser), şartlar onayı (zorunlu), "18 yaşından büyüğüm" (zorunlu), danışan için "Sağlık verilerimin işlenmesine açık rıza veriyorum" (isteğe bağlı; altında "Vermezsen readiness, ölçüm ve PT eşleşmesi kapalı olur").
- **KK:** RPC başarısında guard rolüne yönlendirir; `already_onboarded` → profil yenilenip yönlendirilir; pending davet kodu varsa danışan `client/pairing?code=`'a gider.

### C1 — Danışan ana sayfa (`src/app/client/(tabs)/index.tsx`)
- **Veri:** `['client-home']` (`ClientHome`: program bloğu/haftası, `weekly_target`, `can_leave`), `['weekly-load']` (seri + hacim), `['measurement-deltas', uid]` (`measurement_latest_deltas`: tüm tiplerde son iki ölçüm ve fark — PT'nin girdiği çevre/denge/fonksiyonel ölçümler dahil), yerel `local_session`.
- **Bileşenler:** `ResumeWorkoutCard` (açık oturum: "Devam et" / "Önceki antrenmanı bitir" / "İptal et"), `TodayWorkoutCard` (sıradaki antrenman, egzersiz sayısı, tahmini süre, "Başla", "Başka gün seç"), `CompletedTodayBadge`, `WeeklyStreakCard` (§7.9) + son 4 hafta tonaj mini grafik, `MeasurementDeltaCard` (öncelik: kilo, bel, yağ oranı; "Tümü" → tip listesi; ▲▼ + metin, renk tek başına anlam taşımaz), `ProgramStatusCard` ("Hafta 3/6", blok tamamlandı, `can_leave` ise "Programı bırak" → onay → `leave_program`), `RadarCard` (solo), `PairingCta` (PT yoksa "Antrenörünün kodunu gir"), `ConsentCta` (sağlık rızası yoksa).
- **Durumlar:** program yok + PT yok → "Kendi antrenmanını oluştur" + "PT kodu gir"; program var bugün tamamlandı → "Bugün tamamlandı ✓ · Yine de başla"; çevrimdışı + cache → cache göster + bant; çevrimdışı + cache yok → offline-empty.
- **KK:** "Başla" çevrimdışıyken "Başlatmak için bağlantı gerekli" gösterir; açık oturum varken "Başla" üç seçenekli sheet açar: "Devam et" → C4; "Önceki antrenmanı bitir" → outbox flush + `complete_workout` (`nothing_logged` ise "Hiç çalışma seti yok · İptal et"); "İptal edip yenisini başlat" → flush + `abandon_workout` + aynı yeni id ile `start_workout`. PT'nin girdiği ölçüm C1 son değişim kartında görünür; eşleşmesi biten danışanda "Programı bırak" çalışır ve program kartı kaybolur.

### C2 — Readiness check-in (`src/app/client/workout/checkin.tsx`, modal)
- **Veri:** `from('readiness_logs').insert({ id: randomUUID(), user_id, sleep_rating, energy_rating, soreness_rating, stress_rating, pain_regions })`; ardından `rpc('start_workout', {…, p_readiness_log_id, p_deload_choice})`.
- **Bileşenler:** 4 × `SegmentedRating` (uç etiketleri: "Çok kötü/Çok iyi", "Yok/Şiddetli"), `BodyRegionPicker` (9 bölge, çoklu), canlı skor önizleme (§7.1), "Başla" (alt), "Atla".
- **Akış:** skor < 60 ve mod `confirm` → `DeloadOfferSheet` ("Toparlanman düşük görünüyor. Ağırlıkları %15 azaltıp son setleri kırpalım mı?" Evet/Hayır) → seçimle `start_workout`; mod `auto` → bilgi toast'u "Bugün koruyucu hacim uygulandı"; `session_in_progress` → C1 KK'deki üç seçenekli sheet (Devam et / Önceki antrenmanı bitir / İptal edip yenisini başlat; readiness kaydı 3 saat içinde yeni oturuma bağlanabilir).
- **Durumlar:** sağlık rızası yok → check-in yerine "Rıza ver" linki ve "Rızasız devam" (check-in atlanır).
- **KK:** (4,4,5,5) girişi 50 gösterir ve öneri kartını açar; "Atla" `readiness_outcome='skipped_checkin'` üretir; başarıda payload `['session-payload', id]` ve `local_session`'a yazılır, C3 açılır.

### C3 — Hazırlık (`src/app/client/workout/prepare.tsx`)
- **Veri:** snapshot (yerel), `rpc.reorder`, `wle.update` (skip), `rpc.time_crunch` (outbox).
- **Bileşenler:** `Sortable` liste (blok = kart, süperset tek kart, `customHandle` ≥48 pt, 250 ms aktivasyon), kart başı ▲▼, `PainBadge`, `SkipSheet` (gerekçeler: makine dolu / ağrı / zaman yok / ekipman yok / yorgunluk / diğer + not; "Makine dolu" için birincil eylem "Sıranın sonuna taşı"), `TimeCrunchSheet` (15/25/35/45 dk → pasif edilecekler + tahmini süre + set kırpma önerisi), deload bilgisi, "Antrenmana Başla".
- **KK:** süperset bölünemez (UI engeller, sunucu `block_split_not_allowed` döner); time-crunch sonrası öncelikli olmayanlar gri "Zaman için çıkarıldı"; geri al çalışır; tüm değişiklikler çevrimdışı kuyruğa girer.

### C4 — Aktif antrenman (`src/app/client/workout/active.tsx`)
- **Veri:** `local_session`, `local_sets`, outbox; `['bests']`.
- **Düzen:** Üst sabit panel (~56 pt: toplam süre `now − started_at`, ilerleme "Egzersiz 3/7 · Set 2/4", senkron ikonu). Orta kaydırılabilir: başlık + kategori, `NoteBadge` (önceki not, "Notu düzenle"), `PainBadge`, `SupersetChain` (A → B göstergesi), video küçük görseli (§5.7), katlanabilir püf noktaları, `WarmupPanel` (planlı ısınmalar veya §7.8 önerileri), tamamlanmış setler kompakt satırlar (dokununca düzenleme sheet'i; overload setleri kilitli). Alt sabit `ActiveSetPanel` (`useSafeAreaInsets().bottom`): ağırlık stepper `[-2×inc][-inc][değer][+inc][+2×inc]`, tekrar stepper `[-1][değer][+1]` (duration tipinde süre sayacı), `CompletionTypeSegment` (Tam/Kısmi/Başarısız), tam genişlik "Seti Tamamla". Dinlenmede alt panel: büyük geri sayım, "+15 sn", "Atla", `WaterButton` ("💧 Su İçtim" → mutlak sayaç, "Geri al" toast).
- **Kurallar:** değer varsayılanı = `adjusted ?? original` hedef (yoksa son loglanan); "Seti Tamamla" → §7.2 → gerekirse `OverloadConfirmModal` ("Antrenörünün belirlediği hedefin (+%150) çok üzerindesin. Bu veriyi onaylıyor musun?" [Düzelt] [Onaylıyorum]) → `local_sets` + `set.insert` → PR kontrolü → rest/next.
- **Durumlar:** senkron hatası satırda kırmızı ikon + "Tekrar dene"; çevrimdışı bant; video çevrimdışı mesajı; eşleşme antrenman sırasında bittiyse sunucu yine kaydeder (guardrail snapshot'ı geçerli), alarm üretilmez.
- **KK:** uçak modunda 10 set girilip uygulama öldürülüp açılınca setler ve dinlenme sayacı korunur, bağlantı gelince çoğaltmasız senkron; 20 kg hedefe 50 kg girişte modal bir kez açılır; iOS kenar kaydırma/Android geri tuşu doğrudan çıkarmaz; 375 pt genişlikte alt panel ve "Seti Tamamla" fold üstünde; kilitli ekranda dinlenme bitişinde bildirim gelir.

### C5 — Kapanış (`src/app/client/workout/summary.tsx`)
- **Veri:** `rpc.complete` (outbox) → yanıt gelince özet; çevrimdışıysa yerel özet (tonaj/süre `src/domain`) + "Gönderiliyor…".
- **Bileşenler:** süre, tonaj, hard set, `PrCelebration` (sunucu `prs[]`), "İlk kayıt" listesi, `RpeGrid` (1–10, Borg etiketleri), `EndEnergySegment` (Tükendim/Yorgun/Normal/Enerjik), "Kaydet ve Bitir". **0 çalışma seti** (yerel `local_sets`'te `working` yok): RPE/enerji gizlenir, birincil buton "Antrenmanı iptal et" (`rpc.abandon`), ikincil "Antrenmana dön"; sunucu yine de `nothing_logged` dönerse aynı ekran gösterilir.
- **KK:** RPE/enerji seçimi C5'ten çıkana kadar değiştirilebilir; bitirdikten sonra bekleyen bildirimler iptal, `local_session` temizlenir; PR yoksa kutlama yok; sıfır setli oturum tamamlanmış sayılmaz (seri ve rotasyon değişmez).

### C6 — Profil ve geçmiş (`src/app/client/(tabs)/profile.tsx` + alt sayfalar)
- **Bölümler:** Profili düzenle (ad, telefon), Geçmiş antrenmanlar (`history/[workoutLogId]`: payload, setler, skip gerekçeleri, deload/readiness bilgisi), Ölçümler (`measurements.tsx`: tip bazlı çizgi grafikler, PT notları okunur, "Kilo Ekle" → client measurement session + `weight_kg`/`body_fat_pct`), PT Eşleşmesi (`pairing.tsx`: kod gir → `preview_pairing_invite` → rıza ekranı [PT adı, paylaşılacak veri listesi, "Eşleşme öncesi geçmişimi de paylaş" anahtarı] → `redeem_pairing_invite`; aktifse PT adı + "Eşleşmeyi sonlandır" onaylı), Bildirim ayarları, Gizlilik (rızalar + geri çekme, "Tüm cihazlardan çıkış", "Hesabımı Sil"), "Oturumu Kapat".
- **Hata eşlemesi (pairing):** `code_invalid` "Kod geçersiz", `code_expired` "Kodun süresi dolmuş, antrenöründen yenisini iste", `code_used` "Bu kod kullanılmış", `already_paired`, `rate_limited` "{{dk}} dk sonra tekrar dene", `health_consent_required` → rıza ekranı.
- **KK:** sonlandırma sonrası PT kartı kaybolur, atanmış program danışanda kalır ve "Programı bırak" görünür (`leave_program`); aktif PT'nin programında aksiyon görünmez; kilo 20–400 dışı reddedilir; telefon yalnızca kendi profilde görünür.

### C7 — Antrenmanlarım (`src/app/client/(tabs)/workouts.tsx`, `client/templates/[templateId].tsx`)
- **Veri:** `workout_templates` (`owner_id=uid, client_id=uid`) + tek bloklu (`single`) egzersiz/set yazımı; `rpc('start_workout', { p_template_id })`.
- **Bileşenler:** şablon listesi, PT'den atanmış program günleri (salt okunur, "Başla"), yeni şablon; editör: egzersiz ekle (global + kendi özel egzersizleri, arama/kategori filtre), set ekle/"hepsine uygula", sırala; `client/exercises/new.tsx` özel egzersiz (bölge seçimi zorunlu).
- **KK:** danışan şablonunda tolerans ve süperset alanı görünmez; guardrail modalı açılmaz; egzersiz seçici yalnızca global + kendi + aktif PT'nin özel egzersizlerini listeler, sunucu `exercise_not_available` dönerse "Bu egzersiz artık kullanılamıyor".

### P1 — PT paneli (`src/app/pt/(tabs)/index.tsx`)
- **Veri:** `['radar-live']` = `from('workout_logs').select('id,user_id,started_at,last_activity_at,template_title_snapshot,profiles!workout_logs_user_id_fkey(full_name,avatar_url)').eq('status','in_progress').gt('last_activity_at', now−30dk)`; `['alerts','open']` = `from('pt_alerts').select('*, client:profiles!pt_alerts_client_id_fkey(full_name)').in('status',['open','acknowledged']).in('alert_type',['OVERLOAD_RISK','LOW_READINESS']).order('last_occurred_at',{ascending:false})`; `DELOAD_RECOMMENDED` kartları; `['achievements']` = `pr_events` son 7 gün; realtime §8.5.
- **Bileşenler:** `LiveRadarList` ("Son set 3 dk önce"; `pr_candidate` gelen danışan satırında kupa ikonu + "Rekor adayı" — kesinleşme `pr_achieved`), `CriticalAlertCard` (kırmızı, ikon, payload'dan i18n metin, "×N" tekrar; **geç senkron:** `payload.server_received_at − payload.performed_at > 10 dk` ise "{{süre}} önce yapıldı, şimdi senkronlandı" — iki alan da §4.6 OVERLOAD payload'ında), `ReadinessAlertCard` (amber), `DeloadSuggestionCard` (mavi/info), `AchievementsFeed` (PR'lar; alarm vitrininden ayrı; `pr_achieved` ile anında yenilenir), bağlantı bandı.
- **Alarm detayı (`pt/alerts/[alertId].tsx`):** oturum/set bağlamı; eylemler: "Gördüm" (`acknowledge`), "Seti onayla" (`approve_set`), "Hedefi X kg'a güncelle" (`update_target`, stepper), "E-posta gönder" (`mailto:`), telefon varsa "WhatsApp" (`https://wa.me/<E.164>`) ve "Ara" (`tel:`) — iletişim `get_client_contact`.
- **KK:** danışan 50 kg girince (online) 5 sn içinde kart görünür ve push gelir; aynı egzersizde 3 overload tek kart ×3; eşleşmesi biten danışanın kartları kaybolur.

### P2 — Danışan yönetimi (`src/app/pt/(tabs)/clients.tsx`, `pt/clients/[clientId]/index.tsx`)
- **Liste:** aktif danışanlar (ad, son antrenman, açık alarm sayısı), "Yeni Danışan Bağla" → `create_pairing_invite` → `InviteCodeSheet` (büyük kod, geri sayım, "Kopyala", "Paylaş" [RN `Share`: "PulseCoach'ta antrenörün seni bekliyor. Kod: ABC123 · pulsecoach://invite/ABC123"], "İptal et"); açık davetler listesi.
- **Detay sekmeleri:** Özet (haftalık tonaj/hard set/readiness grafiği `weekly_client_load`, bests, son PR'lar), Loglar (`workout_logs` + `session_volume`; detayda setler, overload/deload_ignored işaretleri, skip gerekçeleri, RPE, bitiş enerjisi, readiness, "Kısaltılmış seans", "Kendi antrenmanı" etiketi), Program (aktif program günleri; "Program ata" → kütüphane programı seç → `assign_program`; gün şablonunu düzenle → `pt/templates/[id]`), Ölçümler (P3'e git, grafikler), Ayarlar (deload modu `set_pair_deload_mode`, iletişim, "Eşleşmeyi sonlandır").
- **KK:** 5 açık davetten sonra buton pasif ("En fazla 5 açık kod"); `data_visible_from` öncesi veriler görünmez ve "Danışan eşleşme öncesi geçmişi paylaşmadı" notu.

### P3 — Ölçüm ve değerlendirme (`src/app/pt/clients/[clientId]/assessment.tsx`)
- **Veri:** `measurement_sessions` insert (`recorded_by_role='pt'`, `measured_at` seçilebilir tarih) + `measurements` toplu insert; geçmiş listesi.
- **Bileşenler:** tarih seçici; Mezura (kol L/R, omuz, göğüs, bel, kalça, bacak L/R); Denge (tek bacak göz açık/kapalı L/R sn, Y-Balance 3 yön L/R + bacak boyu; **bileşik skor sunucuda** `y_balance_composite_pct` olarak türetilip saklanır ve grafiklenir); **Fonksiyonel** (0–3 hareket kalitesi: overhead squat, tek bacak squat L/R, hip hinge; şınav maks tekrar; otur-uzan cm; yan plank L/R sn — `measurement_category='functional'`); Postür notları; PT notları (uyarı: "Danışan bu notları görebilir; tanı/ilaç bilgisi girme"); kilo/yağ opsiyonel.
- **KK:** aralık dışı değer satır içinde hata; kayıt sonrası danışan C6 grafiklerinde ve C1 son değişim kartında görünür; bileşik Y-Balance skoru girdiler değişince yeniden hesaplanır, istemci bu tipi yazamaz; eşleşmesi olmayan danışan için ekran açılamaz.

### P4 — Program ve şablon tasarımcısı (`src/app/pt/(tabs)/programs.tsx`, `pt/programs/[programId].tsx`, `pt/templates/[templateId].tsx`)
- **Program editörü:** başlık/açıklama, **blok süresi (hafta, opsiyonel)** ve **haftalık gün hedefi** (`duration_weeks`, `days_per_week`), gün listesi (`program_workouts`: day_order sürükle, etiket "A/B/C", şablon seç/oluştur), "Danışana ata" (başlangıç tarihi). Bu, PRD "Blok ve Hafta Planlama" maddesinin v1 karşılığıdır (§10 #28).
- **Şablon tasarımcısı:** şablon toleransı (%, kg); blok listesi (`reorder_template_blocks`); "Egzersiz ekle" (P5 havuzundan; `is_priority` varsayılanı `category='compound'`); "Süperset yap" (seçili 2–4 egzersiz → `block_type='superset'`, tur dinlenmesi); egzersiz satırında öncelik anahtarı, tolerans override; set tablosu (ısınma/çalışma ayrı; tekrar min–max, AMRAP, süre [duration tipinde], hedef kg [0.25 adım], dinlenme [single blokta tüm setler; süperset blokta yalnızca ısınma setleri — boşsa ısınma 60 / çalışma 90 sn]); "Tüm setlere uygula"; tahmini süre (§7.7).
- **Hazır şablonlar:** şablon listesinde "Hazır şablonlardan başla" → `['system-templates']` önizleme → `clone_system_template` → kopya editörde açılır.
- **Kurallar:** blok/set silme sonrası numaralar sıkıştırılır (istemci update); programda kullanılan şablon silinemez (arşivle); danışan kopyası düzenlenirken üst bant "Bu değişiklik yalnızca {{danışan}} için".
- **KK:** PRD §8.2 örneği kurulup atanabilir; süperset tek blok olarak C3'te görünür; kaydedilmemiş değişiklikle çıkışta uyarı.

### P5 — Egzersiz havuzu (`src/app/pt/(tabs)/exercises.tsx`, `pt/exercises/[exerciseId].tsx`)
- **Liste:** global + kendi özel egzersizleri; arama, kategori ve bölge filtresi; arşivlenenler gizli.
- **Form:** başlık, kategori, hedef kas (metin), bölgeler (1–4, zorunlu), takip tipi, yük modu (toplam/el başı), artış adımı, min yük, video linki (yapıştır → `parseVideoUrl` → `video_provider/video_id/video_hash/video_start_sec`; geçersizse satır içi hata; önizleme küçük görseli), püf noktaları (≤2000, düz metin).
- **Kurallar:** yalnızca kendi özel egzersizini düzenler; "Sil" yerine "Arşivle" (`archived_at`); global egzersiz düzenleme butonu yok; kendi özel egzersizinde "Global kütüphaneye öner" (not ≤ 500) → `suggest_exercise_to_global` (`suggestion_pending` → "İnceleniyor" rozeti, `too_many_suggestions` → "Günlük öneri sınırı").
- **KK:** `https://youtu.be/<id>` kaydedilince DB'de `video_provider='youtube', video_id=<id>`; `https://vimeo.com/<id>/<hash>` kaydedilince `video_hash` dolar ve oynatıcı `?h=` ile açılır; kullanılan egzersiz arşivlenince geçmiş loglarda başlık snapshot'ı görünür.

### P6 — PT profil ve ayarlar (`src/app/pt/(tabs)/profile.tsx`)
- Profili düzenle (ad, telefon), bildirim tercihleri (`notification_preferences`: overload push, düşük readiness push), yasal belgeler, "Tüm cihazlardan çıkış", "Hesabımı Sil" (aktif danışan sayısı uyarısıyla), "Oturumu Kapat".
- **KK:** hesap silindiğinde danışanların atanmış programları kalır (pgTAP ile doğrulanan davranış).

### Ek ekranlar
- **`invite/[code].tsx`:** kodu `normalizeInviteCode` ile `pending-invite` kv'ye yazar; oturum yoksa A1, onboarding bitmemişse A3, danışansa `client/pairing?code=`, PT ise "Bu kod danışanlar içindir".
- **`offline-gate.tsx`:** "Bağlantı gerekli" + "Tekrar dene" (profil fetch).
- **Güncellenen koşullar:** bloklayan onay ekranı → `accept_document_versions`.
- **Web `account-deletion` sayfası** (statik, uygulama dışı): talep formu → destek e-postası.

---

## 10. PRD'ye göre değişiklikler ve açıklamalar

| # | PRD ne diyordu | Şartname kararı | Neden |
|---|---|---|---|
| 1 | §2.1 "Parola hash'i dahi saklanmaz" | "Kullanıcıya parola sorulmaz/yönetilmez." GoTrue OTP kullanıcılarına rastgele geçici parola atar; `secure_password_change=true`, audit izleme | Teknik doğruluk (AUTH missed) |
| 2 | §2.1 İki kanal (Google + e-posta OTP) | Üç kanal: iOS'ta Apple ile Giriş eklendi | App Store 4.8 |
| 3 | §2.1 "5 dakika geçerli kod" | `otp_expiry=300`, resend 60 sn; hem `confirmation` hem `magic_link` şablonu kodlu | Supabase varsayılanı 1 saat ve link |
| 4 | §2.2 "Oturum asla sonlanmaz", SecureStore | Oturum çıkış, hesap silme, başka cihazdan global çıkış veya sunucu iptaline kadar sürer; LargeSecureStore | SecureStore boyut sınırı, reuse detection |
| 5 | §2.3 Tek adım rol seçimi | A3 (ad + rol) + A4 (şartlar, 18+, sağlık rızası); rol tek seferlik RPC | Rol yükseltme, isimsiz kullanıcı, KVKK |
| 6 | §3 Super Admin global kütüphaneyi yönetir ve antrenman şablonu tasarlar | v1'de uygulama içi admin ekranı yok; Super Admin rolü **içerik hattıdır** (§6.8): global egzersizler ve **sistem şablonları** (`is_system`) migration ile; PT'ler sistem şablonunu `clone_system_template` ile kopyalar | Ekransız yetki ve güvenlik; PRD yetkileri süreçle karşılanır |
| 7 | §3 PT "Öneri yapabilir" | v1: P5 "Global kütüphaneye öner" (`suggest_exercise_to_global`), inceleme içerik hattında (`private.review_exercise_suggestion`); uygulama içi inceleme ekranı v2 | PRD yetkisi karşılanır |
| 8 | §3 Danışan özel egzersizi "sadece kendisi görür" | Kendisi + aktif PT'si (loglarda); PT'nin özel egzersizi atanmış danışanlarına görünür | Çapraz görünürlük olmadan C4 kırılır |
| 9 | §3 PT "DND Evet" | "Şablonda sıra ve öncelik belirleme (P4)"; antrenman anı DND yalnızca danışan, snapshot'a yazar | PT'nin canlı antrenman ekranı yok |
| 10 | §3 Kilo girişi: danışan Evet / §5.2 C6 "sadece okuma" / §6 P3 "danışan giremez" | Danışan kilo + yağ oranı girer (C6 "Kilo Ekle"); mezura/denge/postür yalnızca PT | İç çelişki |
| 11 | §3 Eşleşme satırı "Client: kodu girer/doğrular" | "Kod üretme: PT", "Kod kullanma: Client" | Matris netliği |
| 12 | §4.1 "Two-Way Handshake", 6 haneli alfa-numerik, VARCHAR(8) | PT kod üretir, danışan PT'yi görüp rıza verir, PT ayrıca onaylamaz; 6 karakter, 31 harfli alfabe; ayrı `pairing_invites`; tek aktif PT; deneme sınırı | Güvenli tüketim, KVKK |
| 13 | §4.1 "PT danışanın geçmiş verilerine tam erişim" | Danışan "eşleşme öncesi geçmişi paylaş" seçer (anahtar açıkken PRD'deki "tam erişim" birebir sağlanır); türetilmiş özetler (radar, oturum başı en iyi e1RM, PR önceki en iyi) de aynı sınıra tabidir; eşleşme bitince erişim anında kesilir | Açık rıza, ölçülülük |
| 14 | §4.2 "Varsayılan %20 veya +5 kg" | `allowed = hedef + max(hedef×%20, 5 kg)`; hedef NULL → kural yok; referans orijinal hedef; yalnızca aktif PT'nin şablonunda | Belirsiz "veya", deload etkileşimi |
| 15 | §4.2 Her set PT'ye kırmızı bildirim | Egzersiz başına oturumda tek kart (tekrar sayısı), push ile | Alarm yorgunluğu |
| 16 | §4.3 "Hazır Oluşluk Skoru (0–100)" | Aralık 20–100 (formül aynı), eşik < 60 | Formülün minimumu 20 |
| 17 | §4.3 "%15 düşürür, son setleri kırpar"; şablonda `auto_deload_enabled` boolean | Mod eşleşmede `off/auto/confirm` (VARSAYILAN confirm); artış adımına aşağı yuvarlama; set `max(1, round(n×2/3))` | Üç durum, yüklenebilir ağırlık |
| 18 | §4.3 Bölgesel ağrı: serbest metin `pain_areas`, `target_muscle` | `body_region` enum; egzersizde `primary_regions[]` | Eşleşme imkânsızdı |
| 19 | §4.4 Epley her sette; PR "geçmiş en yüksek" | 1–12 tekrar; reps=1 → ağırlık; PR oturum kapanışında önceki tamamlanmış oturumlara göre; ilk kayıt PR değil; PR alarm tablosunda değil; PT paneline set anında `pr_candidate`, kapanışta `pr_achieved` realtime sinyali ("başarı logu iletilir") | Sahte PR, spam |
| 20 | §4.5 "Son 3 hafta / son 2 hafta / 14 gün", "Set × Tekrar × Ağırlık" | Ölçülebilir radar tanımı (§7.6); tonaj `Σ tekrar × kg` | Tanımsız eşikler, hatalı formül |
| 21 | §5.1 A3 "Sadece İlk Girişte" | `role IS NULL` sunucu kontrolü | DEFAULT 'client' tespiti imkânsız kılıyordu |
| 22 | §5.2 C1 "Bugünün antrenman kartı" | Sıralı rotasyon; takvim/blok-hafta v1.2 | Şemada program yoktu |
| 23 | §5.2 C2 readiness antrenmana bağlı | Bağımsız kayıt, oturuma sonradan bağlanır | Yetim oturum |
| 24 | §5.2 C3 DND/skip nereye yazılacağı yok | `workout_log_exercises` snapshot'ı | PT şablonu bozulurdu |
| 25 | §5.2 C4 "[-5][-1][+1][+5]" | Adım egzersizin artış adımından (`±inc`, `±2×inc`) | Yüklenemeyen değerler |
| 26 | §5.2 C5 "Session RPE (1–10 Slider)" | Segmentli 2×5 grid | Terli el hatası |
| 27 | §5.2 C6'da hesap silme yok | C6/P6 "Hesabımı Sil" + web silme sayfası | Mağaza zorunluluğu |
| 28 | §5.3 P4 "Blok ve Hafta Planlama" | v1: blok = süreli program (`duration_weeks`), hafta planı = haftalık gün hedefi (`days_per_week`) + sıralı gün rotasyonu + hafta sayacı / blok bitti kartı; hafta bazlı hedef progresyonu, deload haftası şablonu ve takvim v1.2 | PRD ekran maddesi v1'de karşılanır; tam periyotlama kapsam dışı |
| 29 | §5.3 P1 "Kritik Alarmlar" içinde PR | PR ayrı "Başarılar" akışı (realtime ile anlık) | Vitrin kirliliği |
| 30 | §6 C3 "sadece bileşik hareketleri korur" | "Sadece öncelikli (`is_priority`) hareketleri korur"; öncelik varsayılanı kategori `compound`; seçilen süre tahmin/kırpma önerisinde kullanılır | Üç kavram çelişkisi |
| 31 | §6 C4 önceki not "sarı rozet" | Not = mavi `note` rozeti; sarı/amber yalnızca ağrı uyarısı | Güvenlik anlamı karışıyordu |
| 32 | §6 P3 `clinical_notes` | `pt_notes`, danışan okuyabilir, "tıbbi tavsiye değildir" uyarısı | KVKK erişim hakkı |
| 33 | §7 şema (tamamı) | §4–§6 şeması: enum'lar, NOT NULL, RLS, açık GRANT, snapshot, blok/set, program, ölçüm, rıza, push, radar, audit | Bulgular |
| 34 | §7 `profiles.email UNIQUE NOT NULL` | Kolon yok; `get_client_contact` RPC | Senkron kaybı kaydı kilitler, ifşa |
| 35 | §7 `video_embed_url TEXT` | `video_provider + video_id` | Oltalama/WebView riski |
| 36 | §7 `pt_alerts.message TEXT` | `payload jsonb` + istemci i18n | Lokalizasyon, sahtecilik |
| 37 | §7 `total_tonnage_kg`, `is_pr` kolonları | View / `exercise_bests` + `pr_events` | Bayat denormalizasyon |
| 38 | §8.1 `"create_user": true` (REST) | supabase-js `options.shouldCreateUser: true` | İstemci API'si |
| 39 | §8.2 `workout_id`, `exercise_id: "ex_101"`, `target_reps` int, `video_url`, `warmup_suggestions`, `superset_group_id: "group_super_1"` | `SessionPayload` (§4.6): UUID'ler, `reps_min/max`, `video_provider/id`, blok modeli; `warmup_suggestions` sunucu payload'ında (planlı ısınma yoksa §7.8 önerisi) | Şema uyumu |
| 40 | §8.3 `severity: "CRITICAL"`, `client_name`, `timestamp` | `severity` enum küçük harf; isim istemcide profiles'tan; `last_occurred_at` + payload `performed_at` | Normalizasyon |
| 41 | PRD'de offline yok | NFR: oturum başlatıldıktan sonra çevrimdışı çalışır; başlatma online | Salon koşulları |
| 42 | PRD'de push yok (yalnızca vitrin) | Overload ve program push'u | "Anlık alarm" vaadi |
| 43 | PRD'de zaman dilimi yok | `profiles.timezone`, `local_date`, ISO hafta | Seri/radar doğruluğu |
| 44 | PRD'de web ayrıntısı ("PWA IndexedDB") | Web: giriş + statik sayfalar; C4 yok | Kapsam |
| 45 | PRD'de solo danışan ekranı yok | C7 "Antrenmanlarım" (VARSAYILAN) | §2.3 vaadi |
| 46 | PRD'de monetizasyon yok | v1: ödeme yok, danışan limiti yok | Açık karar |
| 47 | §5.3 P3 "Fonksiyonel Değerlendirme & Denge Skorları" | `measurement_category='functional'` tipleri (0–3 hareket kalitesi, saha testleri) + Y-Balance bileşik skoru sunucuda türetilip saklanır (`is_derived`) | Grafik/geçmiş tutarlılığı |
| 48 | §5.2 C1 "Son Ölçüm Değişimleri" | `measurement_latest_deltas` view'ı: tüm ölçüm tiplerinde son iki değer ve fark (PT girişleri dahil) | Yalnızca kilo farkı PRD'yi karşılamıyordu |
| 49 | §3 "Kendi özel egzersizi (sadece kendisi görür)" | Şablona egzersiz ekleme görünürlük kuralına tabi (`exercise_not_available`); PT kütüphanesine danışan egzersizi eklenemez | UUID ile gizli egzersize erişim / atama ile sızma |

---

## 11. Uygulama fazları ve doğrulama

### 11.1 Fazlar (build sırası)

| Faz | Kapsam | Çıkış kriteri |
|---|---|---|
| **F0 — Temel** (1–2 hafta) | `.gitignore`, `app.config.ts`, EAS profilleri, dev build iOS+Android; `supabase/config.toml` (§3.2) + `otp.html`; migration 01–05 + seed + pgTAP; `supabase gen types`; `src/domain` iskeleti + §7 testleri; ESLint katman kuralları; Sentry; CI hattı; ADR 0001–0004; Google nitro PoC; SDK 57 AES API doğrulaması; global egzersiz içerik iş kalemi başlatılır; transactional e-posta sağlayıcısı | §11.2 komutlarının hepsi yeşil (pgTAP + §11.4 RLS EXPLAIN kabulü); PoC başarılı; Firebase projesi ve `google-services.json` (EAS file env) hazır; `eas credentials` ile **FCM V1 service account** (Android) ve **APNs key** (iOS) yüklendi |
| **F1 — Kimlik** | A1–A4, AuthProvider, LargeSecureStore, guard, offline gate, logout, global logout, timezone senkronu, güncellenen koşullar, Maestro OTP akışı (Mailpit) | Yeni/mevcut e-posta ile kod gelir; Google/Apple giriş; soğuk açılışta login görünmez; uçak modunda açılış dashboard'a gider |
| **F2 — Kütüphane ve eşleşme** | P5, P4 (şablon + program), P2 (liste, davet, detay iskeleti), C6 pairing (önizleme/rıza/kullanma/sonlandırma), `assign_program`, bildirim kanalları + push token | Davet → eşleşme → program ataması uçtan uca; RLS testleri; **iOS ve Android gerçek cihazda push smoke testi** (token kaydı → `program_assigned` push'u → dokununca deep link) |
| **F3 — Çekirdek antrenman döngüsü** | C1 (home, rotasyon), C2 (readiness + deload), C3 (DND, skip, time-crunch), C4 (outbox, durum makinesi, rest timer, guardrail modalı, video, not), C5, geçmiş; `send-push` + Vault; P1 (radar, alarm kartları + aksiyonlar, realtime, başarılar) | 20→50 kg senaryosu: modal + alarm kartı + push; uçak modu E2E; çift gönderimde çoğaltma yok |
| **F4 — Ölçüm, analiz, solo** | P3 (fonksiyonel testler + Y-Balance bileşik), C6 ölçüm grafikleri + kilo ekle, C1 son ölçüm değişimleri, P2 grafikler (weekly_client_load), C7, akıllı ısınma paneli, deload radarı kartları, haftalık seri, program blok/hafta alanları, sistem şablonları + öneri akışı | Radar vektörleri; grafikler |
| **F5 — Uyum ve yayın** | Hesap silme (Edge + varyant bundle ID'li Apple revoke + web sayfası), review-login (görünür demo girişi, audit) + `create-review-users.ts` + `seed-demo.sql` + `docs/store/app-review.md`, KVKK süreç kontrol listesi (§5.9), data inventory, store beyanları, erişilebilirlik denetimi, performans (soğuk açılış < 3 sn orta Android, set geri bildirimi < 100 ms), captcha flag, lansman kontrol listeleri (§3.14, §5.9) | TestFlight + Play internal; Play'den indirilen build'de Google giriş |
| **v1.1** | Tam offline başlatma, push receipt, analitik olayları, hesap bağlama ekranı, seans yorumları, oEmbed CI | |
| **v1.2** | Hafta bazlı progresyon/periyotlama (v1 blok süresi + haftalık hedef üzerine), takvim, tolerans/deload parametre ayarları | |
| **v2** | Uygulama içi admin/öneri inceleme paneli (v1'de içerik hattı, §6.8), PT'nin kendi antrenmanı, sohbet, monetizasyon, lb birimi, masaüstü PT paneli | |

### 11.2 Doğrulama komutları (CI ve her PR)

```bash
# Veritabanı
npx supabase start
npx supabase db reset                       # migration 01–05 + seed
npx supabase test db                        # pgTAP (245 assertion; plan: no_plan)
npx supabase db lint --level warning
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/perf/rls_explain.sql > /tmp/rls_explain.txt \
  && ! grep -qE 'SubPlan|Function Scan on my_client' /tmp/rls_explain.txt   # §11.4 kabul kriteri (DB_URL: npx supabase status -o env)
npx supabase gen types typescript --local > src/types/database.ts && git diff --exit-code src/types/database.ts

# İstemci
npx tsc --noEmit
npx expo lint
npx jest --ci                               # src/domain vektörleri + RNTL
npx expo install --check
npx expo-doctor

# Güvenlik
npx expo export --platform all && ! grep -rEq 'sb_secret_[A-Za-z0-9]' dist/
gitleaks detect --no-banner

# Konfigürasyon sapması (hosted, link'li ortam)
npx supabase config diff

# E2E (dev build + yerel Supabase + Mailpit)
maestro test .maestro/
```

### 11.3 pgTAP test paketi (`supabase/tests/database/001_core.test.sql`)

Aşağıdaki dosya, bu belgedeki migration'lar ve seed ile birlikte `supabase/postgres:17.6.1.167` imajında çalıştırıldı: **245/245 geçti** (2026-09-15, revizyon 1.1). Kapsam: saf fonksiyon vektörleri (Epley, deload, guardrail + ALGO-11 sınırları, ISO hafta, **ısınma önerisi**); şema sağlığı (RLS kapalı tablo yok, anon'a sıfır yetki, cron işleri, **her FK'nın index'li olması**, `primary_regions` DEFAULT'suz, sistem şablonlarında yalnızca global egzersiz, en iyi e1RM'in tabloda saklanmaması); kayıt trigger'ı; rol koruması ve tek seferlik onboarding; **profil kolon gizliliği ve `get_my_profile`**; rızasız readiness/eşleşme engeli; davet kodu, önizleme, deneme sınırı, tek aktif PT, kullanılmış kod, geçmiş paylaşmama; **egzersiz görünürlüğünün yazımla genişletilememesi, sistem şablonu kopyalama, global kütüphane önerisi ve incelemesi**; PT RLS yazımları ve derin kopya ataması; **PT kütüphanesine danışan egzersizi eklenememesi, Y-Balance bileşik skorunun sunucuda türetilmesi, fonksiyonel ölçümler, son ölçüm değişimleri view'ı**; deload (50 kg, set kırpma), ağrı rozeti, **ısınma/süperset dinlenme kuralı**; guardrail (sunucu hesaplı bayrak, istemcinin bayrak yazamaması, idempotent tekrar gönderim, overload setinin değiştirilemez/silinemez olması), egzersiz başına tek alarm, **`server_received_at`**; push kuyruğu ve talep/bitir uçları; başka PT'nin erişememesi; time-crunch, blok içi sıra, tamamlanan egzersiz kilidi, süperset bölünme engeli; tonaj; PR (onaysız overload baseline dışı), PT onayıyla bests; **aynı egzersizin iki kez geçtiği şablonda satır bazlı guardrail (ALGO-6), sunucu ısınma önerisi payload'ı, okuma anında önceki en iyi, `pr_candidate`/`pr_achieved` yayınları**; eşleşme sonlandırmada erişimin kesilmesi, guardrail'in kapanması, **`program_managed_by_pt` / `leave_program`, `nothing_logged`**; yarım oturum cron'u, **cron sonrası geç senkronda RLS UPDATE penceresi**; **radar KVKK (paylaşmayan danışan → PT 0 satır/0 alarm; paylaşan → alarm), danışan başına LOW_READINESS tekilleştirmesi**; hesap silme (**özel egzersizi kendi şablonunda/logunda olan danışan ve danışan kopyasında olan PT; temizliğin yalnızca kullanılmayanları silmesi; sistem şablonunun korunması**).

```sql
-- =====================================================================
-- supabase/tests/database/001_core.test.sql  (pgTAP; `supabase test db`)
-- Kimlik değiştirme kalıbı:
--   reset role; set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true);
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;
-- Migration'daki global "revoke execute from public" varsayılanı pgTAP fonksiyonlarını da etkiler:
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;

select no_plan();

select set_config('t.pt1', '11111111-1111-4111-8111-111111111111', true);
select set_config('t.pt2', '22222222-2222-4222-8222-222222222222', true);
select set_config('t.c1',  '33333333-3333-4333-8333-333333333333', true);
select set_config('t.c2',  '44444444-4444-4444-8444-444444444444', true);
select set_config('t.c3',  '55555555-5555-4555-8555-555555555555', true);

-- ===================== 1. Saf fonksiyon vektörleri =====================
select is(private.epley_e1rm('weight_reps','working','full', 8, 60), 76.00::numeric, 'e1rm 60x8 = 76.00');
select is(private.epley_e1rm('weight_reps','working','full', 1, 100), 100.00::numeric, 'e1rm 100x1 = 100');
select is(private.epley_e1rm('weight_reps','working','full', 0, 100), null::numeric, 'e1rm reps 0 = null');
select is(private.epley_e1rm('weight_reps','working','full', 5, 82.5), 96.25::numeric, 'e1rm 82.5x5 = 96.25');
select is(private.epley_e1rm('weight_reps','working','full', 7, 57.5), 70.92::numeric, 'e1rm 57.5x7 = 70.92');
select is(private.epley_e1rm('weight_reps','working','full', 12, 100), 140.00::numeric, 'e1rm 100x12 = 140');
select is(private.epley_e1rm('weight_reps','working','full', 13, 100), null::numeric, 'e1rm reps 13 = null');
select is(private.epley_e1rm('weight_reps','warmup','full', 8, 60), null::numeric, 'e1rm warmup = null');
select is(private.epley_e1rm('weight_reps','working','failed', 8, 60), null::numeric, 'e1rm failed = null');
select is(private.epley_e1rm('bodyweight_reps','working','full', 8, 10), null::numeric, 'e1rm bodyweight = null');
select is(private.deload_weight(60, 2.5, 20), 50.0::numeric, 'deload 60 -> 50');
select is(private.deload_weight(100, 2.5, 20), 85.0::numeric, 'deload 100 -> 85');
select is(private.deload_weight(22.5, 2.5, 20), 22.5::numeric, 'deload 22.5 (min 20) -> korunur');
select is(private.deload_weight(12, 2, 0), 10::numeric, 'deload 12 inc2 -> 10');
select is(private.deload_weight(8, 2, 0), 6::numeric, 'deload 8 inc2 -> 6');
select is(private.deload_weight(2, 2, 0), 2::numeric, 'deload 2 inc2 -> korunur');
select is(private.deload_keep_sets(1), 1, 'keep 1->1');
select is(private.deload_keep_sets(2), 1, 'keep 2->1');
select is(private.deload_keep_sets(3), 2, 'keep 3->2');
select is(private.deload_keep_sets(4), 3, 'keep 4->3');
select is(private.deload_keep_sets(5), 3, 'keep 5->3');
select is(private.deload_keep_sets(6), 4, 'keep 6->4');
select is(private.guardrail_allowed_max(20, 20, 5), 25::numeric, 'allowed 20/%20/5 = 25');
select is(private.guardrail_allowed_max(200, 20, 5), 240::numeric, 'allowed 200/%20/5 = 240');
select is(private.guardrail_allowed_max(100, 15, 5), 115::numeric, 'allowed 100/%15/5 = 115');
select is(private.guardrail_allowed_max(0, 20, 5), 5::numeric, 'allowed hedef 0 = abs 5');
select is(private.iso_week_start('2026-09-15'::date), '2026-09-14'::date, 'ISO hafta: Salı -> Pzt');
select is(private.iso_week_start('2026-09-13'::date), '2026-09-07'::date, 'ISO hafta: Pazar -> önceki Pzt');
-- ALGO-11 sınır vektörleri (numeric kesin; float'ta 50×0.15 = 7.4999…)
select is(private.guardrail_allowed_max(50, 15, 5), 57.5::numeric, 'allowed 50/%15/5 = 57.5');
select is(57.5 > private.guardrail_allowed_max(50, 15, 5), false, 'sınır: 50 -> 57.5 (%15) ok');
select is(57.75 > private.guardrail_allowed_max(50, 15, 5), true, 'sınır: 50 -> 57.75 (%15) over');
select is(private.guardrail_allowed_max(200, 15, 5), 230::numeric, 'allowed 200/%15/5 = 230');
select is(230 > private.guardrail_allowed_max(200, 15, 5), false, 'sınır: 200 -> 230 (%15) ok');
select is(24 > private.guardrail_allowed_max(20, 20, 5), false, 'sınır: 20 -> 24 (%20) ok');
-- §7.8 ısınma önerisi vektörleri (sunucu = TS)
select is(private.warmup_suggestions(30, true, true, true, 2.5, 20), '[]'::jsonb, 'ısınma 30 -> []');
select is(private.warmup_suggestions(40, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":25,"reps":5}]'::jsonb, 'ısınma 40');
select is(private.warmup_suggestions(52.5, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":32.5,"reps":5}]'::jsonb, 'ısınma 52.5');
select is(private.warmup_suggestions(60, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":37.5,"reps":5}]'::jsonb, 'ısınma 60');
select is(private.warmup_suggestions(79.9, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":50,"reps":5}]'::jsonb, 'ısınma 79.9');
select is(private.warmup_suggestions(80, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":40,"reps":5},{"weight_kg":60,"reps":3}]'::jsonb, 'ısınma 80');
select is(private.warmup_suggestions(100, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":50,"reps":5},{"weight_kg":75,"reps":3}]'::jsonb, 'ısınma 100');
select is(private.warmup_suggestions(120, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":47.5,"reps":5},{"weight_kg":70,"reps":3},{"weight_kg":95,"reps":2}]'::jsonb, 'ısınma 120');
select is(private.warmup_suggestions(140, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":55,"reps":5},{"weight_kg":82.5,"reps":3},{"weight_kg":110,"reps":2}]'::jsonb, 'ısınma 140');
select is(private.warmup_suggestions(100, true, true, false, 2.5, 20), '[]'::jsonb, 'ısınma: ilk hareket değil -> []');
select is(private.warmup_suggestions(50, true, true, true, 2.5, 20), '[{"weight_kg":20,"reps":10},{"weight_kg":32.5,"reps":5}]'::jsonb, 'ısınma 50 (60''ın deload''u)');

-- ===================== 2. Grant / RLS sağlığı =====================
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'RLS kapalı public tablo yok');
select is((select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'), 0, 'anon hiçbir public tabloya yetkili değil');
select is((select count(*)::int from information_schema.routine_privileges where grantee in ('anon', 'PUBLIC') and routine_schema in ('public', 'private')), 0, 'anon/PUBLIC hiçbir public/private fonksiyonu çalıştıramaz');
select is((select count(*)::int from cron.job where jobname like 'pc-%'), 5, '5 cron işi tanımlı');
select is((select count(*)::int
             from pg_constraint c
            where c.contype = 'f' and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)
              and not exists (
                select 1 from pg_index i
                 where i.indrelid = c.conrelid
                   and (i.indpred is null or pg_get_expr(i.indpred, i.indrelid) ~* 'IS NOT NULL')
                   and (string_to_array(i.indkey::text, ' ')::int2[])[1] = c.conkey[1])), 0,
          'her FK''nın ilk kolonu bir index''in öncü kolonu (CASCADE/SET NULL sıralı taraması yok)');
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'exercises' and column_name = 'primary_regions'), null,
          'exercises.primary_regions DEFAULT yok (CHECK 1..4 ile çelişmez)');
select is((select count(*)::int from public.template_exercises te
             join public.workout_templates t on t.id = te.template_id
             join public.exercises e on e.id = te.exercise_id
            where t.is_system and e.scope <> 'global'), 0, 'sistem şablonları yalnızca global egzersiz içerir');
select is((select count(*)::int from information_schema.columns
            where table_schema = 'public' and table_name in ('workout_log_exercises', 'pr_events')
              and column_name in ('best_e1rm_at_start', 'previous_best_e1rm')), 0,
          'eşleşme öncesi en iyi e1RM tabloda saklanmaz (PT''ye sızmaz)');

-- ===================== 3. Kayıt trigger'ı =====================
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('t.pt1')::uuid, 'authenticated', 'authenticated', 'pt1@test.dev', '{"provider":"email"}', '{}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('t.pt2')::uuid, 'authenticated', 'authenticated', 'pt2@test.dev', '{"provider":"google"}', '{"full_name":"Pt İki","picture":"https://lh3.googleusercontent.com/a/x"}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('t.c1')::uuid, 'authenticated', 'authenticated', 'c1@test.dev', '{"provider":"email"}', '{}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('t.c2')::uuid, 'authenticated', 'authenticated', 'c2@test.dev', '{"provider":"email"}', '{}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('t.c3')::uuid, 'authenticated', 'authenticated', 'c3@test.dev', '{"provider":"email"}', '{"role":"super_admin","avatar_url":"https://evil.example/x.png"}', now(), now(), now());

select is((select count(*)::int from public.profiles where role is null and id in (
  current_setting('t.pt1')::uuid, current_setting('t.pt2')::uuid, current_setting('t.c1')::uuid,
  current_setting('t.c2')::uuid, current_setting('t.c3')::uuid)), 5, 'trigger 5 profil üretti, role NULL');
select is((select full_name from public.profiles where id = current_setting('t.pt2')::uuid), 'Pt İki', 'Google full_name yazıldı');
select isnt((select avatar_url from public.profiles where id = current_setting('t.pt2')::uuid), null, 'googleusercontent avatar kabul');
select is((select avatar_url from public.profiles where id = current_setting('t.c3')::uuid), null, 'yabancı avatar URL reddedildi');

-- ===================== 4. Rol koruması + onboarding =====================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c3'), 'role', 'authenticated')::text, true);
select throws_ok($$update public.profiles set role = 'pt' where id = (select auth.uid())$$, '42501', null, 'authenticated role kolonunu güncelleyemez');
select lives_ok($$update public.profiles set full_name = 'Danışan Üç' where id = (select auth.uid())$$, 'full_name güncellenebilir');
select lives_ok($$select public.complete_onboarding('client', 'Danışan Üç', 'terms-v1', 'privacy-v1', true, null)$$, 'c3 onboarding (sağlık rızası yok)');
select throws_ok($$insert into public.readiness_logs (user_id, sleep_rating, energy_rating, soreness_rating, stress_rating) values ((select auth.uid()), 3, 3, 3, 3)$$, '42501', null, 'rızasız readiness yazılamaz');
select is((public.preview_pairing_invite('ABCDEF') ->> 'error'), 'health_consent_required', 'rızasız eşleşme yok');
select lives_ok($$select public.grant_health_consent('health-v1')$$, 'c3 sağlık rızası verir');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select lives_ok($$select public.complete_onboarding('pt', 'Pt Bir', 'terms-v1', 'privacy-v1', true, null)$$, 'pt1 onboarding');
select throws_ok($$select public.complete_onboarding('client', 'Pt Bir', 'terms-v1', 'privacy-v1', true, null)$$, 'P0001', 'already_onboarded', 'rol tek seferlik');
select lives_ok($$select public.register_push_token('ExponentPushToken[pt1device]', 'ios', 'dev-1')$$, 'pt1 push token kaydı');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt2'), 'role', 'authenticated')::text, true);
select lives_ok($$select public.complete_onboarding('pt', 'Pt İki', 'terms-v1', 'privacy-v1', true, null)$$, 'pt2 onboarding');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select lives_ok($$select public.complete_onboarding('client', 'Ahmet Yılmaz', 'terms-v1', 'privacy-v1', true, 'health-v1')$$, 'c1 onboarding + sağlık rızası');
select lives_ok($$update public.profiles set phone_e164 = '+905551112233' where id = (select auth.uid())$$, 'telefon güncellenebilir (kolon UPDATE yetkisi)');
select is((public.get_my_profile() ->> 'phone_e164'), '+905551112233', 'kendi telefonunu get_my_profile() ile okur');
select is((public.get_my_profile() ->> 'timezone'), 'Europe/Istanbul', 'kendi saat dilimini get_my_profile() ile okur');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c2'), 'role', 'authenticated')::text, true);
select lives_ok($$select public.complete_onboarding('client', 'Ayşe Kaya', 'terms-v1', 'privacy-v1', true, 'health-v1')$$, 'c2 onboarding');
select lives_ok($$insert into public.readiness_logs (user_id, sleep_rating, energy_rating, soreness_rating, stress_rating) values ((select auth.uid()), 4, 4, 2, 2)$$, 'c2 eşleşme öncesi readiness (skor 80)');

-- Test egzersizleri + c2 readiness'ı geçmişe al (postgres)
reset role;
insert into public.exercises (id, scope, title, category, target_muscle, primary_regions, tracking_type, load_mode, load_increment_kg, min_load_kg) values
  ('e0000000-0000-4000-8000-000000000001', 'global', 'T Bench', 'compound', 'Göğüs', '{shoulder}', 'weight_reps', 'total', 2.5, 20),
  ('e0000000-0000-4000-8000-000000000002', 'global', 'T Curl', 'isolation', 'Biceps', '{elbow}', 'weight_reps', 'per_side', 2, 0),
  ('e0000000-0000-4000-8000-000000000003', 'global', 'T Pushdown', 'isolation', 'Triceps', '{elbow}', 'weight_reps', 'total', 2.5, 0);
update public.readiness_logs set checked_in_at = now() - interval '2 days', local_date = current_date - 2
 where user_id = current_setting('t.c2')::uuid;

-- ===================== 5. Eşleşme =====================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select set_config('t.code1', public.create_pairing_invite() ->> 'code', true);
select matches(current_setting('t.code1'), '^[A-HJKMNP-Z2-9]{6}$', 'kod alfabesi doğru');
select is((select count(*)::int from public.pairing_invites), 1, 'PT kendi davetini görür');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt2'), 'role', 'authenticated')::text, true);
select set_config('t.code2', public.create_pairing_invite() ->> 'code', true);
select is((select count(*)::int from public.pairing_invites), 1, 'PT başkasının davetini göremez');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c3'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.pairing_invites), 0, 'danışan davet tablosunu okuyamaz');
select is((public.preview_pairing_invite('ZZZZZ2') ->> 'error'), 'code_invalid', 'yanlış kod 1');
select is((public.preview_pairing_invite('ZZZZZ3') ->> 'error'), 'code_invalid', 'yanlış kod 2');
select is((public.preview_pairing_invite('ZZZZZ4') ->> 'error'), 'code_invalid', 'yanlış kod 3');
select is((public.preview_pairing_invite('ZZZZZ5') ->> 'error'), 'code_invalid', 'yanlış kod 4');
select is((public.redeem_pairing_invite('ZZZZZ6', 'share-v1', true) ->> 'error'), 'code_invalid', 'yanlış kod 5 (redeem)');
select is((public.preview_pairing_invite(current_setting('t.code1')) ->> 'error'), 'rate_limited', '6. deneme rate_limited (doğru kodla bile)');

reset role;
select is((select count(*)::int from private.pairing_attempts where user_id = current_setting('t.c3')::uuid and not success), 5, 'başarısız denemeler kalıcı yazıldı');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select is((public.preview_pairing_invite(lower(current_setting('t.code1'))) -> 'pt' ->> 'full_name'), 'Pt Bir', 'önizleme PT adını döner (küçük harf normalize)');
select is((public.redeem_pairing_invite(current_setting('t.code1'), 'share-v1', true) ->> 'ok'), 'true', 'c1 kodu kullandı (geçmiş paylaşımlı)');
select is((public.redeem_pairing_invite(current_setting('t.code2'), 'share-v1', true) ->> 'error'), 'already_paired', 'tek aktif PT');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c2'), 'role', 'authenticated')::text, true);
select is((public.redeem_pairing_invite(current_setting('t.code1'), 'share-v1', true) ->> 'error'), 'code_used', 'kullanılmış kod');
select is((public.redeem_pairing_invite(current_setting('t.code2'), 'share-v1', false) ->> 'ok'), 'true', 'c2 geçmişi paylaşmadan eşleşti');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt2'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.readiness_logs where user_id = current_setting('t.c2')::uuid), 0, 'paylaşılmayan eşleşme-öncesi readiness PT''ye kapalı');
select is((select count(*)::int from public.profiles where id = current_setting('t.c2')::uuid), 1, 'pt2 kendi danışanının profilini görür');
select is((select count(*)::int from public.profiles where id = current_setting('t.c1')::uuid), 0, 'pt2 başka PT''nin danışanını göremez');
select is((select full_name from public.profiles where id = current_setting('t.c2')::uuid), 'Ayşe Kaya', 'PT danışanın adını okur');
select throws_ok($$select phone_e164 from public.profiles where id = current_setting('t.c2')::uuid$$, '42501', null, 'PT danışan telefonunu profiles''tan okuyamaz (kolon yetkisi)');
select throws_ok($$select timezone from public.profiles$$, '42501', null, 'karşı tarafın saat dilimi okunamaz (kolon yetkisi)');

-- ===================== 5b. Egzersiz görünürlüğü (yazım), öneri akışı, sistem şablonu =====================
insert into public.exercises (id, scope, owner_id, title, category, target_muscle, primary_regions) values
  ('e0000000-0000-4000-8000-000000000010', 'custom', current_setting('t.pt2')::uuid, 'PT2 Gizli Hareket', 'isolation', 'Kol', '{elbow}');
select isnt((public.clone_system_template('00000000-0000-4000-8000-00000000a001') ->> 'template_id'), null, 'PT sistem şablonunu kütüphanesine kopyalar');
select lives_ok($$select public.suggest_exercise_to_global('e0000000-0000-4000-8000-000000000010', 'Kulüplerde yaygın')$$, 'PT özel egzersizini global kütüphaneye önerir');
select throws_ok($$select public.suggest_exercise_to_global('e0000000-0000-4000-8000-000000000010', null)$$, 'P0001', 'suggestion_pending', 'aynı egzersiz için tek bekleyen öneri');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c3'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.clone_system_template('00000000-0000-4000-8000-00000000a001')$$, '42501', null, 'danışan sistem şablonu kopyalayamaz');
select throws_ok($$select public.suggest_exercise_to_global('e0000000-0000-4000-8000-000000000010', null)$$, '42501', null, 'danışan öneri yapamaz');
select is((select count(*)::int from public.template_exercises where template_id = '00000000-0000-4000-8000-00000000a001'), 3, 'sistem şablonu okunabilir');
insert into public.workout_templates (id, owner_id, client_id, title) values
  ('a0000000-0000-4000-8000-000000000030', current_setting('t.c3')::uuid, current_setting('t.c3')::uuid, 'C3 Kendi');
insert into public.template_blocks (id, template_id, position) values
  ('a1000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000030', 1);
select throws_ok($$insert into public.template_exercises (block_id, position_in_block, exercise_id) values ('a1000000-0000-4000-8000-000000000030', 1, 'e0000000-0000-4000-8000-000000000010')$$, '42501', 'exercise_not_available', 'başkasının özel egzersizi UUID ile şablona eklenemez');
select is((select count(*)::int from public.exercises where id = 'e0000000-0000-4000-8000-000000000010'), 0, 'başka PT''nin özel egzersizi okunamaz kalır');
select lives_ok($$insert into public.template_exercises (block_id, position_in_block, exercise_id) values ('a1000000-0000-4000-8000-000000000030', 1, 'e0000000-0000-4000-8000-000000000001')$$, 'global egzersiz kendi şablonuna eklenebilir');

reset role;
select isnt(private.review_exercise_suggestion((select id from public.exercise_suggestions where exercise_id = 'e0000000-0000-4000-8000-000000000010'), true, 'kabul'), null, 'içerik hattı öneriyi global egzersize dönüştürür');
select is((select count(*)::int from public.exercises where scope = 'global' and title = 'PT2 Gizli Hareket'), 1, 'kabul edilen öneri global kütüphanede');

-- ===================== 6. PT kütüphane şablonu + program ataması =====================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.profiles where id = current_setting('t.c1')::uuid), 1, 'pt1 danışanını görür');
insert into public.workout_templates (id, owner_id, client_id, title) values
  ('a0000000-0000-4000-8000-000000000001', current_setting('t.pt1')::uuid, null, 'Üst Vücut A');
insert into public.template_blocks (id, template_id, position, block_type, rest_after_round_sec) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 1, 'single', null),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 2, 'superset', 60);
insert into public.template_exercises (id, block_id, position_in_block, exercise_id, is_priority) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, 'e0000000-0000-4000-8000-000000000001', true),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 1, 'e0000000-0000-4000-8000-000000000002', false),
  ('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 2, 'e0000000-0000-4000-8000-000000000003', false);
insert into public.template_exercise_sets (template_exercise_id, set_type, set_number, target_reps_min, target_reps_max, target_weight_kg, rest_seconds) values
  ('a2000000-0000-4000-8000-000000000001', 'warmup', 1, 10, 10, 20, null),
  ('a2000000-0000-4000-8000-000000000001', 'working', 1, 8, 8, 60, 90),
  ('a2000000-0000-4000-8000-000000000001', 'working', 2, 8, 8, 60, 90),
  ('a2000000-0000-4000-8000-000000000001', 'working', 3, 8, 8, 60, 90),
  ('a2000000-0000-4000-8000-000000000002', 'working', 1, 12, 12, 12, null),
  ('a2000000-0000-4000-8000-000000000003', 'working', 1, 12, 12, 25, null);
insert into public.programs (id, owner_id, client_id, title, status) values
  ('a3000000-0000-4000-8000-000000000001', current_setting('t.pt1')::uuid, null, 'Hipertrofi Bloğu', 'draft');
insert into public.program_workouts (program_id, template_id, day_order, day_label) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 1, 'A');
select pass('PT RLS altında şablon/blok/set/program yazdı');

select throws_ok($$select public.assign_program('a3000000-0000-4000-8000-000000000001', current_setting('t.c2')::uuid)$$, '42501', null, 'başkasının danışanına atama yok');
select lives_ok($$select set_config('t.prog', public.assign_program('a3000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid) ->> 'program_id', true)$$, 'program atandı');
select is((select count(*)::int from public.template_exercise_sets s join public.workout_templates t on t.id = s.template_id where t.client_id = current_setting('t.c1')::uuid), 6, 'derin kopya: 6 set');

-- 6b. Egzersiz kullanım kuralları (PT kütüphane / danışan kopyası) + ölçümler
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
insert into public.exercises (id, scope, owner_id, title, category, target_muscle, primary_regions) values
  ('e0000000-0000-4000-8000-000000000020', 'custom', current_setting('t.c1')::uuid, 'C1 Özel A', 'isolation', 'Kalça', '{hip}'),
  ('e0000000-0000-4000-8000-000000000021', 'custom', current_setting('t.c1')::uuid, 'C1 Özel B', 'isolation', 'Kalça', '{hip}');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.exercises where id = 'e0000000-0000-4000-8000-000000000020'), 1, 'PT aktif danışanının özel egzersizini görür');
select throws_ok($$insert into public.template_exercises (block_id, position_in_block, exercise_id) values ('a1000000-0000-4000-8000-000000000001', 2, 'e0000000-0000-4000-8000-000000000020')$$, '42501', 'exercise_not_available', 'danışan egzersizi PT kütüphane şablonuna eklenemez (atama ile sızmaz)');
insert into public.exercises (id, scope, owner_id, title, category, target_muscle, primary_regions) values
  ('e0000000-0000-4000-8000-000000000022', 'custom', current_setting('t.pt1')::uuid, 'PT1 Özel', 'compound', 'Bacak', '{knee}');
insert into public.workout_templates (id, owner_id, client_id, title) values
  ('a0000000-0000-4000-8000-000000000021', current_setting('t.pt1')::uuid, current_setting('t.c1')::uuid, 'Ek Gün (danışan kopyası)');
insert into public.template_blocks (id, template_id, position) values
  ('a1000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000021', 1),
  ('a1000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000021', 2);
select lives_ok($$insert into public.template_exercises (id, block_id, position_in_block, exercise_id) values
  ('a2000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000021', 1, 'e0000000-0000-4000-8000-000000000022'),
  ('a2000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000022', 1, 'e0000000-0000-4000-8000-000000000020')$$, 'PT danışan kopyasına kendi ve danışanın özel egzersizini ekler');
insert into public.measurement_sessions (id, client_id, recorded_by, recorded_by_role, measured_at) values
  ('f0000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid, current_setting('t.pt1')::uuid, 'pt', now() - interval '1 day');
select lives_ok($$insert into public.measurements (session_id, client_id, type_code, side, value) values
  ('f0000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid, 'y_balance_anterior_cm', 'left', 60),
  ('f0000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid, 'y_balance_posteromedial_cm', 'left', 100),
  ('f0000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid, 'y_balance_posterolateral_cm', 'left', 95),
  ('f0000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid, 'leg_length_cm', 'left', 90),
  ('f0000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid, 'overhead_squat_score', null, 2)$$, 'PT Y-Balance girdileri + fonksiyonel skor');
select is((select value from public.measurements where session_id = 'f0000000-0000-4000-8000-000000000001' and type_code = 'y_balance_composite_pct' and side = 'left'), 94.44::numeric, 'Y-Balance bileşik skoru sunucuda saklandı');
select throws_ok($$insert into public.measurements (session_id, client_id, type_code, side, value) values ('f0000000-0000-4000-8000-000000000001', current_setting('t.c1')::uuid, 'y_balance_composite_pct', 'right', 90)$$, '42501', null, 'türetilmiş ölçüm istemciden yazılamaz');
update public.measurements set value = 100 where session_id = 'f0000000-0000-4000-8000-000000000001' and type_code = 'leg_length_cm' and side = 'left';
select is((select value from public.measurements where session_id = 'f0000000-0000-4000-8000-000000000001' and type_code = 'y_balance_composite_pct' and side = 'left'), 85.00::numeric, 'girdi değişince bileşik skor yeniden hesaplandı');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
insert into public.measurement_sessions (id, client_id, recorded_by, recorded_by_role, measured_at) values
  ('f0000000-0000-4000-8000-000000000002', current_setting('t.c1')::uuid, current_setting('t.c1')::uuid, 'client', now() - interval '7 days'),
  ('f0000000-0000-4000-8000-000000000003', current_setting('t.c1')::uuid, current_setting('t.c1')::uuid, 'client', now());
insert into public.measurements (session_id, type_code, value) values
  ('f0000000-0000-4000-8000-000000000002', 'weight_kg', 80),
  ('f0000000-0000-4000-8000-000000000003', 'weight_kg', 78.5);
select is((select delta from public.measurement_latest_deltas where client_id = current_setting('t.c1')::uuid and type_code = 'weight_kg'), -1.50::numeric, 'C1 son ölçüm değişimi (kilo) -1.5');
select is((select latest_value from public.measurement_latest_deltas where client_id = current_setting('t.c1')::uuid and type_code = 'y_balance_composite_pct' and side = 'left'), 85.00::numeric, 'PT ölçümleri de son değişim görünümünde');
select throws_ok($$insert into public.measurements (session_id, type_code, value) values ('f0000000-0000-4000-8000-000000000003', 'overhead_squat_score', 2)$$, '42501', null, 'danışan fonksiyonel skor giremez');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt2'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.workout_templates where owner_id = current_setting('t.pt1')::uuid or client_id = current_setting('t.c1')::uuid), 0, 'pt2 pt1 şablonlarını göremez');

-- ===================== 7. Oturum 1: readiness + deload + guardrail =====================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select throws_ok($$insert into public.pt_alerts (pair_id, pt_id, client_id, alert_type, severity, dedupe_key) select id, pt_id, client_id, 'OVERLOAD_RISK', 'critical', 'x' from public.pt_client_pairs limit 1$$, '42501', null, 'danışan alarm yazamaz');
update public.template_exercise_sets set target_weight_kg = 200;
select is((select count(*)::int from public.template_exercise_sets where target_weight_kg = 200), 0, 'danışan PT şablonuna yazamaz (RLS 0 satır)');
select lives_ok($$insert into public.readiness_logs (id, user_id, sleep_rating, energy_rating, soreness_rating, stress_rating, pain_regions) values ('d0000000-0000-4000-8000-000000000001', (select auth.uid()), 2, 2, 4, 4, '{shoulder}')$$, 'düşük readiness');
select is((select score::int from public.readiness_logs where id = 'd0000000-0000-4000-8000-000000000001'), 40, 'skor 40');
select set_config('t.pw', (public.get_client_home() -> 'next_workout' ->> 'program_workout_id'), true);
select isnt(current_setting('t.pw'), '', 'home sıradaki antrenmanı döner');
select is((public.start_workout('b0000000-0000-4000-8000-000000000001', current_setting('t.pw')::uuid, null, 'd0000000-0000-4000-8000-000000000001', null) ->> 'error'), 'deload_choice_required', 'onay modu seçim ister');
select is((public.start_workout('b0000000-0000-4000-8000-000000000001', current_setting('t.pw')::uuid, null, 'd0000000-0000-4000-8000-000000000001', 'accept') -> 'workout' ->> 'deload_multiplier'), '0.850', 'deload kabul');
select is((public.start_workout('b0000000-0000-4000-8000-000000000001', current_setting('t.pw')::uuid, null, 'd0000000-0000-4000-8000-000000000001', 'accept') ->> 'ok'), 'true', 'start_workout idempotent');

select set_config('t.wle_bench', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000001' and position = 1), true);
select set_config('t.wle_curl', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000001' and position = 2), true);
select set_config('t.wle_push', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000001' and position = 3), true);
select is((select (e ->> 'adjusted_weight_kg')::numeric from public.workout_log_exercises w, jsonb_array_elements(w.planned_sets) e where w.id = current_setting('t.wle_bench')::uuid and e ->> 'set_type' = 'working' and e ->> 'set_number' = '1'), 50.0::numeric, 'bench 60 -> deload 50');
select is((select count(*)::int from public.workout_log_exercises w, jsonb_array_elements(w.planned_sets) e where w.id = current_setting('t.wle_bench')::uuid and (e ->> 'trimmed')::boolean), 1, '3 çalışma setinden 1''i kırpıldı');
select is((select pain_flag from public.workout_log_exercises where id = current_setting('t.wle_bench')::uuid), true, 'omuz ağrısı rozeti');
select is((select (e ->> 'rest_seconds')::int from public.workout_log_exercises w, jsonb_array_elements(w.planned_sets) e where w.id = current_setting('t.wle_bench')::uuid and e ->> 'set_type' = 'warmup'), 60, 'ısınma rest null -> 60');
select is((select (e ->> 'rest_seconds')::int from public.workout_log_exercises w, jsonb_array_elements(w.planned_sets) e where w.id = current_setting('t.wle_curl')::uuid and e ->> 'set_type' = 'working'), 0, 'süperset çalışma seti rest 0 (tur dinlenmesi bloktan)');
select is((select x -> 'best_e1rm_at_start' from jsonb_array_elements(public.get_session_payload('b0000000-0000-4000-8000-000000000001') -> 'exercises') x where x ->> 'id' = current_setting('t.wle_bench')), 'null'::jsonb, 'ilk oturumda best_e1rm_at_start null');
select is((select x -> 'warmup_suggestions' from jsonb_array_elements(public.get_session_payload('b0000000-0000-4000-8000-000000000001') -> 'exercises') x where x ->> 'id' = current_setting('t.wle_bench')), '[]'::jsonb, 'planlı ısınma varsa sunucu önerisi boş');

select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
  values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', (select auth.uid()), current_setting('t.wle_bench')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 1, 8, 70, now())$$, 'set 70 kg');
select is((select overload_flag from public.set_logs where id = 'c0000000-0000-4000-8000-000000000001'), false, '70 <= 72: overload yok');
select is((select deload_ignored from public.set_logs where id = 'c0000000-0000-4000-8000-000000000001'), true, 'deload hedefi aşıldı, reçete sınırı aşılmadı');
select is((select estimated_1rm from public.set_logs where id = 'c0000000-0000-4000-8000-000000000001'), 88.67::numeric, 'e1rm sunucuda hesaplandı');
select throws_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, overload_flag, performed_at)
  values ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000001', (select auth.uid()), current_setting('t.wle_bench')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 2, 8, 80, false, now())$$, '42501', null, 'istemci overload_flag yazamaz');
select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
  values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', (select auth.uid()), current_setting('t.wle_bench')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 2, 8, 80, now())$$, 'set 80 kg (teyitsiz; kuyruk asla düşmez)');
select is((select overload_flag from public.set_logs where id = 'c0000000-0000-4000-8000-000000000002'), true, 'sunucu overload_flag=true');
select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, overload_confirmed_at, performed_at)
  values ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', (select auth.uid()), current_setting('t.wle_bench')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 3, 6, 85, now(), now())$$, 'set 85 kg teyitli');
select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
  values ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', (select auth.uid()), current_setting('t.wle_bench')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 3, 6, 85, now()) on conflict (id) do nothing$$, 'idempotent tekrar gönderim');
select throws_ok($$update public.set_logs set weight_kg = 60 where id = 'c0000000-0000-4000-8000-000000000003'$$, '42501', 'overload_set_immutable', 'overload seti değiştirilemez');
delete from public.set_logs where id = 'c0000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.set_logs where id = 'c0000000-0000-4000-8000-000000000003'), 1, 'overload seti silinemez (RLS)');
select is((select count(*)::int from public.set_logs where workout_log_id = 'b0000000-0000-4000-8000-000000000001'), 3, 'tekrar gönderim çoğaltmadı');
select is((select status::text from public.workout_log_exercises where id = current_setting('t.wle_bench')::uuid), 'done', 'set → egzersiz done');

-- PT1 alarmları
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.pt_alerts where alert_type = 'OVERLOAD_RISK'), 1, 'tek overload alarmı (egzersiz başına dedupe)');
select is((select occurrences from public.pt_alerts where alert_type = 'OVERLOAD_RISK'), 2, 'occurrences = 2');
select is((select (payload ->> 'max_logged_weight_kg')::numeric from public.pt_alerts where alert_type = 'OVERLOAD_RISK'), 85::numeric, 'max logged 85');
select is((select (payload ->> 'target_weight_kg')::numeric from public.pt_alerts where alert_type = 'OVERLOAD_RISK'), 60::numeric, 'alarm hedefi orijinal reçete (60)');
select isnt((select payload ->> 'server_received_at' from public.pt_alerts where alert_type = 'OVERLOAD_RISK'), null, 'OVERLOAD payload server_received_at içerir');
select is((select count(*)::int from public.pt_alerts where alert_type = 'LOW_READINESS'), 1, 'LOW_READINESS alarmı');
select is((select count(*)::int from public.set_logs where user_id = current_setting('t.c1')::uuid), 3, 'pt1 danışan setlerini görür');
select set_config('t.alert', (select id::text from public.pt_alerts where alert_type = 'OVERLOAD_RISK'), true);
reset role;
select is((select count(*)::int from private.push_outbox where kind = 'overload_alert'), 1, 'overload push kuyruğa girdi (PT token kayıtlı)');
select set_config('t.outbox', (select id::text from private.push_outbox where kind = 'overload_alert'), true);
select is(jsonb_array_length(public.admin_claim_push(current_setting('t.outbox')::bigint) -> 'tokens'), 1, 'send-push talebi token döner');
select is(public.admin_claim_push(current_setting('t.outbox')::bigint), null::jsonb, 'aynı push iki kez talep edilemez');
select lives_ok(format($$select public.admin_finish_push(%s, false, 'DeviceNotRegistered', array['ExponentPushToken[pt1device]'])$$, current_setting('t.outbox')), 'push bitir');
select is((select count(*)::int from public.push_tokens where expo_push_token = 'ExponentPushToken[pt1device]'), 0, 'geçersiz token silindi');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.admin_claim_push(1)$$, '42501', null, 'authenticated push uçlarını çağıramaz');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt2'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.set_logs where user_id = current_setting('t.c1')::uuid), 0, 'pt2 c1 setlerini göremez');
select is((select count(*)::int from public.pt_alerts), 0, 'pt2 alarm görmez');

-- ===================== 8. C3: time-crunch + DND; kapanış =====================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from jsonb_array_elements(public.apply_time_crunch('b0000000-0000-4000-8000-000000000001', true, 25::smallint) -> 'exercises') x where x ->> 'status' = 'time_crunched'), 2, 'öncelikli olmayan süperset pasife çekildi');
select throws_ok(format($$select public.reorder_session_exercises('b0000000-0000-4000-8000-000000000001', array[%L, %L, %L]::uuid[])$$, current_setting('t.wle_curl'), current_setting('t.wle_push'), current_setting('t.wle_bench')), 'P0001', 'done_exercise_locked', 'tamamlanan egzersiz taşınamaz');
select lives_ok(format($$select public.reorder_session_exercises('b0000000-0000-4000-8000-000000000001', array[%L, %L, %L]::uuid[])$$, current_setting('t.wle_bench'), current_setting('t.wle_push'), current_setting('t.wle_curl')), 'blok içi sıra değişebilir');
select is((select position_in_block::int from public.workout_log_exercises where id = current_setting('t.wle_push')::uuid), 1, 'pushdown blokta 1. oldu');
select is((public.complete_workout('b0000000-0000-4000-8000-000000000001', 8::smallint, 'tired', 3::smallint, null) ->> 'ok'), 'true', 'oturum 1 tamamlandı');
select is((select count(*)::int from public.pr_events where workout_log_id = 'b0000000-0000-4000-8000-000000000001'), 0, 'ilk oturumda PR yok (baseline yok)');
select is((select tonnage_kg from public.session_volume where workout_log_id = 'b0000000-0000-4000-8000-000000000001'), 1710.00::numeric, 'tonaj 70*8+80*8+85*6 = 1710');

reset role;
update public.workout_logs
   set started_at = now() - interval '2 days', completed_at = now() - interval '2 days' + interval '1 hour',
       last_activity_at = now() - interval '2 days' + interval '1 hour', local_date = current_date - 2
 where id = 'b0000000-0000-4000-8000-000000000001';

-- ===================== 9. Oturum 2: DND + PR =====================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select is((public.start_workout('b0000000-0000-4000-8000-000000000002', current_setting('t.pw')::uuid, null, null, null) -> 'workout' ->> 'readiness_outcome'), 'skipped_checkin', 'check-in atlandı');
select set_config('t.b2', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000002' and position = 1), true);
select set_config('t.cu2', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000002' and position = 2), true);
select set_config('t.pu2', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000002' and position = 3), true);
select throws_ok(format($$select public.reorder_session_exercises('b0000000-0000-4000-8000-000000000002', array[%L, %L, %L]::uuid[])$$, current_setting('t.cu2'), current_setting('t.b2'), current_setting('t.pu2')), 'P0001', 'block_split_not_allowed', 'süperset bölünemez');
select lives_ok(format($$select public.reorder_session_exercises('b0000000-0000-4000-8000-000000000002', array[%L, %L, %L]::uuid[])$$, current_setting('t.cu2'), current_setting('t.pu2'), current_setting('t.b2')), 'süperset öne alındı');
select is((select block_index::int from public.workout_log_exercises where id = current_setting('t.b2')::uuid), 2, 'bench blok 2 oldu');
select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
  values ('c0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000002', (select auth.uid()), current_setting('t.b2')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 1, 10, 70, now())$$, 'set 70x10');
select is((select overload_flag from public.set_logs where id = 'c0000000-0000-4000-8000-000000000011'), false, 'deload yok, 70 <= 72');
select is((public.complete_workout('b0000000-0000-4000-8000-000000000002', 7::smallint, 'normal', 2::smallint, null) -> 'prs' -> 0 ->> 'estimated_1rm'), '93.33', 'PR: 93.33 > 88.67 (onaysız overload setleri baseline dışı)');

-- PT seti onaylar → en iyi e1RM yeniden hesaplanır
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select lives_ok(format($$select public.resolve_alert(%L, 'approve_set')$$, current_setting('t.alert')), 'PT overload setini onayladı');
select is((select best_e1rm from public.exercise_bests where user_id = current_setting('t.c1')::uuid and exercise_id = 'e0000000-0000-4000-8000-000000000001'), 102.00::numeric, 'onaylı overload setleri dahil: 85x6 = 102.00 en iyi oldu');

-- ===================== 9b. Aynı egzersiz iki kez (ALGO-6), sunucu ısınma önerisi, önceki en iyi, canlı PR =====================
insert into public.workout_templates (id, owner_id, client_id, title) values
  ('a0000000-0000-4000-8000-000000000009', current_setting('t.pt1')::uuid, current_setting('t.c1')::uuid, 'Bench x2');
insert into public.template_blocks (id, template_id, position) values
  ('a1000000-0000-4000-8000-000000000091', 'a0000000-0000-4000-8000-000000000009', 1),
  ('a1000000-0000-4000-8000-000000000092', 'a0000000-0000-4000-8000-000000000009', 2);
insert into public.template_exercises (id, block_id, position_in_block, exercise_id) values
  ('a2000000-0000-4000-8000-000000000091', 'a1000000-0000-4000-8000-000000000091', 1, 'e0000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000092', 'a1000000-0000-4000-8000-000000000092', 1, 'e0000000-0000-4000-8000-000000000001');
insert into public.template_exercise_sets (template_exercise_id, set_type, set_number, target_reps_min, target_reps_max, target_weight_kg) values
  ('a2000000-0000-4000-8000-000000000091', 'working', 1, 5, 5, 100),
  ('a2000000-0000-4000-8000-000000000092', 'working', 1, 8, 8, 70);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select is((public.start_workout('b0000000-0000-4000-8000-000000000004', null, 'a0000000-0000-4000-8000-000000000009', null, null) -> 'workout' ->> 'guardrail_enabled'), 'true', 'PT danışan kopyasından oturum (guardrail açık)');
select set_config('t.bp1', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000004' and position = 1), true);
select set_config('t.bp2', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000004' and position = 2), true);
select is((select x -> 'warmup_suggestions' from jsonb_array_elements(public.get_session_payload('b0000000-0000-4000-8000-000000000004') -> 'exercises') x where x ->> 'id' = current_setting('t.bp1')), '[{"weight_kg":20,"reps":10},{"weight_kg":50,"reps":5},{"weight_kg":75,"reps":3}]'::jsonb, 'sunucu ısınma önerisi (100 kg, kas grubunun ilk hareketi)');
select is((select x -> 'warmup_suggestions' from jsonb_array_elements(public.get_session_payload('b0000000-0000-4000-8000-000000000004') -> 'exercises') x where x ->> 'id' = current_setting('t.bp2')), '[]'::jsonb, 'aynı kas grubunun ikinci hareketinde öneri yok');
select is((select (x ->> 'best_e1rm_at_start')::numeric from jsonb_array_elements(public.get_session_payload('b0000000-0000-4000-8000-000000000004') -> 'exercises') x where x ->> 'id' = current_setting('t.bp1')), 102.00::numeric, 'best_e1rm_at_start okuma anında (onaylı overload dahil) 102');
select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
  values ('c0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000004', (select auth.uid()), current_setting('t.bp1')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 1, 5, 100, now()),
         ('c0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000004', (select auth.uid()), current_setting('t.bp2')::uuid, 'e0000000-0000-4000-8000-000000000001', 'working', 1, 8, 100, now())$$, 'BP#1 ve BP#2 için 100 kg');
select is((select overload_flag from public.set_logs where id = 'c0000000-0000-4000-8000-000000000041'), false, 'ALGO-6: BP#1 (hedef 100) 100 kg ok');
select is((select overload_flag from public.set_logs where id = 'c0000000-0000-4000-8000-000000000042'), true, 'ALGO-6: BP#2 (hedef 70, sınır 84) 100 kg over');
select is((public.complete_workout('b0000000-0000-4000-8000-000000000004', 8::smallint, 'tired', 1::smallint, null) -> 'prs' -> 0 ->> 'previous_best_e1rm')::numeric, 102.00::numeric, 'PR özeti önceki en iyiyi okuma anında hesaplar');
reset role;
select is((select count(*)::int from realtime.messages where topic = 'pt:' || current_setting('t.pt1') || ':feed' and event = 'pr_candidate'), 2, 'canlı PR adayı PT feed''ine iletildi (yalnızca id)');
select is((select count(*)::int from realtime.messages where topic = 'pt:' || current_setting('t.pt1') || ':feed' and event = 'pr_achieved'), 2, 'pr_events PT feed''ine iletildi');

-- ===================== 10. Eşleşme sonlandırma =====================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select public.leave_program(%L)$$, current_setting('t.prog')), 'P0001', 'program_managed_by_pt', 'aktif PT''nin programı bırakılamaz');
select lives_ok($$select public.end_pairing((select id from public.pt_client_pairs where status = 'active'), 'test')$$, 'danışan eşleşmeyi bitirdi');
select is((public.get_client_home() -> 'program' ->> 'is_pt_assigned'), 'true', 'atanmış program danışanda kalır');
select is((public.start_workout('b0000000-0000-4000-8000-000000000003', current_setting('t.pw')::uuid, null, null, null) -> 'workout' ->> 'guardrail_enabled'), 'false', 'eşleşme yoksa guardrail kapalı');
select is((select count(*)::int from public.exercises where id = 'e0000000-0000-4000-8000-000000000002'), 1, 'egzersiz okunabilir kalır');
select throws_ok($$select public.complete_workout('b0000000-0000-4000-8000-000000000003', 5::smallint, 'normal', 0::smallint, null)$$, 'P0001', 'nothing_logged', 'çalışma seti olmayan oturum tamamlanamaz');
select lives_ok(format($$select public.leave_program(%L)$$, current_setting('t.prog')), 'eşleşme bitince danışan programı bırakır');
select is((public.get_client_home() -> 'program'), 'null'::jsonb, 'bırakılan program C1''de görünmez');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.set_logs where user_id = current_setting('t.c1')::uuid), 0, 'bitince PT set erişimi kesildi');
select is((select count(*)::int from public.pt_alerts), 0, 'bitince PT alarm erişimi kesildi');
select is((select count(*)::int from public.profiles where id = current_setting('t.c1')::uuid), 0, 'bitince PT profil erişimi kesildi');
select is((select count(*)::int from public.workout_templates where client_id = current_setting('t.c1')::uuid), 0, 'bitince PT kopya şablona erişemez');

-- ===================== 11. Cron fonksiyonları =====================
reset role;
update public.workout_logs set started_at = now() - interval '4 hours', last_activity_at = now() - interval '4 hours'
 where id = 'b0000000-0000-4000-8000-000000000003';
select is(private.close_stale_workouts(), 1, 'yarım oturum kapatıldı');
select is((select status::text from public.workout_logs where id = 'b0000000-0000-4000-8000-000000000003'), 'abandoned', 'setsiz oturum abandoned');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select set_config('t.wle_b3', (select id::text from public.workout_log_exercises where workout_log_id = 'b0000000-0000-4000-8000-000000000003' and position = 1), true);
select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
  values ('c0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000003', (select auth.uid()), current_setting('t.wle_b3')::uuid, 'e0000000-0000-4000-8000-000000000001', 'warmup', 1, 10, 20, now() - interval '4 hours')$$, 'cron kapattıktan sonra geç senkron ısınma seti kabul edilir');
update public.set_logs set reps_completed = 9 where id = 'c0000000-0000-4000-8000-000000000031';
select is((select reps_completed::int from public.set_logs where id = 'c0000000-0000-4000-8000-000000000031'), 9, 'auto_closed abandoned oturumda RLS UPDATE penceresi trigger ile aynı (sessiz 0 satır yok)');
reset role;
select is((private.evaluate_radar(current_setting('t.c1')::uuid, private.iso_week_start(current_date) - 7) ->> 'result'), 'insufficient_data', 'radar: yetersiz veri');
select lives_ok($$select private.run_deload_radar()$$, 'radar çalışır');
select lives_ok($$select private.expire_invites()$$, 'davet süresi işi çalışır');
select lives_ok($$select private.daily_cleanup()$$, 'günlük temizlik çalışır');

-- ===================== 11b. Radar KVKK + danışan başına alarm tekilleştirme =====================
select set_config('t.c4', '66666666-6666-4666-8666-666666666666', true);
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('t.c4')::uuid, 'authenticated', 'authenticated', 'c4@test.dev', '{"provider":"email"}', '{}', now(), now(), now());
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c4'), 'role', 'authenticated')::text, true);
select lives_ok($$select public.complete_onboarding('client', 'Deniz Ak', 'terms-v1', 'privacy-v1', true, 'health-v1')$$, 'c4 onboarding');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select set_config('t.code4', public.create_pairing_invite() ->> 'code', true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c4'), 'role', 'authenticated')::text, true);
select is((public.redeem_pairing_invite(current_setting('t.code4'), 'share-v1', true) ->> 'ok'), 'true', 'c4 geçmişi paylaşarak pt1 ile eşleşti');
select lives_ok($$insert into public.readiness_logs (user_id, sleep_rating, energy_rating, soreness_rating, stress_rating) values ((select auth.uid()), 2, 2, 4, 4)$$, 'c4 bugün düşük readiness');
reset role;
select is((select count(*)::int from public.pt_alerts where pt_id = current_setting('t.pt1')::uuid and alert_type = 'LOW_READINESS'), 2, 'aynı PT''nin iki danışanı aynı gün ayrı LOW_READINESS alarmı alır');

-- Geçmiş veri (2026-02-23 .. 2026-03-15), c2: geçmişi paylaşmadan eşleşti; c4: paylaşarak eşleşti
do $$
declare
  v_client uuid;
  v_ex uuid := 'e0000000-0000-4000-8000-000000000001';
  v_w0 date := '2026-03-09';
  v_tz text := 'Europe/Istanbul';
  i int; j int; v_ws date; v_wl uuid; v_wle uuid; v_rl uuid; v_start timestamptz;
  v_kg numeric[] := array[500, 550, 525];
  v_sl int[] := array[4, 4, 3]; v_en int[] := array[4, 3, 3]; v_so int[] := array[2, 3, 3]; v_st int[] := array[2, 2, 3];
begin
  foreach v_client in array array[current_setting('t.c2')::uuid, current_setting('t.c4')::uuid] loop
    for i in 1..3 loop
      v_ws := v_w0 - (3 - i) * 7;
      v_start := ((v_ws + 1)::timestamp + interval '10 hours') at time zone v_tz;
      v_wl := gen_random_uuid();
      insert into public.workout_logs (id, user_id, template_title_snapshot, status, started_at, completed_at, last_activity_at, local_date, readiness_outcome)
      values (v_wl, v_client, 'Geçmiş', 'completed', v_start, v_start + interval '1 hour', v_start + interval '1 hour', v_ws + 1, 'skipped_checkin');
      insert into public.workout_log_exercises (workout_log_id, user_id, exercise_id, exercise_title_snapshot, tracking_type, load_mode, load_increment_kg, block_index, block_type, position, position_in_block, is_priority)
      values (v_wl, v_client, v_ex, 'T Bench', 'weight_reps', 'total', 2.5, 1, 'single', 1, 1, true) returning id into v_wle;
      insert into public.set_logs (workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
      values (v_wl, v_client, v_wle, v_ex, 'working', 1, 20, v_kg[i], v_start + interval '5 minutes');
      for j in 1..2 loop
        insert into public.readiness_logs (user_id, sleep_rating, energy_rating, soreness_rating, stress_rating)
        values (v_client, v_sl[i], v_en[i], v_so[i], case when i = 3 and j = 2 then 2 else v_st[i] end) returning id into v_rl;
        update public.readiness_logs set checked_in_at = v_start - interval '1 hour' + (j - 1) * interval '1 day', local_date = v_ws + j where id = v_rl;
      end loop;
    end loop;
  end loop;
end $$;
select is(private.run_deload_radar('2026-03-18 12:00:00+00'), 2, 'radar yalnızca pencerede oturumu olan danışanları değerlendirir');
select is((select result::text from public.radar_evaluations where client_id = current_setting('t.c2')::uuid and week_start = '2026-03-09'), 'triggered', 'radar c2 için tetiklendi (danışanın kendi kaydı)');
select is((select count(*)::int from public.pt_alerts where client_id = current_setting('t.c2')::uuid and alert_type = 'DELOAD_RECOMMENDED'), 0, 'geçmişi paylaşmayan danışan için PT''ye DELOAD alarmı üretilmez');
select is((select count(*)::int from public.pt_alerts where client_id = current_setting('t.c4')::uuid and alert_type = 'DELOAD_RECOMMENDED'), 1, 'geçmişi paylaşan danışan için DELOAD alarmı üretilir');
select is((select payload -> 'avg_readiness' from public.pt_alerts where client_id = current_setting('t.c4')::uuid and alert_type = 'DELOAD_RECOMMENDED'), '[80.0, 70.0, 62.5]'::jsonb, 'radar metrikleri (80 / 70 / 62.5)');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt2'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.radar_evaluations where client_id = current_setting('t.c2')::uuid), 0, 'PT eşleşme öncesi pencereli radar değerlendirmesini (metrics) göremez');
select is((select count(*)::int from public.pt_alerts where client_id = current_setting('t.c2')::uuid), 0, 'PT paylaşılmayan geçmişten alarm görmez');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.pt1'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.radar_evaluations where client_id = current_setting('t.c4')::uuid), 1, 'geçmişi paylaşan danışanın radar değerlendirmesi PT''ye görünür');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c2'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.radar_evaluations), 1, 'danışan kendi radar kaydını görür');
reset role;

-- ===================== 11c. Hesap silme senaryoları için özel egzersiz kullanımı =====================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
insert into public.workout_templates (id, owner_id, client_id, title) values
  ('a0000000-0000-4000-8000-000000000040', current_setting('t.c1')::uuid, current_setting('t.c1')::uuid, 'C1 Kendi A'),
  ('a0000000-0000-4000-8000-000000000041', current_setting('t.c1')::uuid, current_setting('t.c1')::uuid, 'C1 Geçici B');
insert into public.template_blocks (id, template_id, position) values
  ('a1000000-0000-4000-8000-000000000040', 'a0000000-0000-4000-8000-000000000040', 1),
  ('a1000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000041', 1);
insert into public.template_exercises (id, block_id, position_in_block, exercise_id) values
  ('a2000000-0000-4000-8000-000000000040', 'a1000000-0000-4000-8000-000000000040', 1, 'e0000000-0000-4000-8000-000000000020'),
  ('a2000000-0000-4000-8000-000000000041', 'a1000000-0000-4000-8000-000000000041', 1, 'e0000000-0000-4000-8000-000000000021');
insert into public.template_exercise_sets (template_exercise_id, set_type, set_number, target_reps_min, target_weight_kg) values
  ('a2000000-0000-4000-8000-000000000040', 'working', 1, 10, 20),
  ('a2000000-0000-4000-8000-000000000041', 'working', 1, 10, 20);
select is((public.start_workout('b0000000-0000-4000-8000-000000000005', null, 'a0000000-0000-4000-8000-000000000041', null, null) ->> 'ok'), 'true', 'danışan kendi şablonuyla (özel egzersiz B) başlar');
select lives_ok($$insert into public.set_logs (id, workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at)
  select 'c0000000-0000-4000-8000-000000000051', w.workout_log_id, w.user_id, w.id, w.exercise_id, 'working', 1, 10, 20, now()
    from public.workout_log_exercises w where w.workout_log_id = 'b0000000-0000-4000-8000-000000000005'$$, 'özel egzersiz B loglandı');
select is((public.complete_workout('b0000000-0000-4000-8000-000000000005', 6::smallint, 'normal', 0::smallint, null) ->> 'status'), 'completed', 'oturum 5 tamamlandı');
select lives_ok($$delete from public.workout_templates where id = 'a0000000-0000-4000-8000-000000000041'$$, 'geçici şablon silindi (B yalnızca loglarda kalır)');
reset role;

-- ===================== 12. Hesap silme =====================
select is((select count(*)::int from public.exercises where owner_id = current_setting('t.c1')::uuid), 2, 'danışanın 2 özel egzersizi var (A: kendi + PT kopya şablonunda, B: yalnızca kendi loglarında)');
select lives_ok(format($$select public.admin_prepare_account_deletion(%L)$$, current_setting('t.pt1')), 'PT silme hazırlığı (özel egzersizi danışan kopyasında)');
select lives_ok(format($$delete from auth.users where id = %L$$, current_setting('t.pt1')), 'PT hesabı silinebilir');
select is((select count(*)::int from public.workout_templates where client_id = current_setting('t.c1')::uuid and owner_id is null), 3, 'PT''nin danışana kopyaladığı şablonlar kalır, owner SET NULL');
select is((select count(*)::int from public.workout_templates where id = 'a0000000-0000-4000-8000-000000000001'), 0, 'PT kütüphane şablonu silindi');
select is((select count(*)::int from public.exercises where id = 'e0000000-0000-4000-8000-000000000022' and owner_id is null), 1, 'PT özel egzersizi kalır, owner SET NULL');
select lives_ok($$select private.daily_cleanup()$$, 'temizlik (PT silindikten sonra)');
select is((select count(*)::int from public.exercises where id = 'e0000000-0000-4000-8000-000000000022'), 1, 'danışan şablonunda kullanılan sahipsiz egzersiz korunur');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c1'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.exercises where id = 'e0000000-0000-4000-8000-000000000022'), 1, 'danışan silinen PT''nin egzersizini okumaya devam eder');
reset role;
select lives_ok(format($$delete from auth.users where id = %L$$, current_setting('t.pt2')), 'aktif eşleşmeli PT hazırlıksız da silinebilir');
select lives_ok(format($$select public.admin_prepare_account_deletion(%L)$$, current_setting('t.c1')), 'danışan silme hazırlığı (özel egzersiz kendi şablonunda ve kendi loglarında)');
select lives_ok(format($$delete from auth.users where id = %L$$, current_setting('t.c1')), 'danışan hesabı silinebilir');
select is((select count(*)::int from public.set_logs where user_id = current_setting('t.c1')::uuid), 0, 'danışan setleri silindi');
select lives_ok($$select private.daily_cleanup()$$, 'temizlik (danışan silindikten sonra)');
select is((select count(*)::int from public.exercises where id in ('e0000000-0000-4000-8000-000000000020', 'e0000000-0000-4000-8000-000000000021', 'e0000000-0000-4000-8000-000000000022')), 0, 'artık kullanılmayan sahipsiz özel egzersizler temizlendi');
select is((select count(*)::int from public.workout_templates where id = '00000000-0000-4000-8000-00000000a001'), 1, 'sistem şablonu temizlikte korunur');
select lives_ok(format($$delete from auth.users where id in (%L, %L, %L)$$, current_setting('t.c2'), current_setting('t.c3'), current_setting('t.c4')), 'kalan hesaplar silinebilir');

select * from finish();
rollback;
```

### 11.4 RLS performans testi (`supabase/tests/perf/rls_explain.sql`)

Danışan verisi politikalarının PT dalı için kabul kriteri (CI, F0'dan itibaren): (1) planlarda `SubPlan` ve `Function Scan on my_client_visibility…` YOK (yalnızca `InitPlan`); (2) PT'nin 12.000 satırlık `set_logs` üzerindeki `count(*)` sorgusu yerel ortamda < 25 ms; (3) `.eq('user_id')` sorgularında `set_logs_user_exercise_time_idx` / `workout_logs_user_started_idx` index koşulu kullanılır; (4) görünür satır sayıları doğru (paylaşımlı danışan tümü, 30 gün önce paylaşımsız eşleşen danışan yalnızca son 30 gün, eşleşmesiz danışan 0).

Ölçüm (2026-09-15, 12.000 `set_logs`, 1.200 `workout_logs`; aynı veri, aynı imaj):

| Sorgu (PT rolü) | v1.0 politikası | v1.1 politikası |
|---|---|---|
| `count(*)` tüm görünür setler (4.300 satır) | Seq Scan + `SubPlan` → `Function Scan on my_client_visibility` **loops=12000**; 3,1 ms | Seq Scan + 2 `InitPlan`, SubPlan yok; 3,2 ms |
| c1 son 50 set (`.eq('user_id')`) | Bitmap Index Scan + SubPlan **loops=4000**; 1,6 ms | Bitmap Index Scan, SubPlan yok; 1,5 ms |
| c2 (30 gün görünür) sayısı | SubPlan **loops=4000**; 1,3 ms | SubPlan yok; 1,8 ms |
| workout_logs c1 | SubPlan **loops=400**; 0,21 ms | SubPlan yok; 0,16 ms |

Yorum: bu veri hacminde mutlak süreler benzer, çünkü definer fonksiyonu tek satırlık basit bir sorgu. Kazanç yapısal: satır başına fonksiyon çalıştırma (`loops = satır sayısı`) ortadan kalkar, maliyet PT'nin danışan sayısıyla değil sorgu başına sabit InitPlan ile sınırlanır. Gerçek hosted veri hacminde (F3 sonrası staging) aynı script yeniden koşulur.

```sql
\pset pager off
begin;
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '{}', '{}', now(), now(), now()
  from (values ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'perf-pt@t.dev'),
               ('aaaaaaaa-0000-4000-8000-00000000000b'::uuid, 'perf-c1@t.dev'),
               ('aaaaaaaa-0000-4000-8000-00000000000c'::uuid, 'perf-c2@t.dev'),
               ('aaaaaaaa-0000-4000-8000-00000000000d'::uuid, 'perf-c3@t.dev')) u(id, email);
update public.profiles set role = 'pt', full_name = 'Perf PT', onboarded_at = now() where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
update public.profiles set role = 'client', full_name = 'Perf Client', onboarded_at = now()
 where id in ('aaaaaaaa-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-00000000000d');
insert into public.pt_client_pairs (pt_id, client_id, data_visible_from) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000b', '-infinity'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000c', now() - interval '30 days');
insert into public.workout_logs (id, user_id, template_title_snapshot, status, started_at, completed_at, last_activity_at, local_date, readiness_outcome)
select gen_random_uuid(), c.id, 'Perf', 'completed', now() - make_interval(days => g), now() - make_interval(days => g) + interval '1 hour',
       now() - make_interval(days => g) + interval '1 hour', (now() - make_interval(days => g))::date, 'skipped_checkin'
  from (values ('aaaaaaaa-0000-4000-8000-00000000000b'::uuid), ('aaaaaaaa-0000-4000-8000-00000000000c'::uuid), ('aaaaaaaa-0000-4000-8000-00000000000d'::uuid)) c(id),
       generate_series(1, 400) g;
insert into public.workout_log_exercises (workout_log_id, user_id, exercise_id, exercise_title_snapshot, tracking_type, load_mode, load_increment_kg, block_index, block_type, position, position_in_block, is_priority)
select wl.id, wl.user_id, e.id, 'Perf', 'weight_reps', 'total', 2.5, 1, 'single', 1, 1, true
  from public.workout_logs wl cross join (select id from public.exercises where scope = 'global' order by title limit 1) e
 where wl.template_title_snapshot = 'Perf';
alter table public.set_logs disable trigger user;
insert into public.set_logs (workout_log_id, user_id, workout_log_exercise_id, exercise_id, set_type, set_number, reps_completed, weight_kg, performed_at, estimated_1rm)
select w.workout_log_id, w.user_id, w.id, w.exercise_id, 'working', n, 8, 60, wl.started_at + make_interval(mins => n), 76
  from public.workout_log_exercises w join public.workout_logs wl on wl.id = w.workout_log_id
 cross join generate_series(1, 10) n
 where wl.template_title_snapshot = 'Perf';
alter table public.set_logs enable trigger user;
analyze public.set_logs;
analyze public.workout_logs;
analyze public.pt_client_pairs;
select 'total_set_logs', count(*) from public.set_logs;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select 'pt_visible_set_logs', count(*) from public.set_logs;
select 'pt_visible_c2_set_logs', count(*) from public.set_logs where user_id = 'aaaaaaaa-0000-4000-8000-00000000000c';
select 'pt_visible_c3_set_logs', count(*) from public.set_logs where user_id = 'aaaaaaaa-0000-4000-8000-00000000000d';
\echo === Q1 PT count(*) all set_logs
explain (analyze, costs off, summary on) select count(*) from public.set_logs;
\echo === Q2 PT history c1 last 50 (eq user_id)
explain (analyze, costs off, summary on) select id, performed_at, weight_kg, reps_completed from public.set_logs where user_id = 'aaaaaaaa-0000-4000-8000-00000000000b' order by performed_at desc limit 50;
\echo === Q3 PT count c2 (eq user_id, time-limited visibility)
explain (analyze, costs off, summary on) select count(*) from public.set_logs where user_id = 'aaaaaaaa-0000-4000-8000-00000000000c';
\echo === Q4 PT workout_logs c1
explain (analyze, costs off, summary on) select count(*) from public.workout_logs where user_id = 'aaaaaaaa-0000-4000-8000-00000000000b';
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000b","role":"authenticated"}', true);
\echo === Q5 client own count
explain (analyze, costs off, summary on) select count(*) from public.set_logs where user_id = 'aaaaaaaa-0000-4000-8000-00000000000b';
rollback;
```

---

## 12. Açık sorular (ürün sahibi kararı gerekenler)

Her madde VARSAYILAN kararla uygulanır; ürün sahibi farklı karar verirse ilgili bölüm güncellenir.

| # | Soru | VARSAYILAN | Etki |
|---|---|---|---|
| S1 | Solo danışan (PT'siz) v1'de desteklenecek mi? | Evet: C7 "Antrenmanlarım" (tek bloklu, toleranssız) | Hayır denirse C7 kaldırılır, C1 boş durumu yalnızca "PT kodunu gir" |
| S2 | Barındırma bölgesi ve KVKK yurt dışı aktarım dayanağı | Supabase hosted `eu-central-1` + standart sözleşme ve **imzadan itibaren 5 iş günü içinde** Kurum'a bildirim (düzenli aktarım açık rızaya dayandırılmaz); hukuk onayı olmadan prod proje oluşturulmaz. Alternatif: TR'de self-host | Proje oluşturma, SMTP ve Sentry bölgesi |
| S3 | Eşleşme bittiğinde PT eski verilere salt okuma erişimi korusun mu? | Hayır, anında kesilir | RLS `status='active'` |
| S4 | 18 yaş altı danışan kabul edilecek mi? | Hayır (18+ beyanı zorunlu) | Veli onayı akışı v2 |
| S5 | Guardrail formülü `max(%, kg)` ve varsayılan %20 / 5 kg PT'lerle doğrulansın mı? | Evet, şartnamedeki gibi; pilot PT geri bildirimiyle v1.2'de ayarlanabilir | §7.2 |
| S6 | Readiness 20–100 gösterimi ve < 60 eşiği | PRD formülü, 20–100, < 60 | §7.1 |
| S7 | Deload: %15 ve set ×2/3 kırpma | Şartnamedeki gibi | §7.3 |
| S8 | Deload radarı eşikleri (hacim ≥ W−2, readiness 3 hafta kesin düşüş ve ≥ 10 puan, haftada ≥ 2 check-in) | Başlangıç varsayımı; pilot sonrası kalibrasyon | §7.6 |
| S9 | Düşük readiness için PT'ye push gönderilsin mi? | Tercih var, varsayılan kapalı | `notification_preferences` |
| S10 | Dambıl "el başı" ağırlıkta tonaj ×2 sayılsın mı? | Evet (`load_mode='per_side'`) | §7.5 |
| S11 | Transactional e-posta sağlayıcısı ve gönderim alt alanı | Resend veya Postmark (AB veri bölgesi), `mail.pulsecoach.app` | F0 |
| S12 | Supabase planı ve ortamlar | Pro plan; ayrı staging ve production projeleri | Duraklatma, review |
| S13 | `pt_notes` ve postür notları danışana görünür mü? | Evet (salt okuma) | §5.2, P3 uyarısı |
| S14 | Monetizasyon | v1'de ödeme ve danışan limiti yok | Şema değişmez |
| S15 | Audit ve sağlık verisi saklama süreleri | Audit 2 yıl; sağlık verisi hesap silinene kadar | Hukuk teyidi |
| S16 | PT'lere isteğe bağlı MFA (TOTP) | v1.1'de opsiyonel | Pro plan özelliği |
| S17 | Apple token revoke başarısız olursa hesap silme bloklansın mı? | Hayır: silme tamamlanır, `apple_revoke_failed` audit'e yazılır, kullanıcıya Apple Kimliği ayarlarından kaldırma bilgisi gösterilir. Sprint 0'da üç varyantta (dev/preview/prod bundle ID) gerçek revoke testi | §3.11 |
| S18 | Eşleşme bitince / PT hesabı silinince atanmış program ne olur? | Danışanda aktif kalır (guardrail kapalı); danışan `leave_program` ile bırakır; yeni PT atadığında otomatik arşivlenir | §6.3, C1/C6 |
| S19 | Liste dışı (unlisted) Vimeo desteği | v1'de var: `video_hash` (`^[0-9a-f]{10}$`); gerçek linklerle Sprint 0 doğrulaması, farklı biçim çıkarsa CHECK migration ile gevşetilir | §5.7, §7.10 |
| S20 | VERBİS kaydı ve yurt dışı aktarım dayanağı | Hukukçu değerlendirmesi prod lansmanından önce; standart sözleşme imzası sonrası 5 iş günü içinde bildirim; açık rıza düzenli aktarım dayanağı yapılmaz | §5.9, S2 |
| S21 | Silinen hesabın kullanılmayan özel egzersizlerinin temizlik süresi | ≤ 24 saat (günlük cron); aydınlatma metnine yazılır | §3.11, §6.3 |
| S22 | PT'nin telefonu danışana gösterilsin mi? | Hayır (kolon yetkisiyle kapalı); gerekirse v1.1'de PT'nin açık tercihiyle ayrı RPC | §5.2 |

---

## Revizyon Notları (v1.0 → v1.1, 2026-09-15)

**Yöntem:** v1.0'daki SQL blokları çıkarılıp `supabase/postgres:17.6.1.167` imajında (eleştirmenle aynı stub: `auth.users` ek kolonları, `auth.identities`, `request.jwt.claims` okuyan `auth.uid()`, `realtime.messages/topic/send`) uygulandı: **152/152** geçti ve eleştirideki T1 (23503 ×3), T2 (radar payload sızıntısı), T3 (UUID ile egzersiz okuma), T6 (23514), T7 (sıfır setle `completed`) ile T5 (korelasyonlu SubPlan) yeniden üretildi. Düzeltmeler uygulanıp aynı ortamda **245/245** geçti. RLS planı 12.000 satırla ölçüldü (§11.4), `seed-demo.sql` iki kez çalıştırıldı. Geçici konteyner kaldırıldı. Toplam **37 eleştiri maddesi** kapatıldı: 19 gap, 10 sql_problem, 8 PRD maddesi. Revizyonda ayrıca 6 ek sorun bulundu ve düzeltildi.

### A. Gaps (19)

| # | Madde (önem) | Nasıl kapatıldı | Doğrulama |
|---|---|---|---|
| A1 | Hesap silme — `admin_prepare_account_deletion` 23503 (critical) | Egzersiz DELETE adımı fonksiyondan tamamen çıkarıldı (§5.5). Özel egzersiz `owner_id SET NULL` olur; artık kullanılmayan sahipsizleri yalnızca `daily_cleanup` siler. §3.11 "Silme sonucu", §4.5, §6.3 ve K19 gerçek davranışa göre yeniden yazıldı; dönüş sayaçlarından `custom_exercises_deleted` kaldırıldı. | pgTAP §12: (a) özel egzersizi kendi şablonunda, (b) yalnızca kendi logunda olan danışan, (c) özel egzersizi danışan kopyasında olan PT için hazırlık + `auth.users` silme başarılı. Temizlik kullanılan sahipsiz egzersizi korur, sonra kullanılmayanları siler. |
| A2 | KVKK / deload radarı ve türetilmiş değerler (high) | `radar_evaluations.window_start` eklendi. `run_deload_radar` PT alarmını yalnızca `window_start ≥ data_visible_from` iken üretir ve değerlendirmeyi yalnızca bu tarihten sonraki verilerle yapar (`evaluate_radar(..., p_visible_from)`). `radar_select_pt` aynı koşulu uygular. `workout_log_exercises.best_e1rm_at_start` ve `pr_events.previous_best_e1rm` kolonları kaldırıldı; iki değer yalnızca sahip RPC'lerinde okuma anında `private.best_e1rm_before()` ile hesaplanır. §7.6 KVKK kuralı eklendi. | pgTAP §11b: paylaşmayan danışanda PT 0 radar satırı / 0 alarm görür, danışan kendi `triggered` kaydını görür; paylaşan danışanda alarm + metrikler (80/70/62.5). §2'de kolonların yokluğu, §7/§9b'de payload değerleri test edilir. |
| A3 | RLS — egzersiz görünürlüğü yazımla genişliyordu (medium) | `template_exercises_validate_exercise` BEFORE INSERT/UPDATE trigger'ı (INVOKER) + `private.exercise_usable_in_template()`: arşivsiz VE (global / çağıranın / şablonun danışanının / danışanın aktif PT'sinin). PT kütüphane şablonuna danışan egzersizi eklenemez, böylece atama yoluyla üçüncü kişiye sızamaz. `my_assigned_exercise_ids()` korundu (eşleşme bitince atanmış şablon çalışsın) ama artık yazımla genişletilemiyor. | pgTAP §5b: UUID ile ekleme `exercise_not_available` (42501), egzersiz okunamaz kalır. §6b: PT kütüphanesine danışan egzersizi reddedilir, danışan kopyasına izin verilir. |
| A4 | RLS performansı (medium) | 8 tabloda sahip/PT politikaları ayrıldı. PT dalı `(select private.my_client_visibility_map())` InitPlan'ı + jsonb anahtar araması kullanıyor; eski `my_client_visibility()` kaldırıldı. `.eq('user_id')` istemci kuralı (§5.1 #8, §8.1) ve EXPLAIN kabul kriteri (§11.4) eklendi. | EXPLAIN ANALYZE, 12.000 satır: v1.0'da `Function Scan … loops=12000`, v1.1'de SubPlan yok, görünür satır sayıları aynı (4.300 / 300 / 0). Süre bu hacimde benzer (≈3 ms); kazanç yapısal. |
| A5 | Apple revoke tek client ID (medium) | İstemci `bundle_id` (`Application.applicationId`) gönderir. Fonksiyon bunu `APPLE_CLIENT_IDS` izin listesiyle doğrular, client_id ve client_secret `sub` alanı olarak kullanır. Revoke sonucu kod olarak döner; hata (token takası, revoke, ağ, yapılandırma, geçersiz bundle) silmeyi bloklamaz, `apple_revoke_failed` audit'e yazılır, kullanıcı bilgilendirilir. Ürün kararı: §12 S17. | Kod incelemesi. Gerçek revoke testi üç varyantta Sprint 0 (S17). |
| A6 | P1 `synced_at` belirsiz (medium) | OVERLOAD payload'ına `server_received_at = now()` eklendi, tekrarda güncellenir. P1 kuralı `server_received_at − performed_at > 10 dk`; §4.6 tablosu güncellendi. | pgTAP §7: payload alanı mevcut. |
| A7 | `complete_workout` sıfır set (medium) | Çalışma seti yoksa `nothing_logged` (P0001) döner, durum değişmez; cron ile tek kural (§6.3). C5'te "0 set → Antrenmanı iptal et", outbox eşlemesi eklendi. §7.9/§7.12'de "tamamlanmış = ≥1 çalışma seti". | pgTAP §10: setsiz oturum `nothing_logged`, sonra cron ile `abandoned`. |
| A8 | Outbox sessiz 0 satır UPDATE (medium) | Tüm update/delete op'ları `.select('id')` ile doğrulanır; 0 satır → `failed` + `workout_locked` / `delete_not_allowed` (§8.2). `private.workout_is_open()` auto_closed abandoned ≤24 saat penceresini içerir; `set_logs_update_own` ve `workout_logs_update_own` artık trigger penceresiyle birebir aynı. | pgTAP §11: cron kapattıktan sonra geç senkron seti eklenir, RLS altındaki UPDATE gerçekten uygulanır (v1.0'da sessizce 0 satır). |
| A9 | Eşleşme bitince kalan program (medium) | `leave_program()` RPC, `get_client_home().program.can_leave`, C1/C6 "Programı bırak" eklendi. Ürün kararı §6.3 + §12 S18. | pgTAP §10: aktif PT'nin programı `program_managed_by_pt`; eşleşme bitince bırakılır, C1'de program null. |
| A10 | Edge Function secret eksikken açık kalma (low) | review-login: passcode < 32 karakter, allowlist boş veya anahtar eksikse 503; boş passcode reddedilir. send-push: secret < 32 ise 503, boş header 401. Secret uzunluk kuralı §1.5 ve §3.14'e eklendi. | Kod incelemesi. |
| A11 | Video WebView (low) | isTopFrame kuralı eklendi; ayrıca `originWhitelist=['https://*']` ve `onOpenWindow`. Kaynakta görüldü ki 13.16.1 whitelist'i alt çerçevelere de uyguluyor ve dar listede iç çerçeveleri `Linking` ile dışarı açıyor. `video_hash` + `video_start_sec` şemaya, GRANT'lere, payload'a ve `parseVideoUrl` vektörlerine eklendi. | `node_modules/react-native-webview` (13.16.1) `WebViewShared.js`, `RNCWebViewClient.java`, `RNCWebViewImpl.m` incelendi. Gerçek cihaz testi release checklist'te. |
| A12 | Isınma dinlenmesi tutarsız (low) | Tek kural: ısınma null→60 (single + süperset), single çalışma null→90, süperset çalışma 0. `start_workout`, §4.6 ve §7.7 eşitlendi; süperset ısınma vektörü eklendi. | pgTAP §7: ısınma null → 60, süperset çalışma seti 0. |
| A13 | `primary_regions` DEFAULT ↔ CHECK (low) | DEFAULT kaldırıldı. | pgTAP §2: `column_default` null. |
| A14 | Push credential kurulumu yok (low) | §1.4 `googleServicesFile`, §1.5 `GOOGLE_SERVICES_JSON` (EAS file env) ve `.gitignore` eklendi. F0 çıkışı: `eas credentials` ile FCM V1 service account + APNs key. F2 çıkışı: iOS+Android gerçek cihaz push smoke testi. §3.14 kontrol listesi güncellendi. | docs.expo.dev `fcm-credentials` ve `push-notifications-setup` sayfalarıyla (2026-07) teyit edildi. |
| A15 | App Review / demo tanımsız (low) | `scripts/create-review-users.ts` (admin API, idempotent) ve tam içerikli `supabase/seed-demo.sql` eklendi; seed gerçek RPC/RLS yollarıyla sıfırlayıp yeniden üretir, uygulama yöntemi yazıldı. App Store Connect notu ve Play "App access" talimatı §3.12'ye eklendi. review-login başarı/başarısızlıkları `admin_audit_event` ile `private.audit_log`'a yazılır. Gizli 7 dokunuş yerine yalnızca flag açıkken görünen "Demo erişimi" (Guideline 2.3.1). | Docker'da iki kez çalıştırıldı: 6 oturum (6 ayrı gün), 1 OVERLOAD + 1 LOW_READINESS, 10 PR, 5 en iyi, clock skew 0; ikinci çalıştırmada sayılar aynı. |
| A16 | Aktif oturum çakışması (DATA-9) (low) | C1 `ResumeWorkoutCard` ve C2 `session_in_progress` sheet'i: Devam et / Önceki antrenmanı bitir / İptal edip yenisini başlat. §3.8 hizalandı. | C1/C2 KK maddeleri (Maestro/RNTL). |
| A17 | KVKK süreçleri (low) | §5.9 kontrol listesi: m.11 başvuru kanalı + 30 gün, VERBİS değerlendirmesi, standart sözleşme imzasından sonra 5 iş günü içinde bildirim, düzenli aktarımın açık rızaya dayandırılmaması, veri ihlali 72 saat. §12 S2 güncellendi, S20 eklendi. | Hukuk teyidi lansman öncesi ZORUNLU (S20). |
| A18 | Test vektörleri ALGO-11 / ALGO-6 (low) | §7.2'ye 50→57.5/57.75, 200→230/230.25, 20→24 satırları ve aynı egzersizin iki kez geçtiği ALGO-6 vektörü eklendi; pgTAP'e sınır ve sunucu testleri eklendi. | pgTAP §1 (6 sınır assertion'ı), §9b (BP#1 100 kg ok, BP#2 100 kg over, tek alarm). |
| A19 | Profil gizliliği (low) | `profiles` için authenticated'a yalnızca kimlik kolonlarında SELECT verildi; `get_my_profile()` eklendi, `['profile']` sorgusu RPC'ye taşındı. §5.2 notu gerçek davranışa göre yazıldı; PT telefonu danışana gösterilmez (S22). | pgTAP §4–5: kendi telefonu RPC ile okunur; PT danışan telefonunu ve saat dilimini okuyamaz (42501). |

### B. sql_problems (10)

| # | Madde | Durum |
|---|---|---|
| B1 | `admin_prepare_account_deletion` 23503 | A1 |
| B2 | Radar `data_visible_from`'u yok sayıyor, `radar_select` filtresiz | A2 |
| B3 | `template_exercises` INSERT/UPDATE egzersiz okunabilirliği | A3 |
| B4 | `primary_regions` DEFAULT ↔ CHECK | A13 |
| B5 | Korelasyonlu SubPlan (7 politika) | A4 (radar dahil 8 tablo) |
| B6 | `complete_workout` sıfır set | A7 |
| B7 | `set_logs_update_own` pencere farkı / 0 satır | A8 |
| B8 | `push_outbox.user_id` index'i yok | `push_outbox_user_idx` eklendi. Aynı katalog taramasında `consents.pair_id` (SET NULL) için de index eksik çıktı: `consents_pair_idx` eklendi. pgTAP §2 artık "her FK'nın ilk kolonu bir index'in öncü kolonu" koşulunu denetliyor (0 ihlal). |
| B9 | `start_workout` ısınma rest | A12 |
| B10 | Stub notu (152/152) | Aynı stub + pg_cron/pg_net/pgtap ile ortam yeniden kuruldu. Baseline 152/152 teyit edildi; revize SQL 245/245. Stub yalnızca test ortamı içindir. Gerçek GoTrue/Realtime şemasıyla `npx supabase test db` koşusu F0 çıkış kriteridir. |

### C. prd_items_not_covered (8)

| # | PRD maddesi | Nasıl kapatıldı | Doğrulama |
|---|---|---|---|
| C1 | §5.3 P4 "Blok ve Hafta Planlama" | v1'de karşılanıyor: `programs.duration_weeks` (blok), `days_per_week` (haftalık plan / seri hedefi), `get_client_home` hafta sayacı ve blok bitti bilgisi, P4 editör alanları, `assign_program` kopyası. Hafta bazlı progresyon v1.2 (§10 #28). | Demo seed 6 haftalık blok atar, `week_index` üretir. |
| C2 | §3 Super Admin: global kütüphane + şablon tasarlama | §6.8 içerik hattı ve K40. `workout_templates.is_system` (CHECK), `clone_system_template()`, seed'de örnek sistem şablonu; `daily_cleanup` sistem şablonlarını korur (§10 #6). | pgTAP §2 (yalnızca global egzersiz), §5b (PT kopyalar, danışan kopyalayamaz, okunabilir), §12 (temizlikte korunur). |
| C3 | §3 PT: global kütüphaneye öneri | `exercise_suggestions` tablosu, `suggest_exercise_to_global()` (24 saatte 10, tek bekleyen), `private.review_exercise_suggestion()`, P5 butonu (§10 #7). | pgTAP §5b: öneri, `suggestion_pending`, danışan reddi, kabulde global egzersiz. |
| C4 | §5.3 P3 fonksiyonel değerlendirme, Y-Balance bileşik skoru | `measurement_category='functional'`, `measurement_unit` score/reps, 6 fonksiyonel tip. Y-Balance bileşik skoru `is_derived` tip olarak trigger ile saklanır ve istemciye kapalıdır. P3 güncellendi (§10 #47). | pgTAP §6b: 94.44, girdi değişince 85.00; türetilmiş tip yazılamaz; danışan fonksiyonel skor giremez. |
| C5 | §5.2 C1 "Son Ölçüm Değişimleri" | `measurement_latest_deltas` view'ı (security_invoker, tüm tipler, PT girişleri dahil); C1 `MeasurementDeltaCard` (§10 #48). | pgTAP §6b: kilo −1.5; PT girdiği Y-Balance değeri görünür. |
| C6 | §4.1 "PT geçmişe tam erişim" | Rıza anahtarı korundu (KVKK açık rıza); anahtar açıkken PRD davranışı birebir. Radar ve türetilmiş değer sızıntıları kapatıldı (A2). §10 #13 güncellendi. | pgTAP §5 (paylaşmayan) ve §11b (radar). |
| C7 | §4.4 "PT paneline başarı logu iletilir" | Set anında `pr_candidate`, kapanışta `pr_achieved` realtime yayını (yalnızca id). P1 "Rekor adayı" rozeti ve anlık başarılar akışı (§6.4, §10 #19). | pgTAP §9b: PT feed'inde 2 aday + 2 PR yayını. |
| C8 | §8.2 `warmup_suggestions` | `private.warmup_suggestions()` + `SessionPayload.exercises[].warmup_suggestions` (§7.8, §10 #39). | pgTAP §1 (11 vektör), §7 (planlı ısınma → []), §9b (100 kg → 20×10, 50×5, 75×3; aynı kasın ikinci hareketi → []). |

### D. Revizyon sırasında bulunan ek sorunlar

| # | Sorun | Düzeltme |
|---|---|---|
| D1 | `LOW_READINESS` (`low_readiness:<gün>`) ve `DELOAD_RECOMMENDED` (`deload:<hafta>`) tekilleştirme anahtarı PT başına benzersizdi. Aynı PT'nin iki danışanı aynı gün/hafta alarm üretince ikincisi sessizce kayboluyordu. | Anahtarlara danışan kimliği eklendi. pgTAP §11b: aynı gün iki danışan → 2 alarm. |
| D2 | `abandon_workout` iptal edilen oturumun setlerini `exercise_bests`'ten düşürmüyordu (recompute yalnızca set yazımında tetikleniyordu). | İptalde ilgili egzersizler için `recompute_exercise_best`. |
| D3 | `originWhitelist` iOS'ta alt çerçevelere de uygulanıyordu; dar liste oynatıcıyı kırıyordu. | A11. |
| D4 | Gizli 7 dokunuşlu inceleme girişi Guideline 2.3.1 (gizli özellik) riski taşıyordu. | Flag'li görünür "Demo erişimi" (A15). |
| D5 | `session_summary.first_records` tabanı onaysız overload setlerini sayıyordu; PR tabanıyla tutarsızdı. | İkisi de `private.best_e1rm_before()` kullanıyor. |
| D6 | Radar cooldown duvar saatine (`evaluated_at`) bağlıydı, fonksiyon test edilemiyordu. | Hafta bazlı cooldown, `run_deload_radar(p_now)`, pencere dışı (gelecek) oturumlar sayılmıyor. |

### E. Kalan açık konular

- Apple revoke'un üç varyant bundle ID'si ile gerçek cihazda testi ve `APPLE_KEY_ID`'nin üç App ID ile kullanılabilirliği (S17, Sprint 0).
- Liste dışı Vimeo hash biçiminin gerçek linklerle doğrulanması (S19).
- VERBİS ve yurt dışı aktarım dayanağı için hukuk teyidi (S2, S20).
- Edge runtime'da `SUPABASE_PUBLISHABLE_KEYS` env değişkeninin varlığı (§3.12, Sprint 0).
- Hosted ortamda `daily_cleanup`'ın `auth.users` DELETE izni (§6.3 notu).
- RLS EXPLAIN ölçümünün staging veri hacmiyle tekrarlanması (§11.4).
- Stub yerine gerçek GoTrue/Realtime şemasıyla `npx supabase test db` koşusu (F0).

