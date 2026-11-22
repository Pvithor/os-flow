import fs from 'node:fs';

const EVENT_LABELS = {
  CSRF_BLOCKED: 'Bloqueio CSRF (Origin/Referer inválido)',
  RATE_LIMITED: 'Bloqueio por excesso de tentativas (429)',
  SETUP_BLOCKED: 'Tentativa de setup após configuração inicial',
  LOGIN_FAILED: 'Tentativa de login inválida',
  UNAUTHORIZED_API: 'Tentativa de acesso sem autenticação',
  SENSITIVE_PROBE: 'Sondagem de arquivo ou rota restrita (404)',
  AUTH_SUCCESS: 'Acesso autenticado / alteração de credencial',
  REQUEST_RECEIVED: 'Requisição HTTP recebida'
};

/** Carrega variáveis de ambiente de um arquivo .env local, caso exista. */
export function loadEnvIfPresent(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return false;
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    return true;
  }
  return false;
}

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

function formatAlertTime() {
  if (PT_BR_TIME_FORMATTER) {
    return PT_BR_TIME_FORMATTER.format(new Date());
  }
  return new Date().toISOString();
}

/** Cria notificador assíncrono para alertas de segurança no Telegram com proteção anti-flood. */
export function createTelegramNotifier({
  botToken,
  chatId,
  cooldownMs = 10000,
  apiBaseUrl = 'https://api.telegram.org',
  fetchImpl = fetch
} = {}) {
  const cleanToken = String(botToken || '').trim();
  let activeChatId = String(chatId || '').trim();

  if (!cleanToken || !activeChatId) {
    return {
      enabled: false,
      notify: () => {},
      sendRaw: async () => ({ ok: false, skipped: true })
    };
  }

  const cleanBase = String(apiBaseUrl).replace(/\/+$/, '');
  const cooldownMap = new Map();
  const normalizedCooldown = Math.max(0, Number(cooldownMs) || 0);

  async function postSendMessage(targetChatId, text) {
    const res = await fetchImpl(`${cleanBase}/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: String(text || '').slice(0, 4000),
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(5000)
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return { res, data };
  }

  async function sendRaw(text) {
    try {
      let { res, data } = await postSendMessage(activeChatId, text);
      if (res.ok && data?.ok !== false) {
        return { ok: true, chatId: activeChatId, migratedTo: null };
      }

      const migratedId = data?.parameters?.migrate_to_chat_id;
      if (migratedId !== undefined && migratedId !== null) {
        const nextChatId = String(migratedId);
        activeChatId = nextChatId;
        ({ res, data } = await postSendMessage(activeChatId, text));
        if (res.ok && data?.ok !== false) {
          return { ok: true, chatId: activeChatId, migratedTo: nextChatId };
        }
      }

      return {
        ok: false,
        status: res.status,
        description: typeof data?.description === 'string' ? data.description : `HTTP ${res.status}`,
        chatId: activeChatId
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        description: err instanceof Error ? err.name : 'NetworkError',
        chatId: activeChatId
      };
    }
  }

  function notify({ type, ip = '', method = '', path = '', userAgent = '', detail = '', username = '' } = {}) {
    const key =
      type === 'SENSITIVE_PROBE'
        ? `SENSITIVE_PROBE:${ip || '-'}`
        : `${type || 'EVENT'}:${ip || '-'}:${path || '-'}`;
    const now = Date.now();
    const prev = cooldownMap.get(key);

    if (normalizedCooldown > 0 && prev && now - prev.lastSentAt < normalizedCooldown) {
      prev.suppressed += 1;
      return;
    }

    const suppressedCount = prev?.suppressed || 0;
    if (cooldownMap.size > 500) {
      cooldownMap.clear();
    }
    cooldownMap.set(key, { lastSentAt: now, suppressed: 0 });

    const lines = [`[OS FLOW] ${EVENT_LABELS[type] || type || 'Alerta de Segurança'}`];
    if (method || path) lines.push(`Rota: ${[method, path].filter(Boolean).join(' ')}`);
    lines.push(`IP: ${ip || 'desconhecido'}`);
    if (username) lines.push(`Usuário: ${username}`);
    if (detail) lines.push(`Detalhe: ${detail}`);
    if (suppressedCount > 0) lines.push(`Eventos suprimidos no cooldown: +${suppressedCount}`);
    if (userAgent) lines.push(`Agente: ${String(userAgent).slice(0, 140)}`);
    lines.push(`Horário: ${formatAlertTime()}`);

    void sendRaw(lines.join('\n')).then((result) => {
      if (!result.ok && !result.skipped) {
        console.warn(`[OS FLOW] Falha ao enviar alerta Telegram (${result.description || result.status})`);
      }
    });
  }

  return {
    enabled: true,
    notify,
    sendRaw
  };
}
