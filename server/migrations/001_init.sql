-- Users: members and admins. Password is stored as a bcrypt hash.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('member','admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions: an hour-long slot on a date with 20 seats.
-- starts_at and ends_at are TIMESTAMPTZ (UTC underneath, displayed in IST).
CREATE TABLE IF NOT EXISTS sessions (
  id         SERIAL PRIMARY KEY,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 20 CHECK (capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_hour_slot CHECK (ends_at = starts_at + INTERVAL '1 hour'),
  CONSTRAINT starts_on_hour_ist CHECK (
    date_trunc('hour', starts_at AT TIME ZONE 'Asia/Kolkata') = (starts_at AT TIME ZONE 'Asia/Kolkata')
  ),
  CONSTRAINT no_overlap UNIQUE (starts_at)
);

-- Bookings: confirmed or cancelled.
CREATE TABLE IF NOT EXISTS bookings (
  id             SERIAL PRIMARY KEY,
  session_id     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'confirmed'
                 CHECK (status IN ('confirmed','cancelled')),
  checkin_code   TEXT UNIQUE,
  checked_in_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at   TIMESTAMPTZ
);

-- A user can have at most ONE active booking per session.
-- A partial index lets a user cancel and re-book the same session.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking
  ON bookings (session_id, user_id)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_bookings_session_status
  ON bookings (session_id, status);

CREATE INDEX IF NOT EXISTS idx_bookings_user
  ON bookings (user_id);

-- Waitlist: ordered by id (FIFO).
CREATE TABLE IF NOT EXISTS waitlist (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_session
  ON waitlist (session_id, id);
