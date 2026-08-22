# Prompt para o Claude Code

Abra o Claude Code **dentro da pasta do projeto** e cole o texto abaixo
(tudo que está entre as linhas). Ele foi escrito para o agente trabalhar
sozinho até o app estar rodando e o fluxo validado.

---

Você é um engenheiro sênior. Trabalhe neste repositório até o app estar
**rodando localmente** e o fluxo principal **validado**. Não peça
confirmação a cada passo: execute, verifique e siga. Só me chame se algo
exigir uma decisão de produto ou uma credencial que só eu tenho.

## O projeto

**LeadFlow Imobiliário** — SaaS multi-tenant de distribuição de leads para
imobiliárias.

- **Backend**: NestJS 10 + Prisma + PostgreSQL. Código em `src/`, schema em
  `prisma/schema.prisma`.
- **Frontend**: React 18 + Vite + TypeScript + Tailwind + TanStack Query,
  na pasta `frontend/`.
- **Isolamento entre imobiliárias em duas camadas**: extensão do Prisma
  (AsyncLocalStorage) **+ Row-Level Security no Postgres**, usando o papel
  de runtime `leadflow_app` (sem BYPASSRLS). Os arquivos `enable_rls*.sql`
  na raiz viram migrations.
- **Fluxo principal**: mensagem chega pelo WhatsApp → vira lead → o motor
  distribui para um corretor → o corretor responde pelo inbox.

## Regras (importantes)

1. **Não reestruture o projeto.** O layout (`src/`, `prisma/`,
   `frontend/`) é intencional. Não mova arquivos, não troque de framework,
   não "modernize" nada.
2. **Não invente arquivos de configuração novos.** `package.json`,
   `tsconfig*.json`, `nest-cli.json` já existem e estão corretos.
3. **Nada de segredo em código.** Tudo por variável de ambiente.
4. **Correções mínimas e cirúrgicas.** Se der erro de tipo, corrija aquele
   erro — não redesenhe o módulo.
5. **Não enfraqueça segurança para "fazer passar".** Não desligue RLS, não
   remova guards, não use `any` para calar o compilador quando existir o
   tipo certo, não relaxe validação.
6. Se precisar mudar algo estrutural, **pare e me explique** antes.

## Passo 1 — Subir o ambiente

Existe um script que faz tudo (dependências, Postgres em Docker, papel de
runtime, `.env` com segredos gerados, migrations, RLS, permissões e seed):

```bash
bash setup-local.sh
```

Se ele falhar, leia a mensagem e corrija a causa. Pré-requisitos: Node 20+
e Docker rodando.

## Passo 2 — Compilar e corrigir os tipos

```bash
npx prisma generate   # precisa vir ANTES: gera os tipos do banco
npm run build
cd frontend && npm run build && cd ..
```

**Contexto honesto:** este código foi escrito e revisado num ambiente onde
o `@prisma/client` **não podia ser gerado**. Sintaxe e imports foram
validados; o type-check completo **não**. É esperado aparecer algum erro de
tipo aqui — corrija todos, de forma mínima.

## Passo 3 — Rodar os testes

```bash
npm test
```

Devem passar **38 testes em 6 suítes**. Elas cobrem: mascaramento de
CPF/telefone, permissões por papel, máquina de status, estratégias de
distribuição, a distribuição automática a partir do WhatsApp e a cadeia
regional → gerentes → corretores. Se alguma
falhar, investigue: ou o teste está desatualizado em relação a uma correção
sua, ou existe um bug real. **Não apague nem enfraqueça teste para passar** —
entenda a causa e me diga qual era.

## Passo 4 — Subir a aplicação

Em dois processos:

```bash
npm run start:dev                 # API  → http://localhost:3000
cd frontend && npm run dev        # Web  → http://localhost:5173
```

Verifique que `GET http://localhost:3000/health` responde OK.

## Passo 5 — Validar o fluxo principal (o que importa)

Login: `admin@demo.local` / `Admin@12345`

O seed cria uma fila **"Leads WhatsApp"** com dois corretores disponíveis
(Marcos e Priya), e o `.env` já vem com `WHATSAPP_DEV_MODE="true"`, que
liga o modo simulação. Então dá para validar tudo sem a Meta:

1. Entre em **Atendimento** e clique em **"Simular lead"**.
2. Preencha um telefone e uma mensagem e confirme.
3. Confirme que:
   - a conversa apareceu no inbox;
   - em **Leads**, foi criado um lead com origem **WhatsApp**;
   - esse lead está com status **DISTRIBUÍDO** e **com corretor
     responsável** (Marcos ou Priya) — este é o requisito central;
   - responder na conversa funciona e a mensagem aparece na thread.
4. Simule mais leads com telefones **diferentes** e confirme a cadeia de
   distribuição: o seed cria **"Regional Nova Iguaçu"** repartindo entre
   **Gerente Márcio (60%)** e **Gerente Wellington (40%)**, cada um com dois
   corretores. Em ~10 leads, a maioria deve cair no time do Márcio, e todos
   devem ter corretor — nenhum parado.
5. Simule de novo com um telefone **já usado** e confirme que **não houve
   redistribuição** — a mensagem deve cair na conversa existente.

Se o lead for criado mas **não** for distribuído, investigue nesta ordem:
a fila está ativa e com distribuição ligada? os corretores estão
`AVAILABLE` e aceitando distribuição? o log do servidor e a tabela
`DistributionLog` dizem o motivo.

## Definição de pronto

- [ ] `npm run build` e o build do frontend passam sem erro
- [ ] `npm test` verde (31 testes)
- [ ] API e frontend sobem; `/health` responde
- [ ] Login funciona
- [ ] Lead simulado é **criado E distribuído a um corretor**
- [ ] Round-robin alterna entre os corretores
- [ ] A cadeia respeita os percentuais (60/40 entre os gerentes)
- [ ] Lead existente não é redistribuído
- [ ] Responder pela conversa funciona

## No fim, me entregue

1. **O que você corrigiu** — lista curta, arquivo por arquivo, com o motivo.
2. **Qualquer coisa que achou suspeita** e não corrigiu (e por quê).
3. **Como está o fluxo**: funcionou de ponta a ponta? Se não, onde parou e
   qual foi o erro exato.
4. **Nada de resumo otimista.** Se algo não funcionou, diga claramente.

---

## Se preferir mandar em partes

O prompt acima é longo. Dá para quebrar assim, esperando cada etapa
terminar:

1. "Rode `bash setup-local.sh` e me diga se subiu limpo."
2. "Rode `npx prisma generate`, depois `npm run build` e o build do
   frontend. Corrija os erros de tipo de forma mínima e me liste o que
   mudou."
3. "Rode `npm test`. Devem passar 31 testes. Não enfraqueça teste nenhum
   para passar."
4. "Suba a API e o frontend e valide o fluxo do WhatsApp: simular lead →
   ele precisa ser criado E distribuído a um corretor."
