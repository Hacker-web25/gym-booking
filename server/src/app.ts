import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import sessionsRoutes from './routes/sessions';
import bookingsRoutes from './routes/bookings';
import adminRoutes from './routes/admin';
import { errorHandler } from './middleware/errorHandler';

export function buildApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN?.split(',') ?? '*',
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRoutes);
  app.use('/sessions', sessionsRoutes);
  app.use(bookingsRoutes); // /me/bookings, /me/waitlist, /bookings/:id
  app.use('/admin', adminRoutes);

  // Fallthrough 404 for unknown routes
  app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
