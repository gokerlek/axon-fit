'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { clientTabIndex, tabDirection } from '@/lib/client-tabs';
import { DURATION, TABS, tween } from '@/lib/motion';

/**
 * Son gösterilen sayfanın sekme sırası (sekme dışında -1). Yalnız istemcide, efektte yazılır:
 * sunucuda ve hidrasyonda hep boştur, ilk çizim animasyonsuz gelir (içerik sunucu HTML'inde
 * görünmez başlamaz, hidrasyon uyuşmazlığı olmaz).
 */
let previousTab: number | null = null;

/**
 * Sekme geçişi (Next `template.js`: her sayfa değişiminde yeniden kurulur, layout ve dock yerinde
 * kalır). Yeni içerik dock'taki yönden kayarak gelir: sağdaki sekmeye geçince sağdan, soldakine
 * geçince soldan; Ayarlar'a giriş ve çıkışta yalnız saydamlık (`tabDirection`). Süre `DURATION.base`,
 * kayma `TABS.slidePx`. Hareket azaltma tercihinde kayma yok, yalnız saydamlık (`MotionConfig`).
 */
export default function ClientTabsTemplate({ children }: { children: React.ReactNode }) {
  const tab = clientTabIndex(usePathname());
  const [initial] = useState(() => {
    if (previousTab === null) return false as const;
    return { opacity: 0, x: tabDirection(previousTab, tab) * TABS.slidePx };
  });

  useEffect(() => {
    previousTab = tab;
  }, [tab]);

  return (
    <motion.div initial={initial} animate={{ opacity: 1, x: 0 }} transition={tween(DURATION.base)}>
      {children}
    </motion.div>
  );
}
