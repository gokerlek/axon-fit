# Uygulama güncellemeleri

PT panelinde Ayarlar → Uygulama sürümü açılır. Danışanlar bu sayfaya ve API'ye erişemez. Şu anda yayımlanmış yeni kararlı release yoksa ekran bunu söyler.

## Otomatik yol

1. GitHub Actions açık olmalı. Vercel Git bağlantısının Production Branch'i kod reposunun default branch'i olmalı. `AXON_CODE_REPO=hesabın/kod-repon` tanımla; sihirbaz bunu oluşturduğu .env çıktısına ekler. Veri repo'sunu bu alana yazma. Geliştiricinin `gokerlek/axon-fit` reposu güncelleme hedefi olamaz.
2. GitHub tokenının kendi kod reposuna erişmesi ve Actions workflow dispatch yetkisi olması gerekir. PT'nin kendi veri tokenı kullanılır; ayrı geliştirici kişisel tokenı veya servis gerekmez.
3. Güncellemeleri kontrol et. Kararlı release'in `axon-release.json` dosyası tam sürümü içermeli, `automaticUpdate:true` ve `dataMigration:false` olmalı. Veri dönüşümü gerektiren sürüm otomatik açılmaz.
4. Kod değişikliklerinin üzerine yazılmasını onayla → Yeni sürümü hazırla. Actions sadece `axon-update-<run-id>` dalını hazırlar. Varsayılan üretim dalına dokunmaz.
5. Durumunu tekrar kontrol et. Başarılı hazırlıkta Güncellemeyi yayınla butonu gelir. Sunucu önce `axon-backup-<run-id>` etiketiyle eski kodu saklar, ardından PT'nin kendi GitHub tokenıyla üretim dalını normal fast-forward olarak ilerletir. Böylece Vercel normal Git push alır. Kod bu sırada değişmişse işlem durur; force push yapılmaz.
6. Vercel yayınının sonucunu kontrol et. Sürüm numarası yeni uygulama yayını hazır olduğunda değişir. "Kod aktarıldı" bildirimi deployment başarısı anlamına gelmez. Dal koruması, Vercel erişimi/planı, kota veya derleme hatası yayını engelleyebilir.

Danışan/veri repoları ve ortam değişkenleri güncelleme tarafından değiştirilmez. Repo'ya yanlışlıkla veri veya `.env` koyduysan otomatik güncelleme kullanma. Workflow dosyaları eski sürümden korunur; bunların güncellenmesi ayrı manuel işlemdir. İhtiyaç kalmayan `axon-update-*` dallarını GitHub'dan silebilirsin; bu dallar Vercel'de Preview yayını oluşturabilir.

### Güncellemeyi hazırlarken 404 alıyorsan

Önce kendi kod reponun **Actions** ekranını aç. **Axon update** görünmeli ve etkin olmalı. **Enable workflow** veya **Enable Actions** bildirimi varsa repo sahibinin etkinleştirmesi gerekir.

Workflow hiç yoksa kod reponun varsayılan dalında `.github/workflows/axon-update.yml` dosyasını kontrol et. Dosya kopyanda eksikse [ana repodaki dosyanın](https://github.com/gokerlek/axon-fit/blob/main/.github/workflows/axon-update.yml) içeriğini aynı yola ekle. GitHub'ın web editöründen **Add file → Create new file** ile ekleyebilirsin. Bu tek seferlik onarımdan sonra uygulamada yeniden sürüm kontrolü yapıp hazırlığı başlat.

Güncel otomatik kurulum sihirbazı bu dosya eksikse kendisi oluşturur. İlk kurulum anahtarındaki `workflow` izni bunun içindir; dosya zaten varsa üzerine yazılmaz. Kurulu eski kopyalar için yukarıdaki tek seferlik manuel onarım geçerlidir.

Dosya ve etkin workflow mevcutsa Vercel'deki `GITHUB_TOKEN` anahtarının **kod reposuna** erişimini kontrol et. Yalnız veri reposuna izin veren bir anahtar güncelleme yapamaz. Classic token için `repo`, fine-grained token için ilgili kod reposunda Contents okuma/yazma ve Actions okuma/yazma gerekir. Workflow dosyalarını API veya Git ile değiştirmek ayrıca workflow izni gerektirebilir; sırf workflow çalıştırmak için bu ek izin gerekmez.

Sürüm kontrolü artık yeni sürümü göstermek ile otomatik güncellemenin hazır olup olmadığını ayrı raporlar. Eksik workflow veya repo erişiminde otomatik işlem açılmaz; sürüm bilgisi kaybolmaz.

## Kod değişikliklerini koruyarak manuel yol

Çalışma ağacı temizken kendi kod reponu bilgisayara indir, önce bir yedek al. Upstream remote ekle, tag'ları al ve yayımlanan kararlı sürümü kendi değişikliklerinle merge et. Çakışmaları çöz, sürüm notlarındaki env/veri değişikliklerini uygula, typecheck/test/build çalıştır ve kendi Production dalına push et. Workflow dosyası değişiyorsa GitHub'ın gerekli workflow izinlerini de kullan.

Örnek (gerçek sürüm tag'ını release sayfasından seç):

```sh
git remote add upstream https://github.com/gokerlek/axon-fit.git
git fetch upstream --tags
git tag yedek-guncelleme-oncesi
git merge vX.Y.Z
npm ci
npm run typecheck
npm test
npm run build -- --webpack
git push origin HEAD
```

`git remote add` yalnız ilk sefer gerekir. `vX.Y.Z` örnektir, gerçek tag değildir. Repo'yu daha önce Vercel Deploy düğmesiyle kopyaladıysan geçmişler ayrı olabilir: ilk birleştirmeyi dikkatle yap, rastgele `--force` push etme.

## Sürüm yayımlayan geliştirici

`package.json` ve `axon-release.json` sürümlerini birlikte güncelle. Type/lint/test/build ve test PT kurulumu/güncellemesini doğrula; sonra `vX.Y.Z` tag'ından draft/prerelease olmayan GitHub Release yayımla. Veri migrasyonu varsa `dataMigration:true` ve `automaticUpdate:false` yap. Herkese otomatik güncelleme sunmadan önce gerçek test PT reposunda hazırlık → yayın → Vercel deployment akışını doğrula. Bu işlem gerçek danışan verileriyle test edilmez.
