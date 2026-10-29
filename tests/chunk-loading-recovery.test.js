import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { isChunkLoadError } from '../src/utils/lazyWithRetry.js';

describe('TeamSync Chunk Loading & Safe Recovery Test Suite', () => {
  it('1. Correctly classifies genuine chunk loading / dynamic import failures', () => {
    const chunkErrors = [
      new TypeError('Failed to fetch dynamically imported module: https://team.sincommunity.in/assets/TeamChat-CoYaex1P.js'),
      new Error('error loading dynamically imported module: /assets/TeamChat-12345.js'),
      new Error('Importing a module script failed.'),
      new Error('Loading chunk 42 failed.'),
      new Error('Loading dynamic import failed: https://team.sincommunity.in/assets/Reports.js'),
      { name: 'ChunkLoadError', message: 'Loading chunk failed' }
    ];

    for (const err of chunkErrors) {
      assert.strictEqual(
        isChunkLoadError(err),
        true,
        `Expected error "${err.message}" to be identified as a chunk load error`
      );
    }
  });

  it('2. Rejects ordinary application errors from triggering chunk reload recovery', () => {
    const ordinaryErrors = [
      new TypeError("Cannot read properties of undefined (reading 'map')"),
      new Error('Network request failed: 500 Internal Server Error'),
      new Error('Failed to create ticket: title is required'),
      new ReferenceError('profile is not defined'),
      new Error('Invalid credentials. Please check your email or password.'),
      null,
      undefined
    ];

    for (const err of ordinaryErrors) {
      assert.strictEqual(
        isChunkLoadError(err),
        false,
        `Expected error "${err?.message}" NOT to be identified as a chunk load error`
      );
    }
  });

  it('3. vercel.json enforces revalidation on HTML and immutable caching on assets', () => {
    const vercelConfigPath = path.resolve('vercel.json');
    assert.ok(fs.existsSync(vercelConfigPath), 'vercel.json must exist');

    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    // Check index.html cache control
    const indexHeader = config.headers.find(h => h.source === '/index.html');
    assert.ok(indexHeader, 'vercel.json must define headers for /index.html');
    const indexCache = indexHeader.headers.find(h => h.key === 'Cache-Control');
    assert.ok(indexCache, 'index.html must have a Cache-Control header');
    assert.match(indexCache.value, /max-age=0.*must-revalidate/, 'index.html must revalidate immediately');

    // Check /assets/(.*) cache control
    const assetsHeader = config.headers.find(h => h.source === '/assets/(.*)');
    assert.ok(assetsHeader, 'vercel.json must define headers for /assets/(.*)');
    const assetsCache = assetsHeader.headers.find(h => h.key === 'Cache-Control');
    assert.ok(assetsCache, 'assets must have Cache-Control header');
    assert.match(assetsCache.value, /immutable/, 'Hashed assets must be immutable');

    // Check rewrite rule does not rewrite /assets/ to /index.html
    const spaRewrite = config.rewrites.find(r => r.destination === '/index.html');
    assert.ok(spaRewrite, 'Must have SPA rewrite to index.html');
    assert.ok(
      spaRewrite.source.includes('assets/'),
      'SPA rewrite must exclude /assets/ so missing JS assets return 404 instead of HTML'
    );
  });

  it('4. TeamChat is protected with lazyWithRetry and ChunkErrorBoundary in AppRoutes', () => {
    const appRoutesPath = path.resolve('src/routes/AppRoutes.jsx');
    const content = fs.readFileSync(appRoutesPath, 'utf8');

    assert.ok(
      content.includes("lazyWithRetry(() => import('../pages/chat/TeamChat'), 'TeamChat')"),
      'TeamChat must be wrapped in lazyWithRetry'
    );

    assert.ok(
      content.includes('<ChunkErrorBoundary routeName="Chats">'),
      'TeamChat route must be wrapped in ChunkErrorBoundary'
    );
  });

  it('5. Vite preloadError event listener is installed in main.jsx', () => {
    const mainPath = path.resolve('src/main.jsx');
    const content = fs.readFileSync(mainPath, 'utf8');

    assert.ok(
      content.includes('vite:preloadError'),
      'main.jsx must register vite:preloadError event listener'
    );
  });

  it('6. KalviLearn Integration Hub remains completely untouched and protected', () => {
    const appRoutesPath = path.resolve('src/routes/AppRoutes.jsx');
    const content = fs.readFileSync(appRoutesPath, 'utf8');

    // Confirm KalviLearnHub retains its exact import and route structure
    assert.ok(
      content.includes("const KalviLearnHub = lazy(() => import('../pages/integrations/KalviLearnHub'));"),
      'KalviLearnHub lazy import must remain preserved'
    );

    assert.ok(
      content.includes('path="/integrations/kalvilearn"'),
      'KalviLearn route path must remain untouched'
    );

    // Confirm file exists unchanged
    const klHubPath = path.resolve('src/pages/integrations/KalviLearnHub.jsx');
    assert.ok(fs.existsSync(klHubPath), 'KalviLearnHub.jsx must exist');
  });
});
