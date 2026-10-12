import { Router } from 'express';
import { pool } from '../db';
import { authenticate } from '../middleware/authenticate';
import { cancelBooking } from '../services/booking';
import { NotFound } from '../errors';

const router = Router();

// GET /me/bookings — bookings for the signed-in user (member sees their check-in code).
router.get('/me/bookings', authenticate, async (req, res) => {
  const userId = req.user!.id;
  const rows = await pool.query(
    `SELECT b.id, b.session_id, b.status, b.checkin_code, b.checked_in_at, b.created_at,
            s.starts_at, s.ends_at
     FROM bookings b
     JOIN sessions s ON s.id = b.session_id
     WHERE b.user_id = $1
     ORDER BY s.starts_at DESC`,
    [userId],
  );
  res.json(rows.rows);
});

// GET /me/waitlist — sessions this user is on the waitlist for.
router.get('/me/waitlist', authenticate, async (req, res) => {
  const userId = req.user!.id;
  const rows = await pool.query(
    `SELECT w.id, w.session_id, w.created_at,
            s.starts_at, s.ends_at,
            (SELECT COUNT(*)::int FROM waitlist w2
             WHERE w2.session_id = w.session_id AND w2.id <= w.id) AS position
     FROM waitlist w
     JOIN sessions s ON s.id = w.session_id
     WHERE w.user_id = $1
     ORDER BY s.starts_at ASC`,
    [userId],
  );
  res.json(rows.rows);
});

// DELETE /bookings/:id — cancel one of my bookings.
router.delete('/bookings/:id', authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw NotFound('Booking not found');
  const result = await cancelBooking(req.user!.id, id);
  res.json(result);
});

export default router;
