Domain setup and how mail.resultcrafter.com was fixed

Goal
- Host the Cloud Mail UI at https://mail.resultcrafter.com while keeping email addresses at @resultcrafter.com.

Prerequisites
- The domain resultcrafter.com must be added to your Cloudflare account and delegated to Cloudflare nameservers at your registrar.
- Wrangler (Cloudflare CLI) with an authenticated account (npx wrangler whoami returns account info).

Steps performed
1. Add a Workers route in mail-worker/wrangler.toml
- In `mail-worker/wrangler.toml` add:
  [[routes]]
  pattern = "mail.resultcrafter.com"
  custom_domain = true

2. Ensure the zone is active in Cloudflare
- Confirm `resultcrafter.com` is in your Cloudflare dashboard and uses Cloudflare nameservers.
- If the zone is in a different Cloudflare account, migrate or add a new zone in the account holding the Worker.

3. Deploy the Worker which registers the route
- Run: `npx wrangler deploy --config mail-worker/wrangler.toml`
- Wrangler output will show `mail.resultcrafter.com (custom domain)` when registration succeeds.

4. Verify DNS and HTTP
- Check DNS: `dig +short mail.resultcrafter.com` (should return an entry once DNS/Cloudflare routing is active)
- Test HTTP: `curl -v https://mail.resultcrafter.com/` should return 200 and serve the SPA.

Why DNS sometimes appears missing
- Cloudflare routes for a Worker don't require an extra DNS record when the zone is proxied and controlled by Cloudflare; the route is virtual. However, DNS must still resolve to Cloudflare (zone delegated). If you see NXDOMAIN from `dig`, ensure registrar changed nameservers and propagation completed.

Manual DNS fix (if needed)
- If route not reachable, add a DNS record:
  - Type: CNAME
  - Name: mail
  - Target: @ (or your root domain or an appropriate target as per your DNS setup)
  - Proxy status: Proxied (recommended)
- Wait propagation (can be immediate when using Cloudflare proxy).

Cloud Mail specifics
- The Worker is configured to serve built assets from the `mail-worker/dist` folder via the assets binding. Ensure frontend build has produced dist before deploy.
- Bindings required: D1 database (`env.db`), KV (`env.kv`), R2 (`env.r2`). Confirm they appear in wrangler deploy output.

Notes for future domains
- Repeat the same process: add domain to Cloudflare zone, add [[routes]] pattern for the subdomain, ensure zone is under same account as Worker, add any DNS CNAME if necessary, deploy via wrangler.

