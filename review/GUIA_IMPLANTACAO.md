# Guia de Implantação — Cloud Mail (Cloudflare)

> Gerado em 26/07/2026. Baseado nas correções de segurança do PLANO_ACAO_CORRECAO.md.

## Pré-requisitos

- Conta Cloudflare com Workers Paid plan (D1, KV, R2, Cron Triggers)
- Domínio configurado no Cloudflare (para Email Routing e Custom Domain)
- Node.js 22+ e pnpm instalados localmente
- `wrangler` autenticado (`npx wrangler login`)

---

## 1. Criar recursos Cloudflare

```bash
# D1 database
wrangler d1 create cloud-mail
# Anote o database_id

# KV namespace
wrangler kv namespace create cloud-mail-kv
# Anote o namespace_id

# R2 bucket (opcional, para anexos e backups)
wrangler r2 bucket create cloud-mail
```

---

## 2. Configurar Email Routing (obrigatório para receber emails)

1. No dashboard Cloudflare, ative **Email Routing** para o domínio
2. Configure catch-all ou regras de rota apontando para o Worker
3. Vincule o email binding ao Worker:
```toml
# [[send_email]]
# name = "email"
```

---

## 3. Configurar `wrangler-action.toml`

Preencha as variáveis de ambiente no arquivo `mail-worker/wrangler-action.toml`:

```toml
[vars]
ai_model = ""                                          # ou modelo específico do Workers AI
analysis_cache = "false"                               # cache de análise
domain = '["seudominio.com"]'                           # domínios de email (JSON array)
admin = "admin@seudominio.com"                          # email do administrador
project_link = ""                                       # ou false

linuxdo_client_id = ""                                  # opcional (OAuth LinuxDo)
linuxdo_client_secret = ""
linuxdo_callback_url = ""
linuxdo_switch = "false"
```

---

## 4. Gerar e registrar Secrets

```bash
cd mail-worker

# jwt_secret — chave de assinatura JWT (removida de [vars])
wrangler secret put jwt_secret
# colar: openssl rand -hex 32

# init_secret — chave para inicialização do banco
wrangler secret put init_secret
# colar: openssl rand -hex 32

# settings_encryption_key — chave para criptografia de credenciais no D1
wrangler secret put settings_encryption_key
# colar: openssl rand -base64 32

# resend_signing_secret — webhook signing secret do Resend (se usar Resend)
wrangler secret put resend_signing_secret
# colar o secret do dashboard Resend → Webhooks
```

---

## 5. Deploy inicial

```bash
cd mail-worker

# Instalar dependências e build do frontend
pnpm install
pnpm --prefix ../mail-vue install
pnpm --prefix ../mail-vue run build

# Deploy
wrangler deploy --config wrangler-action.toml
```

---

## 6. Inicializar banco de dados

```bash
# Após o primeiro deploy, inicialize as tabelas
INIT_SECRET=$(printf "seu-init-secret-aqui")
WORKER_URL="https://mail.seudominio.com"

curl -H "Authorization: ${INIT_SECRET}" "${WORKER_URL}/api/init"
# Resposta esperada: {"code":200,"message":"Database initialized successfully"}
```

---

## 7. Configurar domínio customizado (Cloudflare Dashboard)

1. Workers & Pages → cloud-mail → Settings → Domains & Routes
2. Adicionar domínio customizado (ex: `mail.seudominio.com`)
3. O DNS será configurado automaticamente

---

## 8. Configurar GitHub Actions (CI/CD)

Adicione os secrets no repositório GitHub (Settings → Secrets and variables → Actions):

| Secret | Descrição |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API Token com permissão `Workers Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID do dashboard Cloudflare |

O workflow em `.github/workflows/deploy-cloudflare.yml` fará build → test → deploy automaticamente em push na `main`.

---

## 9. Configurar Turnstile (anti-bot no login/registro)

1. Crie um site Turnstile no dashboard Cloudflare
2. No admin panel do Cloud Mail, configure `siteKey` e `secretKey` nas configurações do sistema
3. Ative `registerVerify` para exigir verificação no login e registro

---

## 10. Verificações pós-deploy

```bash
# 1. Login funciona
curl -X POST "${WORKER_URL}/api/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seudominio.com","password":"sua-senha"}'

# 2. Webhook Resend rejeita sem assinatura
curl -X POST "${WORKER_URL}/api/webhooks" \
  -H "Content-Type: application/json" \
  -d '{"type":"email.delivered","data":{"email_id":"test"}}'
# Esperado: 401 Unauthorized

# 3. Init rejeita sem header
curl "${WORKER_URL}/api/init"
# Esperado: 401

# 4. CSP presente
curl -I "${WORKER_URL}/assets/" 2>/dev/null | grep -i content-security-policy
```

---

## 11. Ativar backups D1

O backup diário é automático via cron trigger (`0 16 * * *`). Verifique no R2:

```bash
wrangler r2 object list cloud-mail --prefix backups/
```

### Restauração de backup

```bash
# Listar backups
wrangler r2 object list cloud-mail --prefix backups/2025-07-26/

# Baixar tabela
wrangler r2 object get cloud-mail backups/2025-07-26/user.json > user.json

# Restaurar (exemplo para tabela user)
wrangler d1 execute cloud-mail --file user.json
```

---

## Notas de segurança

- Todas as credenciais sensíveis (`secretKey`, `tgBotToken`, `resendTokens`, `s3AccessKey`, `s3SecretKey`) são automaticamente criptografadas com AES-GCM no D1
- O token de sessão é armazenado como cookie `HttpOnly; Secure; SameSite=Strict`
- HTML de emails é sanitizado com DOMPurify na recepção (servidor) e renderização (cliente)
- Rate limiting: 5 tentativas de login por IP a cada 60 segundos
- OAuth `bindUser` exige token de vínculo assinado (JWT, 5 min TTL)
- Senhas usam PBKDF2-HMAC-SHA256 com 120k iterações
