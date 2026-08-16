Troubleshooting and solutions

This note provides concrete commands, checks, and fixes used during the Cloud Mail deployment.

1) Verify Wrangler & Cloudflare auth
- Check auth: `npx wrangler whoami`
- If `You are not authenticated`, run `npx wrangler login` (or use OAuth token in CI). Use `pnpm exec wrangler` if installed via pnpm.

2) Inspect Cloud resources
- D1: `npx wrangler d1 list`
- KV: `npx wrangler kv namespace list`
- R2: `npx wrangler r2 bucket list`

3) Attach bindings to wrangler.toml
- Add resources by ID/names:
  [[d1_databases]]
  binding = "db"
  database_name = "cloud-mail"
  database_id = "<d1-uuid>"  

  [[kv_namespaces]]
  binding = "kv"
  id = "<kv-id>"  

  [[r2_buckets]]
  binding = "r2"
  bucket_name = "cloud-mail"

- Add account_id at top and [assets] config.

4) Build the frontend locally (avoid custom build failures)
- Locally build steps:
  pnpm --prefix ../mail-vue install
  pnpm --prefix ../mail-vue run build
- If esbuild binary errors: `pnpm rebuild esbuild` or pin esbuild in package.json.
- Ensure `mail-worker/dist` contains built assets before `wrangler deploy`.

5) Secrets handling
- Remove sensitive values from wrangler.toml and set `keep_vars = false`.
- Create worker secrets:
  printf '%s' "<secret>" | npx wrangler secret put JWT_SECRET --config mail-worker/wrangler.toml
  printf '%s' "<ark-key>" | npx wrangler secret put AI_API_KEY --config mail-worker/wrangler.toml
- If `wrangler secret put` conflicts (binding name in use), inspect Cloudflare Dashboard -> Workers -> cloud-mail -> Settings -> Secrets and remove duplicates manually.

6) Deploy and verify
- Deploy: `npx wrangler deploy --config mail-worker/wrangler.toml`
- Check deployment output for listed bindings (env.db, env.kv, env.r2, env.assets, env.AI_API_URL, env.JWT_SECRET)
- Test endpoints:
  curl -v https://mail.resultcrafter.com/
  curl -v https://mail.resultcrafter.com/api/init/<jwt>

7) Tail logs
- Start tail: `npx wrangler tail --config mail-worker/wrangler.toml --format pretty` (watch logs while triggering requests)

8) DNS & Route checks
- Confirm zone uses Cloudflare nameservers in your registrar.
- Confirm route appears in Dashboard -> Workers -> Services -> cloud-mail -> Routes.
- If domain does not resolve, add a proxied DNS record (type CNAME) for `mail` and point to your root or follow Cloudflare documentation.

9) Revert Cloudflare AI binding
- To avoid using Workers AI, remove `[ai]` binding from wrangler.toml and move to external API via AI_API_URL + AI_API_KEY secrets. Update code to fall back to the external API.

10) Post-deploy
- Replace placeholder jwt_secret with rotated secret stored as Worker secret.
- Move AI/API keys to CI/CD secrets for automation.

