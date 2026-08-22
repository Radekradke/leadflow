# Papéis e acessos — LeadFlow

Referência de **quem é quem** e **quem pode o quê**. As permissões são o
vocabulário fixo do RBAC; o *escopo* (quais leads cada um enxerga) é resolvido
nas queries, a partir do tipo do papel.

Fonte única de verdade no código: `src/common/rbac/permissions.ts`
(`PERMISSION_CATALOG` + `ROLE_TEMPLATES`). O `prisma/rbac-catalog.ts` apenas
re-exporta esse arquivo — não edite permissões em dois lugares.

---

## Os 7 papéis

| Papel | Quem é, na prática |
|---|---|
| **Administrador** (`ADMIN`) | Dono da imobiliária. Acesso total **dentro do próprio tenant**. |
| **Gestor Comercial** (`SALES_MANAGER`) | Chefe de toda a operação. Funil geral, relatórios, configura distribuição, gerencia equipes e filas. |
| **Coordenador** (`COORDINATOR`) | Chefe de **uma equipe**. Acompanha os leads e corretores **da sua equipe**. |
| **Corretor** (`BROKER`) | Atende os leads. Vê **só os próprios**. |
| **Atendimento** (`ATTENDANT`) | Cadastra leads, faz primeiro contato/qualificação, distribui manualmente. |
| **Supervisor de Fila** (`QUEUE_SUPERVISOR`) | Cuida das filas e das regras de distribuição. |
| **Visualizador** (`VIEWER`) | Só leitura. Para auditoria, sócio, contabilidade. |

## Escopo dos leads (quais cada um vê)

- **Tenant inteiro:** Admin, Gestor, Atendimento, Supervisor, Visualizador.
- **Só a sua equipe:** Coordenador.
- **Só os próprios:** Corretor.

## Dados sensíveis — CPF vs Telefone

São duas proteções **independentes**:

- **CPF / renda / entrada** (`lead:read_sensitive`) — necessários para a
  **simulação de financiamento**. Por isso o corretor TEM essa permissão.
- **Telefone / WhatsApp** (`lead:read_contact`) — fica **mascarado** para quem
  não deve tirar o lead do sistema. O corretor **não** tem: ele atende pelo
  chat interno, e o telefone real fica protegido (evita levar o lead para o
  WhatsApp pessoal).

| Papel | CPF (simulação) | Telefone |
|---|:---:|:---:|
| Administrador | ✅ | ✅ |
| Gestor Comercial | ✅ | ✅ |
| Coordenador | ✅ | ✅ |
| **Corretor** | ✅ | 🔒 |
| Atendimento | ✅ | ✅ |
| Supervisor de Fila | 🔒 | ✅ |
| Visualizador | 🔒 | 🔒 |

> **Como inverter:** se você quiser que o corretor veja o telefone, basta
> adicionar `'lead:read_contact'` ao `BROKER` em
> `src/common/rbac/permissions.ts`. Se quiser esconder o CPF de alguém, remova
> `'lead:read_sensitive'` daquele papel. Nada mais precisa mudar — o
> mascaramento e os guards leem dessas chaves.

## Permissões por papel (resumo)

| Capacidade | Admin | Gestor | Coord. | Corretor | Atend. | Superv. | Visual. |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Ver leads | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver CPF/renda | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Ver telefone | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Cadastrar lead | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Editar/mudar status | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Transferir lead | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Arquivar/perder | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Configurar distribuição | ✅ | ✅ | — | — | — | ✅ | — |
| Distribuir manual | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Gerenciar filas | ✅ | ✅ | — | — | — | ✅ | — |
| Gerenciar equipes | ✅ | ✅ | — | — | — | — | — |
| Criar/editar usuários | ✅ | — | — | — | — | — | — |
| Painel gerencial | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Auditoria | ✅ | ✅ | — | — | — | ✅ | — |

> As roles são criadas **por tenant** no onboarding, a partir deste template.
> Cada imobiliária pode ajustar depois sem afetar as outras. É um ponto de
> partida com **menor privilégio**: adicionar acesso é fácil; tirar o que já
> foi concedido é que dói.
