# Runbook — D1 Backup and Restore

> Implementation lives in `mail-worker/src/service/backup-service.js`, exposed through
> `mail-worker/src/api/backup-api.js`, and exercised by `mail-worker/test/backup.spec.js`.

## What gets backed up

A scheduled job writes a full logical dump to R2 once per day, from the Worker's
`scheduled` handler (`mail-worker/src/index.js`), on the existing `0 16 * * *` cron.

| Object                                | Contents                                        |
| ------------------------------------- | ----------------------------------------------- |
| `backups/<date>/manifest.json`        | Date, timestamp, table list, chunk count, row counts |
| `backups/<date>/<table>.json`         | One file per table: `setting`, `role`, `perm`, `role_perm`, `user`, `account`, `oauth`, `reg_key`, `star`, `att` |
| `backups/<date>/email-NNNN.json`      | Email rows in pages of 200, **including the `content` and `text` bodies** |

Emails are paged because they carry the message bodies; a single unpaged read over a
large mailbox exceeds the Worker memory ceiling. The restore reads `emailChunks` from
the manifest to know how many pages to expect.

**`verify_record` is deliberately excluded.** It is rate-limiting scratch data that the
scheduled job rebuilds, and restoring it would resurrect stale counters.

Retention is **7 days**, enforced by `cleanupOldBackups`, which pages through the full
R2 listing rather than truncating at the first 1000 keys.

### What is *not* covered

Backups capture D1 only. **Attachment payloads are not backed up** — the `att` table
records attachment metadata (key, filename, size), but the objects themselves live in
R2 or KV and are not copied. After a restore, attachment rows will reference keys whose
underlying objects still need to exist. Since attachment keys are content hashes
(`attachments/<sha256-prefix><ext>`) and neither R2 nor KV is truncated by a restore,
this matters only if the object store itself was lost.

`setting` rows are stored encrypted (`$aes$…`) and are only readable with the
`jwt_secret` in force when the backup was taken. Restoring a backup taken before a
`jwt_secret` rotation yields unusable credentials — see
[`jwt-secret-rotation.md`](./jwt-secret-rotation.md).

## Prerequisites

The `r2` binding must be present. `runBackup` returns `null` and does nothing when
`c.env.r2` is unbound, so an instance deployed without `R2_BUCKET_NAME` has **no
backups at all**. Confirm the binding exists before relying on any of this.

## Operations

All three endpoints require the caller to be authenticated **as the address in
`c.env.admin`**. They are gated on that rather than on the permission table, because a
restore can itself rewrite permissions.

**List available backups**

```
GET /api/backup/list
```

Returns dates newest-first, e.g. `["2026-07-26", "2026-07-25"]`.

**Take a backup immediately** (outside the daily cron)

```
POST /api/backup/run
```

Returns the manifest, including per-table row counts. Do this before any risky
migration or bulk operation.

**Restore**

```
POST /api/backup/restore
Content-Type: application/json

{ "date": "2026-07-26", "confirm": "2026-07-26" }
```

`confirm` must equal `date`. Echoing the date back is what distinguishes an intentional
restore from a mistyped or replayed request.

## Restore semantics — read before running

Restore is **destructive and not reversible**:

- Every table present in the backup is **emptied and reloaded**. Any row written after
  the backup was taken is discarded, including emails received since.
- A table is cleared based on whether the backup *captured* it, not on whether it had
  rows. A backup taken from an empty mailbox will still clear the email table on
  restore. (This was a real bug caught by `backup.spec.js`: the original guard keyed on
  chunk count, so restoring an empty backup silently left newer emails in place.)
- Tables **absent** from the archive are left untouched rather than cleared, so a
  partial or truncated archive cannot wipe data it never captured.
- All sessions keyed to restored users remain valid only if the `jwt_secret` is
  unchanged; the KV auth entries are not part of the D1 dump.

Take a fresh backup with `POST /api/backup/run` immediately *before* restoring, so the
current state is recoverable if the restore turns out to be the wrong call.

## Verification — the restore has been exercised

P4's acceptance criterion is that restoration has actually been performed, not merely
documented. `mail-worker/test/backup.spec.js` runs against a real D1 and R2 (miniflare)
on every CI run and asserts:

1. Email **bodies** (`content`, `text`) are present in the backup objects — not just
   metadata.
2. A row deleted after the backup is **brought back** by the restore, with its body
   intact.
3. A row written *after* the backup is **discarded** by the restore.
4. A non-email table (`account`) round-trips.
5. Email paging produces the chunk count the manifest claims, and the chunks together
   hold every row.
6. `listBackups` reports the backup just written.
7. Restoring a date with no manifest is refused.

Because these run in the `Quality-gate` job, a change that breaks restore fails CI
before it can deploy.

## Recommended drill

Automated tests prove the mechanism. They do not prove your *production* archive is
readable. Once per quarter:

1. `GET /api/backup/list` and confirm yesterday's date is present.
2. Fetch `backups/<date>/manifest.json` from R2 and sanity-check `counts` against the
   live row counts — a sudden drop means the backup is capturing less than it should.
3. Restore into a **non-production** instance (point `wrangler-test.toml` at a scratch
   D1) and confirm mail is readable in the UI.

Never rehearse a restore against production.
