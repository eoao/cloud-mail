Deploy incidents and timeline

## Summary
This document records incidents encountered during deployment of Cloud Mail to mail.resultcrafter.com and the actions taken to resolve them.

## Incidents
1. Wrangler not installed globally in shell
   - Symptom: `wrangler` command not found; `npx wrangler whoami` worked.
   - Fix: Use `npx wrangler` or `pnpm exec wrangler` in CI; optionally install wrangler globally.

2. Missing D1/KV/R2 bindings on deployed Worker
   - Symptom: Deployment output showed only `env.ai` and `env.assets`, no DB/KV/R2.
   - Investigation: `npx wrangler versions view --json` showed bindings were missing. Cloudflare Dashboard showed Worker exists but no routes connected.
   - Fix: Add explicit [[d1_databases]], [[kv_namespaces]], [[r2_buckets]] to mail-worker/wrangler.toml using resource IDs from Cloudflare account, then deploy. Also ensure account_id present.

3. Frontend build failures (esbuild native binary mismatch)
   - Symptom: Custom build in wrangler failed: esbuild errors referencing native binary.
   - Fix: Build mail-vue locally: remove node_modules and pnpm-lock.yaml if necessary, reinstall (`pnpm --prefix mail-vue install`), run `pnpm --prefix mail-vue run build`. If esbuild native binary mismatch occurs, run `pnpm rebuild esbuild` or pin esbuild to a compatible version.

4. Secrets and binding name conflicts when moving vars from toml to Worker secrets
   - Symptom: `wrangler secret put` failed with API errors (10053: binding name already in use / 10056: binding not found).
   - Investigation: Wrangler state and existing toml `keep_vars`/old env var caused duplicated bindings.
   - Fix/workaround: Removed sensitive keys from wrangler.toml, set `keep_vars = false`, added new Worker secret `JWT_SECRET` with `npx wrangler secret put JWT_SECRET`. Updated code to read fallback env keys (JWT_SECRET) and redeployed. Manual cleanup in Cloudflare Dashboard may be required if API reports inconsistent secret state.

5. DNS / Route not resolving initially
   - Symptom: `dig` returned empty but `curl` later succeeded. Wrangler deploy reported `mail.resultcrafter.com (custom domain)` as a route.
   - Fix: Ensure domain is managed in the same Cloudflare account (zone delegated to Cloudflare nameservers); add [[routes]] pattern to wrangler.toml and deploy. Confirm route in Cloudflare Dashboard -> Workers -> Services -> cloud-mail -> Routes. If DNS doesn't resolve, add a proxied DNS record (CNAME) under the zone or wait for propagation.

## Notes
- Always store secrets as Worker secrets (wrangler secret put) or in CI secrets; avoid committing them into `wrangler.toml`.
- When wrangler complains about secret binding conflicts, inspect Dashboard and remove legacy env vars or secrets manually.

