/// <reference types="vite/client" />

/**
 * Tipagem das variáveis de ambiente do frontend.
 *
 * Só entram aqui variáveis com o prefixo VITE_ — elas são embutidas no
 * bundle e ficam VISÍVEIS para qualquer pessoa que abrir o site. Nunca
 * coloque segredo (token, senha, chave de API) numa variável VITE_.
 */
interface ImportMetaEnv {
  /** URL da API. Em produção, a URL do backend no Render. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
