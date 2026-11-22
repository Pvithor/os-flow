import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CompleteOrderModal } from './components/CompleteOrderModal';
import { OrderDetailModal } from './components/OrderDetailModal';
import { PauseOrderModal } from './components/PauseOrderModal';
import { api, setUnauthorizedHandler, subscribeEvents } from './lib/api';
import { isSoundEnabled, playBeep, setSoundEnabled } from './lib/sound';
import { trackEvent } from './lib/telemetry';
import type { AppState, AuthStatus, AuthUser, DisplayMode, ViewRoute, WorkOrder } from './types';
import { DashboardView } from './views/DashboardView';
import { DirectoryView } from './views/DirectoryView';
import { HistoryView } from './views/HistoryView';
import { LoginView } from './views/LoginView';
import { NewOrderView } from './views/NewOrderView';
import { OperatorView } from './views/OperatorView';

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sseOnline, setSseOnline] = useState(false);

  const [route, setRoute] = useState<ViewRoute>('dashboard');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('desktop');

  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => isSoundEnabled());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [focusedOrderId, setFocusedOrderId] = useState<number | null>(null);
  const [modalOrderId, setModalOrderId] = useState<number | null>(null);
  const [pauseModalOrder, setPauseModalOrder] = useState<WorkOrder | null>(null);
  const [completeModalState, setCompleteModalState] = useState<{
    orderId: number;
    initialNotes: string;
    initialFinisher: string;
  } | null>(null);
  const [completionToast, setCompletionToast] = useState<string | null>(null);

  useEffect(() => {
    if (!completionToast) return;
    const timer = window.setTimeout(() => setCompletionToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [completionToast]);

  // Relógio e cronômetros em tempo real (1s)
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const refreshAuthStatus = () => {
    setAuthLoading(true);
    setAuthError(null);
    api
      .getAuthStatus()
      .then((status) => {
        setAuthStatus(status);
        setAuthLoading(false);
      })
      .catch((err) => {
        setAuthError(err instanceof Error ? err.message : 'Falha ao verificar autenticação');
        setAuthLoading(false);
      });
  };

  // Verificação inicial de sessão + interceptação 401
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAppState(null);
      setSseOnline(false);
      setFocusedOrderId(null);
      setModalOrderId(null);
      setPauseModalOrder(null);
      setCompleteModalState(null);
      setChangePasswordOpen(false);
      api
        .getAuthStatus()
        .then((status) => setAuthStatus(status))
        .catch(() => setAuthStatus({ authenticated: false, needsSetup: false, user: null }));
    });

    refreshAuthStatus();
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  // Carga inicial + SSE em tempo real somente após autenticação
  useEffect(() => {
    if (!authStatus?.authenticated) {
      setAppState(null);
      setSseOnline(false);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    api
      .getState()
      .then((data) => {
        if (!mounted) return;
        setAppState(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : 'Falha ao conectar ao servidor OS Flow');
        setLoading(false);
      });

    const unsubscribe = subscribeEvents(
      ({ event, payload, state }) => {
        if (!mounted) return;
        setAppState(state);
        setLoading(false);
        setLoadError(null);

        if (event === 'order_created') {
          const created = (payload as { order?: WorkOrder } | undefined)?.order;
          playBeep(created?.urgent ? 'urgent' : 'dispatch');
        } else if (event === 'order_completed') {
          playBeep('complete');
        }
      },
      (online) => {
        if (mounted) setSseOnline(online);
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [authStatus?.authenticated]);

  // Controle do Modo TV 60" + Esc + Fullscreen
  const handleChangeDisplayMode = (mode: DisplayMode) => {
    setDisplayMode(mode);
    if (mode === 'tv') {
      setRoute('dashboard');
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && displayMode === 'tv') {
        handleChangeDisplayMode('desktop');
      }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement && displayMode === 'tv') {
        setDisplayMode('desktop');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [displayMode]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setSoundEnabled(next);
    if (next) playBeep('dispatch');
  };

  const handleAuthenticated = (user: AuthUser) => {
    setAuthStatus({ authenticated: true, needsSetup: false, user });
    setLoadError(null);
    setLoading(true);
    trackEvent('auth_authenticated', { role: user.role });
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // noop
    }
    setAppState(null);
    setSseOnline(false);
    setFocusedOrderId(null);
    setModalOrderId(null);
    setPauseModalOrder(null);
    setCompleteModalState(null);
    setChangePasswordOpen(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setDisplayMode('desktop');
    setRoute('dashboard');
    setAuthStatus({ authenticated: false, needsSetup: false, user: null });
  };

  if (authLoading && !authStatus) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="rounded-xl bg-surface-container border border-outline-variant p-6 text-center max-w-sm w-full">
          <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin mx-auto mb-3" />
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface">
            Verificando acesso...
          </p>
          <p className="font-[family-name:var(--font-mono)] text-xs text-outline mt-1">
            OS FLOW • Segurança Local
          </p>
        </div>
      </div>
    );
  }

  if (!authStatus && authError) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="rounded-xl bg-surface-container border border-error/50 p-6 text-center max-w-md w-full">
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-error">
            Servidor Indisponível
          </p>
          <p className="text-sm text-on-surface-variant mt-1">{authError}</p>
          <button
            type="button"
            onClick={refreshAuthStatus}
            className="mt-4 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-bold text-xs uppercase cursor-pointer"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!authStatus?.authenticated || !authStatus.user) {
    return (
      <LoginView
        needsSetup={Boolean(authStatus?.needsSetup)}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  if (loading && !appState) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="rounded-xl bg-surface-container border border-outline-variant p-6 text-center max-w-sm w-full">
          <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin mx-auto mb-3" />
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface">
            Conectando ao OS Flow...
          </p>
          <p className="font-[family-name:var(--font-mono)] text-xs text-outline mt-1">
            Sincronizando telemetria e fila industrial
          </p>
        </div>
      </div>
    );
  }

  if (!appState) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="rounded-xl bg-surface-container border border-error/50 p-6 text-center max-w-md w-full">
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-error">
            Servidor Indisponível
          </p>
          <p className="text-sm text-on-surface-variant mt-1">{loadError || 'Sem resposta da API'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-bold text-xs uppercase cursor-pointer"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const modalOrder =
    modalOrderId !== null ? appState.orders.find((o) => o.id === modalOrderId) || null : null;

  const completeModalOrder =
    completeModalState !== null
      ? appState.orders.find((o) => o.id === completeModalState.orderId) || null
      : null;

  const handleClaimOrder = async (orderId: number) => {
    const { state } = await api.claimOrder(orderId);
    setAppState(state);
    playBeep('dispatch');
    trackEvent('order_claimed', { orderId });
  };

  const handleCreateOrder = async (payload: {
    unit: string;
    description: string;
    createdAt: string;
    urgent: boolean;
    startImmediately: boolean;
    operatorId?: string;
    createdBy?: string;
  }) => {
    const { order, state } = await api.createOrder(payload);
    setAppState(state);
    if (payload.startImmediately) {
      setFocusedOrderId(order.id);
    }
    trackEvent('order_created', {
      urgent: payload.urgent,
      startImmediately: payload.startImmediately
    });
    return order;
  };

  const handleCompleteOrder = async (orderId: number, notes: string, completedBy: string) => {
    const { order, state } = await api.completeOrder(orderId, {
      notes,
      completedBy
    });
    setAppState(state);
    setCompletionToast(`Ordem OS ${order.code} finalizada por ${order.completedBy || completedBy}!`);
    trackEvent('order_completed', {
      orderId,
      elapsedSeconds: order.elapsedSeconds
    });
    return order;
  };

  const handleCreateOperator = async (payload: { name: string; badge?: string; station?: string }) => {
    const { operator, state } = await api.createOperator(payload);
    setAppState(state);
    return operator;
  };

  const handleOpenOperatorTask = (order: WorkOrder) => {
    setFocusedOrderId(order.id);
    setRoute('operator');
  };

  return (
    <>
      <AppShell
        route={route}
        onNavigate={(nextRoute) => {
          if (displayMode === 'tv' && nextRoute !== 'dashboard') {
            handleChangeDisplayMode('desktop');
          }
          setRoute(nextRoute);
        }}
        displayMode={displayMode}
        onChangeDisplayMode={handleChangeDisplayMode}
        sseOnline={sseOnline}
        metrics={appState.metrics}
        unitsCount={appState.units.length}
        operatorsCount={appState.operators.length}
        authUser={authStatus.user}
        onOpenChangePassword={() => setChangePasswordOpen(true)}
        onLogout={handleLogout}
        alerts={appState.alerts}
        onAckAlert={async (id) => {
          const { state } = await api.ackAlert(id);
          setAppState(state);
        }}
        onAckAllAlerts={async () => {
          const { state } = await api.ackAllAlerts();
          setAppState(state);
        }}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onTestBeep={() => playBeep('urgent')}
      >
        {route === 'dashboard' && (
          <DashboardView
            orders={appState.orders}
            alerts={appState.alerts}
            notices={appState.notices}
            metrics={appState.metrics}
            settings={appState.settings}
            displayMode={displayMode}
            nowMs={nowMs}
            onChangeDisplayMode={handleChangeDisplayMode}
            onNavigate={setRoute}
            onAckAlert={async (id) => {
              const { state } = await api.ackAlert(id);
              setAppState(state);
            }}
            onCreateNotice={async (text) => {
              const { state } = await api.createNotice({
                text,
                author: 'SAC'
              });
              setAppState(state);
            }}
            onUpdateNotice={async (id, text) => {
              const { state } = await api.updateNotice(id, { text });
              setAppState(state);
            }}
            onDeleteNotice={async (id) => {
              const { state } = await api.deleteNotice(id);
              setAppState(state);
            }}
            onClaimOrder={handleClaimOrder}
            onOpenOrderModal={(order) => setModalOrderId(order.id)}
            onOpenOperatorTask={handleOpenOperatorTask}
          />
        )}

        {route === 'new-order' && (
          <NewOrderView
            nextCode={appState.nextCode}
            metrics={appState.metrics}
            units={appState.units}
            onCreateUnit={async (name) => {
              const { unit, state } = await api.createUnit(name);
              setAppState(state);
              return unit;
            }}
            onCreateOrder={handleCreateOrder}
            onNavigate={setRoute}
          />
        )}

        {route === 'operator' && (
          <OperatorView
            orders={appState.orders}
            operators={appState.operators}
            focusedOrderId={focusedOrderId}
            nowMs={nowMs}
            onSelectOrderFocus={setFocusedOrderId}
            onClaimOrder={handleClaimOrder}
            onSaveNotes={async (orderId, notes) => {
              const { state } = await api.saveNotes(orderId, notes);
              setAppState(state);
            }}
            onPauseRequest={(order) => setPauseModalOrder(order)}
            onResumeOrder={async (orderId) => {
              const { state } = await api.resumeOrder(orderId);
              setAppState(state);
            }}
            onReleaseOrder={async (orderId) => {
              const { state } = await api.releaseOrder(orderId);
              setAppState(state);
            }}
            onCreateOperator={handleCreateOperator}
            onRequestComplete={(order, currentNotes, selectedAttendant) =>
              setCompleteModalState({
                orderId: order.id,
                initialNotes: currentNotes,
                initialFinisher: selectedAttendant
              })
            }
            onNavigate={setRoute}
          />
        )}

        {route === 'history' && (
          <HistoryView
            orders={appState.orders}
            operators={appState.operators}
            metrics={appState.metrics}
            onReopenOrder={async (orderId) => {
              const { state } = await api.reopenOrder(orderId);
              setAppState(state);
            }}
            onOpenOrderModal={(order) => setModalOrderId(order.id)}
          />
        )}

        {route === 'directory' && (
          <DirectoryView
            units={appState.units}
            operators={appState.operators}
            onCreateUnit={async (name) => {
              const { unit, state } = await api.createUnit(name);
              setAppState(state);
              return unit;
            }}
            onUpdateUnit={async (id, name) => {
              const { unit, state } = await api.updateUnit(id, name);
              setAppState(state);
              return unit;
            }}
            onDeleteUnit={async (id) => {
              const { state } = await api.deleteUnit(id);
              setAppState(state);
            }}
            onCreateOperator={handleCreateOperator}
            onUpdateOperator={async (id, payload) => {
              const { operator, state } = await api.updateOperator(id, payload);
              setAppState(state);
              return operator;
            }}
            onDeleteOperator={async (id) => {
              const { state } = await api.deleteOperator(id);
              setAppState(state);
            }}
          />
        )}
      </AppShell>

      <OrderDetailModal
        order={modalOrder}
        operators={appState.operators}
        nowMs={nowMs}
        onClose={() => setModalOrderId(null)}
        onClaim={handleClaimOrder}
        onCreateOperator={handleCreateOperator}
        onRequestComplete={(order, currentNotes, selectedAttendant) =>
          setCompleteModalState({
            orderId: order.id,
            initialNotes: currentNotes,
            initialFinisher: selectedAttendant
          })
        }
        onPauseRequest={(order) => setPauseModalOrder(order)}
        onResume={async (orderId) => {
          const { state } = await api.resumeOrder(orderId);
          setAppState(state);
        }}
        onRelease={async (orderId) => {
          const { state } = await api.releaseOrder(orderId);
          setAppState(state);
        }}
        onReopen={async (orderId) => {
          const { state } = await api.reopenOrder(orderId);
          setAppState(state);
        }}
        onDelete={async (orderId) => {
          const { state } = await api.deleteOrder(orderId);
          setAppState(state);
        }}
        onOpenInOperator={handleOpenOperatorTask}
      />

      <PauseOrderModal
        order={pauseModalOrder}
        onClose={() => setPauseModalOrder(null)}
        onConfirm={async (orderId, reason) => {
          const { state } = await api.pauseOrder(orderId, reason);
          setAppState(state);
        }}
      />

      <CompleteOrderModal
        order={completeModalOrder}
        initialNotes={completeModalState?.initialNotes || ''}
        initialFinisher={completeModalState?.initialFinisher || ''}
        operators={appState.operators}
        onClose={() => setCompleteModalState(null)}
        onCreateOperator={handleCreateOperator}
        onConfirm={async (orderId, notes, completedBy) => {
          await handleCompleteOrder(orderId, notes, completedBy);
        }}
      />

      <ChangePasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      {completionToast && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 right-5 z-40 max-w-md rounded-xl bg-tertiary-container border border-tertiary/50 px-4 py-3 text-sm text-on-tertiary-container shadow-2xl flex items-center gap-2.5 animate-[fadeIn_160ms_ease-out]"
        >
          <CheckCircle2 className="w-5 h-5 text-tertiary shrink-0" />
          <span className="font-medium leading-snug">{completionToast}</span>
          <button
            type="button"
            onClick={() => setCompletionToast(null)}
            aria-label="Fechar aviso"
            className="ml-1 p-1 rounded hover:bg-surface-bright/40 text-on-tertiary-container/80 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}

export default App;
