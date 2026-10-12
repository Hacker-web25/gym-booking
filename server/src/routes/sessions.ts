import { Router } from 'express';
import { pool } from '../db';
import { authenticate } from '../middleware/authenticate';
import { bookSession, leaveWaitlist } from '../services/booking';
import { NotFound } from '../errors';

const router = Router();

// Public list of sessions for a given date (IST). Default: today.
router.get('/', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : null;
  const params: unknown[] = [];
  let where = '';
  if (date) {
    params.push(date);
    where = `WHERE (s.starts_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date`;
  } else {
    where = `WHERE (s.starts_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`;
  }

  const rows = await pool.query(
    `SELECT
       s.id, s.starts_at, s.ends_at, s.capacity,
       COALESCE((
         SELECT COUNT(*)::int FROM bookings b
         WHERE b.session_id = s.id AND b.status = 'confirmed'
       ), 0) AS booked,
       COALESCE((
         SELECT COUNT(*)::int FROM waitlist w WHERE w.session_id = s.id
       ), 0) AS waitlist_count
     FROM sessions s
     ${where}
     ORDER BY s.starts_at ASC`,
    params,
  );

  res.json(
    rows.rows.map((r) => ({
      id: r.id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      capacity: r.capacity,
      booked: r.booked,
      seats_left: Math.max(0, r.capacity - r.booked),
      waitlist_count: r.waitlist_count,
    })),
  );
});

// Book a session.
router.post('/:id/book', authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw NotFound('Session not found');
  const result = await bookSession(req.user!.id, id);
  const status = result.outcome === 'confirmed' ? 201 : 202;
  // Hide code details here; member will see them under /me/bookings
  const safe =
    result.outcome === 'confirmed'
      ? {
          outcome: 'confirmed' as const,
          booking: {
            id: result.booking!.id,
            session_id: result.booking!.session_id,
            status: result.booking!.status,
            checkin_code: result.booking!.checkin_code,
            created_at: result.booking!.created_at,
          },
        }
      : {
          outcome: 'waitlisted' as const,
          waitlist_position: result.waitlistPosition,
        };
  res.status(status).json(safe);
});

// Leave the waitlist for a session.
router.delete('/:id/waitlist', authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw NotFound('Session not found');
  await leaveWaitlist(req.user!.id, id);
  res.status(204).end();
});

export default router;
