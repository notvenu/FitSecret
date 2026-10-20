// Builds the POS screens (apps/pos/ui) for the website at /admin, wired to Supabase instead of the POS server.
// Output goes to apps/web/public/admin, which Next serves; next.config.ts rewrites /admin to its index.html.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: at('../../pos/ui'),
  base: '/admin/',
  envDir: at('..'), // apps/web/.env.local, so the same Supabase URL / anon key as the storefront
  envPrefix: 'NEXT_PUBLIC_', // exposes only public keys, never SUPABASE_SERVICE_ROLE_KEY
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@backend': at('./entry.js') } },
  build: { outDir: at('../public/admin'), emptyOutDir: true },
});
