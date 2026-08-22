# WHATSAPP.md — Integração WhatsApp (Cloud API)

Este guia cobre o **lado da Meta** (o que só você consegue fazer). Todo o
código já está pronto: webhook, envio, persistência das conversas, inbox e
criptografia dos tokens.

## Visão geral da arquitetura

- **Um único app Meta** serve todo o SaaS. O webhook é um só; ele descobre
  de qual imobiliária (tenant) é a mensagem pelo `phone_number_id`.
- **Cada imobiliária conecta o próprio número** e tem o próprio token de
  envio (guardado **criptografado** no banco — AES-256-GCM).
- A autenticidade do webhook vem de duas coisas, ambas a nível de app e em
  variáveis de ambiente: o **verify token** (GET de verificação) e o
  **app secret** (assinatura HMAC dos eventos recebidos).

## Testar agora sem a Meta (modo simulação)

Dá para ver o fluxo **capturar → responder** funcionando antes de ter número/conta na Meta:

1. No `.env`, coloque `WHATSAPP_DEV_MODE="true"` e suba a API.
2. Entre no app e abra **Atendimento**. Vai aparecer o botão **"Simular lead"**.
3. Clique, preencha telefone + mensagem e confirme: uma conversa é criada
   (e um lead novo, se o número não existir) — exatamente como um webhook real.
4. Abra a conversa e **responda**. No modo simulação a resposta não vai para a
   Meta (fica registrada como enviada), então você vê a bolha aparecer na thread.
5. Quando for para produção, troque para `WHATSAPP_DEV_MODE="false"` e siga os
   passos abaixo para conectar o número de verdade.

## Passo a passo (uma vez, no app Meta)

> **O verify token não é fornecido pela Meta — você inventa.** Ele é uma
> senha combinada entre o seu servidor e a Meta: quando a Meta for validar
> seu webhook, ela manda esse valor e o seu servidor confere se bate. Por
> isso não existe um campo "gerar verify token" em lugar nenhum do painel.

1. Crie um app em <https://developers.facebook.com> → tipo **Business**.
2. Adicione o produto **WhatsApp**.
3. Em **App Settings → Basic**, copie o **App Secret** →
   variável `WHATSAPP_APP_SECRET`.
4. **No seu terminal** (não no painel da Meta), gere os dois segredos:

   ```bash
   openssl rand -hex 16   # → WHATSAPP_WEBHOOK_VERIFY_TOKEN (você inventa)
   openssl rand -hex 32   # → WHATSAPP_ENC_KEY
   ```

   Sem `openssl` (Windows sem Git Bash), use o Node:

   ```bash
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```

5. Coloque os três valores nas variáveis de ambiente da API
   (`.env` local ou painel do Render). **Suba a API** — ela precisa estar no
   ar antes do próximo passo.
6. **Só agora** configure o webhook, em
   **My Apps → seu app → WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL**: `https://SUA_API/whatsapp/webhook`
   - **Verify token**: exatamente o mesmo valor do passo 4
   - Salve. A Meta chama sua API na hora para validar — se ela não estiver
     no ar, ou se o token estiver diferente, dá erro aqui.
7. Ainda em **Configuration → Webhook**, clique em **Manage** e assine o
   campo **messages**. Sem isso a Meta valida a URL mas nunca envia as
   mensagens.

> **Ordem importa:** o passo 6 exige uma URL pública HTTPS respondendo. Se
> você ainda não fez o deploy, pule para o `DEPLOY.md`, suba a API e volte
> aqui. Enquanto isso, guarde os valores gerados no passo 4.

## Passo a passo (por imobiliária)

1. No painel do WhatsApp, registre/conecte o **número** da imobiliária e
   pegue o **Phone Number ID** e um **Access Token** (de preferência um
   token permanente de System User).
2. No app, como **Admin** ou **Gestor**, vá em **Atendimento → Configurar**
   e preencha:
   - **Phone Number ID**
   - **Access Token** (fica criptografado no banco)
   - Número de exibição e WABA ID (opcionais)
3. Pronto. Mensagens recebidas viram conversas; um lead novo é criado com
   origem **WhatsApp** se o número ainda não existir.

## Como funciona no dia a dia

- **Recebimento**: a Meta chama o webhook → a mensagem é gravada, ligada ao
  lead (casando pelos últimos 8 dígitos do telefone) e aparece no inbox com
  badge de não-lida.
- **Envio**: o corretor responde pelo inbox; a API chama a Graph API com o
  token daquele número e grava a mensagem como `OUTBOUND`.
- **Privacidade**: o corretor conversa **sem ver o número cru** — o telefone
  fica mascarado para quem não tem `whatsapp`/`lead:read_contact`, igual à
  regra dos leads.

## Distribuição automática (o caminho principal)

Quando chega uma mensagem de um número **desconhecido**:

1. O lead é criado com origem **WhatsApp**.
2. Ele entra na **fila de entrada** (a configurada em *Atendimento → Configurar*;
   se nenhuma for escolhida, o sistema usa a primeira fila ativa com
   distribuição ligada).
3. O motor roda na hora e atribui o lead a um corretor elegível, seguindo a
   estratégia da fila (round-robin, menos carregado ou aleatório).
4. O lead aparece já **distribuído**, com o corretor responsável.

Se o número **já é de um lead existente**, a mensagem entra na conversa dele e
**não há redistribuição** — seria tirar o atendimento de quem já está na conversa.

### Para a distribuição funcionar, confira

- Existe pelo menos **uma fila ativa** com **distribuição ligada** (tela *Filas*).
- A fila tem **corretores** com disponibilidade e capacidade livre.
- Se nada disso existir, o lead **não se perde**: fica aguardando distribuição
  manual, e o motivo vai para o log do servidor e para o `DistributionLog`.

## Limitações conhecidas (próximos passos)

- **Janela de 24h**: fora da janela de atendimento, a Meta exige
  **templates** aprovados. Hoje o envio é de texto livre; se estiver fora da
  janela, a mensagem volta como `FAILED` e o inbox avisa. Suporte a template
  é a evolução natural.
- **Mídia** (imagem/áudio/documento) é registrada como marcador de texto
  (`[imagem recebida]` etc.); baixar e armazenar a mídia é uma evolução.
