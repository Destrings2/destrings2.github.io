// vitest/config's defineConfig understands the `test` block; vite's does not.
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';

/**
 * GitHub Pages serves a project site from a subdirectory, so the base path is
 * whatever the workflow passes in. Locally, and for a user or custom-domain
 * site, it stays '/'.
 */
const base = process.env['VITE_BASE_PATH'] ?? '/';

/**
 * Pages has no rewrite rules, so a deep link like /join/ABCD2345 would 404.
 * Serving the same shell as the 404 document is the accepted way round it:
 * the app boots, reads the path, and carries on. The status code is still 404,
 * which browsers render regardless and search engines are welcome to believe.
 */
function pagesSpaFallback(): Plugin {
  return {
    name: 'pages-spa-fallback',
    closeBundle() {
      const out = fileURLToPath(new URL('./dist', import.meta.url));
      copyFileSync(join(out, 'index.html'), join(out, '404.html'));
      // Stops Pages running the output through Jekyll, which drops anything
      // beginning with an underscore.
      writeFileSync(join(out, '.nojekyll'), '');
    },
  };
}

/**
 * A hand-rolled service worker, generated at build time so it can precache
 * exactly the files this build emitted. Hashed assets are immutable, so
 * cache-first is safe for them; navigations go network-first and fall back to
 * the cached shell, which is what makes the app open with no signal at all.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle).filter((file) => file !== 'sw.js');
      // public/ files are copied outside the bundle, so they are named here.
      const fromPublic = [
        'index.html',
        'manifest.webmanifest',
        'favicon.svg',
        'icons/icon.svg',
        'icons/icon-180.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
      ];
      const assets = [...new Set([...emitted, ...fromPublic])].map((file) => base + file);

      // The cache name only changes when the file list does, so a rebuild
      // that changes nothing does not throw the cache away.
      let hash = 5381;
      for (const ch of assets.join('|')) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;

      const sw = `const CACHE = 'rota-${hash.toString(36)}';
const SHELL = '${base}index.html';
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== location.origin) return;

  // Deep links offline: any navigation falls back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(SHELL)));
    return;
  }

  // Precached (hashed, immutable) assets come from the cache; anything else
  // -- there is nothing else same-origin -- passes through to the network.
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), pagesSpaFallback(), serviceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
