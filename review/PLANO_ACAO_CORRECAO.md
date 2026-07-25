# Plano de Ação — Caminho para Produção (cloud-mail)

> **Revisão 2** — 25/07/2026. Gerado a partir de `RELATORIO_ANALISE_SEGURANCA.md` (rev. 2).
> Ordem: **Fase 0 → 1 → 2 → 3 → 4**. Não avançar sem concluir a fase anterior.

Esforço: ⏱️S (≤30min) · ⏱️M (~1-3h) · ⏱️L (>3h)

> **O que mudou da v1 deste plano** (leia antes de executar, se você já começou pela v1):
> - **Dois bloqueadores novos entraram na Fase 1** e são mais graves que o SQLi: **F1-XSS**
>   (XSS armazenado via email, não autenticado) e **F1-OAUTH** (`bindUser` sem prova de posse).
> - **G2 estava errado.** `wrangler secret put jwt_secret` sozinho **é revertido no próximo
>   deploy**, porque o CI deploya com `wrangler-action.toml`, que declara `jwt_secret` em
>   `[vars]`. O item foi reescrito.
> - **A2 tinha uma verificação que passa sem nada ter sido feito.** O plano v1 mandava conferir
>   `grep -rn "=== c.env.jwt_secret"` → vazio. Esse grep **já retorna vazio hoje**: o código usa
>   `!==`, não `===`. A verificação foi corrigida.
> - **A2 e A5 quebram o deploy se aplicados isoladamente** — dependem de alterar o workflow de CI
>   no mesmo commit. Marcado explicitamente.
> - **Fase 4 (prontidão operacional) é nova**: sem ela, as correções de segurança não se sustentam
>   ao longo do tempo.
>
> **Não herdado do fork:** `reset-admin`, External API, `.env.bak` e o bug `active/silenced` (já
> corrigido em `a6b66fc`). Este plano cobre apenas o que existe neste repositório.

---

## Mapa de dependências (ler antes de sequenciar)

Três pares de itens **precisam ser feitos juntos** ou o sistema quebra / a correção é anulada:

1. **G2 + A2 + o workflow de CI.** O `jwt_secret` está simultaneamente em `[vars]` do
   `wrangler-action.toml` e na URL `curl .../api/init/${JWT_SECRET}` do workflow. Mudar um lado
   sem o outro quebra o deploy ou reverte a correção.
2. **F1-XSS + A4 (CORS).** Se o token migrar de `localStorage` para cookie `HttpOnly` (parte da
   remediação do XSS), o CORS aberto passa a ser CSRF explorável. Migrar o token **exige**
   fechar o CORS no mesmo commit.
3. **M2 (`Math.random`) + M3 (KDF).** Senhas geradas fracas + hash de 1 rodada se compõem. Corrigir
   só uma delas deixa metade do problema.

---

## FASE 0 — Contenção no deploy (antes do primeiro deploy)

- [ ] **G1. `.gitignore` de segredos de deploy** ⏱️S
  - Adicionar: `*.env`, `*.env.bak`, `.admin-credentials.txt`, `.dev.vars`.
  - O `.gitignore` atual já cobre `.wrangler` e `*.local`, mas não estes.
  - **Critério:** nenhum arquivo com segredo pode ser `git add`-ado por engano.

- [ ] **G2. `jwt_secret` como Secret de verdade** ⏱️M — *bloqueia produção*
  - **Não basta `wrangler secret put`.** O CI deploya com `mail-worker/wrangler-action.toml`, que
    tem `jwt_secret = "${JWT_SECRET}"` em `[vars]` (linha 44). Uma plain var de mesmo nome
    sobrescreve o Secret no deploy seguinte.
  - Passos, **no mesmo commit**:
    1. Gerar: `openssl rand -hex 32` (hex evita os caracteres que o workflow rejeita e os que
       quebrariam o `sed`).
    2. **Remover** a linha `jwt_secret = "${JWT_SECRET}"` de `wrangler-action.toml`.
    3. Registrar o valor como Secret do Worker (`wrangler secret put jwt_secret`, ou um passo
       `wrangler secret put` no workflow lendo de `secrets.JWT_SECRET`).
    4. Adicionar `keep_vars = true` ao `wrangler-action.toml` (hoje só existe no `wrangler.toml`),
       para que vars ajustadas fora do CI não sejam apagadas.
  - **Critério:** `grep -n "jwt_secret" mail-worker/wrangler-action.toml` → vazio;
    `grep -n "jwt_secret" mail-worker/wrangler.toml` → só a linha comentada; login funciona após
    um deploy completo pelo CI.

- [ ] **G3. Rotacionar o secret se já houve algum deploy** ⏱️S — *bloqueia produção*
  - Se qualquer deploy já rodou com o pipeline atual, o `jwt_secret` foi para os logs do Worker
    (path do `curl` de init, com `[observability] enabled = true`) e para o dashboard em texto
    puro. Considere-o comprometido.
  - Gerar novo secret após G2 e A2 estarem no lugar. Todas as sessões existentes são invalidadas —
    esperado.
  - **Critério:** o valor antigo não é mais aceito; usuários precisam refazer login.

---

## FASE 1 — Bloqueadores de produção (🔴 Crítico)

- [ ] **F1-XSS. Sanitizar HTML de email + remover o token do `localStorage`** ⏱️L — *bloqueia produção*
  - **Este é o item mais grave do plano.** É o único achado remoto, não autenticado e sem
    pré-condição: basta enviar um email para um endereço da instância.
  - Arquivos: `mail-vue/src/components/shadow-html/index.vue:33-78`,
    `mail-vue/src/views/content/index.vue:38`, `mail-worker/src/email/email.js`,
    `mail-worker/src/template/email-html.js`, `mail-vue/src/axios/index.js:12`,
    `mail-vue/public/_headers`.
  - Passos:
    1. Sanitizar no servidor, na recepção (`email/email.js`), com allowlist de tags/atributos.
       Remover todo `on*`, `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, e `javascript:`
       / `data:` em `href` e `src`.
    2. Sanitizar também no cliente antes do `innerHTML` (defesa em profundidade).
    3. Preferencialmente, trocar o shadow DOM por `<iframe sandbox>` sem `allow-scripts` nem
       `allow-same-origin`. Shadow DOM isola CSS, **não** JavaScript.
    4. Adicionar CSP restritiva em `mail-vue/public/_headers` (hoje só há `Cache-Control`).
    5. Migrar o token de sessão para cookie `HttpOnly`+`Secure`+`SameSite=Strict`
       — **junto com A4 (CORS)**, ver mapa de dependências.
  - **Verificação:** enviar para uma conta de teste um email contendo
    `<img src=x onerror="alert(document.domain)">` e `<svg onload=alert(1)>`; abrir no webmail e
    no botão do Telegram. Nenhum dos dois pode executar.
  - **Critério:** `grep -rn "innerHTML" mail-vue/src` não tem nenhum sink alimentado por conteúdo
    de email sem sanitização; CSP presente na resposta.

- [ ] **F1-OAUTH. Exigir prova de posse em `oauth/bindUser`** ⏱️M — *bloqueia produção se OAuth ativo*
  - Arquivos: `mail-worker/src/api/oauth-api.js:10-13`, `service/oauth-service.js:11-31`.
  - Hoje o endpoint é não autenticado (prefixo `/oauth` está no `exclude` de `security.js:21`) e
    aceita `oauthUserId` cru do cliente — um ID numérico enumerável do LinuxDo.
  - Correção: emitir no `linuxDoLogin` um token de vínculo assinado e de curta duração contendo o
    `oauthUserId`; o `bindUser` passa a exigir esse token e ignora qualquer `oauthUserId` do corpo.
  - **Atalho de contenção, se o lançamento for sem LinuxDo:** manter `linuxdoSwitch` desligado e
    tratar este item como bloqueador **de ativação do OAuth**, não do lançamento. Registrar a
    decisão — o risco volta a ser ativo no dia em que alguém ligar a chave.
  - **Verificação:** `PUT /api/oauth/bindUser` com `oauthUserId` de terceiro e sem token de vínculo
    → 401/403, sem criar usuário.

- [ ] **C1. Corrigir SQL Injection em `addUser`** ⏱️M — *bloqueia produção*
  - Arquivo: `mail-worker/src/service/public-service.js:138-145`.
  - Trocar strings interpoladas por `prepare(...).bind(...)` com `?` (`userSql` e `accountSql`),
    mantendo o `c.env.db.batch([...])`.
  - **Verificação:** `grep -n "VALUES ('" mail-worker/src/service/public-service.js` → vazio;
    cadastro com email contendo `'` no local-part não injeta (o regex de `verify-utils.js:3`
    permite aspas simples, então este é o vetor a testar).

- [ ] **C2. Revisar o padrão em `removeAttByField`** ⏱️S
  - Arquivo: `mail-worker/src/service/att-service.js:215-236` — interpola o nome da coluna
    (`a.${fieldName}`) na query. **Não é explorável hoje** (todos os chamadores passam literais
    internos), mas é o mesmo padrão do C1.
  - Correção: allowlist explícita dos nomes de coluna aceitos, ou três funções distintas.
  - **Critério:** nenhum identificador de coluna vem de valor não validado.

---

## FASE 2 — Necessário antes de produção (🟠 Alto)

- [ ] **A1. Validar assinatura do webhook Resend (HMAC/Svix)** ⏱️M
  - Arquivos: `mail-worker/src/api/resend-api.js:3-10`, `service/resend-service.js:7`.
  - Ler o corpo **raw** (`c.req.raw.text()`), validar `svix-signature` antes do `JSON.parse`;
    401 se inválido. Signing secret como Secret do Worker.
  - **Critério:** POST sem assinatura válida em `/webhooks` → 401, sem alterar status de email.
  - *Se a instância não usar Resend (envio só por Cloudflare), a alternativa aceitável é remover
    a rota do `exclude` e desabilitá-la — decidir e registrar.*

- [ ] **A2. Remover o JWT secret do path do `init`** ⏱️M — *altera o workflow de CI junto*
  - Arquivos: `mail-worker/src/api/init-api.js:4`, `src/init/init.js:8-11`, **e**
    `.github/workflows/deploy-cloudflare.yml` (passo *“♻️ 初始化数据库”*, que faz
    `curl "$WORKER_URL/api/init/${JWT_SECRET}"`).
  - Usar um secret **dedicado** (`init_secret`, distinto do `jwt_secret`) enviado em **header**,
    não no path; ou converter em operação autenticada de admin.
  - Ajustar o `curl` do workflow para `-H` no mesmo commit, senão **todo deploy passa a falhar**.
  - Fazer o handler responder 401 (não 200 com texto) em caso de secret errado — hoje é um oráculo
    de força bruta conveniente.
  - **Verificação:** `grep -rn "c.env.jwt_secret" mail-worker/src/init/` → vazio.
    *(A v1 deste plano mandava conferir `"=== c.env.jwt_secret"`, que já retorna vazio hoje porque
    o código usa `!==` — a verificação passava sem nada ter sido corrigido.)*

- [ ] **A3. Expirar tokens JWT do Telegram** ⏱️S
  - Arquivo: `service/telegram-service.js:52,54`.
  - Passar `expiresInSeconds` curto em `generateToken` (`jwt-utils.js:16` só grava `exp` quando o
    recebe); trocar o fallback `cloudflare.com/404` por página local.
  - **Critério:** o token de `getEmail` contém `exp`; após expirar, o acesso é negado.

- [ ] **A4. Restringir CORS** ⏱️S — *acoplado a F1-XSS*
  - Arquivo: `mail-worker/src/hono/hono.js:7`.
  - `cors({ origin: [<domínios da instância>], allowMethods, allowHeaders })`.
  - **Obrigatório antes** de migrar o token para cookie, ou você troca um XSS por um CSRF.
  - **Critério:** origem não listada não recebe `Access-Control-Allow-Origin`.

- [ ] **A5. Rate limiting + Turnstile no login** ⏱️M
  - Endpoints: `/login`, `/register`, `/public/genToken`, `/init`, `/oauth/*`.
  - Cloudflare Rate Limiting (WAF) e/ou contador por IP em KV.
  - **Confirmado nesta revisão:** `login()` (`login-service.js:202`) **não chama o Turnstile em
    nenhum caminho** — a verificação só existe no `register()` (linhas 117-127). Adicionar
    Turnstile ao login também.
  - **Critério:** N tentativas/min por IP passam a ser bloqueadas; login exige Turnstile conforme
    a configuração.

- [ ] **M3. Substituir o hash de senha por um KDF** ⏱️M
  - Arquivo: `mail-worker/src/utils/crypto-utils.js:12-23` — hoje é SHA-256 de **uma rodada**.
  - PBKDF2-HMAC-SHA256 via `crypto.subtle.deriveBits`, ≥100.000 iterações.
  - Migração transparente: gravar a versão do algoritmo na linha do usuário e re-hashear no
    próximo login bem-sucedido; manter verificação legada durante a transição.
  - **Critério:** senhas novas usam PBKDF2; contas antigas migram ao logar; login continua
    funcionando durante a transição.
  - *Está na Fase 2 e não na 3 porque, combinado com `Math.random` (M2), torna trivial quebrar as
    senhas geradas automaticamente para contas OAuth e `addUser`.*

---

## FASE 3 — Endurecimento (🟡 / 🟢 / cosmético)

- [ ] **M1. Criptografar/mover credenciais do D1** ⏱️L
  - `entity/setting.js`: `secretKey` (15), `tgBotToken` (19), `resendTokens` (27),
    `s3AccessKey` (41), `s3SecretKey` (42).
  - Secrets Store ou AES-GCM com chave em Secret.
  - **Critério:** valores não legíveis em `SELECT * FROM setting`.

- [ ] **M2. `crypto.getRandomValues()` em `genRandomPwd`** ⏱️S — *par com M3*
  - `utils/crypto-utils.js:30-37`. ≥16 chars, incluindo símbolos.
  - **Verificação:** `grep -n "Math.random" mail-worker/src/utils/crypto-utils.js` → vazio.

- [ ] **M4. Autorizar leitura de objetos** ⏱️M
  - `api/r2-api.js:4` (`/oss/*`, no `exclude`) e `index.js:20-22` (`/static/`, `/attachments/`,
    que nem passa pelo middleware).
  - Exigir autenticação e checar propriedade do anexo, ou emitir URLs assinadas de curta duração.
    Validar o formato da chave.
  - *Prioridade menor porque as chaves de anexo são hash do conteúdo — inviáveis de enumerar. É
    ausência de controle de autorização, não exposição direta.*

- [ ] **L1. Extrair `issueSession` e remover `noVerifyPwd`** ⏱️M
  - `service/login-service.js:202,206,224`; ajustar `oauth-service.js:28,84`.
  - **Critério:** `login()` sem o parâmetro `noVerifyPwd`.

- [ ] **L2. Timezone da expiração de reg-keys** ⏱️S
  - `service/login-service.js:170-171,192-193` → UTC ou configurável.

- [ ] **X1. Renomear arquivos com typo** ⏱️S — *opcional*
  - `date-uitil.js` → `date-util.js`, `domain-uitls.js` → `domain-utils.js`; atualizar imports.
  - **Verificação:** `grep -rn "date-uitil\|domain-uitls" mail-worker/src` → vazio após ajuste.

---

## FASE 4 — Prontidão operacional (novo nesta revisão)

Sem estes itens, as correções acima não sobrevivem ao primeiro mês de operação.

- [ ] **P1. Gate de qualidade antes do deploy** ⏱️M
  - `.github/workflows/deploy-cloudflare.yml` dispara em todo push para `main` e vai direto ao
    `wrangler deploy`: não há build de validação, lint nem teste antes.
  - Adicionar job de build + teste como pré-requisito do deploy.
  - **Critério:** um commit que quebra o build não chega a produção.

- [ ] **P2. Fazer `pnpm test` rodar testes** ⏱️S
  - `mail-worker/package.json` mapeia `"test": "wrangler deploy --config wrangler-test.toml"` —
    ou seja, **`pnpm test` faz um deploy**. É uma armadilha séria com o `@cloudflare/vitest-pool-workers`
    já instalado e um `test/index.spec.js` existente.
  - Renomear para `"deploy:test"` e apontar `"test"` para `vitest`.
  - **Critério:** `pnpm test` não realiza deploy algum.

- [ ] **P3. Testes de regressão dos achados corrigidos** ⏱️L
  - Cobrir no mínimo: payload XSS em email recebido (F1-XSS), `bindUser` sem token de vínculo
    (F1-OAUTH), email com `'` no local-part (C1), webhook sem assinatura (A1).
  - **Critério:** cada bloqueador da Fase 1 tem um teste que falha se a correção for revertida.

- [ ] **P4. Backup e restauração do D1** ⏱️M
  - O conteúdo dos emails é o produto e não há export agendado nem procedimento de restauração.
  - Definir export periódico, destino, retenção e **um teste de restauração de verdade**.
  - **Critério:** restauração já foi exercitada uma vez, não só documentada.

- [ ] **P5. Preservar a trilha de auditoria do deploy** ⏱️S
  - O passo final do workflow apaga o histórico de execuções (`retain_days: '1'`). Isso existia
    para limitar a exposição do secret nos logs; **depois de G2/A2 o motivo desaparece** e a perda
    de auditoria passa a ser puro custo.
  - **Critério:** histórico de deploys preservado por prazo definido.

- [ ] **P6. Limpar a divergência de cron** ⏱️S
  - `index.js:29` ramifica em `c.cron === '*/30 * * * *'`, mas o único trigger é `["0 16 * * *"]`
    (`wrangler.toml:35`, `wrangler-action.toml:34`). O branch nunca executa.
  - Decidir: adicionar o trigger ou remover o branch. Sem impacto de segurança.

- [ ] **P7. Política de atualização de dependências** ⏱️S
  - Habilitar Dependabot/Renovate para `mail-worker` e `mail-vue`.
  - **Critério:** PRs automáticos de segurança chegam e alguém é responsável por revisá-los.

---

## Checklist de saída (gate para produção)

**Segurança:**
- [ ] Fase 0 completa — `jwt_secret` fora de `[vars]` **e** fora da URL; secret rotacionado (G3).
- [ ] Fase 1 completa — XSS, `bindUser`, SQLi, `removeAttByField`.
- [ ] Fase 2 completa — HMAC webhook, `init` sem secret no path, token Telegram com `exp`, CORS,
      rate limit + Turnstile no login, KDF.

**Verificações mecânicas** (todas devem retornar vazio):
- [ ] `grep -n "VALUES ('" mail-worker/src/service/public-service.js`
- [ ] `grep -rn "c.env.jwt_secret" mail-worker/src/init/`
- [ ] `grep -n "jwt_secret" mail-worker/wrangler-action.toml`
- [ ] `grep -n "Math.random" mail-worker/src/utils/crypto-utils.js`

**Verificações manuais:**
- [ ] Email com `<img src=x onerror=...>` não executa no webmail nem no view do Telegram.
- [ ] `PUT /api/oauth/bindUser` com `oauthUserId` de terceiro é rejeitado.
- [ ] `POST /webhooks` sem assinatura válida retorna 401.
- [ ] Deploy completo pelo CI funciona de ponta a ponta após G2 + A2.
- [ ] Envio por Cloudflare validado com um email real.

**Operacional:**
- [ ] Fase 4: gate de CI ativo, `pnpm test` não deploya, backup do D1 restaurado ao menos uma vez.

---

## Estratégia de contribuição

Estes achados — exceto os de deploy — são **bugs do próprio upstream**. Como este é o repositório
canônico, corrija aqui e, se houver fork ou downstream, envie PR. Evitar divergência foi exatamente
a lição do `cloud-mail-plus`.

**F1-XSS e F1-OAUTH afetam toda instância pública de cloud-mail**, não só a sua. Vale reportar ao
upstream de forma coordenada — divulgação privada primeiro, correção depois — em vez de abrir uma
issue pública descrevendo a exploração.

---

## Não aplicável a este repositório (eram do fork)

- `reset-admin/:secret`, External API (`external-api.js`), `.cloud-mail-deploy.env.bak`.
- Bug `active/silenced` — **já corrigido** em `a6b66fc` (`oauth-service.js:73`).
