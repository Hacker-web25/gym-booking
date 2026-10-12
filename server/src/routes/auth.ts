import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { validateBody } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { Conflict, Unauthorized } from '../errors';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
});

function signToken(user: { id: number; email: string; role: 'member' | 'admin' }): string {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1d' },
  );
}

router.post('/register', validateBody(registerSchema), async (req, res) => {
  const { email, password, name } = req.body as z.infer<typeof registerSchema>;
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'member')
       RETURNING id, email, name, role`,
      [email.toLowerCase(), hash, name],
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      throw Conflict('Email already registered');
    }
    throw err;
  }
});

router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const found = await pool.query(
    `SELECT id, email, name, role, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (found.rowCount === 0) throw Unauthorized('Invalid email or password');
  const u = found.rows[0];
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) throw Unauthorized('Invalid email or password');
  const token = signToken(u);
  res.json({
    token,
    user: { id: u.id, email: u.email, name: u.name, role: u.role },
  });
});

router.get('/me', authenticate, async (req, res) => {
  const u = req.user!;
  const found = await pool.query(
    'SELECT id, email, name, role FROM users WHERE id = $1',
    [u.id],
  );
  if (found.rowCount === 0) throw Unauthorized('User no longer exists');
  res.json(found.rows[0]);
});

export default router;
