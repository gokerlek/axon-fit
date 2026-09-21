import { AspectRatio } from '@/components/ui/aspect-ratio';
import { embedUrl, type VideoProvider } from '@/lib/video';

/**
 * Video gömme — medya barındırmıyoruz, yalnız YouTube/Vimeo oynatıcısı (SPEC: sıfır medya depolama).
 * YouTube'da `youtube-nocookie` alan adı: izlenmeden çerez yazılmaz.
 */
export function VideoEmbed({ provider, id, title }: { provider: VideoProvider; id: string; title: string }) {
  const src = embedUrl({ provider, id });

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
