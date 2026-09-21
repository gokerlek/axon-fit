/**
 * Uygulama genelinde tek hata tipi.
 *
 * Sunucu uçları `{ error: "mesaj" }` ya da alan bazlı hata için
 * `{ error: "mesaj", fields: { ad: "mesaj" } }` döner. `fetchJson` bunu `ApiError`'a
 * çevirir; bildirim gösterme işi tek merkezde (query/client.ts), alan hatalarını
 * forma basma işi `applyFieldErrors` içinde olur.
 */
export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  /** GitHub'da aynı dosyaya eşzamanlı yazma (sha çakışması). Yeniden denemeye değer. */
  readonly conflict: boolean;
  /** Sunucunun tek tek alanlar için döndürdüğü hatalar. */
  readonly fields: FieldErrors;

  constructor(message: string, status: number, fields: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.conflict = status === 409;
    this.fields = fields;
  }
}

const varsayilanMesajlar: Record<number, string> = {
  401: 'Oturumun düşmüş. Yeniden giriş yap.',
  403: 'Bu işlem için yetkin yok.',
  404: 'Aradığın kayıt bulunamadı.',
  409: 'Bu kayıt sen çalışırken değişti. Tekrar dene.',
  429: 'Çok fazla istek gönderildi. Biraz bekle.',
};

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Bağlantı kurulamadı. İnternetini kontrol et.', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; fields?: FieldErrors }
      | null;
    const message = body?.error ?? varsayilanMesajlar[response.status] ?? 'Beklenmeyen bir hata oldu.';
    throw new ApiError(message, response.status, body?.fields ?? {});
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
