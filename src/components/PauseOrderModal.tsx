import { useState } from 'react';
import { PauseCircle, X } from 'lucide-react';
import type { WorkOrder } from '../types';

interface PauseOrderModalProps {
  order: WorkOrder | null;
  onClose: () => void;
  onConfirm: (orderId: number, reason: string) => Promise<void>;
}

const PRESET_REASONS = [
  'Aguardando peça / requisição no almoxarifado',
  'Troca de turno / alinhamento técnico',
  'Parada para intervalo / refeição',
  'Aguardando liberação de energia / bloqueio LOTO'
];

export function PauseOrderModal({ order, onClose, onConfirm }: PauseOrderModalProps) {
  const [reason, setReason] = useState(PRESET_REASONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 2) {
      setError('Informe o motivo da pausa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(order.id, reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao pausar O.S');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-surface-container border border-outline-variant shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-surface-container-low border-b border-outline-variant/60">
          <div className="flex items-center gap-2.5">
            <PauseCircle className="w-5 h-5 text-secondary-container" />
            <div>
              <h2 id="pause-modal-title" className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface">
                Pausar Ordem {order.code}
              </h2>
              <p className="text-xs text-on-surface-variant truncate max-w-xs sm:max-w-sm">{order.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-outline font-bold">
              Motivos Rápidos
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`text-left text-xs px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                    reason === preset
                      ? 'bg-secondary-container/20 border-secondary-container text-secondary font-semibold'
                      : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="pause-reason-input"
              className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-on-surface font-bold"
            >
              Motivo da Pausa *
            </label>
            <textarea
              id="pause-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo da pausa..."
              className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary-container"
            />
          </div>

          {error && (
            <div className="rounded bg-error-container/70 border border-error/50 px-3 py-2 text-xs text-on-error-container">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-bold uppercase cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-lg bg-secondary-container text-on-secondary-container font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Pausando...' : 'Confirmar Pausa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
