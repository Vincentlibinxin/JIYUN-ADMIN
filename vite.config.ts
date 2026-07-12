import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: 'all',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');

          if (normalizedId.includes('node_modules')) {
            if (
              normalizedId.includes('/node_modules/react/') ||
              normalizedId.includes('/node_modules/react-dom/') ||
              normalizedId.includes('/node_modules/react-router/') ||
              normalizedId.includes('/node_modules/react-router-dom/')
            ) {
              return 'react-vendor';
            }

            if (normalizedId.includes('/node_modules/exceljs/')) {
              return 'exceljs-vendor';
            }

            if (
              normalizedId.includes('/node_modules/antd/') ||
              normalizedId.includes('/node_modules/@ant-design/') ||
              normalizedId.includes('/node_modules/@rc-component/')
            ) {
              return 'antd-vendor';
            }

            if (normalizedId.includes('/node_modules/dayjs/')) {
              return 'dayjs-vendor';
            }

            if (normalizedId.includes('/node_modules/lucide-react/')) {
              return 'icons-vendor';
            }
          }

          if (normalizedId.includes('/src/pages/dashboard/')) {
            const match = normalizedId.match(/\/src\/pages\/dashboard\/([^/]+)\.tsx$/);
            if (match?.[1]) {
              return `dashboard-${match[1]}`;
            }
            return 'dashboard-tabs';
          }

          if (normalizedId.includes('/src/pages/AdminDashboard.tsx')) {
            return 'admin-dashboard';
          }
        },
      },
    },
  },
  preview: {
    port: 3002,
    strictPort: true,
    host: '127.0.0.1',
    allowedHosts: 'all',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
