# Kamera ölçüm oturumu ve kayıt Implementation Plan

**Goal:** Kamerayla duruş ve hareket görevlerini tekrarlı örnek, kalıcı ölçüm kaydı ve karşılaştırılabilir geçmişle tamamlamak.
**Architecture:** Yerel MediaPipe çıkarımı korunur. Saf protokol/geometri/örnekleme çekirdeği ve dar kayıt şeması; mevcut onaylı sağlık JSON kaydına atomik/idempotent ekleme; PT ve kendi danışan oturumuna açık dar API; ortak kamera UI/geçmiş.
**Tech Stack:** Next 16, React, Valibot, MediaPipe, mevcut GitHub JSON deposu.
**Spec:** docs/CAMERA-MEASUREMENT-RESEARCH.md; kullanıcının bütün akışları tamamlayıp en son kendi cihazında test etme talebi.

## Global constraints
Aynı feature dalında çalışılır. Gerçek danışan verisine test yazımı yok. Görüntü ve landmark dizisi kaydedilmez. Klinik norm, doğrulanmış iddiası ve otomatik program değişikliği yok. Kayıt ayrı düğmeyle; kullanıcı kalibrasyon aracı almak zorunda değil. Başlangıç gövde eğimi sıfırlanmaz. Mezura/cm ölçümleri mevcut manuel akışta kalır.

## Tasks
- [x] 1: Saf protokoller: önden/yandan duruş, yandan squat, diz bükme-açma, kalça menteşesi, omuz öne/yana kaldırma, dirsek bükme, otur-kalk. Göreve/visible-side'a özgü ölçüm; statikte medyan/dağılım, dinamikte geçerli tamamlanan tekrarların ROM özeti. Süre/sampling/coverage/gap ret testleri önce RED sonra GREEN.
- [x] 2: `camera-measurement.ts` şeması ve saf route: kimlik/rol/onay/origin, sıkı görev-metrik ve sürüm kontrolü, limit/idempotency; health.json kamera ölçümleri opsiyonel, onaysız dilimde yok. Sahte bağımlılıklarla route testleri.
- [x] 3: Mevcut kamera wizard'a başlangıç/süre/tekrar/yeniden deneme/sonuç/kaydet; PT ve danışan sayfalarında geçmiş. Aynı protokol/taraf/çekim koşulundaki kayıtlar için sayısal fark; doğrulanmamış değişime gelişim hükmü yok.
- [x] 4: Typecheck, odaklı lint, tüm testler, production build ve test danışanıyla browser UI doğrulama. Ayrı kaynak incelemesi. README ve tasarım durumunu güncelle.

## Review Focus
Yanlış danışana erişim; kapalı onay; sahte doğrulanmış/metrik payload; düşük FPS/kare kaybı/sabit görüntüde tamamlanmış tekrar; çift kayıt; eski sağlık kayıtlarının korunması; farklı kamera yönleri arasında hatalı trend.

Ruling: Ek izin/plan onayı beklenmez — kullanıcı açıkça tüm işi tamamlamayı ve en sonunda test etmeyi istedi. Ruling: cm/omurga/kuvvet uydurulmaz; zaten var olan manuel ölçümler korunur. Ruling: veri existing health.json'a screening kapsamıyla eklenir.


## Execution ledger
Tasks 1–3: protocol/capture and strict schema/route tests first failed (missing implementation), then passed. Integration uses existing `updateHealth` optimistic-write service; no real client test writes.
Final fresh review: three Important findings, all reproduced RED then fixed GREEN: slow ROM lost endpoints; invalid frames falsely changed side; source dimensions were not locked. Added regression tests for each. No further important review finding.
Ruling: automated geometric estimates stay descriptive and pilot-labelled until the user's final hardware tests; no fabricated cm, 3D spine or clinical norms. Existing manual measurements remain available.

Task 4 complete: 2253/2253 tests passed; typecheck, ESLint and final production build passed. Test Gelişim camera UI verified: nine task cards, consent gate, sit/stand instructions/chair options, disabled capture without camera, and skip creates no result/save control. At 390px width no horizontal overflow. Browser console warning/error list empty. No physical-camera accuracy or live private-repo save was claimed; route/storage behavior exercised with fake dependencies and health-schema round trip. User hardware validation remains the final acceptance step.
