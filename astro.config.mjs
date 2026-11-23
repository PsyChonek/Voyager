// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Optional cookieless analytics: allow its origin in the CSP only when configured.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: analytics stays off.
}
const analyticsSrc = process.env.PUBLIC_ANALYTICS_SRC;
const analyticsOrigin = analyticsSrc ? new URL(analyticsSrc).origin : '';
/** @type {`connect-src${string}`} */
const connectSrc = `connect-src 'self' blob: data: https://*.ingest.sentry.io https://*.ingest.de.sentry.io${analyticsOrigin ? ` ${analyticsOrigin}` : ''}`;

export default defineConfig({
  site: 'https://voyager.vazac.dev',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'cs',
    locales: ['cs', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    react(),
    sitemap({
      i18n: { defaultLocale: 'cs', locales: { cs: 'cs-CZ', en: 'en' } },
    }),
  ],
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        connectSrc,
        "worker-src 'self' blob:",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // React positions elements with style attributes; scripts and <style> stay hash-locked.
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
      scriptDirective: {
        resources: ["'self'", "'wasm-unsafe-eval'", ...(analyticsOrigin ? [analyticsOrigin] : [])],
      },
    },
  },
  build: { inlineStylesheets: 'auto' },
});
