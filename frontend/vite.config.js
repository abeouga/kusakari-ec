import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@kusakari/site-header'],
    include: ['lucide-react'],
  },
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5186,
    strictPort: true,
    proxy: { '/api': { target: process.env.KUSAKARI_EC_API_TARGET || 'http://127.0.0.1:8086' } },
  },
});
