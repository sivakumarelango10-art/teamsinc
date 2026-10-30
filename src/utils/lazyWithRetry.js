import { lazy } from 'react';

/**
 * Checks whether an error is caused by a missing chunk / dynamic import failure
 * typically due to a new production deployment replacing chunk hashes.
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  const name = (error.name || '').toLowerCase();

  return (
    name === 'chunkloaderror' ||
    name === 'typeerror' && message.includes('dynamically imported module') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('loading dynamic import') ||
    message.includes('failed to load module script')
  );
}

/**
 * Wraps React.lazy() with automated chunk-loading error recovery.
 *
 * If a new deployment has replaced asset hashes while the user has an open tab,
 * navigating to a lazy-loaded route can fail with "Failed to fetch dynamically imported module".
 *
 * This utility:
 * 1. Catches the chunk fetch failure.
 * 2. Uses sessionStorage to prevent infinite reload loops (one-time bounded recovery).
 * 3. Automatically reloads the current page to retrieve the fresh HTML entry point & chunk manifest.
 * 4. Cleans up reload markers on successful component loading.
 */
export function lazyWithRetry(componentImport, componentName = 'chunk') {
  return lazy(async () => {
    const reloadKey = `teamsync_reload_${componentName}`;

    try {
      const module = await componentImport();

      // On successful import, clear any prior reload markers for this module
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          sessionStorage.removeItem(reloadKey);
        } catch {}
      }

      return module;
    } catch (error) {
      console.warn(`[TeamSync] Dynamic import failure detected for ${componentName}:`, error);

      if (typeof window !== 'undefined' && isChunkLoadError(error)) {
        try {
          const lastReload = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
          const now = Date.now();

          // Only attempt automated reload once per 20-second window
          if (!lastReload || now - lastReload > 20000) {
            sessionStorage.setItem(reloadKey, now.toString());
            console.warn(`[TeamSync] Attempting one-time automatic page refresh to recover stale chunk: ${componentName}`);
            
            // Perform clean refresh to fetch current HTML and manifest
            window.location.reload();
            
            // Return an unresolved promise so React holds rendering until reload completes
            return new Promise(() => {});
          }
        } catch (storageErr) {
          console.error('[TeamSync] sessionStorage access failed during chunk reload:', storageErr);
        }
      }

      // If already reloaded or not a chunk error, bubble error to ChunkErrorBoundary
      throw error;
    }
  });
}

export default lazyWithRetry;

