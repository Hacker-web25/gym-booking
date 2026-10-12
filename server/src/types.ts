// Augment Express' Request so `req.user` is a known shape wherever auth ran.
import type { Request } from 'express';

export interface AuthUser {
  id: number;
  email: string;
  role: 'member' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type { Request };
