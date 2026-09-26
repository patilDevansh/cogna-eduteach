# Database backup and restore

The database holds student PII and learning records. Losing it is not acceptable, so backups are a deploy requirement, not a nice-to-have.

## Managed Postgres (RDS, Cloud SQL, Neon, Supabase…) — preferred
Turn on the provider's automated daily backups **and** point-in-time recovery, retention ≥ 14 days, and copy backups to a second region/account. Skip the compose `backup` service below; it is for self-hosted Postgres.

## Self-hosted Postgres
`scripts/backup-postgres.sh` takes a compressed custom-format `pg_dump` and prunes dumps older than `BACKUP_RETENTION_DAYS` (default 14). `docker-compose.prod.yml` runs it every 24h into `./backups`.

- **Ship the dumps off the host.** A backup on the same disk as the database is not a backup. Sync `./backups` to object storage (`aws s3 sync ./backups s3://<bucket>/cogna-db/`) from cron or a sidecar, with bucket versioning on.
- Dumps are logical: recovery point is up to 24h. Tighten by running the script more often, or use WAL archiving (pgBackRest/wal-g) if that's not enough.

## Restore
```sh
# 1. Restore into a NEW database first — never straight over production.
createdb cogna_restore
pg_restore --no-owner --exit-on-error -d cogna_restore ./backups/cogna-<timestamp>.dump
# 2. Sanity-check row counts against what you expect.
psql cogna_restore -c 'select count(*) from "PersonalizedVideoAssignment"'
# 3. Cut over: point DATABASE_URL at cogna_restore (or rename databases during a maintenance window).
```

## Restore drill
Run the restore above **quarterly** on a scratch database and record the date. An untested backup is a hope, not a backup. The script and this procedure were exercised end to end against the local dev database (backup → restore into a scratch DB → row counts matched → scratch DB dropped).

## Not covered
- Generated media (lesson videos, TTS cache): with S3 storage, enable bucket versioning; TTS cache and render jobs are regenerable.
- Secrets (`.env.production`): keep in a secrets manager, not in backups.
