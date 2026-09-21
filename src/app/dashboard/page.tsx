import Link from 'next/link';
import { listExercises } from '@/lib/exercises';
import { listClientIds } from '@/lib/github/repos';
import styles from './overview.module.css';

/**
 * Genel bakış. Şimdilik sayılar; danışan ve antrenman ekranları geldikçe
 * "şu an antrenmanda olanlar" (canlı) ve "bugün" burada yer alacak.
 */
export default async function DashboardPage() {
  const [exercises, clientIds] = await Promise.all([
    listExercises(),
    listClientIds().catch(() => [] as string[]),
  ]);
  const custom = exercises.filter((item) => item.source === 'custom').length;

  return (
    <>
      <h1 className={styles.hello}>Genel bakış</h1>
      <p className={styles.sub}>Danışanların, şablonların ve egzersiz kütüphanen.</p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.value}>{clientIds.length}</span>
          <span className={styles.label}>Danışan</span>
          <span className={styles.note}>Danışan ekleme sıradaki adım</span>
        </div>

        <div className={styles.card}>
          <span className={styles.value}>—</span>
          <span className={styles.label}>Şu an antrenmanda</span>
          <span className={styles.note}>Canlı görünüm antrenman ekranıyla gelecek</span>
        </div>

        <Link href="/dashboard/exercises" className={styles.card}>
          <span className={styles.value}>{exercises.length}</span>
          <span className={styles.label}>Egzersiz</span>
          <span className={styles.note}>{custom} tanesi senin</span>
        </Link>
      </div>
    </>
  );
}
