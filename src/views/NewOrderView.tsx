import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Factory,
  FilePlus2,
  ListPlus,
  Play,
  Plus,
  PlusCircle
} from 'lucide-react';
import type { AppMetrics, UnitItem, ViewRoute } from '../types';
import { formatDateTimePt, toLocalDatetimeInputValue } from '../lib/format';

interface NewOrderViewProps {
  nextCode: string;
  metrics: AppMetrics;
  units: UnitItem[];
  isMobile?: boolean;
  onCreateUnit: (name: string) => Promise<UnitItem>;
  onCreateOrder: (payload: {
    unit: string;
    description: string;
    createdAt: string;
    urgent: boolean;
    startImmediately: boolean;
    operatorId?: string;
    createdBy?: string;
  }) => Promise<{ code: string }>;
  onNavigate: (route: ViewRoute) => void;
}

export function NewOrderView({
  nextCode,
  metrics,
  units,
  isMobile = false,
  onCreateUnit,
  onCreateOrder,
  onNavigate
}: NewOrderViewProps) {
  const [unit, setUnit] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);
  const [description, setDescription] = useState('');
  const [createdAtLocal, setCreatedAtLocal] = useState(() => toLocalDatetimeInputValue(new Date()));
  const [urgent, setUrgent] = useState(false);
  const [submitting, setSubmitting] = useState<'queue' | 'start' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; message: string; routeTarget: ViewRoute } | null>(
    null
  );

  const showNewUnitInput = addingUnit || units.length === 0;
  const resolvedUnit = showNewUnitInput ? newUnitName.trim() || unit.trim() : unit.trim();

  const previewIso = (() => {
    const parsed = new Date(createdAtLocal);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  })();

  const handleSaveNewUnit = async () => {
    const clean = newUnitName.trim();
    if (clean.length < 2) {
      setError('Digite o nome da unidade (mínimo 2 caracteres).');
      return;
    }
    setSavingUnit(true);
    setError(null);
    try {
      const created = await onCreateUnit(clean);
      setUnit(created.name);
      setNewUnitName('');
      setAddingUnit(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar unidade');
    } finally {
      setSavingUnit(false);
    }
  };

  const handleSubmit = async (startImmediately: boolean) => {
    if (resolvedUnit.length < 2) {
      setError('Selecione ou cadastre a escola / unidade.');
      return;
    }
    if (description.trim().length < 3) {
      setError('Descreva o chamado com pelo menos 3 caracteres.');
      return;
    }

    setError(null);
    setSubmitting(startImmediately ? 'start' : 'queue');
    try {
      const created = await onCreateOrder({
        unit: resolvedUnit,
        description: description.trim(),
        createdAt: previewIso,
        urgent,
        startImmediately,
        createdBy: 'SAC'
      });

      setToast({
        title: startImmediately
          ? `Ordem ${created.code} Criada & Iniciada`
          : `O.S ${created.code} Enfileirada com Sucesso`,
        message: startImmediately
          ? 'Iniciada pelo SAC. Cronômetro ativo.'
          : 'Transmitida para o Painel Geral e TV 60" aguardando operador.',
        routeTarget: startImmediately ? 'operator' : 'dashboard'
      });

      setUnit(resolvedUnit);
      setNewUnitName('');
      setAddingUnit(false);
      setDescription('');
      setCreatedAtLocal(toLocalDatetimeInputValue(new Date()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar O.S');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Cabeçalho + Micro-KPIs */}
      <div className={`flex flex-col ${isMobile ? '' : 'xl:flex-row xl:items-center'} justify-between gap-4`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-primary font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-wider mb-1">
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Módulo de Triagem &amp; Despacho Rápido</span>
          </div>
          <h1
            className={`font-[family-name:var(--font-display)] font-bold text-on-surface tracking-tight leading-tight ${
              isMobile ? 'text-2xl' : 'text-2xl sm:text-4xl'
            }`}
          >
            Cadastro e Enfileiramento de Ordem de Serviço
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl mt-1">
            Informe a unidade, a descrição do chamado, a data de inclusão e sinalize se é urgente para adicionar à fila ou iniciar atendimento imediatamente.
          </p>
        </div>

        {/* Micro-KPI Bar */}
        <div
          className={`grid ${
            isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-3 items-center gap-2 sm:gap-3'
          } bg-surface-container-high p-3 rounded-xl border border-outline-variant/40 shadow-sm shrink-0`}
        >
          <div className="flex flex-col px-2">
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase font-bold">
              O.S na Fila Geral
            </span>
            <span className="font-[family-name:var(--font-display)] text-xl font-bold text-secondary-fixed-dim tabular-nums mt-0.5">
              {metrics.queuedCount} {metrics.queuedCount === 1 ? 'Ordem' : 'Ordens'}
            </span>
          </div>
          <div
            className={`flex flex-col ${
              isMobile ? 'px-2 pt-2 border-t' : 'px-3 border-l'
            } border-outline-variant/50`}
          >
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase font-bold">
              Tempo Médio Espera
            </span>
            <span className="font-[family-name:var(--font-mono)] text-base font-bold text-primary tabular-nums mt-1">
              {String(metrics.avgQueueWaitMinutes).padStart(2, '0')}m 00s
            </span>
          </div>
          <div
            className={`flex flex-col ${
              isMobile ? 'px-2 pt-2 border-t' : 'px-3 border-l'
            } border-outline-variant/50`}
          >
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase font-bold">
              Bancadas Livres
            </span>
            <span className="font-[family-name:var(--font-mono)] text-base font-bold text-tertiary tabular-nums mt-1">
              {String(metrics.freeBenches).padStart(2, '0')} / {String(metrics.totalBenches).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* Formulário (7 col) + Pré-visualização (5 col) */}
      <div className={`grid grid-cols-1 ${isMobile ? '' : 'lg:grid-cols-12'} gap-6 items-start`}>
        <div
          className={`${
            isMobile ? '' : 'lg:col-span-7'
          } bg-surface-container-low p-4 sm:p-5 rounded-xl border border-outline-variant/40 shadow-md flex flex-col gap-5 min-w-0`}
        >
          <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-primary font-[family-name:var(--font-mono)] text-xs uppercase font-bold">
              <FilePlus2 className="w-4 h-4" />
              <span>Dados da Ordem de Serviço</span>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase font-bold">
              Campos Essenciais
            </span>
          </div>

          {/* 1. Unidade (Dropdown dinâmico + Nova unidade) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="os-unit-select"
                className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface uppercase"
              >
                Escola / Unidade *
              </label>
              <div className="flex items-center gap-2">
                {units.length > 0 && !showNewUnitInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingUnit(true);
                      setError(null);
                    }}
                    className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-primary hover:underline uppercase inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Nova Unidade
                  </button>
                )}
                <span className="font-[family-name:var(--font-mono)] text-primary text-[10px] font-bold">
                  {units.length} CADASTRADA{units.length === 1 ? '' : 'S'}
                </span>
              </div>
            </div>

            {units.length > 0 && (
              <div className="relative">
                <Factory className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="os-unit-select"
                  value={showNewUnitInput ? '__new__' : unit}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (error) setError(null);
                    if (val === '__new__') {
                      setAddingUnit(true);
                    } else {
                      setAddingUnit(false);
                      setUnit(val);
                    }
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant/60 focus:border-primary-container rounded-lg pl-9 pr-3 py-2.5 text-sm text-on-surface focus:outline-none cursor-pointer"
                >
                  <option value="">Selecione uma unidade...</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                  <option value="__new__">+ Cadastrar nova unidade...</option>
                </select>
              </div>
            )}

            {showNewUnitInput && (
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Factory className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="os-new-unit-input"
                    type="text"
                    value={newUnitName}
                    onChange={(e) => {
                      setNewUnitName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={
                      units.length === 0
                        ? 'Nenhuma unidade cadastrada ainda. Digite para adicionar...'
                        : 'Digite o nome da nova unidade...'
                    }
                    className="w-full bg-surface-container-lowest border border-primary-container/60 focus:border-primary-container rounded-lg pl-9 pr-3 py-2.5 text-sm text-on-surface placeholder:text-outline/60 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingUnit || newUnitName.trim().length < 2}
                  onClick={handleSaveNewUnit}
                  className="px-3.5 py-2.5 rounded-lg bg-primary-container text-on-primary-container font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {savingUnit ? 'Salvando...' : 'Salvar Unidade'}
                </button>
                {units.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingUnit(false);
                      setNewUnitName('');
                    }}
                    className="px-3 py-2.5 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold uppercase cursor-pointer shrink-0"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. Descrição */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="os-desc-input"
              className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface uppercase flex items-center justify-between gap-2"
            >
              <span>Descrição *</span>
              <span className="text-[11px] text-outline tabular-nums">
                {description.length} Caracteres
              </span>
            </label>
            <textarea
              id="os-desc-input"
              rows={4}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Descreva detalhadamente o problema ou serviço necessário..."
              className="w-full bg-surface-container-lowest border border-outline-variant/60 focus:border-primary-container rounded-lg p-3 text-sm text-on-surface placeholder:text-outline/60 focus:outline-none"
            />
          </div>

          {/* 3. Data + 4. Urgente */}
          <div className={`grid grid-cols-1 ${isMobile ? '' : 'sm:grid-cols-2'} gap-4`}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="os-date-input"
                  className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface uppercase"
                >
                  Data de Adicionado *
                </label>
                <button
                  type="button"
                  onClick={() => setCreatedAtLocal(toLocalDatetimeInputValue(new Date()))}
                  className="font-[family-name:var(--font-mono)] text-[10px] font-bold text-tertiary hover:underline uppercase cursor-pointer"
                >
                  Agora
                </button>
              </div>
              <div className="relative">
                <CalendarClock className="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="os-date-input"
                  type="datetime-local"
                  value={createdAtLocal}
                  onChange={(e) => setCreatedAtLocal(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/60 focus:border-primary-container rounded-lg pl-9 pr-3 py-2.5 font-[family-name:var(--font-mono)] text-sm text-on-surface tabular-nums focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface uppercase">
                  É Urgente? *
                </span>
                <span
                  className={`font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase ${
                    urgent ? 'text-error' : 'text-outline'
                  }`}
                >
                  {urgent ? 'SIM' : 'NÃO'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 h-11">
                <button
                  type="button"
                  onClick={() => setUrgent(true)}
                  className={`h-full rounded-lg font-[family-name:var(--font-mono)] text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    urgent
                      ? 'bg-error-container text-on-error-container border border-error/60 shadow-sm'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-transparent'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>SIM</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUrgent(false)}
                  className={`h-full rounded-lg font-[family-name:var(--font-mono)] text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    !urgent
                      ? 'bg-surface-container-highest text-on-surface border border-primary-container/50 shadow-sm'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-transparent'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>NÃO</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-error-container/70 border border-error/50 px-3.5 py-2.5 text-xs font-semibold text-on-error-container">
              {error}
            </div>
          )}

          {/* Ações */}
          <div className={`pt-4 flex flex-col ${isMobile ? '' : 'sm:flex-row'} items-stretch gap-3 border-t border-outline-variant/60`}>
            <button
              type="button"
              disabled={submitting !== null}
              onClick={() => handleSubmit(false)}
              className="flex-1 min-h-[52px] py-3 px-4 bg-secondary-container hover:brightness-110 active:scale-[0.98] text-on-secondary-container font-[family-name:var(--font-display)] text-sm sm:text-base font-bold uppercase rounded-lg flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-60 cursor-pointer"
            >
              <ListPlus className="w-5 h-5 shrink-0" />
              <span>{submitting === 'queue' ? 'Enfileirando...' : 'Apenas Colocar em Fila'}</span>
            </button>

            <button
              type="button"
              disabled={submitting !== null}
              onClick={() => handleSubmit(true)}
              className="flex-1 min-h-[52px] py-3 px-4 bg-primary-container hover:brightness-110 active:scale-[0.98] text-on-primary-container font-[family-name:var(--font-display)] text-sm sm:text-base font-bold uppercase rounded-lg flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-60 cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current shrink-0" />
              <span>
                {submitting === 'start' ? 'Iniciando...' : 'Criar e Iniciar pelo Operador'}
              </span>
            </button>
          </div>
        </div>

        {/* Pré-visualização em Tempo Real */}
        <div
          className={`${
            isMobile ? '' : 'lg:col-span-5 lg:sticky lg:top-20'
          } bg-surface-container-low p-4 sm:p-5 rounded-xl border border-outline-variant/40 shadow-lg flex flex-col gap-3 min-w-0`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <span className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface">
                Pré-Visualização
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-surface-container-high px-2.5 py-1 rounded font-[family-name:var(--font-mono)] text-[10px] font-bold text-tertiary uppercase">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />
              TEMPO REAL
            </div>
          </div>

          <p className="text-xs text-on-surface-variant">
            Exibição simplificada dos parâmetros da O.S cadastrada.
          </p>

          <div className="relative bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/50 shadow-inner flex flex-col gap-3.5 overflow-hidden">
            <div
              className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                urgent ? 'bg-error' : 'bg-outline-variant'
              }`}
            />

            <div className="flex items-center justify-between gap-2 pl-2">
              <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-primary tracking-tight tabular-nums whitespace-nowrap">
                OS {nextCode}
              </span>
              <span
                className={`font-[family-name:var(--font-mono)] text-[10px] uppercase px-2.5 py-1 rounded font-bold inline-flex items-center gap-1.5 whitespace-nowrap ${
                  urgent
                    ? 'bg-error-container text-on-error-container'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${urgent ? 'bg-error' : 'bg-outline'}`} />
                <span>URGENTE: {urgent ? 'SIM' : 'NÃO'}</span>
              </span>
            </div>

            <div className="pl-2 flex flex-col gap-0.5">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase font-bold">
                Unidade
              </span>
              <div className="font-[family-name:var(--font-display)] text-base font-bold text-on-surface flex items-center gap-1.5">
                <Factory className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">{resolvedUnit || 'Unidade não selecionada'}</span>
              </div>
            </div>

            <div className="pl-2 flex flex-col gap-1">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase font-bold">
                Descrição
              </span>
              <div className="p-3 bg-surface-container rounded-lg text-sm text-on-surface break-words leading-relaxed min-h-[68px]">
                {description.trim() || 'Aguardando detalhamento do chamado técnico...'}
              </div>
            </div>

            <div className="pl-2 pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/40">
              <div className="flex flex-col">
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase font-bold">
                  Data de Adicionado
                </span>
                <span className="font-[family-name:var(--font-mono)] text-xs text-tertiary font-bold tabular-nums">
                  {formatDateTimePt(previewIso)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-on-surface-variant font-[family-name:var(--font-mono)] text-[11px] bg-surface-container px-2.5 py-1.5 rounded">
                <Clock className="w-3.5 h-3.5 text-secondary" />
                <span>Em espera na Fila</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast flutuante de confirmação */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 max-w-md bg-tertiary-container text-on-tertiary-container px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-3 border border-tertiary">
          <div className="flex items-center gap-3 min-w-0">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-mono)] text-xs font-bold uppercase">
                {toast.title}
              </p>
              <p className="text-xs leading-snug mt-0.5">{toast.message}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onNavigate(toast.routeTarget);
                setToast(null);
              }}
              className="px-2.5 py-1 rounded bg-on-tertiary-container text-tertiary-container font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase cursor-pointer"
            >
              Ver
            </button>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="px-2 py-1 rounded bg-black/15 text-[10px] font-bold uppercase cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
