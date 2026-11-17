import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Minus,
} from 'lucide-react';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '../types';

export function StatusLabel({ status }: { status: TicketStatus }) {
  const styles: Record<TicketStatus, string> = {
    aberto: 'text-blue-700',
    em_andamento: 'text-amber-700',
    aguardando_cliente: 'text-slate-700',
    resolvido: 'text-emerald-700',
    fechado: 'text-slate-500',
  };

  const renderIcon = () => {
    switch (status) {
      case 'aberto':
        return <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
      case 'em_andamento':
        return <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
      case 'aguardando_cliente':
        return <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
      case 'resolvido':
        return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
      case 'fechado':
        return <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${styles[status]}`}
    >
      {renderIcon()}
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: TicketPriority }) {
  const styles: Record<TicketPriority, string> = {
    critica: 'text-red-700 font-semibold',
    alta: 'text-amber-700 font-medium',
    media: 'text-slate-700 font-medium',
    baixa: 'text-slate-500 font-normal',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${styles[priority]}`}
    >
      {priority === 'critica' && (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
      )}
      <span>{PRIORITY_LABELS[priority]}</span>
    </span>
  );
}
