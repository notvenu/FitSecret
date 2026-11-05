import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@fitsecret/shared'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }], formats: ['image/avif', 'image/webp'] },
  // Online Store admin at /admin: the POS screens built from apps/web/admin into public/admin (gitignored).
  rewrites: async () => [{ source: '/admin', destination: '/admin/index.html' }],
  experimental: { optimizePackageImports: ['lucide-react'] },
};
export default config;
