# Considerações Finais — Adoção do projeto original `cloud-mail`

> Data: 25/07/2026 · **Revisão 2** · Autor da revisão: Claude (sessão de auditoria)
> Contexto: migração da decisão de `cloud-mail-plus` (fork) para `cloud-mail` (original).

> **⚠️ Atualização da revisão 2:** a decisão de adotar o original **continua correta** — nada nesta
> revisão a contradiz. O que mudou é o **veredito de prontidão**: a reauditoria completa (incluindo
> frontend e pipeline de deploy, não cobertos na v1) encontrou dois bloqueadores que a v1 não viu.
> O projeto passou de “🟡 produção com ressalvas” para **“🔴 não pronto para produção”** até a
> conclusão das Fases 1 e 2 do plano. Detalhes em `RELATORIO_ANALISE_SEGURANCA.md` (rev. 2).

## Por que estamos aqui

O fork `cloud-mail-plus` foi adotado originalmente por **um único motivo**: enviar email pela
Cloudflare (o original, à época, só enviava por Resend). Essa premissa **caducou**: o original
passou a suportar envio nativo por Cloudflare em `db0e930` (2026-05-10), dez dias após o último
commit do fork. Confirmada a capacidade de envio CF no original, a decisão foi **assumir o
projeto original** e descontinuar o fork.

## O que você ganha ao voltar para o original

- **Envio por Cloudflare** já disponível (`email-service.sendByCloudflareEmail`, binding `email`).
- **Manutenção ativa** (commits até jul/2026) e ~2 meses de correções que o fork não tinha.
- **Menos superfície de ataque:** o original **não** tem o endpoint `reset-admin` nem a
  External API (chave única com delete global) — dois achados que só existiam no fork.
- **Bug `active/silenced` já corrigido** aqui (`a6b66fc`).

## O que você abre mão (e como recuperar, se precisar um dia)

- **AI Email Agent** (`agent/` + `agent-api.js` + auto-draft): não existe no original. Se um dia
  quiser, dá para portar como módulo isolado sobre o original.
- **External API** (`external-api.js`): idem — mas se voltar, portar **já com escopos e rate
  limiting** (era o achado #10 do fork).
- **Envio CF configurável** (`emailProvider` `CF_ONLY`/`RESEND_ONLY`/`cf-first` + fallback
  automático): o original usa CF quando o binding existe, **sem seletor nem fallback**. Se você
  precisa do fallback CF→Resend, isso é uma pequena melhoria a portar/contribuir para o original
  (é a única capacidade em que o fork era superior).

## Estado de segurança do original (resumo — rev. 2)

Rode as correções na ordem de `PLANO_ACAO_CORRECAO.md`:

- **Fazer já (deploy):** o `jwt_secret` **não** está sendo tratado como Secret. O CI deploya com
  `wrangler-action.toml`, que o declara em `[vars]` (texto puro no dashboard), e o passo de init
  do workflow o envia na URL (`curl .../api/init/${JWT_SECRET}`, com observability ligada). Um
  `wrangler secret put` isolado **é revertido no deploy seguinte** — é preciso mudar o TOML e o
  workflow junto. Se já houve algum deploy, **rotacione o secret**. Mais `.gitignore` para
  arquivos de env/credenciais.
- **Bloqueadores (código):**
  1. **XSS armazenado via HTML de email** — sem sanitização em lugar nenhum, renderizado com
     `innerHTML`, token de sessão em `localStorage`. Não autenticado: basta enviar um email.
     É o achado mais grave do projeto.
  2. **`oauth/bindUser` sem prova de posse** — endpoint público que aceita `oauthUserId` cru e
     devolve uma sessão. Só ativo com LinuxDo habilitado.
  3. **SQL Injection** em `public-service.js#addUser` (exige chamador já admin).
- **Antes de produção:** HMAC no webhook Resend, tirar o JWT secret do path do `/init` (mexendo no
  workflow junto), expirar tokens do Telegram, restringir CORS, rate limiting **e Turnstile no
  login** (hoje o login não tem Turnstile em nenhum caminho), e substituir o hash de senha —
  SHA-256 de uma rodada não é KDF.
- **Endurecimento:** cifrar credenciais no D1, `crypto.getRandomValues`, autorizar leitura de
  objetos, timezone UTC, remover `noVerifyPwd`, renomear arquivos com typo (Fase 3).
- **Prontidão operacional (Fase 4, nova):** o deploy não tem gate de testes; `pnpm test` no
  `mail-worker` **executa um deploy** em vez de rodar testes; não há backup do D1.

A maioria são **bugs do próprio upstream**. Como este é o repositório canônico, corrija aqui e,
se houver fork/downstream, contribua via PR — evitar divergência foi exatamente a lição do
`cloud-mail-plus`. Os dois bloqueadores novos afetam toda instância pública de cloud-mail: vale
reportar ao upstream de forma coordenada, não por issue pública.

## Verificações que sustentam estas conclusões

- Original envia por CF: `mail-worker/src/service/email-service.js:234,266,378`.
- Original corrige silenced: `service/oauth-service.js:73` (`silenced = silenced ? 0 : 1`).
- Achados confirmados por leitura direta dos arquivos citados no relatório.
- `reset-admin`/`external-api.js`/`agent/` ausentes neste repositório (`ls`/`grep` confirmados).
- **Rev. 2:** ausência total de sanitização confirmada por
  `grep -rni "sanitiz|dompurify|xss" mail-worker/src mail-vue/src` (sem resultados relevantes);
  ausência de CSP por `grep -rn "Content-Security-Policy"` (sem resultados);
  `jwt_secret` em `[vars]` em `mail-worker/wrangler-action.toml:44` e na URL do passo de init de
  `.github/workflows/deploy-cloudflare.yml`.

## Documentos nesta pasta

- `RELATORIO_ANALISE_SEGURANCA.md` — achados adaptados e reverificados para o original.
- `PLANO_ACAO_CORRECAO.md` — checklist de correção por fases, específico do original.
- `COMPARATIVO_ORIGINAL_VS_FORK.md` — análise completa que fundamentou a decisão de migração.
- `CONSIDERACOES_FINAIS.md` — este documento.

## Próximo passo sugerido (ao continuar por aqui)

1. **Fase 0** do plano — `.gitignore`, tirar `jwt_secret` de `[vars]` **no `wrangler-action.toml`
   e no workflow juntos**, rotacionar o secret se já houve deploy.
2. **Fase 1** — XSS armazenado, `bindUser`, SQLi. São três bloqueadores, não um.
3. Configurar o binding `send_email`/`email` e validar um envio real por CF.
4. **Fase 2**, com atenção ao acoplamento: mexer no `/init` exige alterar o workflow no mesmo
   commit, e migrar o token para cookie exige fechar o CORS no mesmo commit.
5. **Fase 4** antes de considerar o sistema operável, não depois.

Se o objetivo for lançar rápido, o único corte defensável é manter `linuxdoSwitch` desligado e
tratar F1-OAUTH como bloqueador de ativação do OAuth em vez de bloqueador de lançamento. O XSS
não tem corte equivalente — ele é explorável por qualquer pessoa que saiba um endereço da
instância.
