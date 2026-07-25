# Comparativo de Segurança e Estratégia — `cloud-mail` (original) vs `cloud-mail-plus` (fork)

> Data: 25/07/2026
> Repositórios comparados:
> - **Original:** `neog-cloud/cloud-mail` — HEAD `a6b66fc` (2026-07-03)
> - **Fork:** `neog-cloud/cloud-mail-plus` — HEAD `c9b5542` (2026-04-30)
> Base: achados de `RELATORIO_ANALISE_SEGURANCA.md` (revisado) aplicados ao original.

> **Nota da revisão 2 (25/07/2026):** este documento é o **registro histórico** da decisão de
> migrar do fork para o original, e sua conclusão **permanece válida**. Porém a contagem de
> achados aqui está desatualizada: a reauditoria posterior encontrou cinco achados adicionais
> (XSS armazenado, `oauth/bindUser` sem prova de posse, `jwt_secret` no pipeline de CI, hash de
> senha sem KDF, leitura de objetos sem autenticação) que, por serem código do upstream ou do
> template de deploy compartilhado, **existem nos dois repositórios** — ou seja, entram na coluna
> “compartilhados”, não mudam o saldo comparativo e não alteram a recomendação. Para o estado
> atual de segurança, use `RELATORIO_ANALISE_SEGURANCA.md` (rev. 2), não as tabelas abaixo.

---

## TL;DR — Conclusão e recomendação

1. **A premissa que motivou o fork ficou obsoleta.** O original **já envia email pela
   Cloudflare** desde `db0e930` (2026-05-10) — *dez dias depois* do último commit do fork.
   O fork não é mais a única forma de ter envio por Cloudflare.
2. **Porém o fork ainda tem valor:** sua implementação de CF email é **mais rica** que a do
   original (seletor de provider `CF_ONLY`/`RESEND_ONLY`/`cf-first` + fallback automático para
   Resend), e ele adiciona **AI Email Agent** e **External API**, que não existem no original.
3. **Quase todos os achados de segurança são bugs do upstream** (presentes em ambos). Alguns
   são **exclusivos do fork** (introduzidos pelas features novas). E o original **já corrigiu**
   um bug que o fork ainda carrega (`active`/`silenced`).
4. **O fork está ~2 meses atrás do upstream** e as duas bases divergiram no mesmo arquivo
   crítico (`email-service.js`), com implementações independentes de CF email.

**Recomendação:** depende de você usar (ou querer manter) o **AI Email Agent** e a **External
API**.
- **Se SIM →** manter o fork como alvo de deploy, mas **fazer merge do upstream** para recuperar
  2 meses de correções, e **enviar PRs dos bugs compartilhados** para o upstream. (Opção C)
- **Se NÃO →** **migrar para o original** e reconfigurar o envio CF lá; menos superfície de
  ataque e manutenção ativa. (Opção A)

Detalhe e plano ao final.

---

## 1. Linha do tempo (por que o fork existe e por que a premissa mudou)

| Data | Evento |
|------|--------|
| — | Fork criado a partir de um `cloud-mail` anterior a maio/2026 |
| **2026-04-30** | **Último commit do fork** (`c9b5542`) — fork adiciona seu próprio envio CF, AI Agent e External API |
| **2026-05-10** | Upstream adiciona **envio nativo por Cloudflare** (`db0e930`) — 10 dias depois |
| 2026-07-03 | Upstream corrige `active`/`silenced` e outros (`a6b66fc`) |
| **Hoje** | Fork está **~2 meses atrás** do upstream |

> Consequência: o fork e o upstream têm **duas implementações independentes** de CF email.
> O fork usa `service/cf-email-service.js` + binding `EMAIL`; o upstream usa
> `email-service.sendByCloudflareEmail()` inline + binding `email` (minúsculo). Um merge
> exige resolver conflito em `email-service.js`.

---

## 2. Comparativo dos achados de segurança

Legenda: 🟰 idêntico nos dois · ✅ corrigido no original · ➕ exclusivo do fork · 🔺 pior no fork

| # | Achado | Original | Fork | Observação |
|---|--------|:--------:|:----:|-----------|
| 2 | **SQL Injection** em `public-service.js#addUser` | 🟰 presente | 🟰 presente | Bug do upstream. Código idêntico (linhas 138-142). Corrigir **no upstream** (PR). |
| 3 | **`active`/`silenced` invertido** (OAuth) | ✅ **corrigido** (`silenced = silenced ? 0 : 1`) | 🔺 **presente** (`silenced = active ? 0 : 1`) | Fork está atrás; upstream corrigiu em 2026-07-03. **Pull do upstream resolve.** |
| 4 | **Webhook Resend sem HMAC** | 🟰 presente | 🟰 presente | `resend-api.js` idêntico. Corrigir no upstream. |
| 5 | **`init/:secret` com JWT secret no path** | 🟰 presente | 🟰 presente | Ambos. |
| 5b | **`reset-admin/:secret`** | ➖ **não existe** | ➕ **exclusivo do fork** | Superfície de ataque adicionada pelo fork. Responsabilidade do fork. |
| 6 | **Token JWT do Telegram sem expiração** + fallback `cloudflare.com/404` | 🟰 presente | 🟰 presente | Idêntico. Corrigir no upstream. |
| 7 | **CORS aberto** (`cors()` sem config) | 🟰 presente | 🟰 presente | `hono.js` idêntico. Corrigir no upstream. |
| 8 | **Credenciais em texto puro no D1** | 🟰 presente | 🟰 presente | `setting.js` — mesmos campos. Fork adiciona `externalApiKey` (mais um segredo em texto puro). |
| 9 | **Sem rate limiting** | 🟰 presente | 🟰 presente | Ambos. Fork tem mais endpoints expostos (`/external/*`, `/reset-admin`). |
| 10 | **External API sem escopo / acesso global** | ➖ **não existe** | ➕ **exclusivo do fork** | 277 linhas com delete/delete-permanente por chave única. Só o fork. |
| 11 | **`genRandomPwd` usa `Math.random()`** | 🟰 presente | 🟰 presente | `crypto-utils.js` idêntico. Corrigir no upstream. |
| 12 | **`.cloud-mail-deploy.env.bak` fora do `.gitignore`** | ➖ n/a | ➕ fork (deploy) | Artefato do processo de deploy do fork. |
| 13 | **`noVerifyPwd` em `login()`** | 🟰 presente | 🟰 presente | Ambos. |
| 14 | **Timezone `Asia/Shanghai`** | 🟰 presente | 🟰 presente | Ambos. |
| 1/15/16 | **Secrets/IDs no `wrangler.toml`** | (config de deploy) | (config de deploy) | Depende do deploy de cada um; template igual. |

**Resumo:**
- **Compartilhados (bugs do upstream, presentes nos dois):** #2, #4, #5, #6, #7, #8, #9, #11, #13, #14 → **10 achados**. Melhor corrigir **no upstream** via PR (beneficia os dois).
- **Já corrigidos no original, mas o fork carrega:** #3 (`active`/`silenced`) → resolvido ao dar merge/pull do upstream.
- **Exclusivos do fork (das features novas):** #5b (`reset-admin`), #10 (External API), #12 (`.bak`), e `externalApiKey` em texto puro → **responsabilidade do fork**, independentemente da estratégia.

> **Nenhum achado é exclusivo do original.** Migrar para o upstream **não introduz** nenhum
> problema de segurança novo; pelo contrário, elimina os exclusivos do fork (#5b, #10).

---

## 3. O que o fork tem de valor sobre o original

| Recurso | Original | Fork | Nota |
|---------|:--------:|:----:|------|
| Envio por Cloudflare Email | ✅ básico (usa CF se binding existir) | ✅ **avançado** | Fork tem seletor `emailProvider` (`CF_ONLY`/`RESEND_ONLY`/`cf-first`) **+ fallback automático** CF→Resend. Original é binário, sem fallback. |
| **AI Email Agent** | ❌ | ✅ | `agent/` (5 arquivos) + `agent-api.js` + auto-draft em email recebido. Feature substancial. |
| **External API** | ❌ | ✅ | `external-api.js` — enviar/consultar/exportar/deletar via `X-API-Key`. (Também é a maior superfície de risco do fork.) |
| `reset-admin`, `notifyNewUser` | ❌ | ✅ | Convivências operacionais menores. |
| Manutenção ativa | ✅ (commits até jul/2026) | ❌ (parado em abr/2026) | Original é mantido; fork não recebe upstream há 2 meses. |
| Correções recentes (silenced, null-checks, perf) | ✅ | ❌ | Só no upstream. |

**Trade-off central:** o fork ganha em **features** (AI Agent, External API, CF email
configurável); o original ganha em **manutenção e higiene** (atualizado, menos superfície,
bug do silenced já corrigido).

---

## 4. Opções estratégicas

### Opção A — Migrar para o original (`cloud-mail`), abandonar o fork
**Quando:** você **não** usa o AI Email Agent nem a External API, e o envio CF básico do
upstream (sem fallback configurável) atende.
- ➕ Manutenção ativa; bug `active/silenced` já resolvido; **elimina** #5b e #10 (achados
  exclusivos do fork).
- ➕ Você só precisa configurar o binding `email` e opcionalmente contribuir/aplicar os fixes
  compartilhados.
- ➖ Perde AI Agent, External API e o fallback CF→Resend.
- **Esforço:** baixo (reconfigurar deploy) + aplicar fixes compartilhados.

### Opção B — Ficar só no fork e corrigir tudo localmente
**Quando:** você quer as features do fork e não quer lidar com merge do upstream.
- ➕ Mantém tudo.
- ➖ Assume **sozinho** os 10 bugs compartilhados **+** os 4 exclusivos do fork; fica **sem** as
  correções futuras do upstream; dívida técnica cresce (já 2 meses atrás).
- **Não recomendado** — é o pior custo de manutenção a longo prazo.

### Opção C — Híbrido (RECOMENDADO se usa AI Agent/External API)
Manter o fork como alvo de deploy, mas **re-sincronizar com o upstream** e **empurrar os fixes
compartilhados para lá**:
1. `git remote add upstream …/cloud-mail && git fetch upstream` e **merge** de `upstream/main`
   no fork. Conflito principal: `email-service.js` (duas implementações de CF email) — **manter
   a do fork** (mais completa, com fallback) e absorver as demais correções do upstream (inclui
   o fix do `active/silenced`).
2. **Corrigir os 10 achados compartilhados no upstream** (PRs): SQLi (#2), HMAC (#4), CORS (#7),
   `Math.random` (#11), timezone (#14), token Telegram (#6), etc. Beneficia os dois projetos e
   reduz a sua dívida futura.
3. **Corrigir localmente os exclusivos do fork:** escopo/rate-limit da External API (#10),
   `reset-admin` autenticado (#5b), `externalApiKey` cifrado, `.gitignore` do `.bak` (#12).
- ➕ Mantém features; recupera manutenção; distribui o trabalho de segurança.
- ➖ Exige resolver o conflito de merge uma vez e manter cadência de sync com o upstream.
- **Esforço:** médio (merge inicial) + os itens de `PLANO_ACAO_CORRECAO.md`.

---

## 5. Recomendação final

**Decisão depende de uma pergunta:** *você usa/quer manter o AI Email Agent e a External API?*

- **Sim → Opção C (híbrido).** É o melhor equilíbrio: preserva o que o fork tem de único,
  recupera 2 meses de correções do upstream (incluindo o `active/silenced`), e evita virar
  mantenedor solo de 14 problemas de segurança ao empurrar os 10 compartilhados para o upstream.
- **Não → Opção A (migrar).** Se as features novas não são usadas, o original entrega o envio
  CF que você queria, é mantido ativamente, e tem **menos** superfície de ataque (sem
  `reset-admin` nem External API).

**Em ambos os casos, independentemente da escolha:**
- Os fixes 🔴/🟠 de `PLANO_ACAO_CORRECAO.md` continuam necessários (a maioria é bug de upstream,
  então idealmente vira PR).
- A Fase 0 (rotacionar JWT secret, `.gitignore`, remover `.bak`) deve ser feita **já**, pois é
  do seu deploy, não do código.

**Sugestão de sequência prática:**
1. Fase 0 do plano de ação (contenção de segredos) — hoje.
2. Confirmar uso do AI Agent/External API → decide A ou C.
3. Se C: adicionar `upstream`, fazer o merge, resolver `email-service.js` a favor do fork.
4. Corrigir os bugs compartilhados (idealmente como PR no upstream) e depois os exclusivos do fork.

---

## Anexo — Evidências verificadas

- Original **corrige** silenced: `cloud-mail/mail-worker/src/service/oauth-service.js` →
  `userInfo.silenced = userInfo.silenced ? 0 : 1;` (fork usa `... = userInfo.active ? 0 : 1;`).
- Original **tem** CF email: `email-service.js:234` `useCloudflareEmail = !!c.env.email`;
  `:266-278` escolhe CF vs Resend; `:378 sendByCloudflareEmail`. Commit `db0e930` (2026-05-10).
- SQLi idêntico: `public-service.js:138-142` nos dois.
- Webhook/CORS/crypto/timezone/noVerifyPwd idênticos nos dois (grep confirmado).
- `reset-admin`, `external-api.js`, `agent/`, `cf-email-service.js` **só existem no fork**.
- Fork envio CF: `email-service.js:282` seletor `emailProvider` + fallback (`:299-305`),
  `cf-email-service.js` (binding `EMAIL`).
