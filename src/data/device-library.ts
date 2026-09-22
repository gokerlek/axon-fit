import type { Device } from '@/lib/schemas/device';

/**
 * Hazır cihaz kataloğu — pakette gelir, PT'nin repo'suna yazılmaz.
 *
 * Değerler yaygın salon makinelerinin tipik ayarlarıdır. PT kendi cihazının ayarını
 * değiştirirse (ör. blok adımı 7 kg, çift makara) sürümü repo'suna yazılır ve bu
 * kimlikte onunki geçerli olur. Paket güncellemesi PT'nin cihazlarını ezmez.
 */

/** Ağırlık bloklu makinelerin ortak ayarı: 5 kg adım, +2,5 kg ara ağırlık. */
const STACK = { baseKg: 5, stepKg: 5, addOnsKg: [2.5] };

const DUMBBELLS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
const KETTLEBELLS = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];

export const DEVICE_LIBRARY: readonly Device[] = [
  // Serbest ağırlık
  { id: 'olimpik-bar', name: 'Olimpik bar', kind: 'barbell', baseKg: 20, stepKg: 2.5, notes: 'En küçük plaka 1,25 kg (iki yana 2,5 kg).' },
  { id: 'ez-bar', name: 'EZ bar', kind: 'barbell', baseKg: 10, stepKg: 2.5 },
  { id: 'dambil-seti', name: 'Dambıl seti', kind: 'dumbbell', weightsKg: DUMBBELLS },
  { id: 'kettlebell-seti', name: 'Kettlebell seti', kind: 'kettlebell', weightsKg: KETTLEBELLS },

  // Kablo
  { id: 'kablo-istasyonu', name: 'Kablo istasyonu (tek makara)', kind: 'cable', baseKg: 5, stepKg: 5, maxKg: 100, addOnsKg: [2.5], pulleyRatio: 1, attachments: ['straight_bar', 'rope', 'single_handle', 'v_bar', 'ez_bar', 'ankle_strap'] },
  {
    id: 'fonksiyonel-kablo',
    name: 'Fonksiyonel kablo (çift makara)',
    kind: 'cable',
    baseKg: 5,
    stepKg: 5,
    maxKg: 100,
    addOnsKg: [2.5],
    pulleyRatio: 2,
    notes: 'Çift makara: seçilen ağırlığın yarısı hissedilir.', attachments: ['rope', 'single_handle', 'straight_bar'] },

  // Ağırlık bloklu makineler
  { id: 'lat-pulldown-makinesi', name: 'Lat pulldown makinesi', kind: 'selectorized', ...STACK, maxKg: 120, attachments: ['wide_bar', 'lat_bar', 'v_bar', 'straight_bar'] },
  { id: 'oturarak-row-makinesi', name: 'Oturarak row makinesi', kind: 'selectorized', ...STACK, maxKg: 120, attachments: ['v_bar', 'straight_bar', 'wide_bar', 'rope'] },
  { id: 'chest-press-makinesi', name: 'Chest press makinesi', kind: 'selectorized', ...STACK, maxKg: 100 },
  { id: 'pec-deck', name: 'Pec deck (kelebek)', kind: 'selectorized', ...STACK, maxKg: 90, notes: 'Çoğu modelde ters oturunca arka omuz için de kullanılır.' },
  { id: 'shoulder-press-makinesi', name: 'Shoulder press makinesi', kind: 'selectorized', ...STACK, maxKg: 90 },
  { id: 'yana-acis-makinesi', name: 'Yana açış makinesi', kind: 'selectorized', ...STACK, maxKg: 60 },
  { id: 'preacher-curl-makinesi', name: 'Preacher curl makinesi', kind: 'selectorized', ...STACK, maxKg: 60 },
  { id: 'triceps-makinesi', name: 'Triceps makinesi', kind: 'selectorized', ...STACK, maxKg: 80 },
  { id: 'leg-extension-makinesi', name: 'Leg extension makinesi', kind: 'selectorized', ...STACK, maxKg: 110 },
  { id: 'yatarak-leg-curl-makinesi', name: 'Yatarak leg curl makinesi', kind: 'selectorized', ...STACK, maxKg: 90 },
  { id: 'oturarak-leg-curl-makinesi', name: 'Oturarak leg curl makinesi', kind: 'selectorized', ...STACK, maxKg: 100 },
  { id: 'abductor-makinesi', name: 'Abductor makinesi (kalça açma)', kind: 'selectorized', ...STACK, maxKg: 100 },
  { id: 'adductor-makinesi', name: 'Adductor makinesi (kalça kapama)', kind: 'selectorized', ...STACK, maxKg: 100 },
  { id: 'ayakta-calf-makinesi', name: 'Ayakta calf makinesi', kind: 'selectorized', ...STACK, maxKg: 150 },
  { id: 'glute-kickback-makinesi', name: 'Glute kickback makinesi', kind: 'selectorized', ...STACK, maxKg: 80 },
  { id: 'crunch-makinesi', name: 'Crunch makinesi', kind: 'selectorized', ...STACK, maxKg: 80 },
  { id: 'rotary-torso', name: 'Gövde döndürme makinesi', kind: 'selectorized', ...STACK, maxKg: 70 },

  // Plaka yüklemeli makineler
  { id: 'leg-press', name: 'Leg press (45°)', kind: 'plate_loaded', baseKg: 50, stepKg: 5, maxKg: 400, notes: 'Kızak ağırlığı modele göre değişir.' },
  { id: 'hack-squat', name: 'Hack squat makinesi', kind: 'plate_loaded', baseKg: 40, stepKg: 5, maxKg: 300 },
  { id: 'smith-makinesi', name: 'Smith makinesi', kind: 'plate_loaded', baseKg: 15, stepKg: 2.5, maxKg: 300, notes: 'Dengelenmiş barlarda bar ağırlığı daha düşüktür.' },
  { id: 'hip-thrust-makinesi', name: 'Hip thrust makinesi', kind: 'plate_loaded', baseKg: 20, stepKg: 5, maxKg: 300 },
  { id: 't-bar-row', name: 'T-bar row', kind: 'plate_loaded', baseKg: 10, stepKg: 2.5, maxKg: 150, attachments: ['v_bar', 'wide_bar'] },

  // Ekipmansız istasyonlar ve bant
  { id: 'barfiks-bari', name: 'Barfiks barı', kind: 'bodyweight' },
  { id: 'paralel-bar', name: 'Paralel bar (dips)', kind: 'bodyweight' },
  { id: 'hiperekstansiyon-sehpasi', name: 'Hiperekstansiyon sehpası', kind: 'bodyweight', notes: 'Zorlaştırmak için göğüste plaka tutulur.' },
  { id: 'direnc-bandi', name: 'Direnç bandı', kind: 'band' },

  // Kardiyo
  { id: 'kosu-bandi', name: 'Koşu bandı', kind: 'cardio' },
  { id: 'sabit-bisiklet', name: 'Sabit bisiklet', kind: 'cardio' },
  { id: 'eliptik', name: 'Eliptik', kind: 'cardio' },
  { id: 'kurek-ergometresi', name: 'Kürek ergometresi', kind: 'cardio' },
  { id: 'merdiven', name: 'Merdiven (stepmill)', kind: 'cardio' },
  { id: 'air-bike', name: 'Air bike', kind: 'cardio' },
];
