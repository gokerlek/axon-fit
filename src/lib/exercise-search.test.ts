import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, searchExercises, type Searchable } from './exercise-search.ts';

/** `MUSCLE_LABELS` + aile + bölge adlarının küçük bir kopyası (çağıranın vereceği gibi). */
const NAMES: Record<string, string[]> = {
  chest_lower: ['Alt göğüs', 'Göğüs', 'Göğüs'],
  chest_upper: ['Üst göğüs', 'Göğüs', 'Göğüs'],
  triceps_long: ['Triceps uzun baş', 'Triceps', 'Kol'],
  delt_front: ['Ön omuz', 'Omuz', 'Omuz'],
  quadriceps: ['Ön bacak', 'Kalça ve bacak'],
  glutes: ['Kalça', 'Kalça ve bacak'],
  biceps: ['Biceps', 'Kol'],
};
const muscleNames = (muscle: string) => NAMES[muscle] ?? [muscle];

const item = (title: string, primaryMuscles: string[], secondaryMuscles: string[] = []): Searchable => ({
  title,
  primaryMuscles,
  secondaryMuscles,
});

const incline = item('Incline Bench Press', ['chest_upper'], ['delt_front', 'triceps_long']);
const dumbbellBench = item('Dambıl Bench Press', ['chest_lower'], ['triceps_long']);
const barbellBench = item('Halter Bench Press', ['chest_lower'], ['chest_upper', 'triceps_long']);
const dips = item('Paralel Bar Dips', ['triceps_long'], ['chest_lower']);
const squat = item('Squat', ['quadriceps', 'glutes']);
const frontSquat = item('Ön Squat', ['quadriceps'], ['glutes']);
const curl = item('Dambıl Curl', ['biceps']);
const LIST = [squat, incline, dumbbellBench, barbellBench, dips, frontSquat, curl];

const titles = (list: Searchable[]) => list.map((entry) => entry.title);

describe('katlama', () => {
  test('Türkçe harfler ve büyük I', () => {
    assert.equal(fold('GÖĞÜS'), 'gogus');
    assert.equal(fold('Incline'), 'incline');
    assert.equal(fold('İç bacak'), 'ic bacak');
    assert.equal(fold('Dambıl Çekiş'), 'dambil cekis');
  });
});

describe('egzersiz arama', () => {
  test('"incline" Incline Bench Press ile eşleşir', () => {
    assert.deepEqual(titles(searchExercises(LIST, 'incline', muscleNames)), ['Incline Bench Press']);
  });

  test('"gogus" ve "GÖĞÜS" göğüs hareketlerini bulur; hedef kas yardımcıdan önce', () => {
    const expected = ['Dambıl Bench Press', 'Halter Bench Press', 'Incline Bench Press', 'Paralel Bar Dips'];
    assert.deepEqual(titles(searchExercises(LIST, 'gogus', muscleNames)), expected);
    assert.deepEqual(titles(searchExercises(LIST, 'GÖĞÜS', muscleNames)), expected);
  });

  test('kelimelerin hepsi eşleşmeli', () => {
    assert.deepEqual(titles(searchExercises(LIST, 'dambıl göğüs', muscleNames)), ['Dambıl Bench Press']);
    assert.deepEqual(titles(searchExercises(LIST, 'dambil kol', muscleNames)), ['Dambıl Curl', 'Dambıl Bench Press']);
  });

  test('başlık aramayla başlıyorsa önce', () => {
    assert.deepEqual(titles(searchExercises(LIST, 'squat', muscleNames)), ['Squat', 'Ön Squat']);
    assert.deepEqual(titles(searchExercises(LIST, 'bench', muscleNames)), ['Dambıl Bench Press', 'Halter Bench Press', 'Incline Bench Press']);
  });

  test('boş arama bütün listeyi ada göre sıralar', () => {
    assert.deepEqual(titles(searchExercises(LIST, '   ', muscleNames)), [
      'Dambıl Bench Press',
      'Dambıl Curl',
      'Halter Bench Press',
      'Incline Bench Press',
      'Ön Squat',
      'Paralel Bar Dips',
      'Squat',
    ]);
  });
});
