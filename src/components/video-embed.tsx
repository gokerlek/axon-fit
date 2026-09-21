import { AspectRatio } from '@/components/ui/aspect-ratio';

/**
 * Video gömme — medya barındırmıyoruz, yalnız YouTube/Vimeo oynatıcısı (SPEC: sıfır medya depolama).
 * YouTube'da `youtube-nocookie` alan adı: izlenmeden çerez yazılmaz.
 */
export function VideoEmbed({ provider, id, title }: { provider: 'youtube' | 'vimeo'; id: string; title: string }) {
  const src =
    provider === 'youtube'
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`
      : `https://player.vimeo.com/video/${encodeURIComponent(id)}?dnt=1`;

  return (
    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg border bg-muted">
      <iframe
        src={src}
        title={title}
        className="size-full"
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </AspectRatio>
  );
}
