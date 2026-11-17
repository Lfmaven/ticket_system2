import { useState } from 'react';
import { ApiError, updateUserRole } from '../lib/api';
import type { UserDTO, UserRole } from '../types';

interface UsersRbacViewProps {
  currentUser: UserDTO | null;
  token: string | null;
  users: UserDTO[];
  loading: boolean;
  onUserUpdated: (user: UserDTO) => void;
}

export function UsersRbacView({
  currentUser,
  token,
  users,
  loading,
  onUserUpdated,
}: UsersRbacViewProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!currentUser || !token) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        Faça login como Administrador ou Agente para visualizar o diretório de usuários.
      </div>
    );
  }

  if (currentUser.perfil === 'cliente') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-slate-900">
          Acesso Restrito por RBAC (HTTP 403)
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          O endpoint <code className="font-mono text-slate-800">GET /api/v1/users</code> permite apenas os perfis <span className="font-mono">admin</span> e <span className="font-mono">agente</span>. Você está autenticado como <span className="font-mono font-semibold">cliente</span>.
        </p>
      </div>
    );
  }

  const isAdmin = currentUser.perfil === 'admin';

  const handleChangeRole = async (userId: string, perfil: UserRole) => {
    setBusyId(userId);
    setErrorMsg(null);
    try {
      const res = await updateUserRole(token, userId, { perfil });
      onUserUpdated(res.user);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erro ao atualizar perfil.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (user: UserDTO) => {
    setBusyId(user.id);
    setErrorMsg(null);
    try {
      const res = await updateUserRole(token, user.id, { ativo: !user.ativo });
      onUserUpdated(res.user);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erro ao alterar status.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Diretório de Usuários e Controle RBAC
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {isAdmin
            ? 'Como administrador, você pode promover clientes para agentes ou desativar contas via PATCH /api/v1/users/:id/role.'
            : 'Modo leitura (perfil agente). Apenas administradores podem alterar papéis RBAC.'}
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Perfil RBAC</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Último Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Carregando usuários...
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{u.nome}</p>
                      <p className="font-mono text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                      {u.id}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Perfil de ${u.nome}`}
                        value={u.perfil}
                        disabled={!isAdmin || busyId === u.id}
                        onChange={(e) =>
                          handleChangeRole(u.id, e.target.value as UserRole)
                        }
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        <option value="admin">admin</option>
                        <option value="agente">agente</option>
                        <option value="cliente">cliente</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!isAdmin || busyId === u.id}
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs font-medium ${
                          u.ativo ? 'text-emerald-700' : 'text-red-700'
                        } disabled:opacity-60`}
                      >
                        {u.ativo ? 'Ativo' : 'Desativado'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-500 tabular-nums">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString('pt-BR')
                        : 'Nunca'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
