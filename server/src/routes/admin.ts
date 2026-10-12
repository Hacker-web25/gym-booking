import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validateBody } from '../middleware/validate';
import { BadRequest, Conflict, NotFound } from '../errors';
import { checkInByCode } from '../services/booking';

const router = Router();

// All admin routes require login + admin role.
router.use(authenticate, requireRole('admin'));

// POST /admin/sessions — create a session.
// Body: { date: "YYYY-MM-DD", hour: 6..22, capacity?: 20 }
// We always build the timestamp as that date + that hour in IST (+05:30).
const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  hour: z.number().int().min(0).max(23),
  capacity: z.number().int().positive().max(500).optional(),
});

router.post('/sessions', validateBody(createSchema), async (req, res) => {
  const { date, hour, capacity } = req.body as z.infer<typeof createSchema>;
  // Build an ISO string with an explicit +05:30 offset so Postgres stores the right instant.
  const hh = String(hour).padStart(2, '0');
  const startIso = `${date}T${hh}:00:00+05:30`;
  try {
    const result = await pool.query(
      `INSERT INTO sessions (starts_at, ends_at, capacity)
       VALUES ($1::timestamptz, $1::timestamptz + INTERVAL '1 hour', $2)
       RETURNING id, starts_at, ends_at, capacity`,
      [startIso, capacity ?? 20],
    );
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const pgErr = err as { code: string; constraint?: string };
      if (pgErr.code === '23505') throw Conflict('A session already exists at that time');
      if (pgErr.code === '23514') throw BadRequest('Invalid session time');
    }
    throw err;
  }
});

// DELETE /admin/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw NotFound('Session not found');
  const del = await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
  if (del.rowCount === 0) throw NotFound('Session not found');
  res.status(204).end();
});

// GET /admin/sessions/:id/roster — all confirmed bookings and waitlist for a session.
// The admin DOES NOT see the check-in codes (they belong to each member).
router.get('/sessions/:id/roster', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw NotFound('Session not found');

  const sess = await pool.query(
    `SELECT id, starts_at, ends_at, capacity FROM sessions WHERE id = $1`,
    [id],
  );
  if (sess.rowCount === 0) throw NotFound('Session not found');

  const confirmed = await pool.query(
    `SELECT b.id, b.user_id, u.name, u.email, b.checked_in_at, b.created_at
     FROM bookings b JOIN users u ON u.id = b.user_id
     WHERE b.session_id = $1 AND b.status = 'confirmed'
     ORDER BY b.created_at ASC`,
    [id],
  );
  const waitlist = await pool.query(
    `SELECT w.id, w.user_id, u.name, u.email, w.created_at,
            ROW_NUMBER() OVER (ORDER BY w.id) AS position
     FROM waitlist w JOIN users u ON u.id = w.user_id
     WHERE w.session_id = $1
     ORDER BY w.id ASC`,
    [id],
  );

  res.json({
    session: sess.rows[0],
    confirmed: confirmed.rows,
    waitlist: waitlist.rows,
  });
});

// POST /admin/checkin — check someone in by code.
const checkinSchema = z.object({ code: z.string().min(1).max(40) });
router.post('/checkin', validateBody(checkinSchema), async (req, res) => {
  const { code } = req.body as z.infer<typeof checkinSchema>;
  const result = await checkInByCode(code.trim().toUpperCase());
  res.json(result);
});

export default router;
