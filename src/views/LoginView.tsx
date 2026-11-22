import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { OsFlowLogo } from '../components/OsFlowLogo';
import { api } from '../lib/api';
import type { AuthUser } from '../types';

interface LoginViewProps {
  needsSetup: boolean;
  onAuthenticated: (user: AuthUser) => void;
}

export function LoginView({ needsSetup, onAuthenticated }: LoginViewProps) {
  const [username, setUsername] = useState(needsSetup ? 'sac' : '');
  const [displayName, setDisplayName] = useState('SAC • Controle Geral');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (needsSetup) {
      if (password.length < 8) {
        setError('A senha deve ter no mínimo 8 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('A confirmação da senha não confere.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = needsSetup
        ? await api.setupAuth({
            username: username.trim(),
            displayName: displayName.trim() || 'SAC • Controle Geral',
            password
          })
        : await api.login({
            username: username.trim(),
            password
          });
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container border border-outline-variant/60 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 bg-surface-container-low border-b border-outline-variant/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <OsFlowLogo className="w-10 h-10 shrink-0" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-primary tracking-tight leading-none">
                OS FLOW
              </h1>
              <p className="font-[family-name:var(--font-mono)] text-[10px] text-outline uppercase tracking-wider mt-1">
                {needsSetup ? 'Configuração Inicial' : 'Acesso Restrito'}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-tertiary/15 text-tertiary font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            {needsSetup ? 'Primeiro Uso' : 'Protegido'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/40 px-3.5 py-3 text-xs text-on-surface-variant leading-relaxed">
            {needsSetup
              ? 'Defina o usuário e a senha de acesso do SAC. Após concluir, todas as rotas de dados exigirão login ativo.'
              : 'Informe seu usuário e senha para liberar o painel, filas, cadastros e atualizações em tempo real.'}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-username"
              className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase text-on-surface-variant"
            >
              Usuário *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: sac"
                className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant pl-9 pr-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary-container"
              />
            </div>
          </div>

          {needsSetup && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-display-name"
                className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase text-on-surface-variant"
              >
                Nome Exibido no Painel
              </label>
              <input
                id="login-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="SAC • Controle Geral"
                className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary-container"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-password"
              className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase text-on-surface-variant"
            >
              Senha * {needsSetup ? '(mín. 8 caracteres)' : ''}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant pl-9 pr-10 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary-container"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-outline hover:text-on-surface cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {needsSetup && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-confirm-password"
                className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase text-on-surface-variant"
              >
                Confirmar Senha *
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant pl-9 pr-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-error-container/70 border border-error/50 px-3 py-2 text-xs text-on-error-container">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 w-full py-3 px-4 rounded-xl bg-primary-container hover:brightness-110 text-on-primary-container font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
          >
            {submitting
              ? needsSetup
                ? 'Criando acesso...'
                : 'Entrando...'
              : needsSetup
                ? 'Salvar Acesso e Entrar'
                : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
