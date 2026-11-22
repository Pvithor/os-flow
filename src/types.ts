export type OrderStatus = 'queued' | 'in_progress' | 'paused' | 'completed';

export type ViewRoute = 'dashboard' | 'new-order' | 'operator' | 'history' | 'directory';

export type DisplayMode = 'desktop' | 'tv';

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
