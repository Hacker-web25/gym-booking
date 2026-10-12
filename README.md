# Gym Slot Booking

A small full-stack app for booking hourly gym sessions. Members browse sessions, book or waitlist, cancel, and see a check-in code. Admins create sessions, see rosters, and check members in by code.

## Design note (10 lines)

1. Node + Express + TypeScript on the backend; React + Vite + TypeScript on the frontend.
2. PostgreSQL via `pg` with raw, parameterised SQL — no ORM, so every query is explainable.
3. Session times are stored as `TIMESTAMPTZ`; the gym runs on IST (Asia/Kolkata, +05:30), so admin creates slots as `date + hour` and we attach the offset explicitly.
4. Each session has 20 seats; if full, new requests go on a FIFO waitlist (`UNIQUE(session_id, user_id)` prevents double-waitlisting).
5. Booking, cancelling, waitlist-join and promotion all run inside a transaction with `SELECT ... FOR UPDATE` on the session row — this serialises concurrent requests per session and prevents overbooking.
6. A partial unique index `one_active_booking ON bookings(session_id, user_id) WHERE status='confirmed'` is the database-layer safety net: even a buggy app can't create two active bookings.
7. Auth is email + password with bcrypt (cost 10) and a JWT (HS256, 1-day expiry, `sub` = user id). React sends it as `Authorization: Bearer <token>`.
8. Roles are `member` and `admin`; `authenticate` fills `req.user` and `requireRole('admin')` guards admin routes. The server never trusts the frontend.
9. Check-in codes are 6 chars from an unambiguous alphabet (no 0/O/1/I/L), generated with `crypto.randomInt`; check-in is one atomic `UPDATE ... WHERE checked_in_at IS NULL AND status='confirmed'` plus a time-window check.
10. Validation uses zod (422 on invalid), a global error handler maps `AppError` to clean JSON, and TanStack Query (polling every 5s) keeps seat counts fresh in the UI.

## Setup

Prereqs: Node 18+, PostgreSQL 14+ running locally.

### Backend

```bash
cd server
cp .env.example .env            # fill in DATABASE_URL and a long JWT_SECRET
createdb gymbooking              # or whatever your DATABASE_URL points to
npm install
npm run migrate                  # runs server/migrations/*.sql
npm run seed                     # test users + sample sessions
npm run dev                      # http://localhost:4000
```

### Frontend

```bash
cd client
cp .env.example .env             # VITE_API_URL=http://localhost:4000
npm install
npm run dev                      # http://localhost:5173
```

Open http://localhost:5173.

## Test credentials (seeded)

| Role    | Email                | Password     |
|---------|----------------------|--------------|
| Admin   | admin@gym.local      | admin1234    |
| Member  | alice@gym.local      | member1234   |
| Member  | bob@gym.local        | member1234   |
| Member  | charlie@gym.local    | member1234   |
| Member  | dhruv@gym.local      | member1234   |

(These exist only in your local seeded database and are safe to publish.)

## API summary

| Method | Path                              | Auth    | Purpose                                 |
|--------|-----------------------------------|---------|-----------------------------------------|
| POST   | /auth/register                    | public  | Create a member account                 |
| POST   | /auth/login                       | public  | Get a JWT                               |
| GET    | /auth/me                          | user    | Current user                            |
| GET    | /sessions?date=YYYY-MM-DD         | public  | List sessions (default: today, IST)     |
| POST   | /sessions/:id/book                | user    | Book, or go on waitlist if full         |
| DELETE | /sessions/:id/waitlist            | user    | Leave the waitlist                      |
| GET    | /me/bookings                      | user    | My bookings (with check-in code)        |
| GET    | /me/waitlist                      | user    | My waitlist entries                     |
| DELETE | /bookings/:id                     | user    | Cancel; auto-promotes next waitlist     |
| POST   | /admin/sessions                   | admin   | Create a session                        |
| DELETE | /admin/sessions/:id               | admin   | Delete a session                        |
| GET    | /admin/sessions/:id/roster        | admin   | Confirmed + waitlist (no codes shown)   |
| POST   | /admin/checkin                    | admin   | Check in by code                        |

## Status codes

200 OK · 201 Created · 202 Accepted (waitlisted) · 204 No content · 400 Bad JSON · 401 Not authenticated · 403 Forbidden · 404 Not found · 409 Conflict · 422 Invalid input · 500 Internal

## Project structure

```
server/
  migrations/001_init.sql    schema + indexes
  src/
    index.ts                 start
    app.ts                   express app
    db.ts                    pg Pool
    errors.ts                AppError + helpers
    middleware/              authenticate, requireRole, validate, errorHandler
    routes/                  auth, sessions, bookings, admin
    services/booking.ts      transaction + lock + waitlist promotion
    utils/checkinCode.ts     random 6-char code
    migrate.ts, seed.ts
client/
  src/
    api.ts                   fetch helper that adds the Bearer token
    auth/AuthContext.tsx     login/logout + current user
    auth/RequireAuth.tsx     route guard
    components/              Nav, SessionCard
    pages/                   Login, Register, Sessions, MyBookings, Admin
    App.tsx                  routes
```

## What's intentionally not here

- Rate limiting on login (would add in production).
- Refresh tokens (1-day JWT keeps it simple).
- Automated tests — the race condition would be the first thing I'd write a test for.
- Email notifications for waitlist promotion.
- CSRF tokens: not needed because we use `Authorization: Bearer` headers, not cookies.
