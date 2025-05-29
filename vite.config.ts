import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react']
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'background/background.ts'),
        content: resolve(__dirname, 'content/content.ts'),
        popup: resolve(__dirname, 'popup/popup.ts'),
        sidebar: resolve(__dirname, 'sidebar/sidebar.ts'),
        welcome: resolve(__dirname, 'onboarding/welcome.ts'),
      },
      output: {
        dir: 'dist',
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.facadeModuleId?.includes('/background/')) {
            return 'background/[name].js';
          }
          if (chunkInfo.facadeModuleId?.includes('/content/')) {
            return 'content/[name].js';
          }
          if (chunkInfo.facadeModuleId?.includes('/popup/')) {
            return 'popup/[name].js';
          }
          if (chunkInfo.facadeModuleId?.includes('/sidebar/')) {
            return 'sidebar/[name].js';
          }
          if (chunkInfo.facadeModuleId?.includes('/onboarding/')) {
            return 'onboarding/[name].js';
          }
          return '[name].js';
        },
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            if (assetInfo.name.includes('content/')) {
              return 'content/[name][extname]';
            }
            if (assetInfo.name.includes('popup/')) {
              return 'popup/[name][extname]';
            }
            if (assetInfo.name.includes('sidebar/')) {
              return 'sidebar/[name][extname]';
            }
            if (assetInfo.name.includes('onboarding/')) {
              return 'onboarding/[name][extname]';
            }
          }
          return '[name][extname]';
        }
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});