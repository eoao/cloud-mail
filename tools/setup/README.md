# cloud-mail setup wizard

One command takes a blank Cloudflare account and a domain to a working mailbox.
It replaces the dashboard clicking that the project otherwise expects you to do
by hand: Email Routing, DNS, D1, KV, R2, secrets, deploy, migrations.

```bash
node tools/setup/bin/cloud-mail-setup.mjs
```

No dependencies to install — it uses only Node 20+ built-ins.

## What it does

| Step | Detail |
|---|---|
| 1. Token | Verifies your API token and lists the accounts it can see |
| 2. Zone | Picks the mail domain and warns if it is not active yet |
| 3. Storage | Finds or creates the D1 database, KV namespace and R2 bucket |
| 4. Inbound | Enables Email Routing and writes the required MX + SPF records |
| 5. Config | Generates `mail-worker/wrangler.toml` (secrets excluded by design) |
| 6. Deploy | Builds the frontend and deploys the worker |
| 7. Secrets | Pushes `jwt_secret` and `init_secret` with `wrangler secret put` |
| 8. Routing | Points the catch-all rule at the worker — without this, no mail arrives |
| 9. Database | Calls `/api/init/<init_secret>` and retries until the worker answers |
| 10. DMARC | Optionally adds a safe `p=none` DMARC record |

Every step is **idempotent**. Re-run it any time: existing resources are reused,
not duplicated, and `wrangler.toml` is backed up to `wrangler.toml.bak` before
being rewritten.

## API token permissions

Create a custom token at <https://dash.cloudflare.com/profile/api-tokens> with:

- Account → Workers Scripts → Edit
- Account → Workers KV Storage → Edit
- Account → D1 → Edit
- Account → Workers R2 Storage → Edit
- Account → Workers AI → Edit
- Zone → DNS → Edit
- Zone → Email Routing Rules → Edit
- Zone → Zone → Read

Pass it with `--token=...`, set `CLOUDFLARE_API_TOKEN`, or paste it when asked
(input is not echoed).

## Diagnosing an existing install

```bash
node tools/setup/bin/cloud-mail-setup.mjs --doctor
```

Read-only. It checks the zone, the worker, Email Routing, the MX/SPF records,
the catch-all target and DMARC, and prints a concrete fix for anything broken.
The most common finding is a catch-all rule that forwards to an address instead
of the worker — mail silently never reaches the app in that state.

## Why sending still needs a provider

Cloudflare **Email Routing only receives**. There is no free Cloudflare path for
sending to an arbitrary address:

- **Cloudflare Email Sending** (`[[send_email]]` binding) can only deliver to
  addresses verified on your own account, so it is useless for replying to a
  stranger.
- Reaching `gmail.com` and friends needs a provider with SPF/DKIM reputation —
  Resend, Postmark, SendGrid, Brevo, Mailgun or your own SMTP relay.

That is the only reason a Resend token appears in the admin panel. Configure the
provider under **System Settings**, then add the DKIM records it gives you to
this zone.

## Running the tests

```bash
node --test tools/setup/test/setup.test.mjs
```
