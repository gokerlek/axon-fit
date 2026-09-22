import type { Exercise } from '@/lib/schemas/exercise';

/**
 * Hazır egzersiz kütüphanesi — pakette gelir, PT'nin repo'suna yazılmaz.
 *
 * Paket güncellendiğinde bu liste de güncellenir. PT'nin kendi egzersizleri
 * ayrı durur (uygulama repo'sunda `data/exercises.json`), böylece güncelleme
 * onun eklediklerini ezmez.
 */
export const EXERCISE_LIBRARY: readonly Exercise[] = [
  {
    "id": "halter-bench-press",
    "title": "Halter Bench Press",
    "description": "Düz sehpada halterle göğüs pressi; üst vücut itiş gücünün temel hareketi.",
    "cues": [
      "Kürek kemiklerini sıkıştır ve sehpaya yerleştir",
      "Ayaklar yere sabit, belde doğal kavis korunur",
      "Barı göğüs ucuna kontrollü indir, dirsekler gövdeye ~45°"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "olimpik-bar",
    "pattern": "horizontal_push",
    "grip": "pronated",
    "gripWidth": "shoulder",
    "primaryMuscles": [
      "chest_lower"
    ],
    "secondaryMuscles": [
      "chest_upper",
      "delt_front",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 20.0,
    "video": {
      "provider": "youtube",
      "id": "rT7DgCr-3pg"
    }
  },
  {
    "id": "egimli-dambil-press",
    "title": "Eğimli Dambıl Press",
    "description": "30-45° eğimli sehpada dambılla üst göğüs pressi.",
    "cues": [
      "Sehpa açısı 30-45° arasında olsun",
      "Dambılları göğüs hizasına kontrollü indir",
      "Tepede dambılları çarpıştırma, gerginliği koru"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "horizontal_push",
    "primaryMuscles": [
      "chest_upper"
    ],
    "secondaryMuscles": [
      "chest_lower",
      "delt_front",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "8iPEnn-ltC8"
    }
  },
  {
    "id": "duz-sehpada-dambil-fly",
    "title": "Düz Sehpada Dambıl Fly",
    "description": "Göğüs kaslarını izole eden açış hareketi.",
    "cues": [
      "Dirsekler hafif bükük ve sabit kalsın",
      "Omuz hizasının altına inme",
      "Hareketi göğsü sıkarak tamamla"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "chest_fly",
    "primaryMuscles": [
      "chest_lower"
    ],
    "secondaryMuscles": [
      "chest_upper",
      "delt_front"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "eozdVDA78K0"
    }
  },
  {
    "id": "sinav",
    "title": "Şınav",
    "description": "Vücut ağırlığıyla göğüs, omuz ve triceps çalışması.",
    "cues": [
      "Baş, kalça ve topuk tek çizgide",
      "Eller omuz genişliğinde, dirsekler ~45°",
      "Göğüs yere yaklaşınca güçlü it"
    ],
    "category": "compound",
    "trackingType": "bodyweight_reps",
    "equipment": "bodyweight",
    "pattern": "horizontal_push",
    "primaryMuscles": [
      "chest_lower"
    ],
    "secondaryMuscles": [
      "chest_upper",
      "delt_front",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [
      "serratus",
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "IODxDxX7oi4"
    }
  },
  {
    "id": "paralel-bar-dips",
    "title": "Paralel Bar Dips",
    "description": "Paralel barda vücut ağırlığıyla triceps ve alt göğüs.",
    "cues": [
      "Omuzları kulaklardan uzak tut",
      "Dirsekler ~90° olana kadar in",
      "Gövdeyi hafif öne eğmek göğsü daha çok çalıştırır"
    ],
    "category": "compound",
    "trackingType": "bodyweight_reps",
    "equipment": "bodyweight",
    "deviceId": "paralel-bar",
    "pattern": "vertical_push",
    "grip": "neutral",
    "primaryMuscles": [
      "triceps_long",
      "triceps_lateral"
    ],
    "secondaryMuscles": [
      "chest_lower",
      "delt_front"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "2z8JmcrW-As"
    }
  },
  {
    "id": "ayakta-halter-omuz-press",
    "title": "Ayakta Halter Omuz Press",
    "description": "Ayakta başın üzerine halter pressi (overhead press).",
    "cues": [
      "Karın ve kalçayı sık, beli kavislendirme",
      "Bar çeneye yakın dikey hatta ilerlesin",
      "Tepede başı barın altına al"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "olimpik-bar",
    "pattern": "vertical_push",
    "grip": "pronated",
    "gripWidth": "shoulder",
    "primaryMuscles": [
      "delt_front"
    ],
    "secondaryMuscles": [
      "delt_side",
      "triceps_long",
      "triceps_lateral",
      "traps_upper"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower",
      "erectors"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 20.0,
    "video": {
      "provider": "youtube",
      "id": "2yjwXTZQDDI"
    }
  },
  {
    "id": "oturarak-dambil-omuz-press",
    "title": "Oturarak Dambıl Omuz Press",
    "description": "Sırt destekli dambıl omuz pressi.",
    "cues": [
      "Sırtını sehpaya daya",
      "Dambılları kulak hizasına indir",
      "Dirsekleri kilitlemeden yukarı it"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "vertical_push",
    "primaryMuscles": [
      "delt_front"
    ],
    "secondaryMuscles": [
      "delt_side",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "qEwKCR5JCog"
    }
  },
  {
    "id": "dambil-yana-acis",
    "title": "Dambıl Yana Açış",
    "description": "Yan omuz (lateral raise) izolasyonu.",
    "cues": [
      "Hafif öne eğil, dirsekler hafif bükük",
      "Omuz hizasına kadar kaldır",
      "İnişi 2-3 saniyede kontrol et"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "lateral_raise",
    "primaryMuscles": [
      "delt_side"
    ],
    "secondaryMuscles": [
      "traps_upper"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 1.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "3VcKaXpzqRo"
    }
  },
  {
    "id": "kablo-face-pull",
    "title": "Kablo Face Pull",
    "description": "Arka omuz ve üst sırt; omuz sağlığı için.",
    "cues": [
      "Halatı yüz hizasına çek",
      "Dirsekler omuz hizasında ve dışarıda",
      "Sonda kürek kemiklerini birleştir"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "kablo-istasyonu",
    "pattern": "rear_delt",
    "attachment": "Halat",
    "grip": "neutral",
    "primaryMuscles": [
      "delt_rear"
    ],
    "secondaryMuscles": [
      "traps_mid",
      "traps_lower"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "rep-qVOkqgk"
    }
  },
  {
    "id": "barfiks",
    "title": "Barfiks",
    "description": "Vücut ağırlığıyla dikey çekiş (pull-up).",
    "cues": [
      "Tam asılı pozisyondan başla",
      "Göğsü bara doğru çek, çene barı geçsin",
      "Sallanmadan kontrollü in"
    ],
    "category": "compound",
    "trackingType": "bodyweight_reps",
    "equipment": "bodyweight",
    "deviceId": "barfiks-bari",
    "pattern": "vertical_pull",
    "grip": "pronated",
    "gripWidth": "wide",
    "primaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower"
    ],
    "secondaryMuscles": [
      "biceps",
      "traps_mid",
      "traps_lower"
    ],
    "stabilizerMuscles": [
      "forearm_flexors"
    ],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "eGo4IYlbE5g"
    }
  },
  {
    "id": "lat-pulldown",
    "title": "Lat Pulldown",
    "description": "Makinede dikey çekiş; barfiks alternatifi.",
    "cues": [
      "Göğüs yukarıda, hafif geriye yaslan",
      "Barı üst göğse çek",
      "Dirsekleri aşağı ve geriye sür"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "lat-pulldown-makinesi",
    "pattern": "vertical_pull",
    "attachment": "Geniş çekiş barı",
    "grip": "pronated",
    "gripWidth": "wide",
    "primaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower"
    ],
    "secondaryMuscles": [
      "biceps",
      "traps_mid",
      "traps_lower"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "CAwf7n6Luuc"
    }
  },
  {
    "id": "oturarak-kablo-row",
    "title": "Oturarak Kablo Row",
    "description": "Yatay çekiş; orta sırt.",
    "cues": [
      "Sırt dik, gövdeyi sallama",
      "Tutamacı karın hizasına çek",
      "Kürek kemiklerini sonda sık"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "oturarak-row-makinesi",
    "pattern": "horizontal_pull",
    "attachment": "V bar (üçgen)",
    "grip": "neutral",
    "gripWidth": "narrow",
    "primaryMuscles": [
      "traps_mid",
      "traps_lower"
    ],
    "secondaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower",
      "delt_rear",
      "biceps"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "GZbfZ033f74"
    }
  },
  {
    "id": "halter-bent-over-row",
    "title": "Halter Bent-Over Row",
    "description": "Öne eğilerek halterle yatay çekiş.",
    "cues": [
      "Kalçadan menteşelen, sırt nötr",
      "Barı göbek hizasına çek",
      "Gövde açısını set sonuna kadar koru"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "olimpik-bar",
    "pattern": "horizontal_pull",
    "grip": "pronated",
    "gripWidth": "shoulder",
    "primaryMuscles": [
      "traps_mid",
      "traps_lower"
    ],
    "secondaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower",
      "delt_rear",
      "biceps"
    ],
    "stabilizerMuscles": [
      "erectors",
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 20.0,
    "video": {
      "provider": "youtube",
      "id": "9efgcAjQe7E"
    }
  },
  {
    "id": "tek-kol-dambil-row",
    "title": "Tek Kol Dambıl Row",
    "description": "Sehpa destekli tek kol çekiş.",
    "cues": [
      "Destek elini ve dizini sehpaya yerleştir",
      "Dambılı kalçaya doğru çek",
      "Gövdeyi döndürme"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "horizontal_pull",
    "grip": "neutral",
    "primaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower"
    ],
    "secondaryMuscles": [
      "traps_mid",
      "traps_lower",
      "delt_rear",
      "biceps"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "pYcpY20QaE8"
    }
  },
  {
    "id": "deadlift",
    "title": "Deadlift",
    "description": "Yerden halter kaldırma; arka zincirin temel hareketi.",
    "cues": [
      "Bar ayak ortasının üzerinde, kaval kemiklerine yakın",
      "Sırt nötr; kalça ve göğüs birlikte yükselsin",
      "Kilitlemede kalçayı sık, beli geriye atma"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "olimpik-bar",
    "pattern": "hinge",
    "grip": "pronated",
    "gripWidth": "shoulder",
    "primaryMuscles": [
      "erectors",
      "glutes",
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "secondaryMuscles": [
      "quadratus",
      "quadriceps",
      "adductors"
    ],
    "stabilizerMuscles": [
      "traps_upper",
      "forearm_flexors",
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 20.0,
    "video": {
      "provider": "youtube",
      "id": "op9kVnSso6Q"
    }
  },
  {
    "id": "romanian-deadlift",
    "title": "Romanian Deadlift",
    "description": "Diz hafif bükük, kalça menteşesiyle hamstring odaklı çekiş.",
    "cues": [
      "Dizler hafif bükük ve sabit",
      "Barı bacaklara yakın indir, kalçayı geriye it",
      "Hamstring gerilince yönü değiştir"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "olimpik-bar",
    "pattern": "hinge",
    "grip": "pronated",
    "gripWidth": "shoulder",
    "primaryMuscles": [
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "secondaryMuscles": [
      "glutes",
      "erectors"
    ],
    "stabilizerMuscles": [
      "forearm_flexors"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 20.0,
    "video": {
      "provider": "youtube",
      "id": "jEy_czb3RKA"
    }
  },
  {
    "id": "halter-back-squat",
    "title": "Halter Back Squat",
    "description": "Sırtta halterle squat; alt vücudun temel hareketi.",
    "cues": [
      "Bar üst sırtta, karın sıkı",
      "Dizler ayak uçlarıyla aynı yöne açılsın",
      "Kalça en az diz hizasına insin, topuklar yerde"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "olimpik-bar",
    "pattern": "squat",
    "primaryMuscles": [
      "quadriceps",
      "glutes"
    ],
    "secondaryMuscles": [
      "adductors"
    ],
    "stabilizerMuscles": [
      "erectors",
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 20.0,
    "video": {
      "provider": "youtube",
      "id": "ultWZbUMPL8"
    }
  },
  {
    "id": "goblet-squat",
    "title": "Goblet Squat",
    "description": "Göğüste dambılla squat; teknik öğrenimi için ideal.",
    "cues": [
      "Dambılı göğse yakın tut",
      "Dirsekler dizlerin içinden geçsin",
      "Gövde dik, topuklar yerde"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "squat",
    "grip": "neutral",
    "primaryMuscles": [
      "quadriceps"
    ],
    "secondaryMuscles": [
      "glutes",
      "adductors"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "MeIiIdhvXT4"
    }
  },
  {
    "id": "leg-press",
    "title": "Leg Press",
    "description": "Makinede itiş; ön bacak ve kalça.",
    "cues": [
      "Bel ve kalça pedden kalkmasın",
      "Dizler içe kaçmasın",
      "Tepede dizleri kilitleme"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "leg-press",
    "pattern": "squat",
    "primaryMuscles": [
      "quadriceps"
    ],
    "secondaryMuscles": [
      "glutes",
      "adductors",
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "IZxyjW7MPJQ"
    }
  },
  {
    "id": "bulgarian-split-squat",
    "title": "Bulgarian Split Squat",
    "description": "Arka ayak sehpada tek bacak squat.",
    "cues": [
      "Ön ayak sehpadan yeterince uzakta",
      "Gövde hafif öne eğik",
      "Ön diz ayak ucuyla aynı hatta"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "lunge",
    "primaryMuscles": [
      "quadriceps",
      "glutes"
    ],
    "secondaryMuscles": [
      "adductors"
    ],
    "stabilizerMuscles": [
      "glute_medius"
    ],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "2C-uNgKwPLE"
    }
  },
  {
    "id": "dambil-lunge",
    "title": "Dambıl Lunge",
    "description": "Adımlı lunge; bacak ve denge.",
    "cues": [
      "Uzun adım at, gövde dik",
      "Arka diz yere yaklaşsın",
      "Ön topuktan iterek kalk"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "lunge",
    "primaryMuscles": [
      "quadriceps",
      "glutes"
    ],
    "secondaryMuscles": [
      "adductors",
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "stabilizerMuscles": [
      "glute_medius"
    ],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "D7KaRcUTQeE"
    }
  },
  {
    "id": "halter-hip-thrust",
    "title": "Halter Hip Thrust",
    "description": "Sırt sehpada kalça itişi; kalça kasları.",
    "cues": [
      "Üst sırt sehpanın kenarında",
      "Çene göğse yakın, kaburgalar aşağıda",
      "Tepede kalçayı 1 sn sık"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "olimpik-bar",
    "pattern": "hip_extension",
    "primaryMuscles": [
      "glutes"
    ],
    "secondaryMuscles": [
      "hamstrings_medial",
      "hamstrings_lateral",
      "glute_medius"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 20.0,
    "video": {
      "provider": "youtube",
      "id": "SEdqd1n0cvg"
    }
  },
  {
    "id": "leg-extension",
    "title": "Leg Extension",
    "description": "Ön bacak izolasyonu.",
    "cues": [
      "Diz eklemi makine eksenine hizalı",
      "Tepede 1 sn sık",
      "Ağırlığı düşürmeden kontrollü in"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "leg-extension-makinesi",
    "pattern": "knee_extension",
    "primaryMuscles": [
      "quadriceps"
    ],
    "secondaryMuscles": [],
    "stabilizerMuscles": [],
    "loadStepKg": 5.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "YyvSfVjQeL0"
    }
  },
  {
    "id": "yuzustu-leg-curl",
    "title": "Yüzüstü Leg Curl",
    "description": "Arka bacak izolasyonu.",
    "cues": [
      "Kalça pedden kalkmasın",
      "Topukları kalçaya doğru çek",
      "İnişi yavaşlat"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "yatarak-leg-curl-makinesi",
    "pattern": "knee_flexion",
    "primaryMuscles": [
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "secondaryMuscles": [
      "gastroc_medial",
      "gastroc_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "1Tq3QdYUuHs"
    }
  },
  {
    "id": "ayakta-calf-raise",
    "title": "Ayakta Calf Raise",
    "description": "Baldır kasları.",
    "cues": [
      "Tam aşağıda esnet",
      "Parmak ucunda 1 sn bekle",
      "Dizleri kilitleme"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "ayakta-calf-makinesi",
    "pattern": "calf_raise",
    "primaryMuscles": [
      "gastroc_medial",
      "gastroc_lateral"
    ],
    "secondaryMuscles": [
      "soleus"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "gwLzBJYoWlI"
    }
  },
  {
    "id": "halter-biceps-curl",
    "title": "Halter Biceps Curl",
    "description": "Düz barla ayakta biceps curl.",
    "cues": [
      "Dirsekler gövdenin yanında sabit",
      "Gövdeyi sallamadan kaldır",
      "İnişte kolları tam aç"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "barbell",
    "deviceId": "ez-bar",
    "pattern": "elbow_flexion",
    "grip": "supinated",
    "gripWidth": "shoulder",
    "primaryMuscles": [
      "biceps"
    ],
    "secondaryMuscles": [
      "forearm_flexors"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 10.0,
    "video": {
      "provider": "youtube",
      "id": "LY1V6UbRHFM"
    }
  },
  {
    "id": "egimli-sehpada-dambil-curl",
    "title": "Eğimli Sehpada Dambıl Curl",
    "description": "Uzamış pozisyonda biceps çalışması (incline dumbbell curl).",
    "cues": [
      "Sehpa ~45°, sırt dayalı",
      "Omuzları öne çıkarma",
      "Avuç içi yukarı bakarak kaldır"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "elbow_flexion",
    "grip": "supinated",
    "primaryMuscles": [
      "biceps"
    ],
    "secondaryMuscles": [],
    "stabilizerMuscles": [],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "soxrZlIl35U"
    }
  },
  {
    "id": "hammer-curl",
    "title": "Hammer Curl",
    "description": "Nötr tutuşla biceps ve ön kol.",
    "cues": [
      "Avuç içleri birbirine bakar",
      "Dirsekler sabit",
      "Kontrollü in"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "elbow_flexion",
    "grip": "neutral",
    "primaryMuscles": [
      "biceps"
    ],
    "secondaryMuscles": [
      "forearm_flexors"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "zC3nLlEvin4"
    }
  },
  {
    "id": "triceps-halat-pushdown",
    "title": "Triceps Halat Pushdown",
    "description": "Kabloda halatla triceps izolasyonu.",
    "cues": [
      "Dirsekler gövdeye yakın ve sabit",
      "Aşağıda halatı iki yana aç",
      "Yukarı çıkarken dirsekleri öne kaçırma"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "kablo-istasyonu",
    "pattern": "elbow_extension",
    "attachment": "Halat",
    "grip": "neutral",
    "primaryMuscles": [
      "triceps_lateral"
    ],
    "secondaryMuscles": [
      "triceps_long"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "2-LAMcpzODU"
    }
  },
  {
    "id": "oturarak-dambil-triceps-extension",
    "title": "Oturarak Dambıl Triceps Extension",
    "description": "Baş üstünde dambılla triceps uzatma.",
    "cues": [
      "Dirsekler tavanı gösterir",
      "Dambılı başın arkasına kontrollü indir",
      "Beli kavislendirme"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "elbow_extension",
    "primaryMuscles": [
      "triceps_long"
    ],
    "secondaryMuscles": [
      "triceps_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "YbX7Wd8jQ-Q"
    }
  },
  {
    "id": "plank",
    "title": "Plank",
    "description": "İzometrik karın ve gövde stabilitesi.",
    "cues": [
      "Dirsekler omuzların altında",
      "Kalçayı düşürme ya da yükseltme",
      "Nefesi tutma, karnı sık"
    ],
    "category": "isolation",
    "trackingType": "duration",
    "equipment": "bodyweight",
    "pattern": "core_stability",
    "primaryMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "secondaryMuscles": [
      "obliques"
    ],
    "stabilizerMuscles": [
      "delt_front",
      "serratus"
    ],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "pSHjTRCQxIw"
    }
  },
  {
    "id": "yan-plank",
    "title": "Yan Plank",
    "description": "Yan karın ve gövde stabilitesi.",
    "cues": [
      "Dirsek omzun altında",
      "Kalça yukarıda, vücut düz çizgide",
      "İki tarafa eşit süre"
    ],
    "category": "isolation",
    "trackingType": "duration",
    "equipment": "bodyweight",
    "pattern": "core_stability",
    "primaryMuscles": [
      "obliques"
    ],
    "secondaryMuscles": [
      "glute_medius",
      "quadratus"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "K2VljzCC16g"
    }
  },
  {
    "id": "dead-bug",
    "title": "Dead Bug",
    "description": "Bel stabilitesi için kontrollü karın egzersizi.",
    "cues": [
      "Bel boşluğu yere bastırılı kalsın",
      "Karşı kol ve bacağı birlikte uzat",
      "Yavaş ve kontrollü nefes"
    ],
    "category": "isolation",
    "trackingType": "bodyweight_reps",
    "equipment": "bodyweight",
    "pattern": "core_stability",
    "primaryMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "secondaryMuscles": [
      "obliques",
      "hip_flexors"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "g_BYB0R-4Ws"
    }
  },
  {
    "id": "asili-bacak-kaldirma",
    "title": "Asılı Bacak Kaldırma",
    "description": "Barda asılı karın egzersizi (hanging leg raise).",
    "cues": [
      "Sallanmayı engelle",
      "Leğeni yukarı kıvır",
      "Kontrollü indir"
    ],
    "category": "isolation",
    "trackingType": "bodyweight_reps",
    "equipment": "bodyweight",
    "deviceId": "barfiks-bari",
    "pattern": "core_flexion",
    "primaryMuscles": [
      "abs_lower"
    ],
    "secondaryMuscles": [
      "abs_upper",
      "hip_flexors",
      "obliques"
    ],
    "stabilizerMuscles": [
      "forearm_flexors",
      "lats_upper"
    ],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "hdng3Nm1x_E"
    }
  },
  {
    "id": "kettlebell-swing",
    "title": "Kettlebell Swing",
    "description": "Kalça menteşesiyle patlayıcı salınım.",
    "cues": [
      "Güç kalçadan gelir, kollardan değil",
      "Sırt nötr, kalçayı geriye it",
      "Tepede kalçayı sık, kettlebell göğüs hizasında"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "kettlebell",
    "deviceId": "kettlebell-seti",
    "pattern": "hinge",
    "primaryMuscles": [
      "glutes"
    ],
    "secondaryMuscles": [
      "hamstrings_medial",
      "hamstrings_lateral",
      "erectors"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower",
      "forearm_flexors"
    ],
    "loadStepKg": 4.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "YSxHifyI6s8"
    }
  },
  {
    "id": "ciftci-yuruyusu",
    "title": "Çiftçi Yürüyüşü",
    "description": "Ağır dambıllarla yürüyüş; kavrama ve gövde (farmer's walk).",
    "cues": [
      "Omuzlar geride, gövde dik",
      "Kısa ve kontrollü adımlar",
      "Dambılları sıkıca kavra"
    ],
    "category": "compound",
    "trackingType": "duration",
    "equipment": "dumbbell",
    "deviceId": "dambil-seti",
    "pattern": "carry",
    "grip": "neutral",
    "primaryMuscles": [
      "forearm_flexors"
    ],
    "secondaryMuscles": [
      "forearm_extensors",
      "traps_upper"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower",
      "obliques",
      "glute_medius"
    ],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "rt17lmnaLSM"
    }
  },
  {
    "id": "kurek-ergometresi",
    "title": "Kürek Ergometresi",
    "description": "Isınma için düşük tempolu kürek çekme.",
    "cues": [
      "Sıra: bacak → gövde → kol",
      "Dönüşte ters sıra",
      "Sırt nötr"
    ],
    "category": "warmup",
    "trackingType": "duration",
    "equipment": "cardio_machine",
    "deviceId": "kurek-ergometresi",
    "pattern": "cardio",
    "primaryMuscles": [
      "cardio"
    ],
    "secondaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower",
      "traps_mid",
      "quadriceps",
      "glutes"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "H0r_ZPXJLtg"
    }
  },
  {
    "id": "sabit-bisiklet",
    "title": "Sabit Bisiklet",
    "description": "Isınma için hafif tempolu pedal.",
    "cues": [
      "Sele kalça hizasında",
      "Konuşabileceğin tempoda",
      "5-8 dakika yeterli"
    ],
    "category": "warmup",
    "trackingType": "duration",
    "equipment": "cardio_machine",
    "deviceId": "sabit-bisiklet",
    "pattern": "cardio",
    "primaryMuscles": [
      "cardio"
    ],
    "secondaryMuscles": [
      "quadriceps",
      "hamstrings_medial",
      "hamstrings_lateral",
      "gastroc_medial",
      "gastroc_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0
  },
  {
    "id": "band-pull-apart",
    "title": "Band Pull-Apart",
    "description": "Omuz ve üst sırt aktivasyonu.",
    "cues": [
      "Kollar omuz hizasında ve düz",
      "Bandı göğse doğru aç",
      "Kürek kemiklerini birleştir"
    ],
    "category": "warmup",
    "trackingType": "bodyweight_reps",
    "equipment": "band",
    "deviceId": "direnc-bandi",
    "pattern": "rear_delt",
    "primaryMuscles": [
      "delt_rear"
    ],
    "secondaryMuscles": [
      "traps_mid",
      "traps_lower"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0
  },
  {
    "id": "kedi-deve-mobilite",
    "title": "Kedi-Deve Mobilite",
    "description": "Soğuma için omurga mobilitesi.",
    "cues": [
      "Dört ayak pozisyonunda başla",
      "Nefes verirken sırtı yuvarla",
      "Nefes alırken göğsü aç"
    ],
    "category": "cooldown",
    "trackingType": "duration",
    "equipment": "bodyweight",
    "pattern": "mobility",
    "primaryMuscles": [
      "erectors"
    ],
    "secondaryMuscles": [
      "abs_upper",
      "abs_lower",
      "traps_mid"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "kqnua4rHVVA"
    }
  },
  {
    "id": "cocuk-pozu",
    "title": "Çocuk Pozu",
    "description": "Soğuma için sırt ve kalça gevşetme.",
    "cues": [
      "Dizler açık, kalça topuklara",
      "Kolları öne uzat",
      "Derin ve yavaş nefes al"
    ],
    "category": "cooldown",
    "trackingType": "duration",
    "equipment": "bodyweight",
    "pattern": "mobility",
    "primaryMuscles": [
      "erectors"
    ],
    "secondaryMuscles": [
      "quadratus",
      "lats_upper",
      "lats_mid",
      "lats_lower",
      "glutes"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0,
    "video": {
      "provider": "youtube",
      "id": "2MJGg-dUKh0"
    }
  },
  {
    "id": "kapi-araliginda-gogus-esnetme",
    "title": "Kapı Aralığında Göğüs Esnetme",
    "description": "Soğuma için göğüs ve ön omuz esnetmesi.",
    "cues": [
      "Önkolunu kapı kasasına daya",
      "Gövdeyi yavaşça öne ver",
      "Omzunu kulağa kaldırma"
    ],
    "category": "cooldown",
    "trackingType": "duration",
    "equipment": "bodyweight",
    "pattern": "mobility",
    "primaryMuscles": [
      "chest_lower",
      "chest_upper"
    ],
    "secondaryMuscles": [
      "delt_front"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0.0,
    "minLoadKg": 0.0
  },
  {
    "id": "makine-chest-press",
    "title": "Makine Chest Press",
    "description": "Oturarak makinede göğüs pressi; bardan güvenli, yeni başlayana uygun.",
    "cues": [
      "Sırtı pede yasla, kürek kemiklerini sıkıştır",
      "Tutamaçlar göğüs ortası hizasında olsun",
      "Dirsekleri tam kilitlemeden it"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "chest-press-makinesi",
    "pattern": "horizontal_push",
    "primaryMuscles": [
      "chest_lower"
    ],
    "secondaryMuscles": [
      "chest_upper",
      "delt_front",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "pec-deck",
    "title": "Pec Deck (Kelebek)",
    "description": "Makinede göğüs açma; göğsü izole çalıştırır.",
    "cues": [
      "Dirsekler hafif bükük ve sabit kalsın",
      "Kolları göğüs önünde birleştir, bir an sık",
      "Açılırken omuz önünde gerilmeyi zorlama"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "pec-deck",
    "pattern": "chest_fly",
    "primaryMuscles": [
      "chest_lower"
    ],
    "secondaryMuscles": [
      "chest_upper",
      "delt_front"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "kablo-crossover",
    "title": "Kablo Crossover",
    "description": "İki kablo arasında göğüs açma; hareket boyunca sabit gerilim.",
    "cues": [
      "Bir adım öne çık, gövde hafif öne eğik",
      "Elleri göbek önünde buluştur",
      "Dirsek açısını hareket boyunca koru"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "kablo-istasyonu",
    "pattern": "chest_fly",
    "attachment": "Tek el tutamağı",
    "grip": "neutral",
    "primaryMuscles": [
      "chest_lower"
    ],
    "secondaryMuscles": [
      "chest_upper",
      "delt_front"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 0
  },
  {
    "id": "smith-bench-press",
    "title": "Smith Bench Press",
    "description": "Smith makinesinde bench press; bar raylı, dengelemek gerekmez.",
    "cues": [
      "Bar göğüs ortasına insin",
      "Kürek kemikleri sehpaya sabit",
      "Kilitleri bırakmadan önce tutuşu yerleştir"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "smith-makinesi",
    "pattern": "horizontal_push",
    "primaryMuscles": [
      "chest_lower"
    ],
    "secondaryMuscles": [
      "chest_upper",
      "delt_front",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-omuz-press",
    "title": "Makine Omuz Press",
    "description": "Oturarak makinede omuz pressi.",
    "cues": [
      "Sırt pede yaslı, bel boşluğu doğal",
      "Tutamaçları kulak hizasından yukarı it",
      "İnişte dirsekler omuz altına kadar insin"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "shoulder-press-makinesi",
    "pattern": "vertical_push",
    "primaryMuscles": [
      "delt_front"
    ],
    "secondaryMuscles": [
      "delt_side",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-yana-acis",
    "title": "Makine Yana Açış",
    "description": "Makinede yan omuz izolasyonu.",
    "cues": [
      "Omuzları kulaklara çekme",
      "Kolları omuz hizasına kadar kaldır",
      "İnişi yavaş kontrol et"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "yana-acis-makinesi",
    "pattern": "lateral_raise",
    "primaryMuscles": [
      "delt_side"
    ],
    "secondaryMuscles": [
      "traps_upper"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "kablo-yana-acis",
    "title": "Kablo Yana Açış",
    "description": "Tek kolla kablodan yana açış; alt noktada da gerilim var.",
    "cues": [
      "Kablo vücudun önünden geçsin",
      "Dirsek hafif bükük, el dirsekten yukarı çıkmasın",
      "Gövdeyi sallamadan kaldır"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "kablo-istasyonu",
    "pattern": "lateral_raise",
    "attachment": "Tek el tutamağı",
    "grip": "neutral",
    "primaryMuscles": [
      "delt_side"
    ],
    "secondaryMuscles": [
      "traps_upper"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 0
  },
  {
    "id": "ters-pec-deck",
    "title": "Ters Pec Deck",
    "description": "Pec deck makinesinde ters oturarak arka omuz açma.",
    "cues": [
      "Göğsü pede yasla",
      "Kolları yana açarken kürek kemiklerini sık",
      "Omuzları kulaklara çekme"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "pec-deck",
    "pattern": "rear_delt",
    "primaryMuscles": [
      "delt_rear"
    ],
    "secondaryMuscles": [
      "traps_mid",
      "traps_lower"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "t-bar-row",
    "title": "T-Bar Row",
    "description": "Plaka yüklemeli T-bar ile öne eğilerek çekiş.",
    "cues": [
      "Kalçadan menteşelen, sırt nötr",
      "Tutamacı göğüs altına çek",
      "Dirsekleri gövdeye yakın tut"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "t-bar-row",
    "pattern": "horizontal_pull",
    "attachment": "V bar (üçgen)",
    "grip": "neutral",
    "primaryMuscles": [
      "traps_mid",
      "traps_lower",
      "lats_mid"
    ],
    "secondaryMuscles": [
      "lats_upper",
      "lats_lower",
      "delt_rear",
      "biceps"
    ],
    "stabilizerMuscles": [
      "erectors",
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "kablo-duz-kol-pulldown",
    "title": "Kablo Düz Kol Pulldown",
    "description": "Kolları düz tutarak kablodan aşağı çekiş; kanat kasını izole eder.",
    "cues": [
      "Gövde hafif öne eğik, kollar neredeyse düz",
      "Barı kalçaya doğru süpür",
      "Yukarıda kanat kasında gerilmeyi hisset"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "kablo-istasyonu",
    "pattern": "vertical_pull",
    "attachment": "Düz bar",
    "grip": "pronated",
    "gripWidth": "shoulder",
    "primaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower"
    ],
    "secondaryMuscles": [
      "triceps_long"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 0
  },
  {
    "id": "hiperekstansiyon",
    "title": "Hiperekstansiyon",
    "description": "Hiperekstansiyon sehpasında bel ve kalça ile gövde kaldırma.",
    "cues": [
      "Kalça kemiği pedin hemen üstünde",
      "Sırt nötr, belden aşırı bükülme",
      "Yukarıda kalçayı sık, gövde bacaklarla düz"
    ],
    "category": "compound",
    "trackingType": "bodyweight_reps",
    "equipment": "bodyweight",
    "deviceId": "hiperekstansiyon-sehpasi",
    "pattern": "hinge",
    "primaryMuscles": [
      "erectors"
    ],
    "secondaryMuscles": [
      "glutes",
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0,
    "minLoadKg": 0
  },
  {
    "id": "makine-preacher-curl",
    "title": "Makine Preacher Curl",
    "description": "Preacher makinesinde biceps curl; hile yapmayı engeller.",
    "cues": [
      "Kol arkası pede tam yaslı",
      "Alt noktada kolu tam açma, gerilimi koru",
      "Yukarıda bicepsi sık"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "preacher-curl-makinesi",
    "pattern": "elbow_flexion",
    "primaryMuscles": [
      "biceps"
    ],
    "secondaryMuscles": [
      "forearm_flexors"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "kablo-biceps-curl",
    "title": "Kablo Biceps Curl",
    "description": "Alt makaradan barla ya da halatla biceps curl.",
    "cues": [
      "Dirsekler gövde yanında sabit",
      "Gövdeyi sallama",
      "İnişte kolu tam aç"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "kablo-istasyonu",
    "pattern": "elbow_flexion",
    "attachment": "Düz bar",
    "grip": "supinated",
    "primaryMuscles": [
      "biceps"
    ],
    "secondaryMuscles": [
      "forearm_flexors"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 2.5,
    "minLoadKg": 0
  },
  {
    "id": "makine-triceps-extension",
    "title": "Makine Triceps Extension",
    "description": "Oturarak makinede triceps itişi.",
    "cues": [
      "Dirsekler pedde sabit",
      "Kolu tam açıp bir an sık",
      "Dönüşte omuzları öne düşürme"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "triceps-makinesi",
    "pattern": "elbow_extension",
    "primaryMuscles": [
      "triceps_long",
      "triceps_lateral"
    ],
    "secondaryMuscles": [],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "kablo-bas-ustu-triceps",
    "title": "Kablo Baş Üstü Triceps Extension",
    "description": "Arkası dönük, halatla baş üstünden triceps itişi; uzun başı esnetir.",
    "cues": [
      "Dirsekler başın yanında, önü göstersin",
      "Yalnız dirsekten aç",
      "Gövdeyi sabit tut, beli boşaltma"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "kablo-istasyonu",
    "pattern": "elbow_extension",
    "attachment": "Halat",
    "grip": "neutral",
    "primaryMuscles": [
      "triceps_long"
    ],
    "secondaryMuscles": [
      "triceps_lateral"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 0
  },
  {
    "id": "hack-squat",
    "title": "Hack Squat",
    "description": "Hack squat makinesinde sırt destekli squat.",
    "cues": [
      "Sırt ve kalça pede yaslı",
      "Dizler ayak uçları yönünde",
      "Kalça diz hizasının altına insin"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "hack-squat",
    "pattern": "squat",
    "primaryMuscles": [
      "quadriceps"
    ],
    "secondaryMuscles": [
      "glutes",
      "adductors"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "smith-squat",
    "title": "Smith Squat",
    "description": "Smith makinesinde squat; bar raylı olduğu için ayaklar biraz önde durabilir.",
    "cues": [
      "Ayaklar barın biraz önünde",
      "Göğüs dik, bakış karşıya",
      "Kalça dize kadar insin"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "smith-makinesi",
    "pattern": "squat",
    "primaryMuscles": [
      "quadriceps",
      "glutes"
    ],
    "secondaryMuscles": [
      "adductors"
    ],
    "stabilizerMuscles": [
      "erectors",
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "oturarak-leg-curl",
    "title": "Oturarak Leg Curl",
    "description": "Oturarak makinede arka bacak bükme.",
    "cues": [
      "Diz ekseni makinenin ekseninde",
      "Uyluk pedi bacakları sıkı tutsun",
      "Topuğu kalçaya doğru çek, yavaş bırak"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "oturarak-leg-curl-makinesi",
    "pattern": "knee_flexion",
    "primaryMuscles": [
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "secondaryMuscles": [
      "gastroc_medial",
      "gastroc_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-kalca-acma",
    "title": "Makine Kalça Açma (Abductor)",
    "description": "Oturarak makinede bacakları dışa açma; yan kalçayı çalıştırır.",
    "cues": [
      "Sırt pede yaslı, kalça sabit",
      "Dizleri dışa it, bir an tut",
      "Kapanırken ağırlığı bırakma"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "abductor-makinesi",
    "pattern": "hip_abduction",
    "primaryMuscles": [
      "glute_medius"
    ],
    "secondaryMuscles": [
      "glutes"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-kalca-kapama",
    "title": "Makine Kalça Kapama (Adductor)",
    "description": "Oturarak makinede bacakları içe kapama; iç bacağı çalıştırır.",
    "cues": [
      "Başlangıç açıklığını zorlamadan seç",
      "Dizleri kontrollü birleştir",
      "Açılışta ağırlığı yavaş bırak"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "adductor-makinesi",
    "pattern": "hip_adduction",
    "primaryMuscles": [
      "adductors"
    ],
    "secondaryMuscles": [],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-hip-thrust",
    "title": "Makine Hip Thrust",
    "description": "Hip thrust makinesinde kalça itişi; bar kurmaya gerek yok.",
    "cues": [
      "Sırtın üstü pede yaslı",
      "Topuklardan it, yukarıda kalçayı sık",
      "Belden değil kalçadan kalk"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "hip-thrust-makinesi",
    "pattern": "hip_extension",
    "primaryMuscles": [
      "glutes"
    ],
    "secondaryMuscles": [
      "hamstrings_medial",
      "hamstrings_lateral",
      "glute_medius"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-glute-kickback",
    "title": "Makine Glute Kickback",
    "description": "Makinede tek bacakla geriye itiş; kalçayı izole eder.",
    "cues": [
      "Gövde sabit, bel boşalmasın",
      "Bacağı kalçadan geriye it",
      "Yukarıda bir an kalçayı sık"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "glute-kickback-makinesi",
    "pattern": "hip_extension",
    "primaryMuscles": [
      "glutes"
    ],
    "secondaryMuscles": [
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-crunch",
    "title": "Makine Crunch",
    "description": "Oturarak makinede karın bükme.",
    "cues": [
      "Hareketi karından başlat, kollarla çekme",
      "Aşağıda bir an sık",
      "Yukarı dönüşte ağırlığı bırakma"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "crunch-makinesi",
    "pattern": "core_flexion",
    "primaryMuscles": [
      "abs_upper"
    ],
    "secondaryMuscles": [
      "abs_lower",
      "obliques"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "makine-govde-dondurme",
    "title": "Makine Gövde Döndürme",
    "description": "Oturarak makinede gövdeyi iki yöne döndürme; yan karını çalıştırır.",
    "cues": [
      "Kalça ve dizler sabit",
      "Dönüşü karından başlat",
      "Her iki yöne eşit tekrar yap"
    ],
    "category": "isolation",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "rotary-torso",
    "pattern": "core_rotation",
    "primaryMuscles": [
      "obliques"
    ],
    "secondaryMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  },
  {
    "id": "kablo-woodchop",
    "title": "Kablo Woodchop",
    "description": "Fonksiyonel kablodan çapraz çekiş; gövde döndürme gücü.",
    "cues": [
      "Kalçadan ve gövdeden dön, kollar yalnız taşısın",
      "Arka ayak parmak ucunda döner",
      "Her iki yöne eşit tekrar yap"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "cable",
    "deviceId": "fonksiyonel-kablo",
    "pattern": "core_rotation",
    "attachment": "Halat",
    "grip": "neutral",
    "primaryMuscles": [
      "obliques"
    ],
    "secondaryMuscles": [
      "abs_upper",
      "abs_lower",
      "delt_front"
    ],
    "stabilizerMuscles": [
      "glutes"
    ],
    "loadStepKg": 2.5,
    "minLoadKg": 0
  },
  {
    "id": "kosu-bandi",
    "title": "Koşu Bandı",
    "description": "Koşu bandında yürüyüş ya da koşu; ısınma ve dayanıklılık.",
    "cues": [
      "Hızı kademeli artır",
      "Tutunmadan, dik yürü",
      "Eğimle zorluğu artırabilirsin"
    ],
    "category": "warmup",
    "trackingType": "duration",
    "equipment": "cardio_machine",
    "deviceId": "kosu-bandi",
    "pattern": "cardio",
    "primaryMuscles": [
      "cardio"
    ],
    "secondaryMuscles": [
      "quadriceps",
      "hamstrings_medial",
      "hamstrings_lateral",
      "gastroc_medial",
      "gastroc_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0,
    "minLoadKg": 0
  },
  {
    "id": "eliptik",
    "title": "Eliptik",
    "description": "Eklemlere az yük bindiren kardiyo; ısınma ve dayanıklılık.",
    "cues": [
      "Topuklar pedallardan kalkmasın",
      "Kolları da çalıştır",
      "Direnci kademeli artır"
    ],
    "category": "warmup",
    "trackingType": "duration",
    "equipment": "cardio_machine",
    "deviceId": "eliptik",
    "pattern": "cardio",
    "primaryMuscles": [
      "cardio"
    ],
    "secondaryMuscles": [
      "quadriceps",
      "glutes",
      "hamstrings_medial",
      "hamstrings_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0,
    "minLoadKg": 0
  },
  {
    "id": "merdiven",
    "title": "Merdiven (Stepmill)",
    "description": "Sürekli dönen merdivende tırmanış; kalça ve bacak ağırlıklı kardiyo.",
    "cues": [
      "Tutunmaya yaslanma, dik dur",
      "Adımın tamamını bas",
      "Hızı konuşabileceğin tempoda tut"
    ],
    "category": "warmup",
    "trackingType": "duration",
    "equipment": "cardio_machine",
    "deviceId": "merdiven",
    "pattern": "cardio",
    "primaryMuscles": [
      "cardio"
    ],
    "secondaryMuscles": [
      "glutes",
      "quadriceps",
      "gastroc_medial",
      "gastroc_lateral"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 0,
    "minLoadKg": 0
  },
  {
    "id": "air-bike-sprint",
    "title": "Air Bike Sprint",
    "description": "Air bike ile kısa, yüksek tempolu aralıklar; tüm vücut kondisyonu.",
    "cues": [
      "Aralık boyunca kol ve bacakla birlikte it-çek",
      "Dinlenmede yavaş pedal çevir",
      "Tempoyu aralık sonuna kadar koru"
    ],
    "category": "conditioning",
    "trackingType": "duration",
    "equipment": "cardio_machine",
    "deviceId": "air-bike",
    "pattern": "cardio",
    "primaryMuscles": [
      "cardio",
      "quadriceps"
    ],
    "secondaryMuscles": [
      "glutes",
      "delt_front",
      "triceps_long",
      "triceps_lateral"
    ],
    "stabilizerMuscles": [
      "abs_upper",
      "abs_lower"
    ],
    "loadStepKg": 0,
    "minLoadKg": 0
  },
  {
    "id": "ters-tutus-lat-pulldown",
    "title": "Ters Tutuş Lat Pulldown",
    "description": "Lat pulldown makinesinde dar, avuç içi dönük (supinasyon) tutuşla çekiş; biceps payı artar.",
    "cues": [
      "Eller omuz genişliğinden dar, avuç içleri sana dönük",
      "Barı göğüs üstüne çek, dirsekler gövdeye yakın",
      "Yukarıda kanat kasında gerilmeyi hisset"
    ],
    "category": "compound",
    "trackingType": "weight_reps",
    "equipment": "machine",
    "deviceId": "lat-pulldown-makinesi",
    "pattern": "vertical_pull",
    "attachment": "Düz bar",
    "grip": "supinated",
    "gripWidth": "narrow",
    "primaryMuscles": [
      "lats_upper",
      "lats_mid",
      "lats_lower"
    ],
    "secondaryMuscles": [
      "biceps",
      "traps_mid",
      "traps_lower"
    ],
    "stabilizerMuscles": [],
    "loadStepKg": 5,
    "minLoadKg": 0
  }
];
