#!/bin/sh
# Logical Postgres backup: compressed custom-format dump, then prune dumps older than BACKUP_RETENTION_DAYS.
# Uses the standard PG* env vars (PGHOST/PGUSER/PGPASSWORD/PGDATABASE). Run daily; see docs/BACKUP_RESTORE.md.
set -eu
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$DIR"
OUT="$DIR/cogna-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --file="$OUT.partial"
mv "$OUT.partial" "$OUT"   # a crashed dump never masquerades as a good backup
find "$DIR" -name 'cogna-*.dump' -mtime "+$KEEP" -delete
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
