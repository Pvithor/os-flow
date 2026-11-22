import type { WorkerEnv } from './types';

const EVENT_LABELS: Record<string, string> = {
  CSRF_BLOCKED: 'Bloqueio CSRF (Origin/Referer inválido)',
  RATE_LIMITED: 'Bloqueio por excesso de tentativas (429)',
  SETUP_BLOCKED: 'Tentativa de setup após configuração inicial',
  LOGIN_FAILED: 'Tentativa de login inválida',
  UNAUTHORIZED_API: 'Tentativa de acesso sem autenticação',
  SENSITIVE_PROBE: 'Sondagem de arquivo ou rota restrita (404)',
  AUTH_SUCCESS: 'Acesso autenticado / alteração de credencial',
  REQUEST_RECEIVED: 'Requisição HTTP recebida',
  INTERNAL_ERROR: 'Erro interno no Worker (500)'
};

const PT_BR_TIME_FORMATTER = (() => {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Cuiaba',
      dateStyle: 'short',
      timeStyle: 'medium'
    });
  } catch {
    return null;
  }
})();

function formatAlertTime(): string {
  if (PT_BR_TIME_FORMATTER) {
    return PT_BR_TIME_FORMATTER.format(new Date());
  }
  return new Date().toISOString();
}

export interface SecurityAlertEvent {
  type: string;
  ip?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  detail?: string;
  username?: string;
}

export interface TelegramNotifier {
  enabled: boolean;
  notify: (event: SecurityAlertEvent) => Promise<void>;
  sendRaw: (text: string) => Promise<{ ok: boolean; skipped?: boolean; status?: number; migratedTo?: string | null }>;
}

/** Cria notificador assíncrono para Telegram no Worker com anti-flood e proteção de credenciais. */
export function createWorkerTelegramNotifier(
  env: Partial<WorkerEnv>,
  fetchImpl: typeof fetch = fetch,
  apiBaseUrl = 'https://api.telegram.org'
): TelegramNotifier {
  const cleanToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  let activeChatId = String(env.TELEGRAM_CHAT_ID || '').trim();

  if (!cleanToken || !activeChatId) {
    return {
      enabled: false,
      notify: async () => {},
      sendRaw: async () => ({ ok: false, skipped: true })
    };
  }

  const cleanBase = String(apiBaseUrl).replace(/\/+$/, '');
  const cooldownMs = Math.max(0, Number(env.TELEGRAM_ALERT_COOLDOWN_MS) || 10_000);
  const cooldownMap = new Map<string, { lastSentAt: number; suppressed: number }>();

  async function postSendMessage(targetChatId: string, text: string) {
    const res = await fetchImpl(`${cleanBase}/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: String(text || '').slice(0, 4000),
        disable_web_page_preview: true
      })
    });

    let data: { ok?: boolean; description?: string; parameters?: { migrate_to_chat_id?: number | string } } | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { res, data };
  }

  async function sendRaw(
    text: string
  ): Promise<{ ok: boolean; skipped?: boolean; status?: number; migratedTo?: string | null }> {
    try {
      let { res, data } = await postSendMessage(activeChatId, text);
      if (res.ok && data?.ok !== false) {
        return { ok: true, migratedTo: null };
      }

      const migratedId = data?.parameters?.migrate_to_chat_id;
      if (migratedId !== undefined && migratedId !== null) {
        activeChatId = String(migratedId);
        ({ res, data } = await postSendMessage(activeChatId, text));
        if (res.ok && data?.ok !== false) {
          return { ok: true, migratedTo: activeChatId };
        }
      }

      return { ok: false, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  async function notify(event: SecurityAlertEvent): Promise<void> {
    const key =
      event.type === 'SENSITIVE_PROBE'
        ? `SENSITIVE_PROBE:${event.ip || '-'}`
        : `${event.type || 'EVENT'}:${event.ip || '-'}:${event.path || '-'}`;
    const now = Date.now();
    const prev = cooldownMap.get(key);

    if (cooldownMs > 0 && prev && now - prev.lastSentAt < cooldownMs) {
      prev.suppressed += 1;
      return;
    }

    const suppressedCount = prev?.suppressed || 0;
    if (cooldownMap.size > 500) {
      cooldownMap.clear();
    }
    cooldownMap.set(key, { lastSentAt: now, suppressed: 0 });

    const lines = [`[OS FLOW] ${EVENT_LABELS[event.type] || event.type || 'Alerta de Segurança'}`];
    if (event.method || event.path) {
      lines.push(`Rota: ${[event.method, event.path].filter(Boolean).join(' ')}`);
    }
    lines.push(`IP: ${event.ip || 'desconhecido'}`);
    if (event.username) lines.push(`Usuário: ${event.username}`);
    if (event.detail) lines.push(`Detalhe: ${event.detail}`);
    if (suppressedCount > 0) lines.push(`Eventos suprimidos no cooldown: +${suppressedCount}`);
    if (event.userAgent) lines.push(`Agente: ${String(event.userAgent).slice(0, 140)}`);
    lines.push(`Horário: ${formatAlertTime()}`);

    const result = await sendRaw(lines.join('\n'));
    if (!result.ok && !result.skipped) {
      console.warn(`[OS FLOW] Falha ao enviar alerta Telegram (status ${result.status ?? 'erro'})`);
    }
  }

  return {
    enabled: true,
    notify,
    sendRaw
  };
}
