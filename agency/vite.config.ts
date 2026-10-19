import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Agency portal: dev 5174 pe, API backend (4000) pe
export default defineConfig({
  plugins: [react()],
  base: '/agency/',
  server: { port: 5174, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } },
});
