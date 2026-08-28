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

export default defineConfig({
  base,
  plugins: [react(), pagesSpaFallback()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
