import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  RotateCcw,
  Search,
  UserCheck
} from 'lucide-react';
import type { AppMetrics, Operator, WorkOrder } from '../types';
import { api } from '../lib/api';
import { formatDateTimePt, formatDurationShort, formatTimeShort } from '../lib/format';

interface HistoryViewProps {
  orders: WorkOrder[];
  operators: Operator[];
  metrics: AppMetrics;
  isMobile?: boolean;
  onReopenOrder: (orderId: number) => Promise<void>;
  onOpenOrderModal: (order: WorkOrder) => void;
}

export function HistoryView({
  orders,
  operators,
  metrics,
  isMobile = false,
  onReopenOrder,
  onOpenOrderModal
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'urgent' | 'normal'>('all');
  const [operatorFilter, setOperatorFilter] = useState<string>('all');
  const [reopeningId, setReopeningId] = useState<number | null>(null);

  const completed = orders
    .filter((o) => o.status === 'completed')
    .sort((a, b) => Date.parse(b.completedAt || b.createdAt) - Date.parse(a.completedAt || a.createdAt));

  const filtered = completed.filter((o) => {
    if (urgencyFilter === 'urgent' && !o.urgent) return false;
    if (urgencyFilter === 'normal' && o.urgent) return false;
    if (operatorFilter !== 'all' && o.assignedOperatorId !== operatorFilter) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${o.code} ${o.unit} ${o.title} ${o.description} ${o.assignedOperatorName || ''} ${o.operatorNotes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const avgDurationSec =
    completed.length > 0
      ? Math.round(completed.reduce((acc, o) => acc + o.elapsedSeconds, 0) / completed.length)
      : 0;

  const csvUrl = api.getExportCsvUrl({
    status: 'completed',
    urgent: urgencyFilter,
    operatorId: operatorFilter,
    q: search.trim()
  });

  const handleReopen = async (id: number) => {
    setReopeningId(id);
    try {
      await onReopenOrder(id);
    } finally {
      setReopeningId(null);
    }
  };

  return (
    <div className="flex flex-col w-full gap-5 min-w-0">
      {/* Cabeçalho */}
      <div className={`flex flex-col ${isMobile ? '' : 'lg:flex-row lg:items-center'} justify-between gap-4`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-tertiary font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-wider mb-1">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Registro Histórico &amp; Auditoria Industrial</span>
          </div>
          <h1
            className={`font-[family-name:var(--font-display)] font-bold text-on-surface tracking-tight ${
              isMobile ? 'text-2xl' : 'text-2xl sm:text-3xl'
            }`}
          >
            Histórico de Ordens Concluídas
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Consulte baixas realizadas, notas técnicas de fechamento, tempo total de atendimento e exporte relatórios em CSV.
          </p>
        </div>

        <a
          href={csvUrl}
          download="os-flow-relatorio.csv"
          className={`px-4 py-2.5 rounded-lg bg-primary-container hover:brightness-110 text-on-primary-container font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 shadow-sm shrink-0 ${
            isMobile ? 'w-full' : 'self-start lg:self-auto'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Exportar CSV</span>
        </a>
      </div>

      {/* KPIs Consolidados */}
      <div className={`grid grid-cols-2 ${isMobile ? '' : 'lg:grid-cols-4'} gap-3 sm:gap-4`}>
        <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/40">
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase text-outline">
            Total Concluídas
          </span>
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-on-surface tabular-nums mt-1">
            {String(completed.length).padStart(2, '0')}
          </p>
        </div>

        <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/40">
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase text-outline">
            Finalizadas Hoje
          </span>
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-tertiary tabular-nums mt-1">
            {String(metrics.completedTodayCount).padStart(2, '0')}
          </p>
        </div>

        <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/40">
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase text-outline">
            Tempo Médio Atendimento
          </span>
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-primary tabular-nums mt-1">
            {avgDurationSec > 0 ? formatDurationShort(avgDurationSec) : '—'}
          </p>
        </div>

        <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/40">
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase text-outline">
            Cumprimento SLA
          </span>
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-tertiary tabular-nums mt-1">
            {metrics.slaRate}%
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div
        className={`bg-surface-container-low p-3.5 sm:p-4 rounded-xl border border-outline-variant/40 flex flex-col ${
          isMobile ? '' : 'lg:flex-row lg:items-center'
        } justify-between gap-3 min-w-0`}
      >
        <div className="relative flex-1 min-w-0 w-full">
          <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código (#1033), unidade, título, observações ou operador..."
            className="w-full bg-surface-container-lowest border border-outline-variant/60 rounded-lg pl-9 pr-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary-container"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/40">
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'urgent', label: 'Urgentes' },
                { id: 'normal', label: 'Normais' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setUrgencyFilter(opt.id)}
                className={`px-2.5 sm:px-3 py-1 rounded font-[family-name:var(--font-mono)] text-xs font-bold uppercase cursor-pointer transition-colors ${
                  urgencyFilter === opt.id
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filtrar por operador"
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            className={`bg-surface-container-lowest border border-outline-variant/60 rounded-lg px-3 py-2 text-xs font-[family-name:var(--font-mono)] text-on-surface focus:outline-none cursor-pointer ${
              isMobile ? 'w-full' : ''
            }`}
          >
            <option value="all">Todos Operadores</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Concluídas */}
      {filtered.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-10 border border-dashed border-outline-variant/60 text-center text-sm text-outline">
          Nenhuma ordem concluída encontrada para os filtros selecionados.
        </div>
      ) : (
        <div className="flex flex-col gap-3 min-w-0">
          {filtered.map((order) => (
            <article
              key={order.id}
              className="relative bg-surface-container rounded-xl p-4 sm:p-5 border border-outline-variant/40 hover:bg-surface-container-high transition-colors overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-tertiary rounded-l-xl" />

              <div
                className={`pl-2 flex flex-col ${
                  isMobile ? '' : 'lg:flex-row lg:items-center'
                } justify-between gap-4 min-w-0`}
              >
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-[family-name:var(--font-mono)] text-base font-bold text-primary tabular-nums">
                      OS {order.code}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-tertiary/15 text-tertiary font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase">
                      CONCLUÍDA
                    </span>
                    {order.urgent && (
                      <span className="px-2 py-0.5 rounded bg-error text-on-error font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        URGENTE
                      </span>
                    )}
                    <span className="font-[family-name:var(--font-mono)] text-xs text-on-surface-variant inline-flex items-center gap-1 break-words min-w-0">
                      <Building2 className="w-3.5 h-3.5 text-outline shrink-0" />
                      <span>{order.unit}</span>
                    </span>
                  </div>

                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface break-words">
                    {order.title}
                  </h3>

                  <p className="text-sm text-on-surface-variant break-words">{order.description}</p>

                  {order.operatorNotes && (
                    <div className="mt-1 px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface break-words">
                      <strong className="font-[family-name:var(--font-mono)] text-tertiary uppercase">
                        Notas de Baixa:
                      </strong>{' '}
                      {order.operatorNotes}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs font-[family-name:var(--font-mono)] text-outline tabular-nums">
                    <span className="inline-flex items-center gap-1 text-on-surface-variant">
                      <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                      Finalizado por: <strong className="text-on-surface">{order.completedBy || order.assignedOperatorName || '—'}</strong>
                    </span>
                    <span>Criada: {formatDateTimePt(order.createdAt)}</span>
                    <span>Baixa: {formatTimeShort(order.completedAt)}</span>
                    <span className="inline-flex items-center gap-1 text-tertiary font-bold">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Duração: {formatDurationShort(order.elapsedSeconds)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenOrderModal(order)}
                    className="px-3.5 py-2 rounded-lg bg-surface-container-lowest hover:bg-surface-bright text-on-surface border border-outline-variant/50 font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    Detalhes
                  </button>
                  <button
                    type="button"
                    disabled={reopeningId === order.id}
                    onClick={() => handleReopen(order.id)}
                    className="px-3.5 py-2 rounded-lg bg-secondary-container/20 hover:bg-secondary-container text-secondary hover:text-on-secondary-container border border-secondary-container/40 font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {reopeningId === order.id ? 'Reabrindo...' : 'Reabrir O.S'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
