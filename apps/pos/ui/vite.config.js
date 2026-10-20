import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The screens talk to a back end through this alias: the POS server here, Supabase in apps/web/admin.
  resolve: { alias: { '@backend': fileURLToPath(new URL('./src/backend-http.js', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4321' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
