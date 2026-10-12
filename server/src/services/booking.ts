import { pool } from '../db';
import { AppError, Conflict, NotFound } from '../errors';
import { generateCheckinCode } from '../utils/checkinCode';

const CAPACITY_DEFAULT = 20;
const MAX_CODE_RETRIES = 5;

// Shape returned to the client.
export interface BookingRow {
  id: number;
  session_id: number;
  user_id: number;
  status: 'confirmed' | 'cancelled';
  checkin_code: string | null;
  checked_in_at: string | null;
  created_at: string;
}

export interface BookingResult {
  outcome: 'confirmed' | 'waitlisted';
  booking?: BookingRow;
  waitlistPosition?: number;
}

/**
 * Books a session for a user, or puts them on the waitlist if full.
 * Takes a row-level lock on the session to prevent overbooking under concurrency.
 */
export async function bookSession(userId: number, sessionId: number): Promise<BookingResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the session row. Anyone else trying to book this session now waits.
    const sess = await client.query(
      'SELECT id, capacity FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    if (sess.rowCount === 0) {
      await client.query('ROLLBACK');
      throw NotFound('Session not found');
    }
    const capacity: number = sess.rows[0].capacity ?? CAPACITY_DEFAULT;

    // 2. Does this user already have an active booking?
    const existing = await client.query(
      `SELECT id FROM bookings
       WHERE session_id = $1 AND user_id = $2 AND status = 'confirmed'`,
      [sessionId, userId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      throw Conflict('You already have a booking for this session');
    }

    // 3. Count current confirmed bookings.
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM bookings
       WHERE session_id = $1 AND status = 'confirmed'`,
      [sessionId],
    );
    const taken: number = countRes.rows[0].n;

    if (taken >= capacity) {
      // Full — add to waitlist (idempotent-ish: UNIQUE will catch duplicates).
      const existingWait = await client.query(
        'SELECT id FROM waitlist WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId],
      );
      if ((existingWait.rowCount ?? 0) > 0) {
        await client.query('ROLLBACK');
        throw Conflict('You are already on the waitlist for this session');
      }
      await client.query(
        'INSERT INTO waitlist (session_id, user_id) VALUES ($1, $2)',
        [sessionId, userId],
      );
      // Position = how many entries have an id <= mine. We can recompute cheaply.
      const posRes = await client.query(
        'SELECT COUNT(*)::int AS n FROM waitlist WHERE session_id = $1',
        [sessionId],
      );
      await client.query('COMMIT');
      return { outcome: 'waitlisted', waitlistPosition: posRes.rows[0].n };
    }

    // 4. There is room. Insert with a unique check-in code (retry on collision).
    let booking: BookingRow | null = null;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const code = generateCheckinCode();
      const inserted = await client.query(
        `INSERT INTO bookings (session_id, user_id, status, checkin_code)
         VALUES ($1, $2, 'confirmed', $3)
         ON CONFLICT (checkin_code) DO NOTHING
         RETURNING *`,
        [sessionId, userId, code],
      );
      if ((inserted.rowCount ?? 0) > 0) {
        booking = inserted.rows[0];
        break;
      }
    }
    if (!booking) {
      await client.query('ROLLBACK');
      throw new AppError(500, 'CODE_COLLISION', 'Could not generate a check-in code');
    }

    await client.query('COMMIT');
    return { outcome: 'confirmed', booking };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* swallow */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancels a booking. If freeing a seat, promotes the first waitlisted user to confirmed.
 */
export async function cancelBooking(userId: number, bookingId: number): Promise<{
  cancelled: true;
  promoted?: { userId: number; bookingId: number };
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find the booking and its session, lock the booking row.
    const bRes = await client.query(
      `SELECT id, session_id, user_id, status
       FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );
    if (bRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw NotFound('Booking not found');
    }
    const booking = bRes.rows[0];
    if (booking.user_id !== userId) {
      await client.query('ROLLBACK');
      throw NotFound('Booking not found'); // Hide existence from other users.
    }
    if (booking.status !== 'confirmed') {
      await client.query('ROLLBACK');
      throw Conflict('Booking is not active');
    }

    // Lock the session so a concurrent booking doesn't race the promotion.
    await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [booking.session_id]);

    // Cancel it.
    await client.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1`,
      [bookingId],
    );

    // Promote the first waitlisted user, if any.
    const nextWait = await client.query(
      `SELECT id, user_id FROM waitlist
       WHERE session_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [booking.session_id],
    );
    let promoted: { userId: number; bookingId: number } | undefined;
    if ((nextWait.rowCount ?? 0) > 0) {
      const w = nextWait.rows[0];
      // Insert a new confirmed booking for the promoted user.
      let newBooking: BookingRow | null = null;
      for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
        const code = generateCheckinCode();
        const ins = await client.query(
          `INSERT INTO bookings (session_id, user_id, status, checkin_code)
           VALUES ($1, $2, 'confirmed', $3)
           ON CONFLICT (checkin_code) DO NOTHING
           RETURNING *`,
          [booking.session_id, w.user_id, code],
        );
        if ((ins.rowCount ?? 0) > 0) {
          newBooking = ins.rows[0];
          break;
        }
      }
      if (newBooking) {
        await client.query('DELETE FROM waitlist WHERE id = $1', [w.id]);
        promoted = { userId: w.user_id, bookingId: newBooking.id };
      }
    }

    await client.query('COMMIT');
    return { cancelled: true, promoted };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* swallow */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Leave the waitlist (user asks to be removed before a seat opens).
 */
export async function leaveWaitlist(userId: number, sessionId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);
    const del = await client.query(
      'DELETE FROM waitlist WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId],
    );
    if (del.rowCount === 0) {
      await client.query('ROLLBACK');
      throw NotFound('You are not on the waitlist for this session');
    }
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* swallow */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check-in: atomic update that only succeeds if the booking is confirmed,
 * not yet checked in, and the session is happening right now.
 */
export async function checkInByCode(code: string): Promise<{
  booking: BookingRow;
  user: { id: number; name: string; email: string };
  session: { id: number; starts_at: string; ends_at: string };
}> {
  const result = await pool.query(
    `UPDATE bookings b
     SET checked_in_at = now()
     FROM sessions s, users u
     WHERE b.session_id = s.id
       AND b.user_id = u.id
       AND b.checkin_code = $1
       AND b.status = 'confirmed'
       AND b.checked_in_at IS NULL
       AND now() >= s.starts_at - INTERVAL '15 minutes'
       AND now() <  s.ends_at
     RETURNING b.*,
               u.id AS u_id, u.name AS u_name, u.email AS u_email,
               s.id AS s_id, s.starts_at AS s_starts_at, s.ends_at AS s_ends_at`,
    [code],
  );
  if (result.rowCount === 0) {
    // Figure out why for a better message.
    const row = await pool.query(
      `SELECT b.status, b.checked_in_at, s.starts_at, s.ends_at
       FROM bookings b JOIN sessions s ON s.id = b.session_id
       WHERE b.checkin_code = $1`,
      [code],
    );
    if (row.rowCount === 0) throw NotFound('Invalid check-in code');
    const r = row.rows[0];
    if (r.status !== 'confirmed') throw Conflict('Booking was cancelled');
    if (r.checked_in_at) throw Conflict('Already checked in');
    throw Conflict('Not within the check-in window');
  }
  const r = result.rows[0];
  return {
    booking: {
      id: r.id,
      session_id: r.session_id,
      user_id: r.user_id,
      status: r.status,
      checkin_code: r.checkin_code,
      checked_in_at: r.checked_in_at,
      created_at: r.created_at,
    },
    user: { id: r.u_id, name: r.u_name, email: r.u_email },
    session: { id: r.s_id, starts_at: r.s_starts_at, ends_at: r.s_ends_at },
  };
}
