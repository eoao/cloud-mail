# cloud-mail IMAP / SMTP bridge

Lets Thunderbird, Apple Mail, Outlook or a script reach a cloud-mail account
with the protocols they already speak.

## Why this is a separate component

Cloudflare Workers cannot open raw TCP sockets, and IMAP and SMTP are TCP
protocols. There is no way to serve them from the worker itself, so the bridge
runs wherever you already have a machine — a VPS, a home server, a container —
and translates between the protocols and the worker's `/api/v1` REST surface.

It holds no database. Every message, contact and setting stays in the worker;
the bridge is a translator with an API key. Revoke the key and the bridge stops
working immediately.

## Running it

```bash
export CLOUD_MAIL_URL=https://mail.example.com
node tools/imap-bridge/bin/cloud-mail-bridge.mjs
```

Or with Docker:

```bash
docker build -t cloud-mail-bridge tools/imap-bridge
docker run -e CLOUD_MAIL_URL=https://mail.example.com -p 1143:1143 -p 1587:1587 cloud-mail-bridge
```

No dependencies to install — Node 20+ built-ins only.

| Variable | Default | Meaning |
|---|---|---|
| `CLOUD_MAIL_URL` | *(required)* | Your deployment's base URL |
| `IMAP_PORT` | `1143` | IMAP listener |
| `SMTP_PORT` | `1587` | SMTP submission listener |
| `BIND_HOST` | `127.0.0.1` | Interface to bind |

## Configuring a mail client

Create an API key in **Settings → API keys** with the `mail:read` and
`mail:send` scopes, then in your client:

- **Incoming (IMAP)**: your bridge host, port `1143`
- **Outgoing (SMTP)**: your bridge host, port `1587`
- **Username**: your cloud-mail address
- **Password**: the API key

The API key goes in the password field because that is the only credential slot
a mail client offers, and it is what the worker actually checks. Your account
password is never sent to the bridge.

## TLS

The bridge speaks plaintext. That is fine on `127.0.0.1`, and unacceptable over
a network — the API key would cross it in the clear.

If clients connect from anywhere but the same machine, put a TLS terminator in
front of it (stunnel, HAProxy, Caddy's `tls` listener) and point the clients at
that. Binding to `0.0.0.0` prints a warning for this reason.

## What it supports

**IMAP** — read-only: `CAPABILITY`, `LOGIN`, `LIST`, `LSUB`, `SELECT`,
`EXAMINE`, `SEARCH`, `FETCH`, `UID FETCH`, `UID SEARCH`, `NOOP`, `CLOSE`,
`LOGOUT`. Two mailboxes are exposed: `INBOX` and `Sent`.

Commands that would change state (`STORE`, `APPEND`, `COPY`, `EXPUNGE`,
`CREATE`, `DELETE`, `RENAME`) answer `NO`. A fake `OK` would be worse: a client
told a flag was stored stops showing a message as unread when it still is.
Use the web app for those.

**SMTP** — submission only: `EHLO`, `AUTH PLAIN`, `AUTH LOGIN`, `MAIL`, `RCPT`,
`DATA`, `RSET`, `NOOP`, `QUIT`. It is not an MTA and never relays: mail is only
accepted from an authenticated client and is handed to the worker's own sending
provider.

Bcc works, because the envelope recipients are compared against the header ones
rather than trusting the document alone.

## Limits

- A mailbox is fetched one page (200 messages) per `SELECT` and held for the
  session. A larger mailbox is truncated.
- Attachments are not yet served over IMAP; message bodies are.
- `SEARCH` understands `ALL`, `SEEN` and `UNSEEN`; anything else is answered as
  `ALL` rather than as an empty result, because a client that receives nothing
  concludes the mailbox is empty.

## Tests

```bash
node --test tools/imap-bridge/test/bridge.test.mjs
```
