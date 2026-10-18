import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: panel 5173 pe, API backend (4000) pe — /api aur /uploads aage bhejo
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
