import type { HealthConsentState } from '@/lib/client-status';

/** Sağlık modülünün danışan açısından durumu: PT ekranlarında aynı adla. */
export const HEALTH_STATE_LABELS: Record<HealthConsentState, string> = {
  off: 'Sağlık modülü kapalı',
  pending: 'Sağlık onayı bekleniyor',
  granted: 'Sağlık takibi açık',
  declined: 'Sağlık onayı verilmedi',
  outdated: 'Sağlık onayı yenilenecek',
};

export const HEALTH_STATE_DETAILS: Record<HealthConsentState, string> = {
  off: 'Sağlık verisi tutulmuyor; danışan bu ekranları görmez.',
  pending: 'Danışan ilk girişinde neyin tutulacağını görüp onaylayacak. O zamana kadar kayıt tutulmaz.',
  granted: 'Danışan onay verdi; seçili parçalar kaydedilebilir. İstediği an geri çekebilir.',
  declined: 'Danışan onay vermedi; sağlık kaydı tutulmaz. Kendi ekranından sonra açabilir.',
  outdated:
    'Onay bazı parçaların güncel kapsamını ya da metnini karşılamıyor (modül yeniden açıldı, parça eklendi ya da parçanın metni değişti); o parçalar bir sonraki girişinde yeniden sorulacak, onayı süren parçaların kaydı devam eder.',
};
