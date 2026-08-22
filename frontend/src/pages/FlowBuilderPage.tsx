import { ExternalLink, Info } from 'lucide-react';

/**
 * Embute o construtor de fluxo (flowbuilder.html) via iframe. O arquivo é
 * um HTML standalone com CSS/JS próprios e tema escuro — o iframe o isola
 * para que esse estilo não vaze para o resto do app.
 *
 * Hoje ele roda com dados de exemplo (filas/corretores fixos) e NÃO salva
 * no backend — é a versão visual de demonstração. O próximo passo para
 * torná-lo real é trocar os dados fixos pela API e persistir o fluxo.
 */
export default function FlowBuilderPage() {
  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col md:h-[calc(100vh-7rem)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Construtor de fluxo</h2>
          <p className="text-xs text-muted">Desenhe visualmente como os leads são distribuídos.</p>
        </div>
        <a href="/flowbuilder.html" target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
          <ExternalLink size={14} /> Abrir em tela cheia
        </a>
      </div>

      <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Versão de demonstração: o construtor usa dados de exemplo e ainda não salva no servidor.
          A próxima etapa é conectá-lo às filas e corretores reais.
        </span>
      </div>

      <iframe
        src="/flowbuilder.html"
        title="Construtor de fluxo"
        className="w-full flex-1 rounded-2xl border border-line bg-ink-900"
      />
    </div>
  );
}
