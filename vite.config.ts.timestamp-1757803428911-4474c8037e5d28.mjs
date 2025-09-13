// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { resolve } from "path";
var __vite_injected_original_dirname = "/home/project";
var vite_config_default = defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["lucide-react"],
    include: ["@supabase/supabase-js"]
  },
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        // drop_console: true,
        // drop_debugger: true
      }
    },
    rollupOptions: {
      input: {
        main: resolve(__vite_injected_original_dirname, "index.html")
      },
      output: {
        dir: "dist",
        format: "es",
        // Use ES modules format
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.facadeModuleId?.includes("/background/")) {
            return "background/[name].js";
          }
          if (chunkInfo.facadeModuleId?.includes("/content/")) {
            return "content/[name].js";
          }
          if (chunkInfo.facadeModuleId?.includes("/popup/")) {
            return "popup/[name].js";
          }
          if (chunkInfo.facadeModuleId?.includes("/sidebar/")) {
            return "sidebar/[name].js";
          }
          if (chunkInfo.facadeModuleId?.includes("/onboarding/")) {
            return "onboarding/[name].js";
          }
          if (chunkInfo.facadeModuleId?.includes("/public/auth/")) {
            return "auth/[name].js";
          }
          return "[name].js";
        },
        chunkFileNames: (chunkInfo) => {
          const name = chunkInfo.name || "chunk";
          return name.startsWith("_") ? name.substring(1) + ".js" : "[name].js";
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) {
            if (assetInfo.name.includes("content/")) {
              return "content/[name][extname]";
            }
            if (assetInfo.name.includes("popup/")) {
              return "popup/[name][extname]";
            }
            if (assetInfo.name.includes("sidebar/")) {
              return "sidebar/[name][extname]";
            }
            if (assetInfo.name.includes("onboarding/")) {
              return "onboarding/[name][extname]";
            }
            if (assetInfo.name.includes("auth/")) {
              return "auth/[name][extname]";
            }
          }
          return "[name][extname]";
        },
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            return "vendor";
          }
          return void 0;
        }
      }
    },
    outDir: "dist",
    emptyOutDir: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  },
  resolve: {
    alias: {
      "@": resolve(__vite_injected_original_dirname, "src")
    }
  },
  define: {
    global: "globalThis"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcbiAgICBpbmNsdWRlOiBbJ0BzdXBhYmFzZS9zdXBhYmFzZS1qcyddXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgbWluaWZ5OiAndGVyc2VyJyxcbiAgICB0ZXJzZXJPcHRpb25zOiB7XG4gICAgICBjb21wcmVzczoge1xuICAgICAgICAvLyBkcm9wX2NvbnNvbGU6IHRydWUsXG4gICAgICAgIC8vIGRyb3BfZGVidWdnZXI6IHRydWVcbiAgICAgIH1cbiAgICB9LFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG1haW46IHJlc29sdmUoX19kaXJuYW1lLCAnaW5kZXguaHRtbCcpLFxuICAgICAgfSxcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBkaXI6ICdkaXN0JyxcbiAgICAgICAgZm9ybWF0OiAnZXMnLCAvLyBVc2UgRVMgbW9kdWxlcyBmb3JtYXRcbiAgICAgICAgZW50cnlGaWxlTmFtZXM6IChjaHVua0luZm8pID0+IHtcbiAgICAgICAgICBpZiAoY2h1bmtJbmZvLmZhY2FkZU1vZHVsZUlkPy5pbmNsdWRlcygnL2JhY2tncm91bmQvJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnYmFja2dyb3VuZC9bbmFtZV0uanMnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY2h1bmtJbmZvLmZhY2FkZU1vZHVsZUlkPy5pbmNsdWRlcygnL2NvbnRlbnQvJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnY29udGVudC9bbmFtZV0uanMnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY2h1bmtJbmZvLmZhY2FkZU1vZHVsZUlkPy5pbmNsdWRlcygnL3BvcHVwLycpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ3BvcHVwL1tuYW1lXS5qcyc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjaHVua0luZm8uZmFjYWRlTW9kdWxlSWQ/LmluY2x1ZGVzKCcvc2lkZWJhci8nKSkge1xuICAgICAgICAgICAgcmV0dXJuICdzaWRlYmFyL1tuYW1lXS5qcyc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjaHVua0luZm8uZmFjYWRlTW9kdWxlSWQ/LmluY2x1ZGVzKCcvb25ib2FyZGluZy8nKSkge1xuICAgICAgICAgICAgcmV0dXJuICdvbmJvYXJkaW5nL1tuYW1lXS5qcyc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjaHVua0luZm8uZmFjYWRlTW9kdWxlSWQ/LmluY2x1ZGVzKCcvcHVibGljL2F1dGgvJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnYXV0aC9bbmFtZV0uanMnO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gJ1tuYW1lXS5qcyc7XG4gICAgICAgIH0sXG4gICAgICAgIGNodW5rRmlsZU5hbWVzOiAoY2h1bmtJbmZvKSA9PiB7XG4gICAgICAgICAgLy8gUHJldmVudCB1bmRlcnNjb3JlIHByZWZpeGVzIGluIGNodW5rIG5hbWVzXG4gICAgICAgICAgY29uc3QgbmFtZSA9IGNodW5rSW5mby5uYW1lIHx8ICdjaHVuayc7XG4gICAgICAgICAgcmV0dXJuIG5hbWUuc3RhcnRzV2l0aCgnXycpID8gbmFtZS5zdWJzdHJpbmcoMSkgKyAnLmpzJyA6ICdbbmFtZV0uanMnO1xuICAgICAgICB9LFxuICAgICAgICBhc3NldEZpbGVOYW1lczogKGFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgIGlmIChhc3NldEluZm8ubmFtZT8uZW5kc1dpdGgoJy5jc3MnKSkge1xuICAgICAgICAgICAgaWYgKGFzc2V0SW5mby5uYW1lLmluY2x1ZGVzKCdjb250ZW50LycpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAnY29udGVudC9bbmFtZV1bZXh0bmFtZV0nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGFzc2V0SW5mby5uYW1lLmluY2x1ZGVzKCdwb3B1cC8nKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3BvcHVwL1tuYW1lXVtleHRuYW1lXSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXNzZXRJbmZvLm5hbWUuaW5jbHVkZXMoJ3NpZGViYXIvJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdzaWRlYmFyL1tuYW1lXVtleHRuYW1lXSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXNzZXRJbmZvLm5hbWUuaW5jbHVkZXMoJ29uYm9hcmRpbmcvJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdvbmJvYXJkaW5nL1tuYW1lXVtleHRuYW1lXSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXNzZXRJbmZvLm5hbWUuaW5jbHVkZXMoJ2F1dGgvJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdhdXRoL1tuYW1lXVtleHRuYW1lXSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiAnW25hbWVdW2V4dG5hbWVdJztcbiAgICAgICAgfSxcbiAgICAgICAgbWFudWFsQ2h1bmtzOiAoaWQpID0+IHtcbiAgICAgICAgICAvLyBQcmV2ZW50IGF1dG9tYXRpYyBjaHVua2luZyB0aGF0IGNyZWF0ZXMgdW5kZXJzY29yZSBmaWxlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzJykpIHtcbiAgICAgICAgICAgIHJldHVybiAndmVuZG9yJztcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgb3V0RGlyOiAnZGlzdCcsXG4gICAgZW1wdHlPdXREaXI6IHRydWUsXG4gICAgY29tbW9uanNPcHRpb25zOiB7XG4gICAgICBpbmNsdWRlOiBbL25vZGVfbW9kdWxlcy9dLFxuICAgICAgdHJhbnNmb3JtTWl4ZWRFc01vZHVsZXM6IHRydWVcbiAgICB9XG4gIH0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiByZXNvbHZlKF9fZGlybmFtZSwgJ3NyYycpXG4gICAgfVxuICB9LFxuICBkZWZpbmU6IHtcbiAgICBnbG9iYWw6ICdnbG9iYWxUaGlzJyxcbiAgfVxufSk7Il0sCiAgIm1hcHBpbmdzIjogIjtBQUF5TixTQUFTLG9CQUFvQjtBQUN0UCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlO0FBRnhCLElBQU0sbUNBQW1DO0FBSXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsY0FBYztBQUFBLElBQ3hCLFNBQVMsQ0FBQyx1QkFBdUI7QUFBQSxFQUNuQztBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLE1BQ2IsVUFBVTtBQUFBO0FBQUE7QUFBQSxNQUdWO0FBQUEsSUFDRjtBQUFBLElBQ0EsZUFBZTtBQUFBLE1BQ2IsT0FBTztBQUFBLFFBQ0wsTUFBTSxRQUFRLGtDQUFXLFlBQVk7QUFBQSxNQUN2QztBQUFBLE1BQ0EsUUFBUTtBQUFBLFFBQ04sS0FBSztBQUFBLFFBQ0wsUUFBUTtBQUFBO0FBQUEsUUFDUixnQkFBZ0IsQ0FBQyxjQUFjO0FBQzdCLGNBQUksVUFBVSxnQkFBZ0IsU0FBUyxjQUFjLEdBQUc7QUFDdEQsbUJBQU87QUFBQSxVQUNUO0FBQ0EsY0FBSSxVQUFVLGdCQUFnQixTQUFTLFdBQVcsR0FBRztBQUNuRCxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxjQUFJLFVBQVUsZ0JBQWdCLFNBQVMsU0FBUyxHQUFHO0FBQ2pELG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksVUFBVSxnQkFBZ0IsU0FBUyxXQUFXLEdBQUc7QUFDbkQsbUJBQU87QUFBQSxVQUNUO0FBQ0EsY0FBSSxVQUFVLGdCQUFnQixTQUFTLGNBQWMsR0FBRztBQUN0RCxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxjQUFJLFVBQVUsZ0JBQWdCLFNBQVMsZUFBZSxHQUFHO0FBQ3ZELG1CQUFPO0FBQUEsVUFDVDtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsZ0JBQWdCLENBQUMsY0FBYztBQUU3QixnQkFBTSxPQUFPLFVBQVUsUUFBUTtBQUMvQixpQkFBTyxLQUFLLFdBQVcsR0FBRyxJQUFJLEtBQUssVUFBVSxDQUFDLElBQUksUUFBUTtBQUFBLFFBQzVEO0FBQUEsUUFDQSxnQkFBZ0IsQ0FBQyxjQUFjO0FBQzdCLGNBQUksVUFBVSxNQUFNLFNBQVMsTUFBTSxHQUFHO0FBQ3BDLGdCQUFJLFVBQVUsS0FBSyxTQUFTLFVBQVUsR0FBRztBQUN2QyxxQkFBTztBQUFBLFlBQ1Q7QUFDQSxnQkFBSSxVQUFVLEtBQUssU0FBUyxRQUFRLEdBQUc7QUFDckMscUJBQU87QUFBQSxZQUNUO0FBQ0EsZ0JBQUksVUFBVSxLQUFLLFNBQVMsVUFBVSxHQUFHO0FBQ3ZDLHFCQUFPO0FBQUEsWUFDVDtBQUNBLGdCQUFJLFVBQVUsS0FBSyxTQUFTLGFBQWEsR0FBRztBQUMxQyxxQkFBTztBQUFBLFlBQ1Q7QUFDQSxnQkFBSSxVQUFVLEtBQUssU0FBUyxPQUFPLEdBQUc7QUFDcEMscUJBQU87QUFBQSxZQUNUO0FBQUEsVUFDRjtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsY0FBYyxDQUFDLE9BQU87QUFFcEIsY0FBSSxHQUFHLFNBQVMsY0FBYyxHQUFHO0FBQy9CLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsSUFDYixpQkFBaUI7QUFBQSxNQUNmLFNBQVMsQ0FBQyxjQUFjO0FBQUEsTUFDeEIseUJBQXlCO0FBQUEsSUFDM0I7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLFFBQVEsa0NBQVcsS0FBSztBQUFBLElBQy9CO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sUUFBUTtBQUFBLEVBQ1Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
