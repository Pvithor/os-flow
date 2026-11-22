import type { WorkOrder, WorkerEnv } from './types';

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseRecipients(raw: string | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

export interface EmailNotifier {
  enabled: boolean;
  sendUrgentOrderEmail: (order: WorkOrder) => Promise<void>;
  sendSecurityEmail: (event: {
    type: string;
    ip?: string;
    path?: string;
    detail?: string;
    username?: string;
  }) => Promise<void>;
}

/** Cria cliente Resend leve via fetch para alertar O.S urgentes e incidentes críticos sem exceder 100/dia grátis. */
export function createEmailNotifier(
  env: Partial<WorkerEnv>,
  fetchImpl: typeof fetch = fetch
): EmailNotifier {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const recipients = parseRecipients(env.ALERT_EMAIL_TO);
  const from = String(env.RESEND_FROM || 'OS Flow <onboarding@resend.dev>').trim();

  if (!apiKey || recipients.length === 0) {
    return {
      enabled: false,
      sendUrgentOrderEmail: async () => {},
      sendSecurityEmail: async () => {}
    };
  }

  async function sendEmail(subject: string, text: string, html: string): Promise<void> {
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject: subject.slice(0, 180),
          text,
          html
        })
      });
      if (!res.ok) {
        console.warn(`[OS FLOW] Falha no envio Resend (status ${res.status})`);
      }
    } catch {
      console.warn('[OS FLOW] Erro de rede ao enviar e-mail via Resend');
    }
  }

  return {
    enabled: true,
    async sendUrgentOrderEmail(order: WorkOrder): Promise<void> {
      const subject = `[OS FLOW • URGENTE] ${order.code} - ${order.unit}`;
      const text = [
        `Nova O.S URGENTE registrada no OS FLOW`,
        `Código: ${order.code}`,
        `Unidade: ${order.unit}`,
        order.sector ? `Setor: ${order.sector}` : '',
        `Título: ${order.title}`,
        `Descrição: ${order.description}`,
        `Registrada por: ${order.createdBy}`
      ]
        .filter(Boolean)
        .join('\n');

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="color: #dc2626; margin: 0 0 12px;">O.S URGENTE: ${escapeHtml(order.code)}</h2>
          <p><strong>Unidade:</strong> ${escapeHtml(order.unit)}</p>
          ${order.sector ? `<p><strong>Setor:</strong> ${escapeHtml(order.sector)}</p>` : ''}
          <p><strong>Título:</strong> ${escapeHtml(order.title)}</p>
          <p><strong>Descrição:</strong> ${escapeHtml(order.description)}</p>
          <p><strong>Registrada por:</strong> ${escapeHtml(order.createdBy)}</p>
        </div>
      `.trim();

      await sendEmail(subject, text, html);
    },
    async sendSecurityEmail(event): Promise<void> {
      const subject = `[OS FLOW • SEGURANÇA] ${event.type}`;
      const text = [
        `Evento crítico de segurança no OS FLOW`,
        `Tipo: ${event.type}`,
        event.path ? `Rota: ${event.path}` : '',
        `IP: ${event.ip || 'desconhecido'}`,
        event.username ? `Usuário: ${event.username}` : '',
        event.detail ? `Detalhe: ${event.detail}` : ''
      ]
        .filter(Boolean)
        .join('\n');

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="color: #b45309; margin: 0 0 12px;">Alerta de Segurança: ${escapeHtml(event.type)}</h2>
          ${event.path ? `<p><strong>Rota:</strong> ${escapeHtml(event.path)}</p>` : ''}
          <p><strong>IP:</strong> ${escapeHtml(event.ip || 'desconhecido')}</p>
          ${event.username ? `<p><strong>Usuário:</strong> ${escapeHtml(event.username)}</p>` : ''}
          ${event.detail ? `<p><strong>Detalhe:</strong> ${escapeHtml(event.detail)}</p>` : ''}
        </div>
      `.trim();

      await sendEmail(subject, text, html);
    }
  };
}
