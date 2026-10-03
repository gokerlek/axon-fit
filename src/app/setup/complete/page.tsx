import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requirePt } from '@/lib/guards';
import { loadAppConfig } from '@/lib/config';
import { Button } from '@/components/ui/button';
export default async function CompletePage() {
  await requirePt();
  const config = await loadAppConfig();
  if (!config.setupCompleted) redirect('/setup');
  return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-12"><p className="text-sm font-medium text-primary">KURULUM TAMAMLANDI</p><h1 className="font-heading text-3xl font-semibold">{config.appName} hazır.</h1><p className="text-muted-foreground">İlk danışanını ekleyip antrenman programını hazırlayabilirsin. Görünümü daha sonra Ayarlar’dan değiştirebilirsin.</p><Button render={<Link href="/dashboard/clients" />}>Danışanlarıma geç</Button><Button variant="outline" render={<Link href="/dashboard" />}>Paneli aç</Button></main>;
}
