import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';

let initialized = false;
let posthogReady = false;

export function initTelemetry(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const sentryDsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1
    });
  }

  const posthogKey = String(import.meta.env.VITE_POSTHOG_KEY || '').trim();
  if (posthogKey) {
    const posthogHost = String(
      import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
    ).trim();
    posthog.init(posthogKey, {
      api_host: posthogHost,
      autocapture: false,
      capture_pageview: true,
      disable_external_dependency_loading: true,
      persistence: 'localStorage'
    });
    posthogReady = true;
  }
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, string | number | boolean>
): void {
  if (!posthogReady) return;
  try {
    posthog.capture(eventName, properties);
  } catch {
    // Nunca interrompe fluxo do app por falha de telemetria
  }
}

export { Sentry };
