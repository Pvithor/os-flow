import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  PauseCircle,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
  X
} from 'lucide-react';
import type { Operator, WorkOrder } from '../types';
import {
  formatDateTimePt,
  formatDurationHms,
  getLiveElapsedSeconds
} from '../lib/format';

interface OrderDetailModalProps {
  order: WorkOrder | null;
  operators: Operator[];
  nowMs: number;
  onClose: () => void;
  onClaim: (orderId: number) => Promise<void>;
  onCreateOperator: (payload: { name: string }) => Promise<Operator>;
  onRequestComplete: (order: WorkOrder, currentNotes: string, selectedAttendant: string) => void;
  onPauseRequest: (order: WorkOrder) => void;
  onResume: (orderId: number) => Promise<void>;
  onRelease: (orderId: number) => Promise<void>;
  onReopen: (orderId: number) => Promise<void>;
  onDelete: (orderId: number) => Promise<void>;
  onOpenInOperator: (order: WorkOrder) => void;
}

export function OrderDetailModal({
  order,
  operators,
  nowMs,
  onClose,
  onClaim,
  onCreateOperator,
  onRequestComplete,
  onPauseRequest,
  onResume,
  onRelease,
  onReopen,
  onDelete,
  onOpenInOperator
}: OrderDetailModalProps) {
  const [notes, setNotes] = useState('');
  const [attendantName, setAttendantName] = useState('');
  const [addingAttendant, setAddingAttendant] = useState(false);
  const [newAttendantName, setNewAttendantName] = useState('');
  const [savingAttendant, setSavingAttendant] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setNotes(order.operatorNotes || '');
      const assigned =
        order.assignedOperatorName &&
        order.assignedOperatorName !== 'SAC' &&
        order.assignedOperatorName !== 'Em Atendimento'
          ? order.assignedOperatorName
          : '';
      setAttendantName(assigned);
      setAddingAttendant(false);
      setNewAttendantName('');
      setConfirmDelete(false);
      setError(null);
    }
  }, [order?.id, order?.operatorNotes, order?.assignedOperatorName]);

  if (!order) return null;

  const showNewAttendantInput = addingAttendant || operators.length === 0;
  const resolvedAttendant = showNewAttendantInput
    ? newAttendantName.trim() || attendantName.trim()
    : attendantName.trim();

  const handleSaveAttendant = async () => {
    const clean = newAttendantName.trim();
    if (clean.length < 2) {
      setError('Informe o nome do operador (mínimo 2 caracteres).');
      return;
    }
    setSavingAttendant(true);
    setError(null);
    try {
      const created = await onCreateOperator({ name: clean });
      setAttendantName(created.name);
      setNewAttendantName('');
      setAddingAttendant(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar operador');
    } finally {
      setSavingAttendant(false);
    }
  };

  const liveSeconds = getLiveElapsedSeconds(order, nowMs);

  const statusMeta: Record<
    WorkOrder['status'],
    { label: string; badgeClass: string; railClass: string }
  > = {
    queued: {
      label: 'NA FILA',
      badgeClass: 'bg-secondary-container/20 text-secondary border border-secondary-container/40',
      railClass: order.urgent ? 'bg-error' : 'bg-secondary-container'
    },
    in_progress: {
      label: 'EM ATENDIMENTO',
      badgeClass: 'bg-primary-container/20 text-primary border border-primary-container/50',
      railClass: 'bg-primary-container'
    },
    paused: {
      label: 'PAUSADA',
      badgeClass: 'bg-secondary-container/20 text-secondary border border-secondary-container/50',
      railClass: 'bg-secondary-container'
    },
    completed: {
      label: 'FINALIZADA',
      badgeClass: 'bg-tertiary/15 text-tertiary border border-tertiary/40',
      railClass: 'bg-tertiary'
    }
  };

  const meta = statusMeta[order.status];

  const runAction = async (fn: () => Promise<void>, closeAfter = true) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (closeAfter) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar ação');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-xl bg-surface-container border border-outline-variant shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className={`absolute inset-y-0 left-0 w-1.5 ${meta.railClass}`} />

        <div className="flex items-start justify-between gap-4 pl-6 pr-5 py-4 bg-surface-container-low border-b border-outline-variant/60">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary tabular-nums">
                {order.code}
              </span>
              <span className={`px-2 py-0.5 rounded font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider ${meta.badgeClass}`}>
                {meta.label}
              </span>
              {order.urgent && (
                <span className="px-2 py-0.5 rounded bg-error text-on-error font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  URGENTE
                </span>
              )}
            </div>
            <h2 id="order-modal-title" className="font-[family-name:var(--font-display)] text-xl font-bold text-on-surface leading-snug">
              {order.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface shrink-0 cursor-pointer"
            aria-label="Fechar detalhes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="pl-6 pr-5 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface-container-low p-3 border border-outline-variant/40">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase text-outline flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-primary" /> Unidade
              </span>
              <p className="mt-1 text-sm font-semibold text-on-surface">{order.unit}</p>
            </div>

            <div className="rounded-lg bg-surface-container-low p-3 border border-outline-variant/40">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase text-outline flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-primary" /> Adicionado
              </span>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-xs font-semibold text-on-surface tabular-nums">
                {formatDateTimePt(order.createdAt)}
              </p>
              <p className="text-[11px] text-outline mt-0.5">Por: {order.createdBy}</p>
            </div>

            <div className="rounded-lg bg-surface-container-low p-3 border border-outline-variant/40">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase text-outline flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-tertiary" /> Tempo Decorrido
              </span>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-sm font-bold text-primary tabular-nums">
                {order.status === 'queued' ? 'Aguardando início' : formatDurationHms(liveSeconds)}
              </p>
              {order.assignedOperatorName && (
                <p className="text-[11px] text-on-surface-variant mt-0.5 flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-tertiary" />
                  {order.assignedOperatorName}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-surface-container-lowest p-3.5 border border-outline-variant/40">
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase text-outline block mb-1">
              Descrição do Chamado
            </span>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{order.description}</p>
          </div>

          {order.status === 'paused' && order.pauseReason && (
            <div className="rounded-lg bg-secondary-container/15 border border-secondary-container/40 p-3 text-xs text-secondary">
              <strong className="uppercase font-[family-name:var(--font-mono)]">Motivo da pausa:</strong> {order.pauseReason}
            </div>
          )}

          {order.status !== 'completed' ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 rounded-lg bg-surface-container-low p-3 border border-outline-variant/40">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="modal-attendant-select"
                    className="font-[family-name:var(--font-mono)] text-[11px] uppercase text-on-surface font-bold flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-tertiary" />
                    Quem fez o atendimento
                  </label>
                  {operators.length > 0 && !showNewAttendantInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingAttendant(true);
                        setError(null);
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
                    id="modal-attendant-select"
                    value={showNewAttendantInput ? '__new__' : attendantName}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (error) setError(null);
                      if (val === '__new__') {
                        setAddingAttendant(true);
                      } else {
                        setAddingAttendant(false);
                        setAttendantName(val);
                      }
                    }}
                    className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant/70 px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary-container cursor-pointer"
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
                        if (error) setError(null);
                      }}
                      placeholder="Digite o nome do operador..."
                      className="flex-1 min-w-[160px] rounded-lg bg-surface-container-lowest border border-primary-container/60 px-3 py-2 text-sm text-on-surface focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={savingAttendant || newAttendantName.trim().length < 2}
                      onClick={handleSaveAttendant}
                      className="px-3 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
                    >
                      {savingAttendant ? 'Salvando...' : 'Salvar'}
                    </button>
                    {operators.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingAttendant(false);
                          setNewAttendantName('');
                        }}
                        className="px-2.5 py-2 rounded-lg bg-surface-container-high text-xs text-on-surface-variant cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="modal-operator-notes"
                  className="font-[family-name:var(--font-mono)] text-[11px] uppercase text-on-surface-variant font-bold"
                >
                  Observações do Operador (Opcional)
                </label>
                <textarea
                  id="modal-operator-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Registre diagnósticos, peças trocadas ou validação..."
                  className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant/70 px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-surface-container-low p-3.5 border border-tertiary/30">
              <div className="flex items-center justify-between text-xs text-tertiary mb-1">
                <span className="font-[family-name:var(--font-mono)] uppercase font-bold">
                  Baixa Realizada{order.completedBy ? ` • ${order.completedBy}` : ''}
                </span>
                <span className="font-[family-name:var(--font-mono)] tabular-nums">
                  {formatDateTimePt(order.completedAt)}
                </span>
              </div>
              <p className="text-sm text-on-surface-variant">
                {order.operatorNotes?.trim() || 'Sem observações adicionais registradas na baixa.'}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded bg-error-container/70 border border-error/50 px-3 py-2 text-xs text-on-error-container">
              {error}
            </div>
          )}
        </div>

        <div className="pl-6 pr-5 py-3.5 bg-surface-container-low border-t border-outline-variant/60 flex flex-wrap items-center justify-between gap-2">
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-error hover:bg-error-container/30 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Excluir O.S
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(() => onDelete(order.id))}
                  className="px-3 py-2 rounded-lg bg-error text-on-error text-xs font-bold uppercase cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-2 rounded-lg bg-surface-container-high text-xs text-on-surface-variant cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {order.status === 'queued' && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(() => onClaim(order.id))}
                  className="px-4 py-2.5 rounded-lg bg-primary-container text-on-primary-container font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Assumir O.S
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    onRequestComplete(order, notes, resolvedAttendant);
                  }}
                  className="px-4 py-2.5 rounded-lg bg-tertiary text-on-tertiary font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 hover:brightness-110 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Dar Baixa Direta
                </button>
              </>
            )}

            {(order.status === 'in_progress' || order.status === 'paused') && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    onOpenInOperator(order);
                  }}
                  className="px-3.5 py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-bold uppercase cursor-pointer"
                >
                  Abrir em Atendimento
                </button>
                {order.status === 'in_progress' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onClose();
                      onPauseRequest(order);
                    }}
                    className="px-3.5 py-2.5 rounded-lg bg-secondary-container/20 border border-secondary-container/50 text-secondary text-xs font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <PauseCircle className="w-4 h-4" />
                    Pausar
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(() => onResume(order.id))}
                    className="px-3.5 py-2.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Retomar
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(() => onRelease(order.id))}
                  className="px-3.5 py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface-variant text-xs font-bold uppercase cursor-pointer"
                >
                  Devolver à Fila
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    onRequestComplete(order, notes, resolvedAttendant);
                  }}
                  className="px-4 py-2.5 rounded-lg bg-tertiary text-on-tertiary font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 hover:brightness-110 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Finalizar O.S
                </button>
              </>
            )}

            {order.status === 'completed' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(() => onReopen(order.id))}
                className="px-4 py-2.5 rounded-lg bg-secondary-container text-on-secondary-container font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 hover:brightness-110 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Reabrir para Fila
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
