import { useState, type ReactNode } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  KeyRound,
  LayoutGrid,
  LogOut,
  Monitor,
  PlusCircle,
  Tv,
  User,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  X
} from 'lucide-react';
import type { AppMetrics, AuthUser, DispatchAlert, DisplayMode, ViewRoute } from '../types';
import { OsFlowLogo } from './OsFlowLogo';
import { formatRelativePt } from '../lib/format';

interface AppShellProps {
  route: ViewRoute;
  onNavigate: (route: ViewRoute) => void;
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  sseOnline: boolean;
  metrics: AppMetrics;
  unitsCount: number;
  operatorsCount: number;
  authUser: AuthUser;
  onOpenChangePassword: () => void;
  onLogout: () => Promise<void>;
  alerts: DispatchAlert[];
  onAckAlert: (id: number) => Promise<void>;
  onAckAllAlerts: () => Promise<void>;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onTestBeep: () => void;
  children: ReactNode;
}

export function AppShell({
  route,
  onNavigate,
  displayMode,
  onChangeDisplayMode,
  sseOnline,
  metrics,
  unitsCount,
  operatorsCount,
  authUser,
  onOpenChangePassword,
  onLogout,
  alerts,
  onAckAlert,
  onAckAllAlerts,
  soundEnabled,
  onToggleSound,
  onTestBeep,
  children
}: AppShellProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadAlerts = alerts.filter((a) => !a.acknowledged);
  const isTv = displayMode === 'tv';

  const navItems: Array<{
    id: ViewRoute;
    label: string;
    shortLabel: string;
    icon: typeof LayoutGrid;
    badge?: number;
    badgeTone?: string;
  }> = [
    {
      id: 'dashboard',
      label: 'Painel Geral & Fila',
      shortLabel: 'Painel',
      icon: LayoutGrid,
      badge: metrics.queuedCount,
      badgeTone: 'bg-secondary-container/20 text-secondary'
    },
    {
      id: 'new-order',
      label: 'Nova O.S / Triagem',
      shortLabel: 'Nova O.S',
      icon: PlusCircle
    },
    {
      id: 'operator',
      label: 'Atendimento & Baixa',
      shortLabel: 'Atendimento',
      icon: Wrench,
      badge: metrics.inProgressCount,
      badgeTone: 'bg-primary-container/20 text-primary'
    },
    {
      id: 'history',
      label: 'Histórico de Concluídas',
      shortLabel: 'Histórico',
      icon: CheckCircle2,
      badge: metrics.totalCompletedCount,
      badgeTone: 'bg-tertiary/15 text-tertiary'
    },
    {
      id: 'directory',
      label: 'Escolas & Pessoas',
      shortLabel: 'Cadastros',
      icon: Users,
      badge: unitsCount + operatorsCount,
      badgeTone: 'bg-surface-container-high text-on-surface-variant'
    }
  ];

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Header fixo (oculto quando em Modo TV 60") */}
      {!isTv && (
        <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-outline-variant/40 shadow-[0_1px_10px_rgba(0,0,0,0.45)]">
          <div className="h-full w-full px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand + Status */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="flex items-center gap-2.5 text-left cursor-pointer shrink-0"
              >
                <OsFlowLogo className="w-9 h-9 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-[family-name:var(--font-display)] text-lg font-bold text-primary tracking-tight leading-none">
                    OS FLOW
                  </span>
                </div>
              </button>

              <div className="h-6 w-px bg-outline-variant hidden sm:block" />

              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/40">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      sseOnline ? 'bg-tertiary' : 'bg-secondary-container'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      sseOnline ? 'bg-tertiary' : 'bg-secondary-container'
                    }`}
                  />
                </span>
                <span
                  className={`font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider ${
                    sseOnline ? 'text-tertiary' : 'text-secondary'
                  }`}
                >
                  {sseOnline ? 'ONLINE / REAL-TIME' : 'SINCRONIZANDO...'}
                </span>
              </div>
            </div>

            {/* Notificações & Perfil do Operador */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Popover Notificações */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                  }}
                  aria-label="Alertas Sonoros e Notificações"
                  className="relative p-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container border border-outline-variant/40 transition-colors cursor-pointer"
                >
                  {unreadAlerts.length > 0 ? (
                    <BellRing className="w-5 h-5 text-secondary" />
                  ) : (
                    <Bell className="w-5 h-5" />
                  )}
                  {unreadAlerts.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-on-error font-[family-name:var(--font-mono)] text-[10px] font-bold flex items-center justify-center">
                      {unreadAlerts.length}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-surface-container border border-outline-variant shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-b border-outline-variant/60">
                      <span className="font-[family-name:var(--font-display)] text-sm font-bold text-on-surface">
                        Alertas & Despacho Sonoro
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={onToggleSound}
                          className={`px-2 py-1 rounded text-[11px] font-[family-name:var(--font-mono)] font-bold inline-flex items-center gap-1 cursor-pointer ${
                            soundEnabled
                              ? 'bg-tertiary/15 text-tertiary'
                              : 'bg-surface-container-high text-outline'
                          }`}
                        >
                          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                          {soundEnabled ? 'SOM ON' : 'MUDO'}
                        </button>
                        <button
                          type="button"
                          onClick={onTestBeep}
                          className="px-2 py-1 rounded bg-surface-container-high text-[11px] font-[family-name:var(--font-mono)] text-primary hover:bg-surface-bright cursor-pointer"
                        >
                          Testar
                        </button>
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-outline-variant/30">
                      {alerts.length === 0 ? (
                        <p className="p-4 text-xs text-outline text-center">Nenhum evento registrado.</p>
                      ) : (
                        alerts.slice(0, 8).map((al) => (
                          <div
                            key={al.id}
                            className={`px-4 py-3 flex items-start justify-between gap-2 ${
                              al.acknowledged ? 'opacity-60' : 'bg-surface-container-low/50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-primary">
                                  {al.orderCode}
                                </span>
                                <span className="font-[family-name:var(--font-mono)] text-[10px] text-outline">
                                  {formatRelativePt(al.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface mt-0.5 leading-snug">{al.message}</p>
                              <p className="text-[11px] text-outline mt-0.5">{al.actor}</p>
                            </div>
                            {!al.acknowledged && (
                              <button
                                type="button"
                                onClick={() => onAckAlert(al.id)}
                                className="px-2 py-1 rounded bg-surface-container-high hover:bg-primary-container hover:text-on-primary-container text-[10px] font-[family-name:var(--font-mono)] font-bold uppercase shrink-0 cursor-pointer"
                              >
                                Ciente
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="px-4 py-2.5 bg-surface-container-low border-t border-outline-variant/60 flex items-center justify-between gap-2">
                      {unreadAlerts.length > 0 ? (
                        <button
                          type="button"
                          onClick={onAckAllAlerts}
                          className="text-xs font-[family-name:var(--font-mono)] font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Marcar todos como ciente
                        </button>
                      ) : (
                        <span className="text-[11px] text-outline">Todos os alertas lidos</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Selo Acesso Único SAC + Senha / Sair */}
              <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg">
                <div className="hidden md:flex flex-col text-right">
                  <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-on-surface leading-tight max-w-[170px] truncate">
                    {authUser.displayName}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-tertiary uppercase font-semibold">
                    @{authUser.username}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <button
                  type="button"
                  onClick={onOpenChangePassword}
                  title="Alterar senha"
                  aria-label="Alterar senha"
                  className="p-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-primary border border-outline-variant/40 transition-colors cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  title="Sair"
                  aria-label="Sair"
                  className="px-2.5 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-error border border-outline-variant/40 font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Sidebar fixa (Desktop >= lg, oculta no Modo TV) */}
      {!isTv && (
        <aside className="hidden lg:flex fixed left-0 top-16 bottom-0 w-64 bg-surface-container-lowest border-r border-outline-variant/40 z-30 flex-col py-4">
          <div className="px-4 mb-3">
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase text-outline tracking-wider">
              Operação de Campo
            </span>
          </div>

          <nav className="flex-1 px-2.5 space-y-1 flex flex-col">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-lg text-[13px] transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </span>
                  {typeof item.badge === 'number' && (
                    <span
                      className={`px-1.5 py-0.5 rounded font-[family-name:var(--font-mono)] text-[10px] font-bold tabular-nums shrink-0 ${
                        active ? 'bg-on-primary-container/15 text-on-primary-container' : item.badgeTone
                      }`}
                    >
                      {String(item.badge).padStart(2, '0')}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Seletor de Exibição TV 60" / Desktop no canto inferior esquerdo */}
          <div className="mx-3 mt-auto p-3 rounded-lg bg-surface-container-low border border-outline-variant/40 flex flex-col gap-2">
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase text-outline font-bold tracking-wider">
              Modo de Exibição
            </span>
            <div className="grid grid-cols-2 gap-1.5 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/40">
              <button
                type="button"
                aria-pressed="true"
                onClick={() => onChangeDisplayMode('desktop')}
                className="py-2 px-2 rounded-md font-[family-name:var(--font-mono)] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-primary-container text-on-primary-container shadow-sm"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                aria-pressed="false"
                onClick={() => onChangeDisplayMode('tv')}
                className="py-2 px-2 rounded-md font-[family-name:var(--font-mono)] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>TV 60&quot;</span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Área principal */}
      <div className={!isTv ? 'lg:pl-64' : ''}>
        <main
          className={`min-h-screen transition-all ${
            isTv ? 'px-6 sm:px-10 py-6' : 'pt-20 pb-24 lg:pb-10 px-3 sm:px-5'
          }`}
        >
          {/* Barra superior do Modo TV 60" */}
          {isTv && (
            <div
              id="tv-exit-bar"
              className="w-full flex flex-wrap items-center justify-between gap-3 mb-6 bg-surface-container-low px-5 py-3 rounded-xl border border-outline-variant shadow-md"
            >
              <div className="flex items-center gap-3">
                <OsFlowLogo className="w-8 h-8" />
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tertiary" />
                </span>
                <span className="font-[family-name:var(--font-mono)] text-xs text-tertiary uppercase tracking-wider font-bold">
                  MODO TV 60&quot; INDUSTRIAL • PAINEL SINCRONIZADO
                </span>
              </div>
              <button
                type="button"
                onClick={() => onChangeDisplayMode('desktop')}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface hover:text-primary font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-wider flex items-center gap-2 border border-outline-variant cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Sair do Modo TV (Esc)</span>
              </button>
            </div>
          )}

          <div className="w-full">{children}</div>
        </main>
      </div>

      {/* Navegação inferior automática em viewports reais < lg (exceto Modo TV) */}
      {!isTv && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-lg border-t border-outline-variant/60 grid grid-cols-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`min-h-[56px] py-2 px-1 flex flex-col items-center justify-center gap-1 text-[10px] font-[family-name:var(--font-mono)] font-bold uppercase cursor-pointer ${
                  active ? 'text-primary bg-primary-container/10' : 'text-outline hover:text-on-surface'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
