import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Dev proxy tới các microservice (cổng khớp docs/ARCHITECTURE.md).
    proxy: {
      '/api/auth': 'http://127.0.0.1:3001',
      '/api/it': 'http://127.0.0.1:3002',
      '/api/rooms': 'http://127.0.0.1:3002',
      '/api/kudos': 'http://127.0.0.1:3002',
    },
  },
});
