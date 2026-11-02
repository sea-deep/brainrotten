import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute URL for link previews (og:image); set VITE_SITE_URL when building the public site.
const siteUrl=(process.env['VITE_SITE_URL']??'').replace(/\/$/,'');

export default defineConfig({
  plugins: [react(),{name:'site-url',transformIndexHtml:html=>html.replaceAll('__SITE_URL__',siteUrl)}],
  server: {
    // Only allow loopback during development
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // Proxy /api requests to the companion
      '/api/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false, // keep the loopback origin
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
