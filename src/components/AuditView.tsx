import { useState } from 'react';
import { AUDIT_FINDINGS, type AuditFinding } from '../data/auditAndFlask';

export function AuditView() {
  const [filterCat, setFilterCat] = useState<string>('Todas');

  const categories = [
    'Todas',
    'Bug de Execução',
    'Segurança',
    'Arquitetura',
    'Funcionalidade',
  ];

  const items =
    filterCat === 'Todas'
      ? AUDIT_FINDINGS
      : AUDIT_FINDINGS.filter((f) => f.categoria === filterCat);

  const severityColor: Record<AuditFinding['severidade'], string> = {
    Crítica: 'text-red-700 font-semibold',
    Alta: 'text-amber-700 font-semibold',
    Média: 'text-slate-700 font-medium',
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Auditoria Técnica de Lfmaven/ticket_system
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl">
              Análise direta dos arquivos <code className="font-mono text-slate-800">aapi_users/*</code> e <code className="font-mono text-slate-800">api_tickets/*</code> do repositório original, listando falhas bloqueantes, vulnerabilidades e melhorias aplicadas nesta API.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filterCat === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {items.map((item, idx) => (
          <article
            key={item.id}
            className="rounded-lg border border-slate-200 bg-white overflow-hidden"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-medium text-slate-700 tabular-nums">
                  {String(idx + 1).padStart(2, '0')}.
                </span>
                <span className="font-mono text-slate-800">{item.arquivo}</span>
                <span aria-hidden="true">·</span>
                <span>{item.categoria}</span>
                <span aria-hidden="true">·</span>
                <span className={severityColor[item.severidade]}>
                  Severidade {item.severidade}
                </span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-slate-900">
                {item.titulo}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {item.descricao}
              </p>
            </div>

            <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-4">
                <p className="text-xs font-semibold text-red-700">
                  Original no GitHub
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200">
                  {item.antes}
                </pre>
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold text-emerald-700">
                  Implementação Melhorada
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100">
                  {item.depois}
                </pre>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
