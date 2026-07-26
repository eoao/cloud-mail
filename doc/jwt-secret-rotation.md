# Runbook — Rotating `jwt_secret`

> Applies from commit `4e81e38` onward (`fix: enforce deleted/banned checks in issueSession,
> derive settings encryption key via HKDF`). Read this before rotating `jwt_secret` in any
> environment where the D1 `setting` table has ever held real credentials.

## Why this matters

As of `mail-worker/src/utils/encrypt-utils.js`, the AES-GCM key used to encrypt sensitive
columns in the `setting` table is **derived from `jwt_secret`** via HKDF-SHA256, not from a
standalone secret:

```
deriveKey(c) = HKDF-SHA256(ikm = c.env.jwt_secret,
                            salt = "cloud-mail-settings-encryption-v1",
                            info = "settings-aes-gcm-key") -> AES-256-GCM key
```

This was a deliberate trade-off: reusing
`jwt_secret` avoids provisioning yet another Worker secret, and HKDF removes the key-length
footgun that a standalone `crypto.subtle.importKey('raw', ...)` secret had (AES-GCM requires
exactly 16/24/32 raw bytes; HKDF normalizes any input length to a valid 256-bit key).

**The consequence: `jwt_secret` is no longer just a session-signing secret. It is also the
root key for encrypted settings.** Rotating it without a migration step makes every
previously encrypted value permanently unreadable — `decryptSetting` fails closed (returns
the raw ciphertext) rather than throwing, so this failure is **silent** unless you know to
check for it.

## Blast radius

Rotating `jwt_secret` without following this runbook breaks decryption for every row in the
`setting` table where these columns hold a value prefixed with `$aes$`:

| Column (DB name)         | Entity field   | Used for                          |
| ------------------------- | -------------- | ---------------------------------- |
| `secret_key`               | `secretKey`    | Cloudflare Turnstile secret key    |
| `tg_bot_token`             | `tgBotToken`   | Telegram bot token                 |
| `resend_tokens`            | `resendTokens` | Resend API keys (JSON, per domain) |
| `s3_access_key`            | `s3AccessKey`  | S3-compatible storage access key   |
| `s3_secret_key`            | `s3SecretKey`  | S3-compatible storage secret key   |

After rotation, `settingService.query()` / `refresh()` will return the raw ciphertext string
(something like `$aes$AbCd...==`) in place of the real value for each of these fields. This
is **not** a crash — the application keeps running, but Turnstile verification, the Telegram
bot, Resend sending, and S3-backed attachment storage will all silently fail using garbage
credentials.

This is unrelated to, and does not affect, session validity: existing JWTs and KV auth
entries signed with the old `jwt_secret` are correctly invalidated by rotation, which is the
intended effect. Only the encrypted **settings columns** have this extra dependency.

## Pre-rotation checklist

Before generating a new `jwt_secret`:

1. **Confirm whether any of the five fields above are actually populated.** If the instance
   never configured Turnstile, Telegram, Resend, or S3-compatible storage, there is nothing
   encrypted and you can skip straight to rotating.

   ```sql
   SELECT secret_key, tg_bot_token, resend_tokens, s3_access_key, s3_secret_key FROM setting;
   ```

   Any value starting with `$aes$` is a candidate that will break.

2. **Capture the current plaintext values from the admin UI** (Settings → the relevant
   section for each field), not from the database — the DB holds ciphertext, and the admin
   UI is what already knows how to decrypt with the *current* `jwt_secret` before you rotate
   it. Store these temporarily in your password manager, not in a plain file.

3. Confirm you have write access to re-enter these values through the admin UI after
   rotation (i.e. an admin account whose session will survive the rotation long enough, or
   that you can re-authenticate with fresh credentials post-rotation — rotation invalidates
   all sessions, so you will need to log in again regardless).

## Rotation procedure

1. Generate the new secret and update it wherever `jwt_secret` is provisioned (GitHub
   Actions secret `JWT_SECRET`, consumed by the `🔑 设置密钥 / Set Worker secrets` step in
   `.github/workflows/deploy-cloudflare.yml`, which runs `wrangler secret put jwt_secret`).
2. Deploy. This immediately invalidates all existing sessions and all previously encrypted
   setting values (decryption will silently fail-open to ciphertext from this point on).
3. Log back in as admin (expected — see step 3 of the checklist).
4. Re-enter each affected field you captured in the pre-rotation checklist, through the
   normal Settings UI, and save. The `set()` handler in `setting-service.js` re-encrypts on
   write using the new `jwt_secret`-derived key automatically — no manual encryption step is
   needed.
5. Verify (see below).

## Verification

After re-entering credentials, confirm each dependent feature actually works end-to-end, not
just that the settings page shows a masked value:

- **Turnstile**: trigger a login/register flow that requires it and confirm the challenge is
  accepted (a stale/garbage `secretKey` causes `turnstileService.verify` to fail with
  `botVerifyFail` on every attempt).
- **Telegram**: trigger a new-mail notification and confirm the bot message is delivered.
- **Resend**: send a test email through a domain configured with a Resend token and confirm
  it goes out (and that `/webhooks` deliveries keep validating — Resend's *signing* secret is
  a separate Worker secret, `resend_signing_secret`, unaffected by this rotation).
- **S3 storage**: upload or fetch an attachment on an instance configured with S3-compatible
  storage and confirm it succeeds.

If any of these fail after rotation and re-entry, check `SELECT ... FROM setting` again — a
value still starting with `$aes$` that doesn't decrypt to something sensible in the admin UI
means the corresponding field was not actually re-saved in step 4.

## Notes for future changes

- If `settings_encryption_key` (a standalone secret) is ever reintroduced instead of the
  HKDF-from-`jwt_secret` approach, this coupling goes away and this runbook becomes
  obsolete — update or remove it at that point.
- Any future automation that rotates `jwt_secret` (e.g. a scheduled rotation job) must not
  treat this as a fire-and-forget secret update. It needs either a decrypt-with-old /
  re-encrypt-with-new migration step run before the old secret is discarded, or it must
  fail loudly (not silently) when `$aes$`-prefixed values exist and no migration ran.
