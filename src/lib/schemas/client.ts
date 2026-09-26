import * as v from 'valibot';

/**
 * Danışan şeması — sunucu ve istemci ortak (SPEC §3, §4).
 *
 * Danışanın her şeyi kendi özel repo'sunda (`client-<id>`): `client.json` bu kayıttır,
 * `invite.json` davet kodunun özeti. Uygulama repo'sundaki `data/clients.json` yalnız
 * kimlik ve durum tutar — isim, not hiçbir koşulda oraya yazılmaz.
 */

/** Danışan kimliği: `c_` + 6-24 küçük harf/rakam. Repo adına doğrudan girdiği için dar tutulur. */
export const CLIENT_ID_PATTERN = /^c_[a-z0-9]{6,24}$/;

export const CLIENT_NAME_MAX = 60;
export const CLIENT_NOTE_MAX = 500;

export const CLIENT_STATUSES = ['active', 'paused', 'archived'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  archived: 'Arşivde',
};

/**
 * Sağlık modülünün parçaları. PT danışanı açarken hangilerinin tutulacağını seçer;
 * danışan onayı bu listeyi kapsar — sonradan eklenen parça yeniden onay ister.
 */
export const HEALTH_FIELDS = ['conditions', 'readiness', 'check_in', 'measurements', 'screening'] as const;
export type HealthField = (typeof HEALTH_FIELDS)[number];
export const HEALTH_FIELD_INFO: Record<HealthField, { label: string; description: string }> = {
  conditions: { label: 'Kısıtlar', description: 'Sakatlık ve rahatsızlıklar; egzersiz süzgeci bunlarla çalışır.' },
  readiness: {
    label: 'Hazır oluşluk',
    description: 'Antrenman öncesi uyku, enerji, kas ağrısı ve stres (1–5); kötü günde yük önerisi hafifler.',
  },
  check_in: {
    label: 'Ağrı takibi',
    description: 'Ağrı seviyesi, belirtilerin yönü ve kırmızı bayrak soruları; ağrı artarsa yük durur.',
  },
  measurements: { label: 'Ölçümler', description: 'Beden çevreleri, performans testleri ve anket skorları.' },
  screening: { label: 'Hareket taraması', description: 'Hareket paternlerinin puanı, asimetri ve ağrı bayrakları.' },
};

/** Onay metninin sürümü: metin değişirse artar, eski onay "güncel değil" sayılır. */
export const HEALTH_CONSENT_VERSION = '2026-09';

/**
 * Danışanın uygulamaya gelmeden önceki antrenman geçmişi (tasarım §5.2 "Genel deneyim tabanı", açık
 * soru 4): her hareketin aşamasına taban olur. Yeni → taban yok (her hareket Tanışma'dan başlar); 6 ay+
 * → Tanışma tek seans (yalnız ayar), sonra en az Başlangıç; 1 yıl+ → Tanışma tek seans, sonra en az Orta.
 */
export const TRAINING_EXPERIENCES = ['new', 'six_months', 'one_year'] as const;
export type TrainingExperience = (typeof TRAINING_EXPERIENCES)[number];
export const TRAINING_EXPERIENCE_LABELS: Record<TrainingExperience, string> = {
  new: 'Yeni başlıyor',
  six_months: '6 ay ve üstü',
  one_year: '1 yıl ve üstü',
};

export const clientIdSchema = v.pipe(v.string(), v.regex(CLIENT_ID_PATTERN, 'Danışan kimliği geçersiz.'));

const timestamp = v.pipe(v.string(), v.isoTimestamp());

const nameSchema = v.pipe(
  v.string('Ad gir.'),
  v.trim(),
  v.minLength(2, 'Ad çok kısa.'),
  v.maxLength(CLIENT_NAME_MAX, `En fazla ${CLIENT_NAME_MAX} karakter.`),
);
const noteSchema = v.pipe(v.string(), v.trim(), v.maxLength(CLIENT_NOTE_MAX, `En fazla ${CLIENT_NOTE_MAX} karakter.`));
const healthFieldsSchema = v.pipe(
  v.array(v.picklist(HEALTH_FIELDS)),
  v.maxLength(HEALTH_FIELDS.length),
);

export const healthConsentSchema = v.object({
  granted: v.boolean(),
  version: v.string(),
  /** Onayın kapsadığı parçalar. */
  fields: healthFieldsSchema,
  at: timestamp,
});
export type HealthConsent = v.InferOutput<typeof healthConsentSchema>;

export const clientSchema = v.object({
  id: clientIdSchema,
  name: nameSchema,
  /** PT'nin kendine notu. */
  note: v.optional(noteSchema),
  createdAt: timestamp,
  status: v.picklist(CLIENT_STATUSES),
  /** Durumun son değiştiği an (ör. duraklatmadan dönüş): kaçan gün penceresi bundan önce sayılmaz (`attention.ts`). */
  statusChangedAt: v.optional(timestamp),
  modules: v.object({
    health: v.object({
      enabled: v.boolean(),
      fields: healthFieldsSchema,
      /** Modülün son açıldığı an; kapalıysa yok. */
      enabledAt: v.optional(timestamp),
    }),
  }),
  consents: v.object({ health: v.optional(healthConsentSchema) }),
  /** PT'nin girdiği antrenman geçmişi; yoksa yeni sayılır (öneri motorunda aşama tabanı). */
  training: v.optional(v.object({ experience: v.picklist(TRAINING_EXPERIENCES) })),
  /**
   * Oturum kuşağı: danışanın oturum çerezi bu sayıyı taşır. PT "erişimi kapat" deyince
   * artar ve açık bütün oturumlar bir sonraki istekte düşer.
   */
  access: v.object({
    version: v.pipe(v.number(), v.integer(), v.minValue(1)),
    /** İlk ve son davetle giriş. Davet dosyası her yeni kodda ezildiği için katılım burada tutulur. */
    joinedAt: v.optional(timestamp),
    lastJoinAt: v.optional(timestamp),
    /** PT'nin erişimi son kapattığı an; sonraki girişte kalkar. */
    revokedAt: v.optional(timestamp),
    /**
     * Danışanın şifreyi son belirlediği an (yalnız bilgi; özeti `auth.json`'da, SPEC §5). "Erişimi
     * kapat" siler: kapatmadan önceki şifre açmaz, danışan yeni kare kodla girip yenisini belirler.
     */
    passwordSetAt: v.optional(timestamp),
    /**
     * Şifre girişinin çok sayıda yanlış denemeden sonra kapandığı an (PT ekranında rozet; SPEC §5).
     * Yeni kare kodla girilince ya da yeni şifre belirlenince kalkar.
     */
    loginLockedAt: v.optional(timestamp),
  }),
  /** Faz 7: bağlantı verilen diğer danışanlar (yalnız kimlik). */
  visibleTo: v.array(clientIdSchema),
  /**
   * PT'nin bildirimleri (Genel bakış, tasarım §4.6): `seenAt`'ten yeni bildirim okunmamıştır. PT yazar;
   * bildirimler ayrı dosyada tutulmaz, danışanın kayıtlarından türetilir (`notices.ts`).
   */
  inbox: v.optional(v.object({ seenAt: v.optional(timestamp) })),
});
export type Client = v.InferOutput<typeof clientSchema>;

/** Uygulama repo'sundaki `data/clients.json`: yalnız kimlik ve durum. */
export const clientIndexSchema = v.array(v.object({ id: clientIdSchema, status: v.picklist(CLIENT_STATUSES) }));
export type ClientIndexEntry = v.InferOutput<typeof clientIndexSchema>[number];

/** `invite.json`: kodun kendisi hiçbir yerde saklanmaz, yalnız anahtarlı özeti. */
export const inviteSchema = v.object({
  codeHash: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  createdAt: timestamp,
  expiresAt: timestamp,
  used: v.boolean(),
  usedAt: v.optional(timestamp),
  /** Yanlış kod denemeleri; sınıra gelince davet kilitlenir, PT yenisini üretir. */
  attempts: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type Invite = v.InferOutput<typeof inviteSchema>;

/** Formdaki antrenman geçmişi: verilmezse kayıttaki kalır (yeni danışanda "yeni"). */
const trainingExperienceSchema = v.optional(v.picklist(TRAINING_EXPERIENCES, 'Antrenman geçmişini seç.'));

/** PT'nin formu. Durum yalnız düzenlemede görünür; yeni danışan aktif başlar. */
export const clientFormSchema = v.pipe(
  v.object({
    name: nameSchema,
    note: noteSchema,
    status: v.picklist(CLIENT_STATUSES, 'Durumu seç.'),
    healthEnabled: v.boolean(),
    healthFields: healthFieldsSchema,
    trainingExperience: trainingExperienceSchema,
  }),
  v.forward(
    v.partialCheck(
      [['healthEnabled'], ['healthFields']],
      (input) => !input.healthEnabled || input.healthFields.length > 0,
      'Modül açıksa en az bir parça seç.',
    ),
    ['healthFields'],
  ),
);
export type ClientInput = v.InferOutput<typeof clientFormSchema>;

/** Kayıt ucu: kimliksiz gelen istek yeni danışandır. */
export const clientSaveSchema = v.pipe(
  v.object({
    id: v.optional(clientIdSchema),
    name: nameSchema,
    note: noteSchema,
    status: v.picklist(CLIENT_STATUSES, 'Durumu seç.'),
    healthEnabled: v.boolean(),
    healthFields: healthFieldsSchema,
    trainingExperience: trainingExperienceSchema,
  }),
  v.forward(
    v.partialCheck(
      [['healthEnabled'], ['healthFields']],
      (input) => !input.healthEnabled || input.healthFields.length > 0,
      'Modül açıksa en az bir parça seç.',
    ),
    ['healthFields'],
  ),
);

/** Kaydın antrenman geçmişi: formda seçildiyse o, değilse kayıttaki (yoksa alan yazılmaz). */
export function trainingOf(
  input: Pick<ClientInput, 'trainingExperience'>,
  current?: Client['training'],
): Pick<Client, 'training'> {
  const experience = input.trainingExperience ?? current?.experience;
  return experience ? { training: { experience } } : {};
}
