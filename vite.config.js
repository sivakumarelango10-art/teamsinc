import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function apiMiddlewarePlugin() {
  return {
    name: 'teamsync-api-middleware',
    async configureServer(server) {
      const { app } = await import('./server/app.js');
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url.startsWith('/api') || req.url === '/api')) {
          return app(req, res, next);
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiMiddlewarePlugin()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'esnext',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('/react/')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('date-fns')) {
              return 'vendor-date';
            }
          }
        }
      }
    },
    chunkSizeWarningLimit: 800
  }
});
