# Relatório de Auditoria de Segurança — cloud-mail (projeto original)

> Data: 25/07/2026 · **Revisão 2** (reverificação completa contra a codebase)
> Escopo: `mail-worker/`, `mail-vue/`, `.github/workflows/`, `wrangler*.toml`
> Base: `cloud-mail`, HEAD `a6b66fc` (2026-07-03)

> **Histórico desta revisão:** a v1 era uma adaptação da auditoria do fork `cloud-mail-plus`,
> limitada aos achados que já existiam naquele documento. A v2 reauditou o repositório **do
> zero**, incluindo frontend e pipeline de deploy — áreas que a v1 não cobria. Resultado: os 12
> achados da v1 seguem válidos, mas **cinco achados novos** apareceram, e **dois deles são mais
> graves que qualquer coisa da lista original**.

---

## Resumo executivo

| # | Achado | Severidade | Estado |
|---|--------|-----------|--------|
| **N1** | **XSS armazenado via HTML de email (não autenticado)** | 🔴 **Crítico** | **Novo — confirmado** |
| **N2** | **`oauth/bindUser` sem prova de posse da conta OAuth** | 🔴 **Crítico** (condicional) | **Novo — confirmado** |
| 2 | SQL Injection em `public-service.js#addUser` | 🔴 Crítico | Confirmado |
| **N3** | **`jwt_secret` em `[vars]` e na URL do `init` no pipeline de CI** | 🔴 **Crítico** | **Novo — corrige o achado #1 da v1** |
| **N4** | **Hash de senha sem KDF (SHA-256 de 1 rodada)** | 🟠 Alto | **Novo — confirmado** |
| 3 | Webhook Resend sem verificação de assinatura | 🟠 Alto | Confirmado |
| 4 | `init/:secret` usa o JWT secret no path | 🟠 Alto | Confirmado |
| 5 | Tokens JWT do Telegram sem expiração | 🟠 Alto | Confirmado |
| 6 | CORS liberado para qualquer origem | 🟠 Alto | Confirmado |
| 8 | Sem rate limiting em endpoints sensíveis | 🟠 Alto | Confirmado (**severidade elevada**) |
| 7 | Credenciais de terceiros em texto puro no D1 | 🟡 Médio | Confirmado |
| **N5** | **Leitura de objetos sem autenticação (`/oss/*`, `/attachments/*`)** | 🟡 Médio | **Novo — confirmado** |
| 9 | `genRandomPwd` usa `Math.random()` | 🟡 Médio | Confirmado |
| 10 | Padrão `noVerifyPwd` no `login()` | 🟢 Baixo | Confirmado (informativo) |
| 11 | Timezone fixo `Asia/Shanghai` na expiração de reg-keys | 🟢 Baixo | Confirmado |
| 12 | Typos em nomes de arquivo (`date-uitil`, `domain-uitls`) | ⚪ Cosmético | Confirmado |

**Correções à v1 deste relatório:**

- O achado #1 da v1 (“`wrangler.toml` está limpo, o risco é só de processo”) estava **incorreto na
  premissa**. O `wrangler.toml` versionado está limpo, sim — mas ele **não é o arquivo usado no
  deploy**. Ver **N3**.
- A v1 afirmava que o `addUser` era *“o único ponto da base com interpolação direta em SQL”*.
  **Falso:** `att-service.js:215-236` (`removeAttByField`) interpola o nome da coluna
  (`a.${fieldName}`) na query. Os valores são bindados e todos os chamadores passam literais
  internos, então **não é explorável hoje** — mas é o mesmo padrão, e invalida a afirmação de
  ponto único.

**Já resolvido neste repositório (não é achado):** lógica `active`/`silenced` no OAuth —
`oauth-service.js:73` usa `userInfo.silenced = userInfo.silenced ? 0 : 1;` (correto), corrigido
em `a6b66fc`. O fork ainda carregava o bug.

**Não presente neste repositório (eram exclusivos do fork):** endpoint `reset-admin`,
External API (`external-api.js`) e o artefato `.cloud-mail-deploy.env.bak`.

**Código malicioso:** nenhum. Sem backdoor, cryptominer, exfiltração ou ofuscação. Todas as
chamadas externas vão para serviços esperados (Turnstile, Telegram, LinuxDo, GitHub, Resend).

---

## N1. 🔴 CRÍTICO (NOVO) — XSS armazenado via HTML de email

**Arquivos:** `mail-vue/src/components/shadow-html/index.vue:33-78`,
`mail-vue/src/views/content/index.vue:38`, `mail-worker/src/email/email.js` (`content: email.html`)

O HTML bruto de um email recebido é gravado em `D1.email.content` **sem nenhuma sanitização** e
depois injetado no DOM do webmail:

```javascript
// shadow-html/index.vue:33
shadowRoot.innerHTML = `
  <style>…</style>
  <div class="shadow-content">
    ${cleanedHtml}      // ← HTML do remetente, sem filtro
  </div>
`;
```

`cleanedHtml` é apenas `props.html.replace(/<\/?body[^>]*>/gi, '')` — remove a tag `<body>` e
nada mais. **Não há DOMPurify nem sanitizador equivalente em nenhum ponto da base** (verificado:
`grep -rni "sanitiz|dompurify|xss" mail-worker/src mail-vue/src` não retorna nada relevante).

**Shadow DOM não é fronteira de segurança.** Ele isola CSS, não JavaScript: `<img onerror=…>`,
`<svg onload=…>`, `<iframe srcdoc=…>` executam normalmente na origem da aplicação.

**Cadeia de exploração completa:**
1. Atacante envia um email comum para qualquer endereço da instância — **não precisa de conta,
   credencial ou interação prévia**.
2. A vítima abre o email no webmail.
3. O payload executa na origem da aplicação e lê `localStorage.getItem('token')`
   (`mail-vue/src/axios/index.js:12` — o JWT de sessão fica em `localStorage`).
4. Comprometimento total da conta. Se a vítima for o admin, comprometimento da instância.

**Não há CSP** que mitigue: `grep -rn "Content-Security-Policy"` não retorna nada, e
`mail-vue/public/_headers` só define `Cache-Control`.

**Observação sobre o path do Telegram:** `mail-worker/src/template/email-html.js` faz um filtro
**parcial** — remove `<script>` via linkedom, mas não remove handlers `on*` nem `<iframe>`. Isso
mostra que o autor tinha consciência do risco nesse caminho, mas a proteção é insuficiente e
inexistente no webmail principal.

**Por que isto é o achado #1:** é o único da lista que é **remoto, não autenticado, sem
pré-condição** e leva a takeover. O SQLi (#2) exige que o atacante já seja admin.

**Remediação:**
1. Sanitizar no **servidor**, no momento da recepção (`email/email.js`), com allowlist de tags e
   atributos — remover todo `on*`, `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`,
   `javascript:` e `data:` em `href`/`src`.
2. Sanitizar também no **cliente**, antes do `innerHTML` (defesa em profundidade).
3. Renderizar o corpo em `<iframe sandbox>` sem `allow-scripts` e sem `allow-same-origin`, em vez
   de shadow DOM — é o padrão de todo webmail sério.
4. Adicionar CSP restritiva em `_headers`.
5. Mover o token de sessão de `localStorage` para cookie `HttpOnly`+`Secure`+`SameSite=Strict`
   (mitiga o roubo mesmo se um XSS escapar). Requer ajustar `axios/index.js` e `security.js`.

---

## N2. 🔴 CRÍTICO (NOVO) — `oauth/bindUser` sem prova de posse

**Arquivos:** `mail-worker/src/api/oauth-api.js:10-13`,
`mail-worker/src/service/oauth-service.js:11-31`, `mail-worker/src/security/security.js:21`

`PUT /api/oauth/bindUser` está no `exclude` do middleware de auth (o prefixo `/oauth` cobre as
duas rotas), logo é **totalmente não autenticado**. Ele recebe `{ email, oauthUserId, code }` e:

```javascript
async bindUser(c, params) {
    const { email, oauthUserId, code } = params;
    const oauthRow = await this.getById(c, oauthUserId);   // ← só lê pelo ID recebido
    let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);
    if (userRow) throw new BizError('用户已绑定有邮箱')       // ← única checagem
    await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);
    …
    const jwtToken = await loginService.login(c, { email, password: null }, true);
    return { userInfo: oauthRow, token: jwtToken }          // ← devolve sessão ao chamador
}
```

**Não existe nenhuma verificação de que o chamador é dono do `oauthUserId`.** O `code` do payload
é a reg-key de registro, não o código OAuth. E `oauthUserId` é o ID numérico do LinuxDo
(`String(userInfo.id)` em `oauth-service.js:71`) — **sequencial e enumerável**.

**Exploração:** para qualquer usuário LinuxDo que já autenticou na instância mas ainda não vinculou
um email (`oauth.user_id = 0`), um atacante pode chamar `bindUser` com aquele `oauthUserId` e um
email escolhido por ele. O atacante recebe um JWT válido da conta criada — e a **vítima**, ao
fazer login via LinuxDo depois, cai exatamente nessa mesma conta (`linuxDoLogin` resolve
`oauthRow.userId` → emite token). Atacante e vítima passam a compartilhar a caixa de correio, com
o atacante tendo chegado primeiro.

**Condicionalidade:** só é explorável com `linuxdoSwitch` ativo. Se a instância for a produção com
OAuth do LinuxDo desligado, o risco é latente, não ativo — mas vira bloqueador no instante em que
o OAuth for habilitado.

**Remediação:** vincular o `bindUser` a uma sessão OAuth provada — emitir um token de vínculo de
curta duração no `linuxDoLogin` (assinado, contendo o `oauthUserId`) e exigi-lo no `bindUser`, em
vez de aceitar o `oauthUserId` cru do cliente.

---

## 2. 🔴 CRÍTICO — SQL Injection em `public-service.js` (`addUser`)

**Arquivo:** `mail-worker/src/service/public-service.js:138-145`

```javascript
const userSql = `INSERT INTO user (email, password, ...)
VALUES ('${email}', '${hash}', '${salt}', '${type}', '${os}', '${browser}', '${activeIp}', '${activeIp}', '${device}', '${activeTime}', '${activeTime}')`

const accountSql = `INSERT INTO account (email, name, user_id)
VALUES ('${email}', '${emailUtils.getName(email)}', 0);`;
```

**Confirmado.** Vetor real: `email` — o regex `isEmail` (`verify-utils.js:3`) tem `'` dentro da
classe de caracteres do local-part, portanto **aspas simples passam na validação**. Os campos
`os`/`browser`/`device`/`activeIp` derivam de `User-Agent`/IP do próprio chamador.

**Atenuante de exposição:** `/public/addUser` exige o token público, e `POST /public/genToken` só
o emite para quem prova ser admin (`verifyUser`: `email === c.env.admin` + senha). É explorável
por um chamador **já admin** — não anônimo. Ainda assim é crítico: contorna o ORM inteiro, e a
correção é trivial.

**Remediação:** `c.env.db.prepare(...).bind(...)` com placeholders `?`, mantendo o `batch`.

---

## N3. 🔴 CRÍTICO (NOVO) — `jwt_secret` em `[vars]` e na URL do `init` no pipeline

**Arquivos:** `.github/workflows/deploy-cloudflare.yml`, `mail-worker/wrangler-action.toml:38-45`

Este achado **substitui e corrige** o achado #1 da v1. O `mail-worker/wrangler.toml` versionado
está de fato limpo — mas **não é o arquivo usado no deploy**. O workflow de CI deploya com
`wrangler deploy -c wrangler-action.toml`, e esse arquivo (versionado) declara:

```toml
[vars]
…
jwt_secret = "${JWT_SECRET}"
```

Três consequências, todas confirmadas no workflow:

1. **O `jwt_secret` vira uma plain var, não um Secret.** Fica legível em texto puro para qualquer
   pessoa com acesso de leitura ao dashboard do Cloudflare Worker. Não é um Secret criptografado.
2. **O secret trafega na URL.** O passo *“♻️ 初始化数据库 / Initialize database”* executa
   `curl -sL "$WORKER_URL/api/init/${JWT_SECRET}"`. Com `[observability] enabled = true`, o path
   completo — secret incluído — entra nos logs do Worker.
3. **Isso quebra a remediação proposta na v1.** `wrangler secret put jwt_secret` conflita com a
   entrada `[vars]` de mesmo nome: o próximo `wrangler deploy` com `wrangler-action.toml`
   sobrescreve o Secret com a var em texto puro. A v1 recomendava o `secret put` isoladamente, o
   que resultaria numa correção **silenciosamente revertida no deploy seguinte**.

Observações menores do mesmo pipeline: `keep_vars = true` existe em `wrangler.toml` mas **não** em
`wrangler-action.toml`; o `sed` de substituição não escapa `|` nem `&` (a validação só rejeita
`? % # / \`, então um secret gerado com `openssl rand -hex 32` é seguro, mas um secret arbitrário
pode corromper o arquivo); e o passo final apaga o histórico de execuções (`retain_days: '1'`),
o que reduz a exposição dos logs mas também elimina a trilha de auditoria do deploy.

**Remediação:** ver **G2** e **A2** no plano de ação — o `wrangler-action.toml` e o workflow
precisam ser alterados **junto** com o código, ou nada disso se sustenta.

---

## N4. 🟠 ALTO (NOVO) — Hash de senha sem KDF

**Arquivo:** `mail-worker/src/utils/crypto-utils.js:12-23`

```javascript
async genHashPassword(password, salt) {
    const data = encoder.encode(salt + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);  // ← 1 rodada
    …
}
```

O salt é gerado corretamente (`crypto.getRandomValues`, 16 bytes), mas o hash é **SHA-256 de uma
única rodada** — uma função projetada para ser rápida, não para resistir a força bruta offline.
Não há PBKDF2, scrypt, bcrypt nem Argon2.

**Impacto:** qualquer vazamento do D1 (via #2, via credencial de API do Cloudflare, via backup mal
guardado) permite quebrar senhas de usuário em taxa de bilhões de tentativas por segundo em GPU.
O salt impede apenas rainbow tables; não retarda o ataque dirigido.

**Agravante combinado com #9:** os usuários criados por OAuth e por `addUser` recebem senha de
`genRandomPwd()` — 8 caracteres alfanuméricos vindos de `Math.random()`. Com um KDF de uma rodada,
essas senhas caem instantaneamente.

**Remediação:** PBKDF2-HMAC-SHA256 via `crypto.subtle.deriveBits` (disponível em Workers), com
≥100.000 iterações. Migração transparente: gravar a versão do algoritmo na linha do usuário e
re-hashear no próximo login bem-sucedido.

---

## 3. 🟠 ALTO — Webhook Resend sem verificação de assinatura

**Arquivos:** `mail-worker/src/api/resend-api.js:3-10`, `mail-worker/src/service/resend-service.js:7`

`/webhooks` é público (consta no `exclude` de `security.js:16`) e processa `body.data.*` sem
validar a assinatura Svix/HMAC do Resend. **Confirmado.** Qualquer um pode forjar um payload e
alterar o status de qualquer email.

**Remediação:** validar `svix-signature` (HMAC-SHA256) sobre o corpo **raw** (`c.req.raw.text()`)
antes do `JSON.parse`; rejeitar com 401 se inválido. Signing secret como Secret do Worker.

---

## 4. 🟠 ALTO — `init/:secret` usa o JWT secret no path

**Arquivos:** `mail-worker/src/api/init-api.js:4`, `mail-worker/src/init/init.js:8-11`

```javascript
app.get('/init/:secret', (c) => dbInit.init(c));
// init.js:10
if (secret !== c.env.jwt_secret) { return c.text('❌ JWT secret mismatch'); }
```

**Confirmado.** Reutiliza o secret de assinatura JWT como senha de operação e o expõe no path da
URL. Ver **N3** para o impacto real: o pipeline de CI chama exatamente essa URL a cada deploy.

Note ainda que a rota responde `200` com texto em caso de secret errado, o que a torna um oráculo
conveniente para força bruta (combinado com #8, ausência de rate limiting).

**Remediação:** mover `init` para operação autenticada de admin ou usar um secret **dedicado**
transmitido em header. **Qualquer mudança aqui exige alterar o passo de init do workflow no mesmo
commit** — senão o deploy quebra.

---

## 5. 🟠 ALTO — Tokens JWT do Telegram sem expiração

**Arquivos:** `mail-worker/src/service/telegram-service.js:52,54`, `mail-worker/src/utils/jwt-utils.js:16-29`

```javascript
const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId })  // sem expiresIn
const webAppUrl = customDomain ? `${…}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'
```

**Confirmado.** `generateToken` só grava `exp` quando recebe `expiresInSeconds`; aqui não recebe.
A URL embutida no botão do Telegram **nunca expira** e dá leitura do conteúdo do email a quem
obtiver a URL, indefinidamente. O fallback `cloudflare.com/404` é problema menor.

**Remediação:** passar `expiresInSeconds` curto; trocar o fallback por página de erro local.

---

## 6. 🟠 ALTO — CORS liberado para qualquer origem

**Arquivo:** `mail-worker/src/hono/hono.js:7` → `app.use('*', cors());`

**Confirmado.** `cors()` sem opções reflete a origem de qualquer requester em todas as rotas.
A auth é por header `Authorization` (reduz CSRF clássico), mas a política aberta permite abuso via
browser de terceiros. **Se o token migrar para cookie** (remediação de **N1**), esta política
aberta passa a ser diretamente explorável para CSRF — as duas correções são acopladas.

**Remediação:** restringir `origin` aos domínios da instância e limitar métodos/headers.

---

## 8. 🟠 ALTO — Sem rate limiting em endpoints sensíveis

**Severidade elevada de 🟡 para 🟠 nesta revisão.** Motivo: confirmei que `login()`
(`login-service.js:202`) **não chama o Turnstile em nenhum caminho** — a verificação existe apenas
no `register()` (`login-service.js:117-127`). Logo não há *nenhum* obstáculo à força bruta de
senha, e nenhuma das camadas atenuantes que a v1 assumia implicitamente.

Endpoints sem proteção: `/login`, `/register`, `/public/genToken`, `/init/:secret`, `/oauth/*`.
Combinado com **N4** (KDF fraco) e com o oráculo de `/init`, o custo de ataque é baixo.

**Remediação:** Cloudflare Rate Limiting (WAF) e/ou contador por IP em KV; Turnstile também no
login.

---

## 7. 🟡 MÉDIO — Credenciais de terceiros em texto puro no D1

**Arquivo:** `mail-worker/src/entity/setting.js` — `secretKey` (Turnstile, linha 15), `tgBotToken`
(19), `resendTokens` (27), `s3AccessKey` (41), `s3SecretKey` (42). **Confirmado.** Qualquer leitura
indevida do D1 expõe todas as integrações de uma vez.

**Remediação:** Cloudflare Secrets Store, ou AES-GCM com chave em Secret antes de gravar.

---

## N5. 🟡 MÉDIO (NOVO) — Leitura de objetos sem autenticação

**Arquivos:** `mail-worker/src/api/r2-api.js:4`, `mail-worker/src/index.js:20-22`,
`mail-worker/src/security/security.js:14`

Dois caminhos servem objetos do storage sem qualquer verificação de identidade ou de propriedade:

```javascript
// r2-api.js:4 — '/oss' está no exclude do middleware de auth
app.get('/oss/*', async (c) => { const key = c.req.path.split('/oss/')[1]; … });

// index.js:20 — nem passa pelo middleware
if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) { … }
```

Qualquer chave é lida por qualquer pessoa. **Atenuante forte:** as chaves de anexo são
endereçadas por conteúdo — `'attachments/' + sha(conteúdo) + ext` (`email/email.js`,
`constant.js:6`) — logo são inviáveis de enumerar sem já possuir o arquivo. Por isso é 🟡 e não
🟠. O problema é a ausência de controle de autorização por design: não há verificação de que o
solicitante é dono do anexo, e nenhuma validação de formato da chave.

*(Verificado e descartado como achado: a deleção de anexos deduplicados é segura — o
`removeAttByField` usa `HAVING COUNT(*) = 1`, então não apaga objeto ainda referenciado por outro
usuário.)*

**Remediação:** exigir autenticação e checar propriedade do anexo em `/oss/*` e `/attachments/*`,
ou emitir URLs assinadas de curta duração.

---

## 9. 🟡 MÉDIO — `genRandomPwd` usa `Math.random()`

**Arquivo:** `mail-worker/src/utils/crypto-utils.js:30-37`

**Confirmado.** `Math.random()` não é criptograficamente seguro (~48 bits de estado, 8 chars
alfanuméricos de saída). Usado em `oauth-service.js:23` (senha de usuários OAuth) e em
`public-service.js:112` (`addUser` sem senha explícita). A app já usa `crypto.getRandomValues` em
`generateSalt` — basta reaplicar o padrão. **Ver N4 para o efeito combinado.**

**Remediação:** `crypto.getRandomValues()`, ≥16 chars, incluindo símbolos.

---

## 10. 🟢 BAIXO (informativo) — Padrão `noVerifyPwd` em `login()`

**Arquivo:** `mail-worker/src/service/login-service.js:202,206,224`; chamado de
`oauth-service.js:28,84`. Seguro no fluxo atual (o OAuth valida contra a LinuxDO antes de chamar),
mas é uma flag que desliga a verificação de senha — frágil por construção.

**Remediação:** extrair a emissão de JWT para `issueSession(userRow)` e remover a flag.

---

## 11. 🟢 BAIXO — Timezone fixo `Asia/Shanghai`

**Arquivo:** `mail-worker/src/service/login-service.js:170-171,192-193`. Expiração de reg-keys
hardcoded para Xangai. **Confirmado.**

**Remediação:** usar UTC ou tornar configurável.

---

## 12. ⚪ COSMÉTICO — Typos em nomes de arquivo

`mail-worker/src/utils/date-uitil.js` → `date-util.js`;
`mail-worker/src/utils/domain-uitls.js` → `domain-utils.js`. **Confirmado.** Renomear exige
atualizar todos os imports.

---

## Observações de prontidão operacional (não são vulnerabilidades)

Levantadas nesta revisão porque afetam a decisão de ir a produção:

- **Sem gate de qualidade no deploy.** `.github/workflows/deploy-cloudflare.yml` dispara em todo
  push para `main` e vai direto para produção: não há build de validação, lint, nem execução de
  testes antes do `wrangler deploy`.
- **Sem testes.** Existe `mail-worker/test/index.spec.js` e o `@cloudflare/vitest-pool-workers`
  está instalado, mas o `package.json` mapeia `"test": "wrangler deploy --config wrangler-test.toml"`
  — ou seja, `pnpm test` **faz um deploy**, não roda testes.
- **Sem estratégia de backup do D1.** O conteúdo dos emails é o produto; não há export agendado
  nem procedimento de restauração documentado.
- **Trilha de auditoria de deploy apagada** (`retain_days: '1'` no passo de limpeza).
- **Cron divergente:** `index.js:29` ramifica em `c.cron === '*/30 * * * *'`, mas o único trigger
  configurado é `["0 16 * * *"]` (`wrangler.toml:35`, `wrangler-action.toml:34`). O branch de
  refresh de 30 minutos nunca executa. Sem impacto de segurança; é código morto na configuração
  atual.

---

## Avaliação geral

| Aspecto | Nota | Comentário |
|---------|------|-----------|
| Código malicioso | ✅ Limpo | — |
| Arquitetura | ✅ Boa | Hono + Drizzle + Cloudflare Workers; envio CF nativo |
| **Segurança do frontend** | ❌ **1/10** | **XSS armazenado sem sanitização, sem CSP, token em `localStorage`** |
| Segurança de dados | ❌ 3/10 | SQLi em 1 ponto; credenciais em texto puro no D1 |
| Autenticação | ⚠️ 4/10 | KDF de 1 rodada; secret reusado no path de `init` |
| API Security | ⚠️ 4/10 | Webhook sem HMAC, CORS aberto, objetos públicos |
| Rate limiting | ❌ 1/10 | Ausente, e sem Turnstile no login |
| OAuth | ❌ 3/10 | `active/silenced` corrigido, mas `bindUser` sem prova de posse |
| Pipeline de deploy | ❌ 3/10 | Secret em `[vars]` e na URL; sem gate de testes |
| Manutenibilidade | ⚠️ 6/10 | PT/中文/EN misturados; typos em arquivos; `pnpm test` deploya |

### Veredito: 🔴 NÃO PRONTO PARA PRODUÇÃO

**Mudou em relação à v1** (que dizia “🟡 produção com ressalvas”). A base é legítima e ativamente
mantida, mas os achados N1 (XSS armazenado não autenticado) e N3 (secret em texto puro no
pipeline) são bloqueadores duros que a v1 não tinha visto. Resolver Fase 1 e Fase 2 de
`PLANO_ACAO_CORRECAO.md` antes de qualquer exposição pública.

---

*Revisão 2 — reauditoria completa em 25/07/2026 contra `cloud-mail` HEAD `a6b66fc`.*
