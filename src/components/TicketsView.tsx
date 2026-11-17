import { Download, Plus, RefreshCw, Search } from 'lucide-react';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type TicketDTO,
  type TicketStats,
  type TicketStatus,
  type UserDTO,
} from '../types';
import { PriorityLabel, StatusLabel } from './TicketBadges';
import { TicketChartsDashboard } from './TicketChartsDashboard';

interface TicketsViewProps {
  currentUser: UserDTO | null;
  tickets: TicketDTO[];
  stats: TicketStats | null;
  loading: boolean;
  errorMsg: string | null;
  statusFilter: string;
  priorityFilter: string;
  searchQuery: string;
  onStatusFilterChange: (value: string) => void;
  onPriorityFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onRefresh: () => void;
  onExportCsv: () => void;
  exportingCsv?: boolean;
  onOpenNewTicket: () => void;
  onSelectTicket: (ticket: TicketDTO) => void;
  onOpenAuth: () => void;
}

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'todos', label: 'Todos' },
  { key: 'aberto', label: 'Abertos' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'aguardando_cliente', label: 'Aguardando' },
  { key: 'resolvido', label: 'Resolvidos' },
  { key: 'fechado', label: 'Fechados' },
];

export function TicketsView({
  currentUser,
  tickets,
  stats,
  loading,
  errorMsg,
  statusFilter,
  priorityFilter,
  searchQuery,
  onStatusFilterChange,
  onPriorityFilterChange,
  onSearchQueryChange,
  onRefresh,
  onExportCsv,
  exportingCsv = false,
  onOpenNewTicket,
  onSelectTicket,
  onOpenAuth,
}: TicketsViewProps) {
  if (!currentUser) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          Sessão JWT não iniciada
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Autentique-se via <code className="font-mono text-slate-800">/api/v1/auth/login</code> ou crie uma conta para consultar, abrir e gerenciar tickets com controle RBAC.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Entrar ou Trocar Perfil
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI strip - single clean bordered surface divided by hairlines */}
      <section className="grid grid-cols-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Total no Escopo</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {stats ? stats.total : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {currentUser.perfil === 'cliente' ? 'Seus chamados' : 'Fila global'}
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Ativos na Fila</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-blue-700 tabular-nums">
            {stats ? stats.openActive : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stats ? `${stats.byStatus.aberto} aguardando triagem` : 'Calculando'}
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500">SLA Vencido</p>
          <p
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              stats && stats.slaBreached > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {stats ? stats.slaBreached : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stats && stats.slaBreached > 0
              ? 'Exigem atenção imediata'
              : 'Dentro do prazo contratado'}
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Tempo Médio de Resolução</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {stats ? `${stats.avgResolutionHours}h` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stats ? `${stats.byStatus.resolvido + stats.byStatus.fechado} concluídos` : '—'}
          </p>
        </div>
      </section>

      <TicketChartsDashboard
        stats={stats}
        loading={loading}
        activeStatusFilter={statusFilter}
        activePriorityFilter={priorityFilter}
        onSelectStatus={onStatusFilterChange}
        onSelectPriority={onPriorityFilterChange}
      />

      {/* Filter & Actions Toolbar */}
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onStatusFilterChange(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
              {stats && tab.key !== 'todos'
                ? ` (${stats.byStatus[tab.key as TicketStatus]})`
                : ''}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] sm:w-64 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Buscar por código ou título..."
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <select
            aria-label="Filtrar por prioridade"
            value={priorityFilter}
            onChange={(e) => onPriorityFilterChange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="todas">Todas prioridades</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>

          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          {currentUser.perfil === 'admin' && (
            <button
              type="button"
              disabled={exportingCsv}
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" />
              <span>{exportingCsv ? 'Exportando...' : 'Exportar CSV'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenNewTicket}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Ticket</span>
          </button>
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* High-density Tickets Table */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="px-4 py-3 whitespace-nowrap">Código</th>
                <th className="px-4 py-3">Título e Contexto</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap">Prioridade</th>
                <th className="px-4 py-3 whitespace-nowrap">Responsável</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Prazo SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading && tickets.length === 0 ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="h-12">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <p className="text-sm font-medium text-slate-900">
                      Nenhum ticket encontrado para os filtros aplicados
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Ajuste os filtros ou registre um novo chamado na fila.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenNewTicket}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Abrir Primeiro Ticket</span>
                    </button>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelectTicket(t)}
                    className="cursor-pointer hover:bg-slate-50/90 transition-colors"
                  >
                    <td className="px-4 py-3 align-middle font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                      {t.codigo}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="font-medium text-slate-900 line-clamp-1">
                        {t.titulo}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {CATEGORY_LABELS[t.categoria]}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{t.solicitante?.nome || 'Solicitante'}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {t.commentsCount} {t.commentsCount === 1 ? 'comentário' : 'comentários'}
                        </span>
                      </p>
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <StatusLabel status={t.status} />
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <PriorityLabel priority={t.prioridade} />
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-slate-700 whitespace-nowrap">
                      {t.responsavel ? t.responsavel.nome : 'Não atribuído'}
                    </td>
                    <td className="px-4 py-3 align-middle text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      <span
                        className={
                          t.isSlaBreached
                            ? 'font-medium text-red-700'
                            : 'text-slate-600'
                        }
                      >
                        {new Date(t.slaDueAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {t.isSlaBreached ? ' · Vencido' : ''}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          <span>
            Status atual: {statusFilter === 'todos' ? 'Todos' : STATUS_LABELS[statusFilter as TicketStatus]}
          </span>
          <span className="font-mono tabular-nums">
            Exibindo {tickets.length} registros
          </span>
        </div>
      </section>
    </div>
  );
}
