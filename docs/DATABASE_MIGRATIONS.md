# Database migrations

The schema in `packages/database/prisma/schema.prisma` is the source of truth. Migrations in
`packages/database/prisma/migrations/` must build that exact schema from an empty database.

## What changed on 2026-10-04

The nine earlier migrations only created 11 of the 60 tables (the rest came from `prisma db push`),
so a new database could not be built from them. They were replaced by one baseline migration,
`20261004000000_baseline`, generated from the schema. Seven performance indexes that only existed in
an old migration were added to the schema with their original names, so nothing was lost.

## One-time step for an existing database (yours, a teammate's, staging)

Run from the repo root with `DATABASE_URL` pointing at that database. Back it up first if it holds
anything you care about.

```bash
cd packages/database

# 1. See what the database is missing compared to the schema. On a db-push database this is
#    normally just the performance indexes (CREATE INDEX lines). Stop and ask if you see DROP or
#    ALTER ... DROP lines: that means the database has drifted and needs a closer look.
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/catchup.sql
cat /tmp/catchup.sql

# 2. Apply exactly those changes.
npx prisma db execute --file /tmp/catchup.sql --url "$DATABASE_URL"

# 3. Record the baseline as already applied (does not run it).
npx prisma migrate resolve --applied 20261004000000_baseline

# 4. Confirm: should print "Database schema is up to date!" and "No difference detected."
npx prisma migrate status
pnpm migrate:check
```

If the database already has a `_prisma_migrations` table with the nine old migrations recorded,
step 3 still works; those old rows are simply ignored.

## From now on

- Change the schema, then run `pnpm --filter @cogna/database migrate -- --name what_changed` to
  create a migration. Commit both.
- Don't use `db push` on any shared or deployed database.
- Deploys run `prisma migrate deploy` automatically before the API starts (see `Dockerfile`).
- CI builds its database from the migrations and fails if they don't match the schema
  (`pnpm --filter @cogna/database migrate:check`).
