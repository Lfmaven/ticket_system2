import { useState, type FormEvent } from 'react';
import { Send, Trash2, X } from 'lucide-react';
import { addTicketComment, ApiError, deleteTicket, updateTicket } from '../lib/api';
import {
  ALLOWED_TRANSITIONS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketDTO,
  type TicketPriority,
  type TicketStatus,
  type UserDTO,
} from '../types';
import { PriorityLabel, StatusLabel } from './TicketBadges';

interface TicketDetailDrawerProps {
  ticket: TicketDTO;
  token: string;
  currentUser: UserDTO;
  staffUsers: UserDTO[];
  onClose: () => void;
  onUpdated: (ticket: TicketDTO) => void;
  onDeleted: (ticketId: string) => void;
}

export function TicketDetailDrawer({
  ticket,
  token,
  currentUser,
  staffUsers,
  onClose,
  onUpdated,
  onDeleted,
}: TicketDetailDrawerProps) {
  const [commentText, setCommentText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isStaff = currentUser.perfil === 'admin' || currentUser.perfil === 'agente';
  const canDelete =
    currentUser.perfil === 'admin' ||
    (ticket.solicitanteId === currentUser.id &&
      ticket.status === 'aberto' &&
      !ticket.responsavelId);

  const allowedNextStatuses = ALLOWED_TRANSITIONS[ticket.status];

  const handlePatch = async (payload: {
    status?: TicketStatus;
    prioridade?: TicketPriority;
    responsavelId?: string | null;
  }) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await updateTicket(token, ticket.id, payload);
      onUpdated(res.ticket);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Falha ao atualizar ticket.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (commentText.trim().length < 2) {
      setErrorMsg('O comentário precisa de pelo menos 2 caracteres.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await addTicketComment(token, ticket.id, {
        conteudo: commentText.trim(),
        interno: isStaff ? isInternal : false,
      });
      setCommentText('');
      setIsInternal(false);
      onUpdated(res.ticket);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Falha ao enviar comentário.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await deleteTicket(token, ticket.id);
      onDeleted(ticket.id);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Falha ao excluir ticket.',
      );
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/30"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes do ticket ${ticket.codigo}`}
    >
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {ticket.codigo}
              </span>
              <span aria-hidden="true">·</span>
              <span>{CATEGORY_LABELS[ticket.categoria]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Aberto em {new Date(ticket.createdAt).toLocaleString('pt-BR')}
              </span>
            </div>
            <h2 className="mt-1.5 text-lg font-semibold text-slate-900">
              {ticket.titulo}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Fechar painel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Description */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500">Descrição</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {ticket.descricao}
            </p>
          </section>

          {/* Controls grid */}
          <section className="grid grid-cols-1 gap-5 border-y border-slate-200 py-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ticket-status-select"
                className="block text-xs font-medium text-slate-500"
              >
                Status (Máquina de Estados)
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <StatusLabel status={ticket.status} />
              </div>
              <select
                id="ticket-status-select"
                value={ticket.status}
                disabled={busy}
                onChange={(e) =>
                  handlePatch({ status: e.target.value as TicketStatus })
                }
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:opacity-50"
              >
                <option value={ticket.status}>
                  {STATUS_LABELS[ticket.status]} (atual)
                </option>
                {allowedNextStatuses
                  .filter((st) => isStaff || st === 'fechado' || (ticket.status === 'resolvido' && st === 'aberto'))
                  .map((st) => (
                    <option key={st} value={st}>
                      Mover para: {STATUS_LABELS[st]}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="ticket-priority-select"
                className="block text-xs font-medium text-slate-500"
              >
                Prioridade & Prazo SLA
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <PriorityLabel priority={ticket.prioridade} />
                <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                <span
                  className={`font-mono text-xs tabular-nums ${
                    ticket.isSlaBreached ? 'text-red-700 font-medium' : 'text-slate-600'
                  }`}
                >
                  SLA {new Date(ticket.slaDueAt).toLocaleString('pt-BR')}
                  {ticket.isSlaBreached ? ' (Vencido)' : ''}
                </span>
              </div>
              <select
                id="ticket-priority-select"
                value={ticket.prioridade}
                disabled={busy || !isStaff}
                onChange={(e) =>
                  handlePatch({ prioridade: e.target.value as TicketPriority })
                }
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              >
                {(['baixa', 'media', 'alta', 'critica'] as TicketPriority[]).map(
                  (p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-500">
                Solicitante
              </span>
              <p className="mt-1.5 text-sm font-medium text-slate-900">
                {ticket.solicitante?.nome || 'Usuário removido'}
              </p>
              <p className="text-xs text-slate-500">{ticket.solicitante?.email}</p>
            </div>

            <div>
              <label
                htmlFor="ticket-assignee-select"
                className="block text-xs font-medium text-slate-500"
              >
                Responsável (Agente / Admin)
              </label>
              <select
                id="ticket-assignee-select"
                value={ticket.responsavelId || ''}
                disabled={busy || !isStaff}
                onChange={(e) =>
                  handlePatch({
                    responsavelId: e.target.value ? e.target.value : null,
                  })
                }
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">Não atribuído</option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.perfil})
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Comments */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Comentários e Interações ({ticket.comments.length})
              </h3>
            </div>

            {ticket.comments.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum comentário registrado até o momento.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {ticket.comments.map((cmt) => (
                  <div
                    key={cmt.id}
                    className={`px-4 py-3.5 ${
                      cmt.interno ? 'bg-amber-50/50' : 'bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {cmt.authorNome}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="text-slate-600">{cmt.authorPerfil}</span>
                        {cmt.interno && (
                          <>
                            <span className="text-slate-400" aria-hidden="true">·</span>
                            <span className="font-medium text-amber-800">
                              Nota interna
                            </span>
                          </>
                        )}
                      </div>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {new Date(cmt.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">
                      {cmt.conteudo}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleCommentSubmit} className="space-y-3 pt-2">
              <textarea
                rows={3}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Escreva uma resposta para este ticket..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {isStaff ? (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Nota interna (visível apenas para agentes e admins)</span>
                  </label>
                ) : (
                  <span className="text-xs text-slate-500">
                    Resposta pública no histórico do chamado
                  </span>
                )}

                <button
                  type="submit"
                  disabled={busy || commentText.trim().length < 2}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="h-4 w-4" />
                  <span>Enviar</span>
                </button>
              </div>
            </form>
          </section>

          {/* Audit Trail */}
          <section className="space-y-3 border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-900">
              Trilha de Auditoria ({ticket.history.length})
            </h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {ticket.history.map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-1"
                >
                  <div>
                    <span className="font-medium text-slate-900">
                      {ev.actorNome}
                    </span>{' '}
                    alterou{' '}
                    <span className="font-mono text-slate-800">{ev.campo}</span>
                    {ev.valorAnterior ? (
                      <>
                        {' '}
                        de{' '}
                        <span className="font-mono text-slate-700">
                          {ev.valorAnterior}
                        </span>
                      </>
                    ) : null}{' '}
                    para{' '}
                    <span className="font-mono font-medium text-slate-900">
                      {ev.valorNovo || 'nenhum'}
                    </span>
                  </div>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {new Date(ev.createdAt).toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Footer */}
        {canDelete && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-800"
              >
                <Trash2 className="h-4 w-4" />
                <span>Excluir ticket</span>
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-red-700 font-medium">
                  Confirmar exclusão definitiva?
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDelete}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
              </div>
            )}
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              ID: {ticket.id}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
