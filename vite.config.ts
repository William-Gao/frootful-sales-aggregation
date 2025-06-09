import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['@supabase/supabase-js']
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
      output: [
        // ES modules for background, popup, sidebar (these support modules)
        {
          dir: 'dist',
          format: 'es',
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.facadeModuleId?.includes('/background/')) {
              return 'background/[name].js';
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
        },
        // IIFE format for content script (no module support)
        {
          dir: 'dist',
          format: 'iife',
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.facadeModuleId?.includes('/content/')) {
              return 'content/[name].js';
            }
            return null; // Skip other entries for this output
          },
          chunkFileNames: 'content/[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css') && assetInfo.name.includes('content/')) {
              return 'content/[name][extname]';
            }
            return null; // Skip other assets for this output
          }
        }
      ]
    },
    outDir: 'dist',
    emptyOutDir: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  define: {
    global: 'globalThis',
  }
});