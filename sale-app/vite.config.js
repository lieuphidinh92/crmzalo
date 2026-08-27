import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['favicon.svg', 'manifest.json', 'icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Chunk in chứng từ A4 nặng 214 KB nhưng chỉ dùng khi bấm in phiếu →
        // KHÔNG nạp sẵn cho mọi người (đo 26/8/2026: nạp sẵn 3,12 MB, riêng
        // chunk này + ảnh mockup bỏ quên chiếm 60%). Vẫn được cache lại sau
        // lần in đầu nhờ runtimeCaching bên dưới.
        // Cả html2canvas (198 KB) — thư viện chụp ảnh phiếu, chỉ dùng lúc in.
        globIgnores: ['**/SalesDocument-*.js', '**/html2canvas*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Chunk không nạp sẵn (vd màn in chứng từ): lần đầu tải qua mạng,
            // từ lần 2 lấy từ máy → bấm in lần sau vẫn nhanh.
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sale-chunks',
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sale-api-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Ưu tiên cổng do trình preview/host cấp qua biến môi trường PORT;
    // fallback 5174 khi chạy `npm run dev` thủ công.
    port: Number(process.env.PORT) || 5174,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
