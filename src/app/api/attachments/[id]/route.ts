import { NextResponse } from 'next/server';
import { appRepoFiles } from '@/lib/app-repo-files';
import { deleteAttachment } from '@/lib/catalog-actions';
import { readPtSession } from '@/lib/session';

/**
 * PT'nin aparatını siler; hazır bir aparatın PT sürümüyse varsayılana döner. Hazır
 * havuzdakiler silinemez. Silinen aparat seçili olduğu PT cihazlarından ve
 * egzersizlerinden düşer (SPEC §7.3), kimliği bir daha verilmez; varsayılana dönüşte
 * kimlik hazır havuzda yaşadığı için bağlar kalır. Aparatın fotoğrafı da silinir.
 * Kurallar ve adımların sırası `deleteAttachment`'ta (`src/lib/catalog-actions.ts`).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: 'Bu işlem için yetkin yok.' }, { status: 403 });

  const { id } = await params;
  const { status, body } = await deleteAttachment(appRepoFiles(), id);
  return NextResponse.json(body, { status });
}
