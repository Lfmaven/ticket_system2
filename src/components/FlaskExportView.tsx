import { useState } from 'react';
import { Check, Copy, FileCode2 } from 'lucide-react';
import { FLASK_EXPORT_FILES } from '../data/auditAndFlask';

export function FlaskExportView() {
  const [selectedPath, setSelectedPath] = useState(FLASK_EXPORT_FILES[0].path);
  const [copied, setCopied] = useState(false);

  const activeFile =
    FLASK_EXPORT_FILES.find((f) => f.path === selectedPath) ||
    FLASK_EXPORT_FILES[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
      <aside className="rounded-lg border border-slate-200 bg-white lg:col-span-4 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">
            Código Python/Flask Refatorado
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Versão corrigida para aplicar diretamente no repositório GitHub
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {FLASK_EXPORT_FILES.map((file) => {
            const active = file.path === activeFile.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => {
                  setSelectedPath(file.path);
                  setCopied(false);
                }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                  active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <FileCode2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    active ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-medium text-slate-900">
                    {file.path}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                    {file.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white lg:col-span-8 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h3 className="font-mono text-sm font-semibold text-slate-900">
              {activeFile.path}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {activeFile.description}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? 'Copiado' : 'Copiar arquivo'}</span>
          </button>
        </div>

        <pre className="max-h-[640px] overflow-auto bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-100">
          {activeFile.content}
        </pre>
      </section>
    </div>
  );
}
