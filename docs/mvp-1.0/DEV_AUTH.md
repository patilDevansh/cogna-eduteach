# MVP 1.0 — Development authentication

## Default (no Clerk keys)

When `CLERK_SECRET_KEY` is **unset**, local development uses:

| Actor | Method |
|---|---|
| Parent | `POST /parents/dev/signup` → store `parentId` → `X-Parent-Id` header on API calls |
| Student | Access code login (`POST /auth/student/login`) — seeded `demo1234` after `pnpm db:seed` |

Web app: parent signup form at `/parent/login` (dev stub).

## Production path (Clerk optional)

When `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are set:

1. API verifies `Authorization: Bearer <clerk_jwt>` via `@clerk/backend`
2. Parent is provisioned/linked by Clerk `sub` → `users.clerkId`
3. `GET /parents/me/auth-mode` returns `{ clerkEnabled: true }`
4. Dev signup remains available when Clerk is disabled only

Student login remains **access-code only** (S011 — email/password accounts are post-MVP).

## Verify

```bash
curl http://localhost:3001/parents/me/auth-mode
```

With Clerk keys configured, parent routes accept either `X-Parent-Id` (dev) or Bearer token (Clerk).
