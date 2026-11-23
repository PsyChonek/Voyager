// Error reporting hook. No-op unless PUBLIC_SENTRY_DSN is set at build time.
import { logger } from './logger';

const dsn = import.meta.env.PUBLIC_SENTRY_DSN as string | undefined;
let sentry: Promise<typeof import('@sentry/browser')> | null = null;

export function initErrorReporting(): void {
  if (!dsn || sentry) return;
  sentry = import('@sentry/browser').then((mod) => {
    mod.init({ dsn, tracesSampleRate: 0 });
    return mod;
  });
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  logger.error('error', { error: String(error), ...context });
  void sentry?.then((mod) => mod.captureException(error, { extra: context }));
}
