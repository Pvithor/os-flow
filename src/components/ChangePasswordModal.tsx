import { useState } from 'react';
import { CheckCircle2, KeyRound, X } from 'lucide-react';
import { api } from '../lib/api';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const resetAndClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova senha não confere.');
      return;
    }

    setSaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="relative w-full max-w-md rounded-xl bg-surface-container border border-outline-variant shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 bg-surface-container-low border-b border-outline-variant/60">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            <h2
              id="change-password-title"
              className="font-[family-name:var(--font-display)] text-lg font-bold text-on-surface"
            >
              Alterar Senha de Acesso
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Fechar"
            className="p-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="cp-current"
              className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase text-on-surface-variant"
            >
              Senha Atual *
            </label>
            <input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary-container"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="cp-new"
              className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase text-on-surface-variant"
            >
              Nova Senha * (mín. 8 caracteres)
            </label>
            <input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary-container"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="cp-confirm"
              className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase text-on-surface-variant"
            >
              Confirmar Nova Senha *
            </label>
            <input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary-container"
            />
          </div>

          {error && (
            <div className="rounded bg-error-container/70 border border-error/50 px-3 py-2 text-xs text-on-error-container">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded bg-tertiary-container border border-tertiary/50 px-3 py-2 text-xs text-on-tertiary-container flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-tertiary shrink-0" />
              <span>Senha atualizada com sucesso. Outras sessões foram encerradas.</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 rounded-lg bg-surface-container-high text-xs font-bold uppercase text-on-surface-variant cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold uppercase disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Atualizar Senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
