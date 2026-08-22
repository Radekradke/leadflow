import { ExternalLink, Info } from 'lucide-react';

/**
 * Embute o construtor de fluxo (flowbuilder.html) via iframe. O arquivo é
 * um HTML standalone com CSS/JS próprios e tema escuro — o iframe o isola
 * para que esse estilo não vaze para o resto do app.
 *
 * O builder recebe a URL da API por querystring (?api=) e lê o token CSRF
 * do localStorage (mesma origem). Assim ele carrega filas/corretores reais
 * e, ao "Guardar", aplica a estratégia de distribuição na fila real via API.
 * O layout do grafo em si ainda não é persistido — é o próximo passo.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';
const FLOWBUILDER_SRC = API_BASE
  ? `/flowbuilder.html?api=${encodeURIComponent(API_BASE)}`
  : '/flowbuilder.html';

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

      <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Conectado: o construtor lê suas filas e corretores reais. No nó <b>Fila</b>, escolha a
          estratégia de <b>Distribuição</b> e clique <b>Guardar</b> — ela passa a valer de verdade.
          (O desenho do fluxo em si ainda não é salvo — próximo passo.)
        </span>
      </div>

      <iframe
        src={FLOWBUILDER_SRC}
        title="Construtor de fluxo"
        className="w-full flex-1 rounded-2xl border border-line bg-ink-900"
      />
    </div>
  );
}
