import { useState } from 'react';
import {
  Building2,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import type { Operator, UnitItem } from '../types';

interface DirectoryViewProps {
  units: UnitItem[];
  operators: Operator[];
  onCreateUnit: (name: string) => Promise<UnitItem>;
  onUpdateUnit: (id: number, name: string) => Promise<UnitItem>;
  onDeleteUnit: (id: number) => Promise<void>;
  onCreateOperator: (payload: { name: string; badge?: string; station?: string }) => Promise<Operator>;
  onUpdateOperator: (id: string, payload: { name: string; badge?: string; station?: string }) => Promise<Operator>;
  onDeleteOperator: (id: string) => Promise<void>;
}

export function DirectoryView({
  units,
  operators,
  onCreateUnit,
  onUpdateUnit,
  onDeleteUnit,
  onCreateOperator,
  onUpdateOperator,
  onDeleteOperator
}: DirectoryViewProps) {
  // Escolas / Unidades state
  const [unitSearch, setUnitSearch] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editingUnitName, setEditingUnitName] = useState('');
  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState<number | null>(null);
  const [unitBusy, setUnitBusy] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  // Pessoas state
  const [personSearch, setPersonSearch] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonStation, setNewPersonStation] = useState('');
  const [newPersonBadge, setNewPersonBadge] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPersonName, setEditingPersonName] = useState('');
  const [editingPersonStation, setEditingPersonStation] = useState('');
  const [editingPersonBadge, setEditingPersonBadge] = useState('');
  const [confirmDeletePersonId, setConfirmDeletePersonId] = useState<string | null>(null);
  const [personBusy, setPersonBusy] = useState(false);
  const [personError, setPersonError] = useState<string | null>(null);

  const filteredUnits = units.filter((u) => {
    const q = unitSearch.trim().toLowerCase();
    return !q || u.name.toLowerCase().includes(q);
  });

  const filteredOperators = operators.filter((op) => {
    const q = personSearch.trim().toLowerCase();
    return (
      !q ||
      `${op.name} ${op.station} ${op.badge}`.toLowerCase().includes(q)
    );
  });

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newUnitName.trim();
    if (clean.length < 2) {
      setUnitError('Informe o nome da escola / unidade (mínimo 2 caracteres).');
      return;
    }
    setAddingUnit(true);
    setUnitError(null);
    try {
      await onCreateUnit(clean);
      setNewUnitName('');
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : 'Erro ao adicionar escola / unidade');
    } finally {
      setAddingUnit(false);
    }
  };

  const handleSaveUnitEdit = async (id: number) => {
    const clean = editingUnitName.trim();
    if (clean.length < 2) {
      setUnitError('Nome deve ter pelo menos 2 caracteres.');
      return;
    }
    setUnitBusy(true);
    setUnitError(null);
    try {
      await onUpdateUnit(id, clean);
      setEditingUnitId(null);
      setEditingUnitName('');
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : 'Erro ao atualizar escola / unidade');
    } finally {
      setUnitBusy(false);
    }
  };

  const handleDeleteUnit = async (id: number) => {
    setUnitBusy(true);
    setUnitError(null);
    try {
      await onDeleteUnit(id);
      setConfirmDeleteUnitId(null);
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : 'Erro ao excluir escola / unidade');
    } finally {
      setUnitBusy(false);
    }
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPersonName.trim();
    if (clean.length < 2) {
      setPersonError('Informe o nome da pessoa (mínimo 2 caracteres).');
      return;
    }
    setAddingPerson(true);
    setPersonError(null);
    try {
      await onCreateOperator({
        name: clean,
        station: newPersonStation.trim() || 'Equipe Técnica',
        badge: newPersonBadge.trim()
      });
      setNewPersonName('');
      setNewPersonStation('');
      setNewPersonBadge('');
    } catch (err) {
      setPersonError(err instanceof Error ? err.message : 'Erro ao cadastrar pessoa');
    } finally {
      setAddingPerson(false);
    }
  };

  const handleSavePersonEdit = async (id: string) => {
    const clean = editingPersonName.trim();
    if (clean.length < 2) {
      setPersonError('Nome deve ter pelo menos 2 caracteres.');
      return;
    }
    setPersonBusy(true);
    setPersonError(null);
    try {
      await onUpdateOperator(id, {
        name: clean,
        station: editingPersonStation.trim() || 'Equipe Técnica',
        badge: editingPersonBadge.trim()
      });
      setEditingPersonId(null);
    } catch (err) {
      setPersonError(err instanceof Error ? err.message : 'Erro ao atualizar pessoa');
    } finally {
      setPersonBusy(false);
    }
  };

  const handleDeletePerson = async (id: string) => {
    setPersonBusy(true);
    setPersonError(null);
    try {
      await onDeleteOperator(id);
      setConfirmDeletePersonId(null);
    } catch (err) {
      setPersonError(err instanceof Error ? err.message : 'Erro ao excluir pessoa');
    } finally {
      setPersonBusy(false);
    }
  };

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-1.5 text-primary font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-wider mb-1">
          <Users className="w-4 h-4" />
          <span>Catálogo de Cadastros</span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
          Escolas &amp; Pessoas
        </h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Adicione, edite ou remova escolas/unidades e integrantes da equipe usados nos dropdowns de criação e finalização de O.S.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* COLUNA 1: ESCOLAS / UNIDADES */}
        <section className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/40 shadow-md flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-variant/50">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface">
                Escolas / Unidades
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-primary-container/15 text-primary font-[family-name:var(--font-mono)] text-xs font-bold tabular-nums">
              {String(units.length).padStart(2, '0')}
            </span>
          </div>

          <form onSubmit={handleAddUnit} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <input
              type="text"
              value={newUnitName}
              onChange={(e) => {
                setNewUnitName(e.target.value);
                if (unitError) setUnitError(null);
              }}
              placeholder="Nome da escola ou unidade..."
              className="flex-1 min-w-[180px] bg-surface-container-lowest border border-outline-variant/60 focus:border-primary-container rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addingUnit}
              className="px-4 py-2 rounded-lg bg-primary-container hover:brightness-110 text-on-primary-container font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              {addingUnit ? 'Salvando...' : 'Adicionar'}
            </button>
          </form>

          {unitError && (
            <div className="rounded-lg bg-error-container/70 border border-error/50 px-3 py-2 text-xs font-semibold text-on-error-container">
              {unitError}
            </div>
          )}

          {units.length > 4 && (
            <div className="relative">
              <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                placeholder="Buscar escola / unidade..."
                className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-lg pl-9 pr-3 py-1.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary-container"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            {filteredUnits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-outline-variant/60 p-6 text-center text-xs text-outline">
                {units.length === 0
                  ? 'Nenhuma escola / unidade cadastrada ainda.'
                  : 'Nenhuma escola encontrada para o filtro.'}
              </div>
            ) : (
              filteredUnits.map((u) => {
                const isEditing = editingUnitId === u.id;
                const isConfirmDelete = confirmDeleteUnitId === u.id;

                return (
                  <div
                    key={u.id}
                    className="rounded-lg bg-surface-container p-3 border border-outline-variant/40 flex flex-wrap items-center justify-between gap-2"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          autoFocus
                          value={editingUnitName}
                          onChange={(e) => {
                            setEditingUnitName(e.target.value);
                            if (unitError) setUnitError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveUnitEdit(u.id);
                            } else if (e.key === 'Escape') {
                              setEditingUnitId(null);
                              setEditingUnitName('');
                            }
                          }}
                          className="flex-1 min-w-0 bg-surface-container-lowest border border-primary-container rounded px-2.5 py-1.5 text-sm text-on-surface focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={unitBusy}
                          onClick={() => handleSaveUnitEdit(u.id)}
                          className="px-2.5 py-1.5 rounded bg-tertiary text-on-tertiary font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUnitId(null);
                            setEditingUnitName('');
                          }}
                          className="p-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
                          aria-label="Cancelar edição"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-on-surface break-words">{u.name}</p>
                        </div>

                        {isConfirmDelete ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={unitBusy}
                              onClick={() => handleDeleteUnit(u.id)}
                              className="px-2.5 py-1 rounded bg-error text-on-error font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUnitId(null)}
                              className="px-2 py-1 rounded bg-surface-container-high text-on-surface-variant text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUnitId(u.id);
                                setEditingUnitName(u.name);
                                setConfirmDeleteUnitId(null);
                                setUnitError(null);
                              }}
                              className="px-2.5 py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-primary font-[family-name:var(--font-mono)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteUnitId(u.id);
                                setEditingUnitId(null);
                              }}
                              className="px-2.5 py-1.5 rounded bg-surface-container-high hover:bg-error-container/60 text-error font-[family-name:var(--font-mono)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* COLUNA 2: PESSOAS / EQUIPE */}
        <section className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/40 shadow-md flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-variant/50">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-tertiary" />
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface">
                Pessoas / Equipe
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary font-[family-name:var(--font-mono)] text-xs font-bold tabular-nums">
              {String(operators.length).padStart(2, '0')}
            </span>
          </div>

          <form onSubmit={handleAddPerson} className="flex flex-col gap-2">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => {
                  setNewPersonName(e.target.value);
                  if (personError) setPersonError(null);
                }}
                placeholder="Nome completo *"
                className="flex-1 min-w-[160px] bg-surface-container-lowest border border-outline-variant/60 focus:border-primary-container rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingPerson}
                className="px-4 py-2 rounded-lg bg-tertiary hover:brightness-110 text-on-tertiary font-[family-name:var(--font-mono)] text-xs font-bold uppercase inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                {addingPerson ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={newPersonStation}
                onChange={(e) => setNewPersonStation(e.target.value)}
                placeholder="Estação / Função (opcional)"
                className="bg-surface-container-lowest border border-outline-variant/50 focus:border-primary-container rounded-lg px-3 py-1.5 text-xs text-on-surface placeholder:text-outline/60 focus:outline-none"
              />
              <input
                type="text"
                value={newPersonBadge}
                onChange={(e) => setNewPersonBadge(e.target.value)}
                placeholder="Crachá / ID (opcional)"
                className="bg-surface-container-lowest border border-outline-variant/50 focus:border-primary-container rounded-lg px-3 py-1.5 text-xs text-on-surface placeholder:text-outline/60 focus:outline-none"
              />
            </div>
          </form>

          {personError && (
            <div className="rounded-lg bg-error-container/70 border border-error/50 px-3 py-2 text-xs font-semibold text-on-error-container">
              {personError}
            </div>
          )}

          {operators.length > 4 && (
            <div className="relative">
              <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                placeholder="Buscar pessoa..."
                className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-lg pl-9 pr-3 py-1.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary-container"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            {filteredOperators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-outline-variant/60 p-6 text-center text-xs text-outline">
                {operators.length === 0
                  ? 'Nenhuma pessoa cadastrada ainda.'
                  : 'Nenhuma pessoa encontrada para o filtro.'}
              </div>
            ) : (
              filteredOperators.map((op) => {
                const isEditing = editingPersonId === op.id;
                const isConfirmDelete = confirmDeletePersonId === op.id;

                return (
                  <div
                    key={op.id}
                    className="rounded-lg bg-surface-container p-3 border border-outline-variant/40 flex flex-wrap items-center justify-between gap-2"
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={editingPersonName}
                            onChange={(e) => {
                              setEditingPersonName(e.target.value);
                              if (personError) setPersonError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSavePersonEdit(op.id);
                              } else if (e.key === 'Escape') {
                                setEditingPersonId(null);
                              }
                            }}
                            placeholder="Nome *"
                            className="flex-1 min-w-0 bg-surface-container-lowest border border-primary-container rounded px-2.5 py-1.5 text-sm text-on-surface focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={personBusy}
                            onClick={() => handleSavePersonEdit(op.id)}
                            className="px-2.5 py-1.5 rounded bg-tertiary text-on-tertiary font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase inline-flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPersonId(null)}
                            className="p-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer shrink-0"
                            aria-label="Cancelar edição"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editingPersonStation}
                            onChange={(e) => setEditingPersonStation(e.target.value)}
                            placeholder="Estação / Função"
                            className="bg-surface-container-lowest border border-outline-variant rounded px-2.5 py-1 text-xs text-on-surface focus:outline-none"
                          />
                          <input
                            type="text"
                            value={editingPersonBadge}
                            onChange={(e) => setEditingPersonBadge(e.target.value)}
                            placeholder="Crachá / ID"
                            className="bg-surface-container-lowest border border-outline-variant rounded px-2.5 py-1 text-xs text-on-surface focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-on-surface break-words">
                            {op.name}
                            {op.badge && (
                              <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px] text-primary">
                                {op.badge}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-on-surface-variant">{op.station}</p>
                        </div>

                        {isConfirmDelete ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={personBusy}
                              onClick={() => handleDeletePerson(op.id)}
                              className="px-2.5 py-1 rounded bg-error text-on-error font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePersonId(null)}
                              className="px-2 py-1 rounded bg-surface-container-high text-on-surface-variant text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPersonId(op.id);
                                setEditingPersonName(op.name);
                                setEditingPersonStation(op.station);
                                setEditingPersonBadge(op.badge);
                                setConfirmDeletePersonId(null);
                                setPersonError(null);
                              }}
                              className="px-2.5 py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-primary font-[family-name:var(--font-mono)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeletePersonId(op.id);
                                setEditingPersonId(null);
                              }}
                              className="px-2.5 py-1.5 rounded bg-surface-container-high hover:bg-error-container/60 text-error font-[family-name:var(--font-mono)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
