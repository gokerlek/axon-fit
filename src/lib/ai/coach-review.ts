import type { SessionIndexExercise, SessionIndexRow } from '../schemas/session.ts';
import { strongestOf } from '../session-records.ts';
export type CoachInsight = { title: string; finding: string; next: string; sources: string[] };
type Performance = { value: number; label: string; metric: string; unit: string };
function performanceOf(exercise: SessionIndexExercise): Performance | null {
  const strength = strongestOf(exercise.best);
  if (strength) return { value: strength.e1rm, label: `${strength.kg} kg × ${strength.reps} tekrar`, metric: 'Tahmini maksimum', unit: 'kg' };
  const seconds = exercise.best?.seconds;
  if (seconds) return { value: seconds, label: `${seconds} sn`, metric: 'Süre', unit: 'sn' };
  const reps = Math.max(0, ...(exercise.best?.sets ?? []).filter(s => s.kg === 0).map(s => s.reps));
  return reps ? { value: reps, label: `${reps} tekrar`, metric: 'Tekrar', unit: 'tekrar' } : null;
}
/** Compare only the same exercise/device on different dates; do not guess causes or training loads. */
export function progressReview(rows: readonly SessionIndexRow[], today: string, titles: ReadonlyMap<string, string>): CoachInsight[] {
  const finished = rows.filter(r => r.finishedAt && !r.unfinished && r.date <= today).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const cutoff = new Date(`${today}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 27);
  const recent = finished.filter(r => r.date >= cutoff.toISOString().slice(0, 10));
  const insights: CoachInsight[] = [{ title: 'Antrenman düzeni', finding: `Son 28 günde ${recent.length} tamamlanmış antrenman kaydı var.`, next: recent.length ? 'Sonraki seansı mevcut programın sıradaki gününden sürdür; gün ve süre sana uymuyorsa programı bu koşullara göre düzenle.' : 'Bir sonraki tamamlanan seansı kaydet; sıklık ve gelişim değerlendirmesini bu kayıtlarla başlatalım.', sources: recent.slice(0, 4).map(r => `${r.date} antrenman kaydı`) }];
  const seen = new Set<string>();
  for (const row of recent) for (const exercise of row.exercises) {
    const key = JSON.stringify([exercise.exerciseId, exercise.deviceId ?? null]);
    if (!exercise.full || exercise.lighter || exercise.oneOff || seen.has(key) || !titles.has(exercise.exerciseId)) continue;
    const latest = performanceOf(exercise); if (!latest) continue;
    seen.add(key);
    const history = finished.filter(r => r.date < row.date).flatMap(r => r.exercises.filter(e => e.full && !e.lighter && !e.oneOff && e.exerciseId === exercise.exerciseId && e.deviceId === exercise.deviceId).map(e => ({ date: r.date, best: performanceOf(e) }))).filter(e => e.best?.metric === latest.metric);
    const before = history[0], title = titles.get(exercise.exerciseId)!;
    if (!before?.best) {
      insights.push({ title, finding: `${row.date}: ${latest.label} başlangıç kaydı. Aynı cihazla önceki karşılaştırma yok.`, next: 'Sonraki seansı aynı hareket ve cihazla kaydet; yük artışına karar vermeden tekrar ve eforu karşılaştır.', sources: [`${row.date} · ${title}`] });
    } else {
      const difference = latest.value - before.best.value;
      const direction = difference > 0.05 ? 'arttı' : difference < -0.05 ? 'azaldı' : 'aynı kaldı';
      insights.push({ title, finding: `${before.date} → ${row.date}: ${before.best.label} → ${latest.label}. ${latest.metric} ${Math.abs(difference).toFixed(1)} ${latest.unit} ${direction}; bu iki seansın karşılaştırması.`, next: difference < -0.05 ? 'Sonraki seansta yükü artırmayı ertele; aynı cihazda tekrar ve eforu kaydet. Düşüş tekrarlanırsa set yükünü ve dinlenmeyi PT ile gözden geçir.' : difference > 0.05 ? 'İlerleme var. Sonraki seansta mevcut tekrar aralığını ve eforu kontrol et; uygulamadaki hareket önerisini esas al.' : 'Hedef tekrar aralığı ve efor kaydını kontrol et. Hedef henüz tamamlanmadıysa aynı yükte tekrarları ilerlet; tamamlandıysa uygulamanın sonraki yük önerisini değerlendir.', sources: [`${before.date} · ${title}`, `${row.date} · ${title}`] });
    }
    if (insights.length >= 5) return insights;
  }
  return insights;
}
