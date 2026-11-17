import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketPriority,
  type TicketStats,
  type TicketStatus,
} from '../types';

interface TicketChartsDashboardProps {
  stats: TicketStats | null;
  loading: boolean;
  activeStatusFilter: string;
  activePriorityFilter: string;
  onSelectStatus: (status: string) => void;
  onSelectPriority: (priority: string) => void;
}

interface ChartDatum {
  key: string;
  label: string;
  count: number;
  percent: number;
  color: string;
}

const STATUS_CONFIG: Array<{ key: TicketStatus; color: string }> = [
  { key: 'aberto', color: '#2563EB' },
  { key: 'em_andamento', color: '#D97706' },
  { key: 'aguardando_cliente', color: '#64748B' },
  { key: 'resolvido', color: '#16A34A' },
  { key: 'fechado', color: '#94A3B8' },
];

const PRIORITY_CONFIG: Array<{ key: TicketPriority; color: string }> = [
  { key: 'critica', color: '#DC2626' },
  { key: 'alta', color: '#D97706' },
  { key: 'media', color: '#2563EB' },
  { key: 'baixa', color: '#64748B' },
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const item = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-semibold text-slate-900">{item.label}</p>
      <p className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums">
        {item.count} {item.count === 1 ? 'ticket' : 'tickets'} ({item.percent}%)
      </p>
    </div>
  );
}

export function TicketChartsDashboard({
  stats,
  loading,
  activeStatusFilter,
  activePriorityFilter,
  onSelectStatus,
  onSelectPriority,
}: TicketChartsDashboardProps) {
  const total = stats?.total || 0;

  const statusData: ChartDatum[] = STATUS_CONFIG.map(({ key, color }) => {
    const count = stats ? stats.byStatus[key] : 0;
    return {
      key,
      label: STATUS_LABELS[key],
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
      color,
    };
  });

  const priorityData: ChartDatum[] = PRIORITY_CONFIG.map(({ key, color }) => {
    const count = stats ? stats.byPriority[key] : 0;
    return {
      key,
      label: PRIORITY_LABELS[key],
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
      color,
    };
  });

  if (loading && !stats) {
    return (
      <section
        aria-label="Gráficos de distribuição"
        className="grid grid-cols-1 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white lg:grid-cols-2 lg:divide-x lg:divide-y-0"
      >
        <div className="p-5">
          <div className="h-4 w-44 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-52 w-full animate-pulse rounded bg-slate-50" />
        </div>
        <div className="p-5">
          <div className="h-4 w-44 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-52 w-full animate-pulse rounded bg-slate-50" />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Distribuição de tickets por status e prioridade"
      className="grid grid-cols-1 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white lg:grid-cols-2 lg:divide-x lg:divide-y-0"
    >
      {/* Status Distribution Chart */}
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Distribuição por Status
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Clique em uma barra para filtrar a fila abaixo
            </p>
          </div>
          {activeStatusFilter !== 'todos' && (
            <button
              type="button"
              onClick={() => onSelectStatus('todos')}
              className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap shrink-0"
            >
              Limpar filtro ({STATUS_LABELS[activeStatusFilter as TicketStatus]})
            </button>
          )}
        </div>

        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={statusData}
              margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#E2E8F0"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: '#F1F5F9' }}
                content={<CustomTooltip />}
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                onClick={(entry) => {
                  const key = (entry as unknown as ChartDatum)?.key;
                  if (key) {
                    onSelectStatus(activeStatusFilter === key ? 'todos' : key);
                  }
                }}
                className="cursor-pointer"
              >
                {statusData.map((entry) => {
                  const dimmed =
                    activeStatusFilter !== 'todos' &&
                    activeStatusFilter !== entry.key;
                  return (
                    <Cell
                      key={entry.key}
                      fill={entry.color}
                      fillOpacity={dimmed ? 0.3 : 1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
          {statusData.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                onSelectStatus(activeStatusFilter === item.key ? 'todos' : item.key)
              }
              className={`inline-flex items-center gap-1.5 whitespace-nowrap transition-opacity ${
                activeStatusFilter !== 'todos' && activeStatusFilter !== item.key
                  ? 'opacity-45'
                  : 'opacity-100'
              }`}
            >
              <span
                className="h-2 w-2 rounded-xs shrink-0"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span>{item.label}</span>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Priority Distribution Chart */}
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Distribuição por Prioridade
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Criticidade e impacto nos prazos de SLA
            </p>
          </div>
          {activePriorityFilter !== 'todas' && (
            <button
              type="button"
              onClick={() => onSelectPriority('todas')}
              className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap shrink-0"
            >
              Limpar filtro ({PRIORITY_LABELS[activePriorityFilter as TicketPriority]})
            </button>
          )}
        </div>

        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={priorityData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="#E2E8F0"
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={64}
                tick={{ fontSize: 12, fill: '#334155' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: '#F1F5F9' }}
                content={<CustomTooltip />}
              />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                maxBarSize={28}
                onClick={(entry) => {
                  const key = (entry as unknown as ChartDatum)?.key;
                  if (key) {
                    onSelectPriority(
                      activePriorityFilter === key ? 'todas' : key,
                    );
                  }
                }}
                className="cursor-pointer"
              >
                {priorityData.map((entry) => {
                  const dimmed =
                    activePriorityFilter !== 'todas' &&
                    activePriorityFilter !== entry.key;
                  return (
                    <Cell
                      key={entry.key}
                      fill={entry.color}
                      fillOpacity={dimmed ? 0.3 : 1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
          {priorityData.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                onSelectPriority(
                  activePriorityFilter === item.key ? 'todas' : item.key,
                )
              }
              className={`inline-flex items-center gap-1.5 whitespace-nowrap transition-opacity ${
                activePriorityFilter !== 'todas' &&
                activePriorityFilter !== item.key
                  ? 'opacity-45'
                  : 'opacity-100'
              }`}
            >
              <span
                className="h-2 w-2 rounded-xs shrink-0"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span>{item.label}</span>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
