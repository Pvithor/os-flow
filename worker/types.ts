export type OrderStatus = 'queued' | 'in_progress' | 'paused' | 'completed';

export interface Operator {
  id: string;
  name: string;
  badge: string;
  station: string;
  shift: string;
  shiftGoal: number;
}

export interface WorkOrder {
  id: number;
  code: string;
  unit: string;
  sector: string;
  title: string;
  description: string;
  urgent: boolean;
  status: OrderStatus;
  createdAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  completedAt: string | null;
  elapsedSeconds: number;
  createdBy: string;
  assignedOperatorId: string | null;
  assignedOperatorName: string | null;
  assignedStation: string | null;
  completedBy: string | null;
  operatorNotes: string;
}

export interface DispatchAlert {
  id: number;
  orderId: number | null;
  orderCode: string;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface CustomNotice {
  id: number;
  label: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface UnitItem {
  id: number;
  name: string;
  createdAt: string;
}

export interface AppMetrics {
  queuedCount: number;
  urgentQueuedCount: number;
  inProgressCount: number;
  completedTodayCount: number;
  totalCompletedCount: number;
  dailyGoal: number;
  avgQueueWaitMinutes: number;
  freeBenches: number;
  totalBenches: number;
  slaRate: number;
}

export interface AppState {
  orders: WorkOrder[];
  operators: Operator[];
  units: UnitItem[];
  alerts: DispatchAlert[];
  notices: CustomNotice[];
  settings: Record<string, string>;
  metrics: AppMetrics;
  nextCode: string;
  serverTime: string;
}

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

export interface AuthStatus {
  authenticated: boolean;
  needsSetup: boolean;
  user: AuthUser | null;
}

export interface WorkerEnv {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  ALERT_EMAIL_TO?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_ALERT_COOLDOWN_MS?: string;
  TELEGRAM_NOTIFY_ALL_REQUESTS?: string;
  SENTRY_DSN?: string;
  CF_VERSION_METADATA?: {
    id?: string;
    tag?: string;
  };
}
