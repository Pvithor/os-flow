import type { WorkOrder } from '../types';

export function pad2(n: number): string {
  return String(Math.floor(Math.max(0, n))).padStart(2, '0');
}

export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function getTimezoneLabel(date: Date = new Date()): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absHours = Math.floor(Math.abs(offsetMin) / 60);
  const remMin = Math.abs(offsetMin) % 60;
  return remMin === 0 ? `GMT${sign}${absHours}` : `GMT${sign}${absHours}:${pad2(remMin)}`;
}

export function formatDateTimePt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${day}/${month}/${year} às ${hh}:${mm}`;
}

export function formatTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatRelativePt(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return 'agora';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'agora';
  const diffMin = Math.max(0, Math.floor((nowMs - ms) / 60_000));
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin === 1) return 'há 1 min';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return 'há 1h';
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? 'ontem' : `há ${diffDays}d`;
}

export function formatSmartAdded(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Hoje às ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return formatDateTimePt(iso);
}

export function getLiveElapsedSeconds(order: WorkOrder, nowMs: number = Date.now()): number {
  const base = Number(order.elapsedSeconds || 0);
  if (order.status === 'in_progress' && order.startedAt) {
    const startMs = Date.parse(order.startedAt);
    if (Number.isFinite(startMs)) {
      return base + Math.max(0, Math.floor((nowMs - startMs) / 1000));
    }
  }
  return base;
}

export function formatDurationHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}h ${pad2(m)}m ${pad2(sec)}s`;
}

export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h}h ${pad2(m)}m`;
  return `${Math.max(1, m)} min`;
}

export function toLocalDatetimeInputValue(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
