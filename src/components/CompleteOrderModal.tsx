import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Plus, UserCheck, X } from 'lucide-react';
import type { Operator, WorkOrder } from '../types';

interface CompleteOrderModalProps {
  order: WorkOrder | null;
  initialNotes: string;
  initialFinisher?: string;
  operators: Operator[];
  onClose: () => void;
  onCreateOperator: (payload: { name: string }) => Promise<Operator>;
  onConfirm: (orderId: number, notes: string, completedBy: string) => Promise<void>;
}

export function CompleteOrderModal({
  order,
  initialNotes,
  initialFinisher = '',
  operators,
  onClose,
  onCreateOperator,
  onConfirm
}: CompleteOrderModalProps) {
  const [finisherName, setFinisherName] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [savingPerson, setSavingPerson] = useState(false);
  const [caseNotes, setCaseNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setFinisherName(initialFinisher?.trim() || '');
    setAddingPerson(false);
    setNewPersonName('');
    setCaseNotes(initialNotes ?? order.operatorNotes ?? '');
    setError(null);
  }, [order?.id, initialNotes, initialFinisher]);

  if (!order) return null;

  const showNewPersonInput = addingPerson || operators.length === 0;
  const resolvedFinisher = showNewPersonInput
    ? newPersonName.trim() || finisherName.trim()
    : finisherName.trim();

  const handleSavePerson = async () => {
    const clean = newPersonName.trim();
    if (clean.length < 2) {
      setError('Informe o nome da pessoa (mínimo 2 caracteres).');
      return;
    }
    setSavingPerson(true);
    setError(null);
    try {
      const created = await onCreateOperator({ name: clean });
      setFinisherName(created.name);
      setNewPersonName('');
      setAddingPerson(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar pessoa');
    } finally {
      setSavingPerson(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resolvedFinisher.length < 2) {
      setError('Selecione ou cadastre o operador que finalizou a O.S.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(order.id, caseNotes.trim(), resolvedFinisher);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar O.S');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-xl bg-surface-container border border-outline-variant shadow-2xl overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-tertiary" />

        <div className="flex items-center justify-between gap-3 pl-6 pr-5 py-4 bg-surface-container-low border-b border-outline-variant/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-tertiary shrink-0" />
            <div className="min-w-0">
              <h2
                id="complete-modal-title"
                className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface"
              >
                Finalizar Ordem {order.code}
              </h2>
              <p className="text-xs text-on-surface-variant truncate">
                {order.title} • {order.unit}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface shrink-0 cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pl-6 pr-5 py-5 flex flex-col gap-4">
          {/* Quem finalizou */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="complete-finisher-select"
                className="font-[family-name:var(--font-mono)] text-xs font-bold uppercase text-on-surface flex items-center gap-1.5"
              >
                <UserCheck className="w-4 h-4 text-tertiary" />
                <span>Quem fez o atendimento / finalizou? *</span>
              </label>
              {operators.length > 0 && !showNewPersonInput && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingPerson(true);
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
                id="complete-finisher-select"
                value={showNewPersonInput ? '__new__' : finisherName}
                onChange={(e) => {
                  const val = e.target.value;
                  if (error) setError(null);
                  if (val === '__new__') {
                    setAddingPerson(true);
                  } else {
                    setAddingPerson(false);
                    setFinisherName(val);
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

            {showNewPersonInput && (
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newPersonName}
                  onChange={(e) => {
                    setNewPersonName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    operators.length === 0
                      ? 'Nenhuma pessoa cadastrada ainda. Digite o nome...'
                      : 'Digite o nome de quem finalizou...'
                  }
                  className="flex-1 min-w-[160px] rounded-lg bg-surface-container-lowest border border-primary-container/60 px-3 py-2 text-sm text-on-surface placeholder:text-outline/60 focus:outline-none focus:border-primary-container"
                />
                <button
                  type="button"
                  disabled={savingPerson || newPersonName.trim().length < 2}
                  onClick={handleSavePerson}
                  className="px-3.5 py-2 rounded-lg bg-primary-container text-on-primary-container font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {savingPerson ? 'Salvando...' : 'Salvar'}
                </button>
                {operators.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPerson(false);
                      setNewPersonName('');
                    }}
                    className="px-2.5 py-2 rounded-lg bg-surface-container-high text-xs text-on-surface-variant cursor-pointer shrink-0"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Descrição do Caso / Observação */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="complete-case-notes"
              className="font-[family-name:var(--font-mono)] text-xs font-bold uppercase text-on-surface flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-primary" />
              <span>Descrição / Observação do Caso (Opcional)</span>
            </label>
            <textarea
              id="complete-case-notes"
              rows={4}
              value={caseNotes}
              onChange={(e) => setCaseNotes(e.target.value)}
              placeholder="Descreva o que foi feito ou observações do caso (caso tenha)..."
              className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant px-3 py-2.5 text-sm text-on-surface placeholder:text-outline/60 focus:outline-none focus:border-primary-container resize-y"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-error-container/70 border border-error/50 px-3 py-2 text-xs font-semibold text-on-error-container">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/50">
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
              className="px-5 py-2.5 rounded-lg bg-tertiary text-on-tertiary font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-60 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Finalizando...' : 'Confirmar Finalização'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
