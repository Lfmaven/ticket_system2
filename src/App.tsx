import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Code2,
  FileSearch,
  Inbox,
  LogOut,
  Menu,
  Plug,
  Search,
  ShieldCheck,
  Terminal,
  UserCheck,
  X,
} from 'lucide-react';
import { ApiExplorerView } from './components/ApiExplorerView';
import { AuditView } from './components/AuditView';
import { AuthModal } from './components/AuthModal';
import { FlaskExportView } from './components/FlaskExportView';
import { IntegrationsView } from './components/IntegrationsView';
import { NewTicketModal } from './components/NewTicketModal';
import { TicketDetailDrawer } from './components/TicketDetailDrawer';
import { TicketsView } from './components/TicketsView';
import { UsersRbacView } from './components/UsersRbacView';
import {
  ApiError,
  exportTicketsCsv,
  fetchMe,
  fetchTickets,
  fetchTicketStats,
  fetchUsers,
  loginRequest,
} from './lib/api';
import {
  STATUS_LABELS,
  type AuthSession,
  type TicketDTO,
  type TicketStats,
  type UserDTO,
} from './types';

type ActiveTab = 'tickets' | 'integrations' | 'explorer' | 'audit' | 'flask' | 'users';

const STORAGE_KEY = 'ticketcore_session_v1';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof Inbox;
}> = [
  { id: 'tickets', label: 'Fila de Tickets', icon: Inbox },
  { id: 'integrations', label: 'Integrações & SDK', icon: Plug },
  { id: 'explorer', label: 'Explorador de API', icon: Terminal },
  { id: 'audit', label: 'Auditoria & Correções', icon: FileSearch },
  { id: 'flask', label: 'Código Flask (Python)', icon: Code2 },
  { id: 'users', label: 'Usuários & RBAC', icon: ShieldCheck },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tickets');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [session, setSession] = useState<AuthSession | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [tickets, setTickets] = useState<TicketDTO[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('todos');
  const [priorityFilter, setPriorityFilter] = useState('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false);
  const globalSearchRef = useRef<HTMLDivElement | null>(null);

  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketDTO | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        globalSearchRef.current &&
        !globalSearchRef.current.contains(event.target as Node)
      ) {
        setGlobalSearchFocused(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setGlobalSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const persistSession = useCallback((next: AuthSession | null) => {
    setSession(next);
    if (next) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Initialize session: restore from sessionStorage or sign in with demo admin
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as AuthSession;
          const me = await fetchMe(parsed.accessToken);
          if (!cancelled) {
            setSession({ ...parsed, user: me.user });
            setAuthInitialized(true);
            return;
          }
        } catch {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }

      try {
        const demo = await loginRequest('admin@ticketcore.dev', 'Admin@2026');
        if (!cancelled) {
          persistSession(demo);
        }
      } catch {
        // Leave unauthenticated if login fails
      } finally {
        if (!cancelled) {
          setAuthInitialized(true);
        }
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [persistSession]);

  const loadTicketData = useCallback(async () => {
    if (!session?.accessToken) {
      setTickets([]);
      setStats(null);
      return;
    }
    setLoadingTickets(true);
    setTicketError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetchTickets(session.accessToken, {
          status: statusFilter,
          priority: priorityFilter,
          q: searchQuery,
          limit: 50,
        }),
        fetchTicketStats(session.accessToken),
      ]);
      setTickets(listRes.items);
      setStats(statsRes);
    } catch (err) {
      setTicketError(
        err instanceof ApiError ? err.message : 'Erro ao carregar tickets.',
      );
    } finally {
      setLoadingTickets(false);
    }
  }, [session?.accessToken, statusFilter, priorityFilter, searchQuery]);

  const loadUsersData = useCallback(async () => {
    if (!session?.accessToken || session.user.perfil === 'cliente') {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    try {
      const res = await fetchUsers(session.accessToken);
      setUsers(res.items);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [session?.accessToken, session?.user.perfil]);

  useEffect(() => {
    if (authInitialized) {
      loadTicketData();
      loadUsersData();
    }
  }, [authInitialized, loadTicketData, loadUsersData]);

  const handleExportCsv = useCallback(async () => {
    if (!session?.accessToken) return;
    setExportingCsv(true);
    setTicketError(null);
    try {
      await exportTicketsCsv(session.accessToken, {
        status: statusFilter,
        priority: priorityFilter,
        q: searchQuery,
      });
    } catch (err) {
      setTicketError(
        err instanceof ApiError ? err.message : 'Erro ao exportar CSV.',
      );
    } finally {
      setExportingCsv(false);
    }
  }, [session?.accessToken, statusFilter, priorityFilter, searchQuery]);

  const staffUsers = users.filter(
    (u) => u.ativo && (u.perfil === 'admin' || u.perfil === 'agente'),
  );

  const currentTabMeta =
    NAV_ITEMS.find((item) => item.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            TicketCore
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 space-y-3">
          {session ? (
            <div className="space-y-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-900">
                  {session.user.nome}
                </p>
                <p className="truncate font-mono text-xs text-slate-500">
                  {session.user.perfil} · {session.user.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Trocar Perfil
                </button>
                <button
                  type="button"
                  onClick={() => persistSession(null)}
                  title="Encerrar sessão JWT"
                  className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Entrar com JWT
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/35"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col bg-white border-r border-slate-200">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
              <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                TicketCore
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Abrir navegação"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden xl:inline text-slate-500 whitespace-nowrap">
                Lfmaven / ticket_system
              </span>
              <span className="hidden xl:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <h1 className="truncate font-semibold text-slate-900">
                {currentTabMeta.label}
              </h1>
            </div>
          </div>

          {/* Global Ticket Search Bar */}
          <div
            ref={globalSearchRef}
            className="relative flex-1 max-w-md min-w-[160px]"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              role="searchbox"
              value={searchQuery}
              onFocus={() => setGlobalSearchFocused(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setGlobalSearchFocused(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim().length > 0) {
                  setGlobalSearchFocused(false);
                  setActiveTab('tickets');
                }
              }}
              placeholder="Buscar tickets em qualquer aba..."
              aria-label="Busca global de tickets"
              className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setGlobalSearchFocused(false);
                }}
                aria-label="Limpar busca global"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {globalSearchFocused &&
              searchQuery.trim().length > 0 &&
              activeTab !== 'tickets' && (
                <div className="absolute left-0 right-0 top-full mt-1.5 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden z-40">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3.5 py-2 text-xs text-slate-500">
                    <span>
                      Resultados para{' '}
                      <span className="font-mono font-medium text-slate-800">
                        "{searchQuery.trim()}"
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setGlobalSearchFocused(false);
                        setActiveTab('tickets');
                      }}
                      className="font-medium text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Ver na Fila
                    </button>
                  </div>

                  {!session ? (
                    <div className="px-4 py-4 text-xs text-slate-600">
                      Entre com um perfil JWT para consultar tickets.
                    </div>
                  ) : loadingTickets ? (
                    <div className="px-4 py-4 text-xs text-slate-500">
                      Filtrando tickets...
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="px-4 py-4 text-xs text-slate-500">
                      Nenhum ticket correspondente encontrado.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {tickets.slice(0, 6).map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setGlobalSearchFocused(false);
                              setSelectedTicket(item);
                            }}
                            className="flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-900">
                                {item.titulo}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                <span className="font-mono text-slate-700 tabular-nums">
                                  {item.codigo}
                                </span>
                                <span className="mx-1.5" aria-hidden="true">·</span>
                                <span>{STATUS_LABELS[item.status]}</span>
                              </p>
                            </div>
                            <span className="shrink-0 text-xs font-medium text-blue-600">
                              Abrir
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {session ? (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                <span>
                  {session.user.nome.split(' ')[0]} · {session.user.perfil}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                Entrar
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {activeTab === 'tickets' && (
            <TicketsView
              currentUser={session?.user || null}
              tickets={tickets}
              stats={stats}
              loading={loadingTickets}
              errorMsg={ticketError}
              statusFilter={statusFilter}
              priorityFilter={priorityFilter}
              searchQuery={searchQuery}
              onStatusFilterChange={setStatusFilter}
              onPriorityFilterChange={setPriorityFilter}
              onSearchQueryChange={setSearchQuery}
              onRefresh={loadTicketData}
              onExportCsv={handleExportCsv}
              exportingCsv={exportingCsv}
              onOpenNewTicket={() => setNewTicketOpen(true)}
              onSelectTicket={setSelectedTicket}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsView
              currentUser={session?.user || null}
              token={session?.accessToken || null}
              onTicketCreatedFromWidget={loadTicketData}
            />
          )}

          {activeTab === 'explorer' && (
            <ApiExplorerView accessToken={session?.accessToken || null} />
          )}

          {activeTab === 'audit' && <AuditView />}

          {activeTab === 'flask' && <FlaskExportView />}

          {activeTab === 'users' && (
            <UsersRbacView
              currentUser={session?.user || null}
              token={session?.accessToken || null}
              users={users}
              loading={loadingUsers}
              onUserUpdated={(updated) => {
                setUsers((prev) =>
                  prev.map((u) => (u.id === updated.id ? updated : u)),
                );
                if (session && updated.id === session.user.id) {
                  persistSession({ ...session, user: updated });
                }
              }}
            />
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={(nextSession) => {
            persistSession(nextSession);
          }}
        />
      )}

      {newTicketOpen && session?.accessToken && (
        <NewTicketModal
          token={session.accessToken}
          onClose={() => setNewTicketOpen(false)}
          onCreated={(created) => {
            setNewTicketOpen(false);
            setSelectedTicket(created);
            loadTicketData();
          }}
        />
      )}

      {selectedTicket && session?.accessToken && (
        <TicketDetailDrawer
          ticket={selectedTicket}
          token={session.accessToken}
          currentUser={session.user}
          staffUsers={staffUsers}
          onClose={() => setSelectedTicket(null)}
          onUpdated={(updated) => {
            setSelectedTicket(updated);
            loadTicketData();
          }}
          onDeleted={() => {
            setSelectedTicket(null);
            loadTicketData();
          }}
        />
      )}
    </div>
  );
}
