/** Local preview only: no recording, frame extraction, upload or persistence. */
export type PreviewStream = { getTracks(): { stop(): void }[] };

/** Invalidates outstanding permission requests as well as already opened streams. */
export class CameraPreviewSession<T extends PreviewStream> {
  private generation = 0;
  private current: T | null = null;

  get stream(): T | null { return this.current; }

  stop(): void {
    this.generation += 1;
    const stream = this.current;
    this.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }

  async open(acquire: () => Promise<T>): Promise<T | null> {
    this.stop();
    const generation = this.generation;
    let stream: T;
    try { stream = await acquire(); }
    catch (error) {
      if (generation !== this.generation) return null;
      throw error;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    this.current = stream;
    return stream;
  }
}

export function cameraErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Kamera izni verilmedi. Tarayıcının site izinlerinden kamerayı açabilir veya manuel yolla devam edebilirsin.';
  if (name === 'NotFoundError') return 'Kamera bulunamadı. Başka bir cihaz veya manuel ölçüm kullanabilirsin.';
  if (name === 'NotReadableError') return 'Kamera açılamadı. Kamerayı kullanan diğer uygulamayı kapatıp tekrar deneyebilirsin.';
  return 'Kamera açılamadı. Tekrar deneyebilir veya manuel yolla devam edebilirsin.';
}
