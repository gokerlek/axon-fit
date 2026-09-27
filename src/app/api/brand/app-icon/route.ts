import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { readAppConfig } from '@/lib/config';
import { appRepo } from '@/lib/github/client';
import { readBinary } from '@/lib/github/files';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Android kurulum simgesi: marka logosu veya mevcut nabız işareti, maskelenebilir güvenli alan içinde. */
export async function GET(request: Request) {
  const size = new URL(request.url).searchParams.get('size');
  if (size !== '192' && size !== '512') return new Response(null, { status: 400 });
  const pixels = Number(size);
  const config = await readAppConfig();
  const type = config.logo ? TYPES[config.logo.split('.').pop() ?? ''] : undefined;
  const logo = config.logo && type ? await readBinary(appRepo(), config.logo).catch(() => null) : null;
  const mark = logo
    ? createElement('img', {
        src: `data:${type};base64,${Buffer.from(logo.bytes).toString('base64')}`,
        width: pixels * 0.56,
        height: pixels * 0.56,
        style: { objectFit: 'contain' },
      })
    : createElement('svg', { width: pixels * 0.7, height: pixels * 0.4, viewBox: '0 0 240 40', fill: 'none' },
        createElement('path', {
          d: 'M0 20h78l8-13 10 26 9-19 7 6h128',
          stroke: config.accent ?? '#c4f000', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
  return new ImageResponse(
    createElement('div', {
      style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717' },
    }, mark),
    { width: pixels, height: pixels, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
