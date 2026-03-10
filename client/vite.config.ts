import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      '/api': 'http://localhost:3001',
    },
    ...(process.env.VITE_ALLOWED_HOST
      ? { allowedHosts: [process.env.VITE_ALLOWED_HOST] }
      : {}),
  },
});
