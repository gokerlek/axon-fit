import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Sunucu sırları (GITHUB_TOKEN vb.) asla istemci paketine girmez: NEXT_PUBLIC_ öneki
  // kullanılmaz ve GitHub'a giden modüller `server-only` ile işaretlenir (src/lib/env.ts).
  poweredByHeader: false,
};

export default nextConfig;
