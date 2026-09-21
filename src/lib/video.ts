/**
 * Video bağlantıları — medya barındırmıyoruz; PT YouTube/Vimeo bağlantısı yapıştırır,
 * biz yalnız sağlayıcı ve kimliği saklarız (oynatıcı gömülür).
 *
 * Vimeo'da "liste dışı" videoların bağlantısında gizli bir anahtar olur
 * (`vimeo.com/123/abc`); kimlik `123:abc` olarak saklanır, oynatıcıya `?h=abc` gider.
 */

export type VideoProvider = 'youtube' | 'vimeo';
export type VideoRef = { provider: VideoProvider; id: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}(:[0-9a-f]{6,20})?$/;

export function isValidVideoId({ provider, id }: VideoRef): boolean {
  return provider === 'youtube' ? YOUTUBE_ID.test(id) : VIMEO_ID.test(id);
}

/** YouTube (watch, youtu.be, shorts, embed, live) ya da Vimeo bağlantısından video kimliği. */
export function parseVideoUrl(input: string): VideoRef | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);

  let ref: VideoRef | null = null;
  if (host === 'youtu.be') {
    ref = { provider: 'youtube', id: parts[0] ?? '' };
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    const id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '') ? parts[1] : null;
    ref = { provider: 'youtube', id: id ?? '' };
  } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/123 · vimeo.com/123/abc · vimeo.com/channels/x/123 · player.vimeo.com/video/123?h=abc
    const index = parts.findIndex((part) => /^\d+$/.test(part));
    if (index >= 0) {
      const hash = url.searchParams.get('h') ?? (parts[index + 1] && /^[0-9a-f]+$/.test(parts[index + 1] ?? '') ? parts[index + 1] : null);
      ref = { provider: 'vimeo', id: hash ? `${parts[index]}:${hash}` : (parts[index] ?? '') };
    }
  }
  return ref && isValidVideoId(ref) ? ref : null;
}

/** Düzenleme formunda gösterilecek bağlantı. */
export function videoUrl({ provider, id }: VideoRef): string {
  if (provider === 'youtube') return `https://www.youtube.com/watch?v=${id}`;
  const [video, hash] = id.split(':');
  return hash ? `https://vimeo.com/${video}/${hash}` : `https://vimeo.com/${video}`;
}

/** Gömülü oynatıcı adresi. YouTube'da `nocookie`: izlenmeden çerez yazılmaz. */
export function embedUrl({ provider, id }: VideoRef): string {
  if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
  const [video = '', hash] = id.split(':');
  return `https://player.vimeo.com/video/${encodeURIComponent(video)}?dnt=1${hash ? `&h=${encodeURIComponent(hash)}` : ''}`;
}
