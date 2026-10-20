import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@fitsecret/shared'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }], formats: ['image/avif', 'image/webp'] },
  // Temporary: billing & inventory at /admin (built from apps/web/admin into public/admin). Delete this and apps/web/admin to remove it.
  rewrites: async () => [{ source: '/admin', destination: '/admin/index.html' }],
  experimental: { optimizePackageImports: ['@phosphor-icons/react'] },
};
export default config;
