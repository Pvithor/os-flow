import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Sentry, initTelemetry } from './lib/telemetry';
import './index.css';

initTelemetry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl bg-surface-container border border-error/50 p-6 text-center">
            <h1 className="font-bold text-lg text-error">Erro inesperado na interface</h1>
            <p className="text-sm text-on-surface-variant mt-2">
              Recarregue a página para continuar usando o OS FLOW.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-bold text-xs uppercase cursor-pointer"
            >
              Recarregar
            </button>
          </div>
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
