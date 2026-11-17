import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { ApiError, createTicket } from '../lib/api';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  type TicketCategory,
  type TicketDTO,
  type TicketPriority,
} from '../types';

interface NewTicketModalProps {
  token: string;
  onClose: () => void;
  onCreated: (ticket: TicketDTO) => void;
}

export function NewTicketModal({
  token,
  onClose,
  onCreated,
}: NewTicketModalProps) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<TicketPriority>('media');
  const [categoria, setCategoria] = useState<TicketCategory>('bug');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Array<{ campo: string; mensagem: string }>
  >([]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setFieldErrors([]);
    try {
      const res = await createTicket(token, {
        titulo,
        descricao,
        prioridade,
        categoria,
      });
      onCreated(res.ticket);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
        setFieldErrors(err.details || []);
      } else {
        setErrorMsg('Erro ao criar ticket.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Abrir novo ticket"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Abrir Novo Ticket
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

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">{errorMsg}</p>
              {fieldErrors.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {fieldErrors.map((f, idx) => (
                    <li key={idx}>
                      <span className="font-mono">{f.campo}</span>: {f.mensagem}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="new-ticket-titulo"
              className="block text-xs font-medium text-slate-700"
            >
              Título (mín. 5 caracteres)
            </label>
            <input
              id="new-ticket-titulo"
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Falha de validação ao renovar refresh token"
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="new-ticket-categoria"
                className="block text-xs font-medium text-slate-700"
              >
                Categoria
              </label>
              <select
                id="new-ticket-categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as TicketCategory)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="new-ticket-prioridade"
                className="block text-xs font-medium text-slate-700"
              >
                Prioridade (Define SLA)
              </label>
              <select
                id="new-ticket-prioridade"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as TicketPriority)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-ticket-descricao"
              className="block text-xs font-medium text-slate-700"
            >
              Descrição detalhada (mín. 10 caracteres)
            </label>
            <textarea
              id="new-ticket-descricao"
              rows={4}
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva passos para reprodução, código HTTP recebido e impacto..."
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Salvando...' : 'Criar Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
