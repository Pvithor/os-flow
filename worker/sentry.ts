import type { WorkerEnv } from './types';

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

function parseSentryDsn(rawDsn: string | undefined): ParsedDsn | null {
  const clean = String(rawDsn || '').trim();
  if (!clean) return null;
  try {
    const url = new URL(clean);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '');
    const publicKey = url.username;
    if (!publicKey || !projectId || !url.host) return null;
    const basePath = url.pathname.slice(0, url.pathname.lastIndexOf('/'));
    return {
      endpoint: `${url.protocol}//${url.host}${basePath}/api/${projectId}/envelope/`,
      publicKey
    };
  } catch {
    return null;
  }
}

function generateEventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/** Reporta exceções do Worker para o Sentry via Envelope HTTPS API (sem dependências pesadas). */
export async function captureWorkerException(
  err: unknown,
  env: Partial<WorkerEnv>,
  context: { method?: string; path?: string; status?: number } = {},
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const parsed = parseSentryDsn(env.SENTRY_DSN);
  if (!parsed) return;

  const errorObj = err instanceof Error ? err : new Error(String(err || 'WorkerError'));
  const eventId = generateEventId();
  const sentAt = new Date().toISOString();

  const header = JSON.stringify({
    event_id: eventId,
    sent_at: sentAt
  });
  const itemHeader = JSON.stringify({ type: 'event' });
  const payload = JSON.stringify({
    event_id: eventId,
    timestamp: Math.floor(Date.now() / 1000),
    platform: 'javascript',
    level: 'error',
    environment: 'production',
    release: env.CF_VERSION_METADATA?.id || undefined,
    server_name: 'os-flow-worker',
    exception: {
      values: [
        {
          type: errorObj.name || 'Error',
          value: String(errorObj.message || 'Erro inesperado no Worker').slice(0, 500)
        }
      ]
    },
    tags: {
      runtime: 'cloudflare-worker',
      http_method: context.method || 'UNKNOWN',
      http_status: String(context.status || 500)
    },
    request: context.path
      ? {
          method: context.method || 'GET',
          url: context.path
        }
      : undefined
  });

  try {
    await fetchImpl(parsed.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=os-flow-worker/1.0, sentry_key=${parsed.publicKey}`
      },
      body: `${header}\n${itemHeader}\n${payload}`
    });
  } catch {
    // Nunca quebra a resposta se o Sentry estiver indisponível
  }
}
