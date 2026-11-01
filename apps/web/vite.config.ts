import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
