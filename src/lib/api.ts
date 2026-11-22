import type { AppState, AuthStatus, AuthUser, CustomNotice, Operator, UnitItem, WorkOrder } from '../types';

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (
      res.status === 401 &&
      !url.startsWith('/api/auth/login') &&
      !url.startsWith('/api/auth/setup') &&
      !url.startsWith('/api/auth/status')
    ) {
      unauthorizedHandler?.();
    }
    const errMsg =
      (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Erro HTTP ${res.status}`);
    throw new Error(errMsg);
  }
  return data as T;
}

export const api = {
  getAuthStatus: () => requestJson<AuthStatus>('/api/auth/status'),

  setupAuth: (payload: { username: string; displayName?: string; password: string }) =>
    requestJson<{ authenticated: boolean; user: AuthUser }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  login: (payload: { username: string; password: string }) =>
    requestJson<{ authenticated: boolean; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  logout: () =>
    requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST'
    }),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    requestJson<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getState: () => requestJson<AppState>('/api/state'),

  createOrder: (payload: {
    unit: string;
    sector?: string;
    title?: string;
    description: string;
    createdAt?: string;
    urgent: boolean;
    startImmediately: boolean;
    operatorId?: string;
    createdBy?: string;
  }) =>
    requestJson<{ order: WorkOrder; state: AppState }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  claimOrder: (orderId: number, operatorId?: string) =>
    requestJson<{ order: WorkOrder; state: AppState }>(`/api/orders/${orderId}/claim`, {
      method: 'POST',
      body: JSON.stringify(operatorId ? { operatorId } : {})
    }),

  pauseOrder: (orderId: number, reason: string) =>
    requestJson<{ order: WorkOrder; state: AppState }>(`/api/orders/${orderId}/pause`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  resumeOrder: (orderId: number) =>
    requestJson<{ order: WorkOrder; state: AppState }>(`/api/orders/${orderId}/resume`, {
      method: 'POST'
    }),

  releaseOrder: (orderId: number) =>
    requestJson<{ order: WorkOrder; state: AppState }>(`/api/orders/${orderId}/release`, {
      method: 'POST'
    }),

  saveNotes: (orderId: number, notes: string) =>
    requestJson<{ order: WorkOrder; state: AppState }>(`/api/orders/${orderId}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes })
    }),

  completeOrder: (orderId: number, payload: { notes?: string; operatorId?: string; completedBy?: string }) =>
    requestJson<{ order: WorkOrder; state: AppState }>(`/api/orders/${orderId}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  reopenOrder: (orderId: number) =>
    requestJson<{ order: WorkOrder; state: AppState }>(`/api/orders/${orderId}/reopen`, {
      method: 'POST'
    }),

  deleteOrder: (orderId: number) =>
    requestJson<{ deletedId: number; state: AppState }>(`/api/orders/${orderId}`, {
      method: 'DELETE'
    }),

  createOperator: (payload: { name: string; badge?: string; station?: string; shift?: string; shiftGoal?: number }) =>
    requestJson<{ operator: Operator; state: AppState }>('/api/operators', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateOperator: (id: string, payload: { name: string; badge?: string; station?: string }) =>
    requestJson<{ operator: Operator; state: AppState }>(`/api/operators/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteOperator: (id: string) =>
    requestJson<{ deletedId: string; state: AppState }>(`/api/operators/${id}`, {
      method: 'DELETE'
    }),

  createUnit: (name: string) =>
    requestJson<{ unit: UnitItem; state: AppState }>('/api/units', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),

  updateUnit: (id: number, name: string) =>
    requestJson<{ unit: UnitItem; state: AppState }>(`/api/units/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    }),

  deleteUnit: (id: number) =>
    requestJson<{ deletedId: number; state: AppState }>(`/api/units/${id}`, {
      method: 'DELETE'
    }),

  ackAlert: (alertId: number) =>
    requestJson<{ ok: boolean; state: AppState }>(`/api/alerts/${alertId}/ack`, {
      method: 'PATCH'
    }),

  ackAllAlerts: () =>
    requestJson<{ ok: boolean; state: AppState }>('/api/alerts/ack-all', {
      method: 'POST'
    }),

  createNotice: (payload: { label?: string; text: string; author?: string }) =>
    requestJson<{ notice: CustomNotice; state: AppState }>('/api/notices', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateNotice: (id: number, payload: { label?: string; text: string }) =>
    requestJson<{ notice: CustomNotice; state: AppState }>(`/api/notices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteNotice: (id: number) =>
    requestJson<{ deletedId: number; state: AppState }>(`/api/notices/${id}`, {
      method: 'DELETE'
    }),

  getExportCsvUrl: (params: { status?: string; urgent?: string; operatorId?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set('status', params.status);
    if (params.urgent) sp.set('urgent', params.urgent);
    if (params.operatorId) sp.set('operatorId', params.operatorId);
    if (params.q) sp.set('q', params.q);
    return `/api/orders/export.csv?${sp.toString()}`;
  }
};

export interface StreamEventPayload {
  event: string;
  payload?: unknown;
  state: AppState;
}

export function subscribeEvents(
  onState: (data: StreamEventPayload) => void,
  onConnectionChange: (online: boolean) => void
): () => void {
  let closed = false;
  let sseEstablished = false;
  let pollingTimer: number | null = null;
  let pollingActive = false;

  const pollOnce = async () => {
    if (closed || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      const state = await api.getState();
      if (closed) return;
      onConnectionChange(true);
      onState({ event: 'poll', state });
    } catch {
      if (!closed) onConnectionChange(false);
    }
  };

  const handleVisibilityChange = () => {
    if (pollingActive && typeof document !== 'undefined' && !document.hidden) {
      void pollOnce();
    }
  };

  const startPolling = (intervalMs = 4000) => {
    if (closed || pollingActive) return;
    pollingActive = true;
    void pollOnce();
    pollingTimer = window.setInterval(() => {
      void pollOnce();
    }, intervalMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  };

  if (typeof EventSource === 'undefined') {
    startPolling();
    return () => {
      closed = true;
      if (pollingTimer !== null) window.clearInterval(pollingTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }

  const source = new EventSource('/api/events');

  const handleEvent = (eventName: string) => (ev: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(ev.data) as StreamEventPayload;
      sseEstablished = true;
      onConnectionChange(true);
      onState({ ...parsed, event: eventName });
    } catch {
      // ignore malformed frame
    }
  };

  const eventNames = [
    'connected',
    'order_created',
    'order_claimed',
    'order_paused',
    'order_resumed',
    'order_released',
    'order_updated',
    'order_completed',
    'order_reopened',
    'order_deleted',
    'operator_created',
    'operator_updated',
    'operator_deleted',
    'unit_created',
    'unit_updated',
    'unit_deleted',
    'alert_acknowledged',
    'alerts_acknowledged_all',
    'notice_created',
    'notice_updated',
    'notice_deleted',
    'demo_reset'
  ];

  for (const name of eventNames) {
    source.addEventListener(name, handleEvent(name) as EventListener);
  }

  source.onopen = () => {
    sseEstablished = true;
    onConnectionChange(true);
  };
  source.onerror = () => {
    if (closed) return;
    if (!sseEstablished && source.readyState === EventSource.CLOSED) {
      source.close();
      startPolling();
      return;
    }
    onConnectionChange(false);
  };

  return () => {
    closed = true;
    source.close();
    if (pollingTimer !== null) window.clearInterval(pollingTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}
