import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  Hand,
  Maximize2,
  Minimize2,
  Pencil,
  Play,
  Plus,
  PlusCircle,
  Terminal,
  Volume2,
  Wrench,
  X
} from 'lucide-react';
import type {
  AppMetrics,
  CustomNotice,
  DispatchAlert,
  DisplayMode,
  ViewRoute,
  WorkOrder
} from '../types';
import {
  formatClock,
  formatDateTimePt,
  formatDurationHms,
  formatRelativePt,
  formatTimeShort,
  getLiveElapsedSeconds,
  getTimezoneLabel
} from '../lib/format';

interface DashboardViewProps {
  orders: WorkOrder[];
  alerts: DispatchAlert[];
  notices: CustomNotice[];
  metrics: AppMetrics;
  settings: Record<string, string>;
  displayMode: DisplayMode;
  nowMs: number;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  onNavigate: (route: ViewRoute) => void;
  onAckAlert: (id: number) => Promise<void>;
  onCreateNotice: (text: string) => Promise<void>;
  onUpdateNotice: (id: number, text: string) => Promise<void>;
  onDeleteNotice: (id: number) => Promise<void>;
  onClaimOrder: (orderId: number) => Promise<void>;
  onOpenOrderModal: (order: WorkOrder) => void;
  onOpenOperatorTask: (order: WorkOrder) => void;
}

export function DashboardView({
  orders,
  alerts,
  notices,
  metrics,
  settings,
  displayMode,
  nowMs,
  onChangeDisplayMode,
  onNavigate,
  onAckAlert,
  onCreateNotice,
  onUpdateNotice,
  onDeleteNotice,
  onClaimOrder,
  onOpenOrderModal,
  onOpenOperatorTask
}: DashboardViewProps) {
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [addingNotice, setAddingNotice] = useState(false);
  const [newNoticeText, setNewNoticeText] = useState('');
  const [savingNotice, setSavingNotice] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);
  const [editingNoticeText, setEditingNoticeText] = useState('');

  const isTv = displayMode === 'tv';

  const unackDispatch = alerts.find((a) => !a.acknowledged) || null;

  const queuedOrders = orders.filter((o) => o.status === 'queued');
  const runningOrders = orders.filter((o) => o.status === 'in_progress' || o.status === 'paused');
  const completedOrders = orders
    .filter((o) => o.status === 'completed')
    .sort((a, b) => Date.parse(b.completedAt || b.createdAt) - Date.parse(a.completedAt || a.createdAt));

  const nowDate = new Date(nowMs);
  const queueBarPct = Math.min(100, Math.max(12, Math.round((metrics.queuedCount / 12) * 100)));

  const handleClaim = async (orderId: number) => {
    setClaimingId(orderId);
    try {
      await onClaimOrder(orderId);
    } finally {
      setClaimingId(null);
    }
  };

  const handleAddNoticeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newNoticeText.trim();
    if (!clean) return;
    setSavingNotice(true);
    try {
      await onCreateNotice(clean);
      setNewNoticeText('');
      setAddingNotice(false);
    } finally {
      setSavingNotice(false);
    }
  };

  const handleEditNoticeSubmit = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    const clean = editingNoticeText.trim();
    if (!clean) return;
    setSavingNotice(true);
    try {
      await onUpdateNotice(id, clean);
      setEditingNoticeId(null);
      setEditingNoticeText('');
    } finally {
      setSavingNotice(false);
    }
  };

  return (
    <div className="flex flex-col w-full gap-4">
      {/* Faixa de Avisos Clicáveis + Despachos Ativos */}
      <section className="flex flex-col gap-2">
        {/* Avisos customizados adicionados pelo usuário */}
        {notices.map((notice) => {
          const isEditing = !isTv && editingNoticeId === notice.id;
          const badgeLabel =
            notice.label && notice.label !== 'AVISO' ? notice.label : 'NÃO INICIADO';
          return (
            <div
              key={notice.id}
              className="relative w-full overflow-hidden bg-surface-container-high rounded-xl px-4 py-3 border border-outline-variant/50 shadow-md"
            >
              <div className="absolute inset-y-0 left-0 w-1.5 bg-secondary-container" />
              <div className="flex flex-wrap items-center justify-between gap-3 pl-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-container opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary-container" />
                  </span>
                  <span className="px-2.5 py-1 rounded bg-secondary-container/20 text-secondary-container font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-wider shrink-0">
                    {badgeLabel}
                  </span>
                  <Volume2 className="w-4 h-4 text-secondary-container shrink-0" />

                  {isEditing ? (
                    <form
                      onSubmit={(e) => handleEditNoticeSubmit(e, notice.id)}
                      className="flex items-center gap-2 flex-1 min-w-[200px]"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editingNoticeText}
                        onChange={(e) => setEditingNoticeText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingNoticeId(null);
                            setEditingNoticeText('');
                          }
                        }}
                        placeholder="Digite o texto do aviso..."
                        className="flex-1 bg-surface-container-lowest border border-primary-container rounded-md px-3 py-1.5 text-base sm:text-lg font-semibold text-on-surface focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={savingNotice || !editingNoticeText.trim()}
                        className="px-2.5 py-1.5 rounded bg-tertiary text-on-tertiary font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoticeId(null);
                          setEditingNoticeText('');
                        }}
                        className="p-1.5 rounded bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer"
                        aria-label="Cancelar edição"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : isTv ? (
                    <p className="font-[family-name:var(--font-display)] font-bold text-2xl xl:text-3xl text-on-surface leading-snug break-words">
                      {notice.text}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoticeId(notice.id);
                        setEditingNoticeText(notice.text);
                      }}
                      title="Clique para editar este aviso"
                      className="text-left font-[family-name:var(--font-display)] font-bold text-lg sm:text-xl text-on-surface hover:text-primary leading-snug transition-colors flex-1 min-w-0 inline-flex items-center gap-2 group cursor-pointer"
                    >
                      <span className="break-words">{notice.text}</span>
                      <Pencil className="w-4 h-4 text-outline group-hover:text-primary shrink-0" />
                    </button>
                  )}
                </div>

                {!isTv && !isEditing && (
                  <button
                    type="button"
                    onClick={() => onDeleteNotice(notice.id)}
                    className="px-3 py-1.5 rounded-md bg-surface-container hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border border-outline-variant/40 shrink-0 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 text-tertiary" />
                    Ciente
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Alerta automático de Novo Despacho quando pendente */}
        {unackDispatch && (
          <div className="relative w-full overflow-hidden bg-surface-container-high rounded-xl px-4 py-2.5 border border-outline-variant/50 shadow-md">
            <div className="absolute inset-y-0 left-0 w-1.5 bg-secondary-container" />
            <div className="flex flex-wrap items-center justify-between gap-3 pl-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-container opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary-container" />
                </span>
                <span className="px-2 py-0.5 rounded bg-secondary-container/20 text-secondary-container font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider shrink-0">
                  Novo Despacho
                </span>
                <Volume2 className="w-4 h-4 text-secondary-container shrink-0" />
                <p className="text-sm text-on-surface truncate">
                  <strong className="font-[family-name:var(--font-mono)] text-primary font-bold">
                    {unackDispatch.orderCode}
                  </strong>{' '}
                  • {unackDispatch.message} •{' '}
                  <span className="text-on-surface-variant text-xs font-[family-name:var(--font-mono)]">
                    Adicionada {formatRelativePt(unackDispatch.createdAt, nowMs)} por {unackDispatch.actor}
                  </span>
                </p>
              </div>
              {!isTv && (
                <button
                  type="button"
                  onClick={() => onAckAlert(unackDispatch.id)}
                  className="px-3 py-1.5 rounded-md bg-surface-container hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border border-outline-variant/40 shrink-0 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-tertiary" />
                  Ciente
                </button>
              )}
            </div>
          </div>
        )}

        {/* Campo / Botão clicável para adicionar quantos avisos quiser */}
        {!isTv && (
          addingNotice ? (
            <form
              onSubmit={handleAddNoticeSubmit}
              className="relative w-full overflow-hidden bg-surface-container-high rounded-xl px-4 py-2.5 border border-primary-container/60 shadow-md"
            >
              <div className="absolute inset-y-0 left-0 w-1.5 bg-secondary-container" />
              <div className="flex flex-wrap items-center gap-2.5 pl-2">
                <span className="px-2 py-0.5 rounded bg-secondary-container/20 text-secondary-container font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider shrink-0">
                  Novo Aviso
                </span>
                <input
                  type="text"
                  autoFocus
                  value={newNoticeText}
                  onChange={(e) => setNewNoticeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setAddingNotice(false);
                      setNewNoticeText('');
                    }
                  }}
                  placeholder="Digite o aviso para exibir no painel e na TV 60&quot;..."
                  className="flex-1 min-w-[200px] bg-surface-container-lowest border border-outline-variant focus:border-primary-container rounded-lg px-3 py-1.5 text-sm text-on-surface placeholder:text-outline focus:outline-none"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={savingNotice || !newNoticeText.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-secondary-container hover:brightness-110 text-on-secondary-container font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {savingNotice ? 'Salvando...' : 'Publicar Aviso'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingNotice(false);
                      setNewNoticeText('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface text-xs font-bold uppercase cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </form>
          ) : notices.length === 0 && !unackDispatch ? (
            <button
              type="button"
              onClick={() => setAddingNotice(true)}
              className="relative w-full overflow-hidden bg-surface-container-low hover:bg-surface-container-high rounded-xl px-4 py-2.5 border border-dashed border-outline-variant/70 hover:border-secondary-container/70 transition-colors text-left cursor-pointer group"
            >
              <div className="absolute inset-y-0 left-0 w-1.5 bg-secondary-container/70 group-hover:bg-secondary-container transition-colors" />
              <div className="flex items-center justify-between gap-3 pl-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-secondary-container/20 text-secondary-container font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider shrink-0">
                    Aviso
                  </span>
                  <Volume2 className="w-4 h-4 text-secondary-container shrink-0" />
                  <span className="text-sm text-on-surface-variant group-hover:text-on-surface truncate">
                    Clique aqui para adicionar um aviso ou recado no painel...
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-surface-container text-primary font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase inline-flex items-center gap-1 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  Novo Aviso
                </span>
              </div>
            </button>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAddingNotice(true)}
                className="px-3 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/60 text-primary font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar outro aviso ({notices.length})
              </button>
            </div>
          )
        )}
      </section>

      {/* Barra de Telemetria: Relógio + KPIs */}
      <section className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        {/* Card Relógio ao Vivo */}
        <div className="lg:col-span-4 bg-surface-container-low rounded-xl p-4 border border-outline-variant/40 flex flex-col justify-between shadow-md">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tertiary" />
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-tertiary uppercase tracking-normal xl:tracking-wider whitespace-nowrap">
                AO VIVO • TELEMETRIA
              </span>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[11px] text-on-surface-variant shrink-0">
              {getTimezoneLabel(nowDate)}
            </span>
          </div>

          <div className="my-2">
            <div
              className={`font-[family-name:var(--font-display)] font-bold tracking-tight text-on-surface leading-none tabular-nums select-none ${
                isTv ? 'text-5xl xl:text-6xl' : 'text-4xl sm:text-5xl'
              }`}
            >
              {formatClock(nowDate)}
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase tracking-wider mt-1.5 block">
              {settings.shiftLabel || 'ATUALIZAÇÃO: 1 SEG'}
            </span>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-on-surface-variant">
            <button
              type="button"
              onClick={() => onChangeDisplayMode(isTv ? 'desktop' : 'tv')}
              className={`px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                isTv
                  ? 'bg-primary-container text-on-primary-container border-primary-container'
                  : 'bg-surface-container hover:bg-surface-bright text-primary border-outline-variant hover:border-primary'
              }`}
            >
              {isTv ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isTv ? 'RESTAURAR PAINEL DESKTOP' : 'ALTERNAR MODO TV 60" / TELA CHEIA'}</span>
            </button>
          </div>
        </div>

        {/* Grid de 2 KPIs */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Total em Fila */}
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/40 flex flex-col justify-between shadow-md">
            <div className="flex items-center justify-between text-secondary">
              <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-wider">
                Total em Fila
              </span>
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="my-2 flex items-baseline gap-2.5 flex-wrap">
              <span
                className={`font-[family-name:var(--font-display)] font-bold text-secondary tabular-nums ${
                  isTv ? 'text-5xl' : 'text-4xl'
                }`}
              >
                {String(metrics.queuedCount).padStart(2, '0')}
              </span>
              <span
                className={`font-[family-name:var(--font-mono)] text-xs font-bold tabular-nums ${
                  metrics.urgentQueuedCount > 0 ? 'text-error' : 'text-on-surface-variant'
                }`}
              >
                {metrics.urgentQueuedCount > 0
                  ? `↑ +${metrics.urgentQueuedCount} crítica${metrics.urgentQueuedCount > 1 ? 's' : ''}`
                  : 'Sem críticas'}
              </span>
            </div>
            <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-secondary h-full rounded-full transition-all duration-300"
                style={{ width: `${queueBarPct}%` }}
              />
            </div>
          </div>

          {/* Finalizadas Hoje */}
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/40 flex flex-col justify-between shadow-md">
            <div className="flex items-center justify-between text-tertiary">
              <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-wider">
                Finalizadas Hoje
              </span>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="my-2 flex items-baseline gap-2.5 flex-wrap">
              <span
                className={`font-[family-name:var(--font-display)] font-bold text-tertiary tabular-nums ${
                  isTv ? 'text-5xl' : 'text-4xl'
                }`}
              >
                {String(metrics.completedTodayCount).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Faixa compacta Em Atendimento Agora */}
      {runningOrders.length > 0 && (
        <section className="bg-surface-container-lowest rounded-xl p-3 border border-primary-container/35 glow-active">
          <div className="flex items-center justify-between gap-2 mb-2.5 px-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-container" />
              </span>
              <span className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wider text-primary">
                Em Atendimento Agora
              </span>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary tabular-nums">
              {runningOrders.length} O.S ATIVA{runningOrders.length > 1 ? 'S' : ''}
            </span>
          </div>

          <div
            className={`grid gap-2.5 ${
              runningOrders.length === 1
                ? 'grid-cols-1'
                : runningOrders.length === 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            }`}
          >
            {runningOrders.map((order) => {
              const elapsed = getLiveElapsedSeconds(order, nowMs);
              const isPaused = order.status === 'paused';
              return (
                <div
                  key={order.id}
                  className="bg-surface-container rounded-lg px-3.5 py-2.5 border border-outline-variant/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpenOrderModal(order)}
                    className="min-w-0 flex-1 text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-primary tabular-nums whitespace-nowrap">
                        {order.code}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase whitespace-nowrap ${
                          isPaused
                            ? 'bg-secondary-container/20 text-secondary'
                            : 'bg-primary-container/20 text-primary'
                        }`}
                      >
                        {isPaused ? 'PAUSADA' : 'EM EXECUÇÃO'}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface tabular-nums whitespace-nowrap">
                        {formatDurationHms(elapsed)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors truncate mt-0.5">
                      {order.title}
                    </p>
                    <p className="text-[11px] text-on-surface-variant truncate flex items-center gap-1 mt-0.5">
                      <Wrench className="w-3 h-3 text-primary shrink-0" />
                      {order.assignedOperatorName || 'Operador'} • {order.unit}
                    </p>
                  </button>

                  {!isTv && (
                    <button
                      type="button"
                      onClick={() => onOpenOperatorTask(order)}
                      className="px-3 py-2 rounded-lg bg-primary-container/15 hover:bg-primary-container text-primary hover:text-on-primary-container font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase shrink-0 inline-flex items-center justify-center gap-1 transition-colors cursor-pointer w-full sm:w-auto"
                    >
                      <span>Dar Baixa</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quadro Kanban (2 colunas: Na Fila e Finalizadas) */}
      <div id="board-container" className="grid gap-5 grid-cols-1 lg:grid-cols-2">
        {/* COLUNA 1: NA FILA */}
        <section className="flex flex-col bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/40 shadow-md">
          <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg mb-3">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-secondary-container shrink-0" />
              <div className="flex flex-col">
                <span className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface uppercase tracking-tight leading-tight">
                  Na Fila
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline">
                  Aguardando Operador
                </span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-container/20 text-secondary-container font-[family-name:var(--font-mono)] font-bold text-xs tabular-nums">
              {String(queuedOrders.length).padStart(2, '0')} O.S
            </span>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            {queuedOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-outline-variant/60 p-6 text-center text-sm text-outline">
                Nenhuma O.S aguardando na fila no momento.
              </div>
            ) : (
              queuedOrders.map((order) => (
                <article
                  key={order.id}
                  className={`relative bg-surface-container rounded-lg p-4 border border-outline-variant/40 shadow-md transition-colors hover:bg-surface-container-high ${
                    order.urgent ? 'glow-critical' : ''
                  }`}
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg ${
                      order.urgent ? 'bg-error' : 'bg-outline-variant'
                    }`}
                  />
                  <div className="pl-2 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenOrderModal(order)}
                          className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary hover:underline tabular-nums cursor-pointer"
                        >
                          {order.code}
                        </button>
                        {order.urgent && (
                          <span className="px-2 py-0.5 rounded bg-error text-on-error font-[family-name:var(--font-mono)] text-[10px] uppercase font-bold tracking-wider whitespace-nowrap">
                            URGENTE
                          </span>
                        )}
                      </div>
                      <span className="font-[family-name:var(--font-mono)] text-[11px] text-on-surface-variant flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 shrink-0 text-outline" />
                        <span>{order.unit}</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenOrderModal(order)}
                      className="text-left cursor-pointer group"
                    >
                      <h3
                        className={`font-[family-name:var(--font-display)] font-bold text-on-surface leading-snug group-hover:text-primary transition-colors ${
                          isTv ? 'text-xl' : 'text-lg'
                        }`}
                      >
                        {order.title}
                      </h3>
                    </button>

                    <p className={`text-on-surface-variant leading-relaxed ${isTv ? 'text-base' : 'text-sm'}`}>
                      {order.description}
                    </p>

                    <div className="text-xs text-outline font-[family-name:var(--font-mono)] flex items-center gap-1.5 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Adicionado em {formatDateTimePt(order.createdAt)}</span>
                    </div>

                    {!isTv && (
                      <button
                        type="button"
                        disabled={claimingId === order.id}
                        onClick={() => handleClaim(order.id)}
                        className={`w-full mt-1 py-2.5 px-4 rounded-lg font-[family-name:var(--font-display)] text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer ${
                          order.urgent
                            ? 'bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container'
                            : 'bg-surface-container-high hover:bg-primary-container text-on-surface hover:text-on-primary-container'
                        }`}
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>
                          {claimingId === order.id ? 'Assumindo...' : 'Assumir O.S'}
                        </span>
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* COLUNA 2: FINALIZADAS */}
        <section className="flex flex-col bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/40 shadow-md">
          <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg mb-3">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-tertiary shrink-0" />
              <div className="flex flex-col">
                <span className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface uppercase tracking-tight leading-tight">
                  Finalizadas
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline">
                  Concluídas Hoje
                </span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-tertiary/20 text-tertiary font-[family-name:var(--font-mono)] font-bold text-xs tabular-nums">
              {String(metrics.completedTodayCount).padStart(2, '0')} O.S
            </span>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            {completedOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-outline-variant/60 p-6 text-center text-sm text-outline">
                Nenhuma O.S concluída ainda.
              </div>
            ) : (
              completedOrders.slice(0, isTv ? 5 : 6).map((order) => (
                <article
                  key={order.id}
                  onClick={() => onOpenOrderModal(order)}
                  className="relative bg-surface-container-low rounded-lg p-4 border border-outline-variant/40 shadow-md opacity-95 hover:opacity-100 hover:bg-surface-container transition-all cursor-pointer"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-tertiary rounded-l-lg" />
                  <div className="pl-2 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-on-surface tabular-nums">
                          {order.code}
                        </span>
                        {order.urgent && (
                          <span className="px-2 py-0.5 rounded bg-error text-on-error font-[family-name:var(--font-mono)] text-[10px] uppercase font-bold tracking-wider whitespace-nowrap inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            URGENTE
                          </span>
                        )}
                      </div>
                      <span className="font-[family-name:var(--font-mono)] text-[11px] text-on-surface-variant flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 shrink-0 text-outline" />
                        <span>{order.unit}</span>
                      </span>
                    </div>

                    <h3 className={`font-[family-name:var(--font-display)] font-bold text-on-surface leading-snug ${isTv ? 'text-xl' : 'text-lg'}`}>
                      {order.title}
                    </h3>

                    <p className={`text-on-surface-variant leading-relaxed ${isTv ? 'text-base' : 'text-sm'}`}>
                      {order.description}
                    </p>

                    <div className="text-xs text-outline font-[family-name:var(--font-mono)] flex items-center gap-1.5 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Adicionado em {formatDateTimePt(order.createdAt)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5 text-tertiary font-[family-name:var(--font-mono)] text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        O.S Finalizada{order.completedBy ? ` • ${order.completedBy}` : ' (Baixa Realizada)'}
                      </span>
                      <span className="text-on-surface-variant tabular-nums font-bold">
                        {formatTimeShort(order.completedAt)}
                      </span>
                    </div>
                  </div>
                </article>
              ))
            )}

            {completedOrders.length > 5 && !isTv && (
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="w-full py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Ver todas as {completedOrders.length} concluídas →
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Rodapé Sticky de Despacho (oculto no modo TV 60") */}
      {!isTv && (
        <footer className="sticky bottom-[64px] lg:bottom-3 z-20 bg-surface-container-low/95 backdrop-blur-md rounded-xl p-3.5 sm:p-4 border border-outline-variant/50 shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Terminal className="w-6 h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface uppercase tracking-wider block truncate">
                Terminal de Despacho • SAC
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[11px] text-outline block truncate">
                Acesso Único: Controle Geral de O.S
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onNavigate('operator')}
              className="flex-1 sm:flex-initial py-2.5 px-4 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-[family-name:var(--font-display)] text-sm font-bold inline-flex items-center justify-center gap-2 border border-outline-variant/50 transition-colors cursor-pointer"
            >
              <Hand className="w-4 h-4 text-primary" />
              <span>Atendimento & Baixa</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('new-order')}
              className="flex-1 sm:flex-initial py-2.5 px-4 rounded-lg bg-secondary-container hover:brightness-110 text-on-secondary-container font-[family-name:var(--font-display)] text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Adicionar à Fila (+ Nova O.S)</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
