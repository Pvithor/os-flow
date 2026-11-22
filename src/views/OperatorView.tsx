import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  PauseCircle,
  Play,
  Plus,
  RotateCcw,
  UserCheck,
  Wrench
} from 'lucide-react';
import type { Operator, ViewRoute, WorkOrder } from '../types';
import {
  formatDateTimePt,
  formatDurationHms,
  formatDurationShort,
  formatSmartAdded,
  formatTimeShort,
  getLiveElapsedSeconds
} from '../lib/format';

interface OperatorViewProps {
  orders: WorkOrder[];
  operators: Operator[];
  focusedOrderId: number | null;
  nowMs: number;
  isMobile?: boolean;
  onSelectOrderFocus: (orderId: number | null) => void;
  onClaimOrder: (orderId: number) => Promise<void>;
  onSaveNotes: (orderId: number, notes: string) => Promise<void>;
  onPauseRequest: (order: WorkOrder) => void;
  onResumeOrder: (orderId: number) => Promise<void>;
  onReleaseOrder: (orderId: number) => Promise<void>;
  onCreateOperator: (payload: { name: string }) => Promise<Operator>;
  onRequestComplete: (order: WorkOrder, currentNotes: string, selectedAttendant: string) => void;
  onNavigate: (route: ViewRoute) => void;
}

export function OperatorView({
  orders,
  operators,
  focusedOrderId,
  nowMs,
  isMobile = false,
  onSelectOrderFocus,
  onClaimOrder,
  onSaveNotes,
  onPauseRequest,
  onResumeOrder,
  onReleaseOrder,
  onCreateOperator,
  onRequestComplete,
  onNavigate
}: OperatorViewProps) {
  const activeOrders = orders.filter((o) => o.status === 'in_progress' || o.status === 'paused');

  const currentOrder =
    activeOrders.find((o) => o.id === focusedOrderId) ||
    activeOrders[0] ||
    null;

  const queuedOrders = orders.filter((o) => o.status === 'queued');

  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const completedToday = orders
    .filter((o) => {
      if (o.status !== 'completed' || !o.completedAt) return false;
      const ms = Date.parse(o.completedAt);
      return Number.isFinite(ms) && ms >= todayStartMs;
    })
    .sort((a, b) => Date.parse(b.completedAt || '') - Date.parse(a.completedAt || ''));

  const shiftOrders = completedToday;
  const avgDurationSec =
    shiftOrders.length > 0
      ? Math.round(shiftOrders.reduce((acc, o) => acc + o.elapsedSeconds, 0) / shiftOrders.length)
      : 0;
  const shiftSlaPct =
    shiftOrders.length > 0
      ? ((shiftOrders.filter((o) => o.elapsedSeconds <= 5400).length / shiftOrders.length) * 100).toFixed(1)
      : '100.0';

  const [notes, setNotes] = useState(currentOrder?.operatorNotes || '');
  const [notesSavedLabel, setNotesSavedLabel] = useState(false);
  const [attendantName, setAttendantName] = useState('');
  const [addingAttendant, setAddingAttendant] = useState(false);
  const [newAttendantName, setNewAttendantName] = useState('');
  const [savingAttendant, setSavingAttendant] = useState(false);
  const [attendantError, setAttendantError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    setNotes(currentOrder?.operatorNotes || '');
    setNotesSavedLabel(false);
    const assigned =
      currentOrder?.assignedOperatorName &&
      currentOrder.assignedOperatorName !== 'SAC' &&
      currentOrder.assignedOperatorName !== 'Em Atendimento'
        ? currentOrder.assignedOperatorName
        : '';
    setAttendantName(assigned);
    setAddingAttendant(false);
    setNewAttendantName('');
    setAttendantError(null);
  }, [currentOrder?.id, currentOrder?.operatorNotes, currentOrder?.assignedOperatorName]);

  const showNewAttendantInput = addingAttendant || operators.length === 0;
  const resolvedAttendant = showNewAttendantInput
    ? newAttendantName.trim() || attendantName.trim()
    : attendantName.trim();

  const handleSaveAttendant = async () => {
    const clean = newAttendantName.trim();
    if (clean.length < 2) {
      setAttendantError('Informe o nome do operador (mínimo 2 caracteres).');
      return;
    }
    setSavingAttendant(true);
    setAttendantError(null);
    try {
      const created = await onCreateOperator({ name: clean });
      setAttendantName(created.name);
      setNewAttendantName('');
      setAddingAttendant(false);
    } catch (err) {
      setAttendantError(err instanceof Error ? err.message : 'Erro ao cadastrar operador');
    } finally {
      setSavingAttendant(false);
    }
  };

  const handleNotesBlur = async () => {
    if (!currentOrder) return;
    if (notes === (currentOrder.operatorNotes || '')) return;
    await onSaveNotes(currentOrder.id, notes);
    setNotesSavedLabel(true);
    setTimeout(() => setNotesSavedLabel(false), 2000);
  };

  const handleFinish = () => {
    if (!currentOrder) return;
    onRequestComplete(currentOrder, notes, resolvedAttendant);
  };

  const handleClaim = async (orderId: number) => {
    setBusyAction(`claim-${orderId}`);
    try {
      await onClaimOrder(orderId);
      onSelectOrderFocus(orderId);
    } finally {
      setBusyAction(null);
    }
  };

  const elapsedSec = currentOrder ? getLiveElapsedSeconds(currentOrder, nowMs) : 0;

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Ribbon Superior do Operador */}
      <div
        className={`w-full bg-surface-container-low rounded-xl p-4 border border-outline-variant/40 shadow-md flex flex-col ${
          isMobile ? '' : 'lg:flex-row lg:items-center'
        } justify-between gap-4`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-xl bg-surface-container-high border border-outline-variant/50 flex items-center justify-center text-primary">
              <Wrench className="w-7 h-7" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-tertiary border-2 border-surface-container-low" />
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase tracking-wider">
                Acesso Único
              </span>
              <span className="px-2 py-0.5 rounded bg-surface-container text-tertiary font-[family-name:var(--font-mono)] text-[10px] font-bold">
                SAC • CONTROLE GERAL
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-on-surface tracking-tight">
                Central SAC • Atendimento &amp; Baixa
              </h1>
            </div>

            <p className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-0.5 truncate">
              <Wrench className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Assuma as O.S da fila e finalize preenchendo o operador responsável</span>
            </p>
          </div>
        </div>

        {/* KPI Chips */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/40 shrink-0">
          <div className="flex flex-col px-2">
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase">
              Finalizadas Hoje
            </span>
            <span className="font-[family-name:var(--font-mono)] text-sm sm:text-base text-on-surface font-bold tabular-nums mt-0.5">
              {completedToday.length} OS
            </span>
          </div>
          <div className="flex flex-col px-3 border-l border-outline-variant/40">
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase">
              Tempo Médio
            </span>
            <span className="font-[family-name:var(--font-mono)] text-sm sm:text-base text-primary font-bold tabular-nums mt-0.5">
              {avgDurationSec > 0 ? formatDurationShort(avgDurationSec) : '—'}
            </span>
          </div>
          <div className="flex flex-col px-3 border-l border-outline-variant/40">
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase">
              Status SLA
            </span>
            <span className="font-[family-name:var(--font-mono)] text-sm sm:text-base text-tertiary font-bold tabular-nums mt-0.5">
              {shiftSlaPct}%
            </span>
          </div>
        </div>
      </div>

      {/* Workspace Principal: Esquerda (8 col) + Direita (4 col) */}
      <div className={`grid grid-cols-1 ${isMobile ? '' : 'xl:grid-cols-12'} gap-6 items-start`}>
        <div className={`${isMobile ? '' : 'xl:col-span-8'} flex flex-col gap-4 min-w-0`}>
          {/* Seletor quando há múltiplas O.S ativas */}
          {activeOrders.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 bg-surface-container-low px-3.5 py-2.5 rounded-xl border border-outline-variant/40">
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase">
                O.S em Atendimento:
              </span>
              {activeOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onSelectOrderFocus(o.id)}
                  className={`px-3 py-1 rounded-md font-[family-name:var(--font-mono)] text-xs font-bold transition-colors cursor-pointer ${
                    currentOrder?.id === o.id
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {o.code} • {o.unit.split('-')[0].trim()}
                </button>
              ))}
            </div>
          )}

          {currentOrder ? (
            <section className="bg-surface-container rounded-xl p-5 sm:p-6 border border-outline-variant/50 shadow-xl relative overflow-hidden">
              <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary-container/10 blur-3xl pointer-events-none" />

              {/* Status + Código + Relógio Decorrido */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-outline-variant/40">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`px-3 py-1 rounded font-[family-name:var(--font-mono)] text-xs font-bold tracking-wider inline-flex items-center gap-1.5 ${
                      currentOrder.status === 'paused'
                        ? 'bg-secondary-container/20 text-secondary'
                        : 'bg-primary-container/15 text-primary-fixed-dim'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        currentOrder.status === 'paused'
                          ? 'bg-secondary-container'
                          : 'bg-primary-container animate-pulse'
                      }`}
                    />
                    {currentOrder.status === 'paused' ? 'PAUSADA' : 'EM ATENDIMENTO'}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-on-surface tabular-nums">
                    OS {currentOrder.code}
                  </span>
                </div>

                <div className="bg-surface-container-lowest px-4 py-2 rounded-lg border border-outline-variant/40 flex items-center gap-2.5 shadow-inner self-start sm:self-auto">
                  <Clock className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase">
                      Decorrido
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-base font-bold text-primary tabular-nums">
                      {formatDurationHms(elapsedSec)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3 Blocos: Unidade, Data, Urgente */}
              <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-3'} gap-4 mb-5`}>
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase tracking-wider flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-primary" /> Unidade
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-base font-bold text-on-surface leading-snug">
                    {currentOrder.unit}
                  </span>
                  {currentOrder.sector && (
                    <span className="text-xs text-on-surface-variant">{currentOrder.sector}</span>
                  )}
                </div>

                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-outline" /> Data de Adicionado
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-on-surface tabular-nums">
                    {formatDateTimePt(currentOrder.createdAt)}
                  </span>
                  <span className="text-xs text-outline">
                    Início atendimento: {formatTimeShort(currentOrder.startedAt)}
                  </span>
                </div>

                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-1">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-error" /> É Urgente?
                  </span>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {currentOrder.urgent ? (
                      <>
                        <span className="px-3 py-1 rounded-lg bg-error text-on-error font-[family-name:var(--font-display)] text-sm font-bold tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                          ! SIM
                        </span>
                        <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase">
                          (Prioridade Alta)
                        </span>
                      </>
                    ) : (
                      <span className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant font-[family-name:var(--font-display)] text-sm font-bold">
                        NÃO (Normal)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Descrição do Chamado */}
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 mb-5 shadow-inner">
                <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-outline uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-3.5 h-3.5 text-primary" /> Descrição do Chamado
                </span>
                <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-on-surface tracking-tight mb-1.5">
                  {currentOrder.title}
                </h2>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {currentOrder.description}
                </p>
              </div>

              {currentOrder.status === 'paused' && currentOrder.pauseReason && (
                <div className="mb-4 rounded-lg bg-secondary-container/15 border border-secondary-container/40 p-3 text-xs text-secondary flex items-center gap-2">
                  <PauseCircle className="w-4 h-4 shrink-0" />
                  <span>
                    <strong className="uppercase font-[family-name:var(--font-mono)]">Em pausa:</strong>{' '}
                    {currentOrder.pauseReason}
                  </span>
                </div>
              )}

              {/* Quem fez o atendimento */}
              <div className="flex flex-col gap-2 mb-5 rounded-xl bg-surface-container-low p-4 border border-outline-variant/40">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="operator-attendant-select"
                    className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <UserCheck className="w-4 h-4 text-tertiary" />
                    <span>Quem fez o atendimento</span>
                  </label>
                  {operators.length > 0 && !showNewAttendantInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingAttendant(true);
                        setAttendantError(null);
                      }}
                      className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-primary hover:underline uppercase inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Novo Operador
                    </button>
                  )}
                </div>

                {operators.length > 0 && (
                  <select
                    id="operator-attendant-select"
                    value={showNewAttendantInput ? '__new__' : attendantName}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (attendantError) setAttendantError(null);
                      if (val === '__new__') {
                        setAddingAttendant(true);
                      } else {
                        setAddingAttendant(false);
                        setAttendantName(val);
                      }
                    }}
                    className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary-container cursor-pointer"
                  >
                    <option value="">Selecione quem fez o atendimento...</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.name}>
                        {op.name}
                      </option>
                    ))}
                    <option value="__new__">+ Cadastrar novo operador...</option>
                  </select>
                )}

                {showNewAttendantInput && (
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <input
                      type="text"
                      value={newAttendantName}
                      onChange={(e) => {
                        setNewAttendantName(e.target.value);
                        if (attendantError) setAttendantError(null);
                      }}
                      placeholder={
                        operators.length === 0
                          ? 'Nenhum operador cadastrado ainda. Digite o nome...'
                          : 'Digite o nome do operador...'
                      }
                      className="flex-1 min-w-[160px] rounded-lg bg-surface-container-lowest border border-primary-container/60 px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary-container"
                    />
                    <button
                      type="button"
                      disabled={savingAttendant || newAttendantName.trim().length < 2}
                      onClick={handleSaveAttendant}
                      className="px-3.5 py-2 rounded-lg bg-primary-container text-on-primary-container font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {savingAttendant ? 'Salvando...' : 'Salvar'}
                    </button>
                    {operators.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingAttendant(false);
                          setNewAttendantName('');
                        }}
                        className="px-2.5 py-2 rounded-lg bg-surface-container-high text-xs text-on-surface-variant cursor-pointer shrink-0"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}

                {attendantError && (
                  <p className="text-xs text-error font-medium">{attendantError}</p>
                )}
              </div>

              {/* Observações do Operador */}
              <div className="flex flex-col gap-1.5 mb-5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="operator-notes"
                    className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface uppercase tracking-wider"
                  >
                    Observações do Operador (Opcional)
                  </label>
                  {notesSavedLabel && (
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-tertiary font-bold">
                      Salvo automaticamente
                    </span>
                  )}
                </div>
                <textarea
                  id="operator-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder="Observações de fechamento, peças substituídas ou medições..."
                  className="w-full bg-surface-container-lowest border border-outline-variant/50 focus:border-primary-container text-on-surface text-sm p-3 rounded-lg focus:outline-none resize-y shadow-inner"
                />
              </div>

              {/* Ações de Controle + Botão Principal FINALIZAR O.S */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {currentOrder.status === 'in_progress' ? (
                      <button
                        type="button"
                        onClick={() => onPauseRequest(currentOrder)}
                        className="px-3.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-secondary border border-secondary-container/40 font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <PauseCircle className="w-4 h-4" />
                        Pausar O.S
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => onResumeOrder(currentOrder.id)}
                        className="px-3.5 py-2 rounded-lg bg-primary-container text-on-primary-container font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Retomar Execução
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => onReleaseOrder(currentOrder.id)}
                      className="px-3.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Devolver à Fila
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleNotesBlur}
                    className="text-xs font-[family-name:var(--font-mono)] text-primary hover:underline cursor-pointer"
                  >
                    Salvar observações
                  </button>
                </div>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleFinish}
                  className="w-full min-h-[58px] py-3.5 px-6 rounded-xl bg-tertiary hover:brightness-105 text-on-tertiary font-[family-name:var(--font-display)] text-lg sm:text-xl font-bold uppercase tracking-wide flex items-center justify-center gap-3 transition-all active:scale-[0.99] shadow-lg glow-done disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="w-7 h-7 shrink-0" />
                  <span>FINALIZAR O.S</span>
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-surface-container rounded-xl p-6 sm:p-8 border border-outline-variant/40 text-center flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-tertiary">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-on-surface">
                  Bancada Livre — Nenhuma O.S em Atendimento
                </h2>
                <p className="text-sm text-on-surface-variant mt-1 max-w-md mx-auto">
                  Assuma a próxima ordem na fila ao lado ou abra uma nova O.S na triagem rápida.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                {queuedOrders[0] && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleClaim(queuedOrders[0].id)}
                    className="px-5 py-3 rounded-lg bg-primary-container text-on-primary-container font-[family-name:var(--font-display)] text-sm font-bold uppercase inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Assumir Próxima ({queuedOrders[0].code})
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Painel Direito: Próximas na Fila + Histórico do Turno */}
        <div className={`${isMobile ? '' : 'xl:col-span-4'} flex flex-col gap-5 min-w-0`}>
          {/* Próximas na Fila */}
          <section className="bg-surface-container rounded-xl p-4 border border-outline-variant/40 shadow-md">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-outline-variant/40">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-secondary" />
                <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-on-surface">
                  Próximas na Fila
                </h3>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-secondary font-bold uppercase tabular-nums">
                {queuedOrders.length} AGUARDANDO
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {queuedOrders.length === 0 ? (
                <p className="text-xs text-outline text-center py-4">Fila vazia no momento.</p>
              ) : (
                queuedOrders.slice(0, 4).map((q) => (
                  <div
                    key={q.id}
                    className="bg-surface-container-low rounded-xl p-3.5 border border-outline-variant/30 hover:bg-surface-container-high transition-colors flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-[family-name:var(--font-mono)] text-sm text-primary font-bold tabular-nums">
                        OS {q.code}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase">
                          Urgente?
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase ${
                            q.urgent
                              ? 'bg-error text-on-error'
                              : 'bg-surface-container-highest text-on-surface-variant'
                          }`}
                        >
                          {q.urgent ? 'SIM' : 'NÃO'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase block">
                        Unidade
                      </span>
                      <span className="text-sm font-semibold text-on-surface">{q.unit}</span>
                    </div>

                    <div>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase block">
                        Descrição
                      </span>
                      <h4 className="text-sm text-on-surface leading-snug">{q.title}</h4>
                    </div>

                    <div className="text-[11px] text-outline font-[family-name:var(--font-mono)]">
                      ADICIONADO:{' '}
                      <span className="text-on-surface-variant font-semibold">
                        {formatSmartAdded(q.createdAt)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => handleClaim(q.id)}
                      className={`mt-1 w-full py-2.5 px-3 rounded-lg font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-60 cursor-pointer ${
                        q.urgent
                          ? 'bg-primary-container text-on-primary-container hover:brightness-110'
                          : 'bg-surface-container-highest hover:bg-surface-bright text-on-surface'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {busyAction === `claim-${q.id}` ? 'Iniciando...' : 'Iniciar Atendimento'}
                      </span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Histórico Rápido do Turno */}
          <section className="bg-surface-container rounded-xl p-4 border border-outline-variant/40 shadow-md">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-outline-variant/40">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-tertiary" />
                <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-on-surface">
                  Histórico do Turno
                </h3>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-on-surface-variant uppercase font-bold">
                HOJE
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {shiftOrders.length === 0 ? (
                <p className="text-xs text-outline text-center py-3">Nenhuma baixa hoje.</p>
              ) : (
                shiftOrders.slice(0, 4).map((done) => (
                  <div
                    key={done.id}
                    className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-on-surface tabular-nums">
                        OS {done.code}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-tertiary/10 text-tertiary font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase">
                        CONCLUÍDA
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant font-medium">{done.title}</p>
                    {(done.completedBy || done.assignedOperatorName) && (
                      <p className="text-[11px] font-[family-name:var(--font-mono)] text-primary">
                        Finalizado por: {done.completedBy || done.assignedOperatorName}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-outline font-[family-name:var(--font-mono)] text-[11px] pt-1 tabular-nums">
                      <span>
                        Entrada: {formatTimeShort(done.startedAt || done.createdAt)} • Baixa:{' '}
                        {formatTimeShort(done.completedAt)}
                      </span>
                      <span className="text-tertiary font-bold">
                        {formatDurationShort(done.elapsedSeconds)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="mt-3 w-full text-center py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-[family-name:var(--font-mono)] text-xs font-bold transition-colors cursor-pointer"
            >
              Ver Histórico Completo da Estação →
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
