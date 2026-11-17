import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { ApiError, loginRequest, registerRequest } from '../lib/api';
import type { AuthSession } from '../types';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (session: AuthSession) => void;
}

const DEMO_ACCOUNTS = [
  {
    label: 'Admin',
    email: 'admin@ticketcore.dev',
    senha: 'Admin@2026',
    desc: 'Acesso total: RBAC, exclusão e fila completa',
  },
  {
    label: 'Agente',
    email: 'agente@ticketcore.dev',
    senha: 'Agente@2026',
    desc: 'Atendimento, notas internas e atribuição',
  },
  {
    label: 'Cliente',
    email: 'cliente@ticketcore.dev',
    senha: 'Cliente@2026',
    desc: 'Escopo restrito aos próprios tickets',
  },
];

export function AuthModal({ onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('admin@ticketcore.dev');
  const [senha, setSenha] = useState('Admin@2026');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const session =
        mode === 'login'
          ? await loginRequest(email, senha)
          : await registerRequest(nome, email, senha);
      onAuthenticated(session);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Falha na autenticação.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string, demoPass: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const session = await loginRequest(demoEmail, demoPass);
      onAuthenticated(session);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Falha ao trocar usuário.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Autenticação JWT"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Autenticação JWT
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Entrar (/auth/login)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setEmail('');
                setSenha('');
                setErrorMsg(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cadastrar (/auth/register)
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-nome"
                className="block text-xs font-medium text-slate-700"
              >
                Nome completo
              </label>
              <input
                id="auth-nome"
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Lucas Ferreira"
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-slate-700"
            >
              E-mail
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@empresa.com"
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="auth-senha"
              className="block text-xs font-medium text-slate-700"
            >
              Senha {mode === 'register' ? '(mín. 8 caracteres, letra e número)' : ''}
            </label>
            <input
              id="auth-senha"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy
              ? 'Autenticando...'
              : mode === 'login'
                ? 'Entrar e Gerar JWT'
                : 'Criar Conta Cliente'}
          </button>
        </form>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 rounded-b-lg">
          <p className="text-xs font-medium text-slate-700">
            Troca rápida de perfil (para testar RBAC real)
          </p>
          <div className="mt-2.5 space-y-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                disabled={busy}
                onClick={() => handleQuickLogin(acc.email, acc.senha)}
                className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left hover:border-blue-400 transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {acc.label} · <span className="font-mono font-normal text-slate-600">{acc.email}</span>
                  </p>
                  <p className="text-xs text-slate-500">{acc.desc}</p>
                </div>
                <span className="text-xs font-medium text-blue-600 whitespace-nowrap shrink-0">
                  Entrar
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
