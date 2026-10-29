import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import './index.css';

// Automated Vite Chunk / Module Preload Error Recovery
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[TeamSync] Vite module preload error detected:', event);
    const key = 'teamsync_preload_reload';
    try {
      const lastReload = parseInt(sessionStorage.getItem(key) || '0', 10);
      const now = Date.now();
      // Bounded retry: only auto-reload once per 20 seconds to prevent infinite loops
      if (!lastReload || now - lastReload > 20000) {
        sessionStorage.setItem(key, now.toString());
        event.preventDefault();
        window.location.reload();
      }
    } catch {}
  });

  // Clean stale reload markers after 30 seconds of stable session
  setTimeout(() => {
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('teamsync_reload_') || key.startsWith('teamsync_preload_')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch {}
  }, 30000);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
