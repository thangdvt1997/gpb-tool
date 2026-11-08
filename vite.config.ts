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
  // `vite preview` (kiểm tra trình duyệt e2e): mọi /api trỏ về gateway đang chạy (mặc định 127.0.0.1:18080).
  // GPB_PREVIEW_AUTH_API: tách riêng /api/auth sang service auth kiểm thử (tài khoản test e2e, không phải production).
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      ...(process.env.GPB_PREVIEW_AUTH_API ? { '/api/auth': process.env.GPB_PREVIEW_AUTH_API } : {}),
      // GPB_PREVIEW_WORLD_API: tách /api/world (cả WebSocket) sang world service cục bộ (ví dụ http://127.0.0.1:3903).
      ...(process.env.GPB_PREVIEW_WORLD_API ? { '/api/world': { target: process.env.GPB_PREVIEW_WORLD_API, ws: true } } : {}),
      // GPB_PREVIEW_LAYOUT_API: tách /api/layout (gồm SSE) sang layout service kiểm thử (ví dụ http://127.0.0.1:3904).
      ...(process.env.GPB_PREVIEW_LAYOUT_API ? { '/api/layout': process.env.GPB_PREVIEW_LAYOUT_API } : {}),
      '/api': process.env.GPB_PREVIEW_API ?? 'http://127.0.0.1:18080',
    },
  },
});
