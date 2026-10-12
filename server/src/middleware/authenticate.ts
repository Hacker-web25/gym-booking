import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Unauthorized } from '../errors';
import type { AuthUser } from '../types';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(Unauthorized('Missing or malformed Authorization header'));
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) return next(Unauthorized('Empty token'));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      email: string;
      role: 'member' | 'admin';
    };
    const user: AuthUser = {
      id: Number(payload.sub),
      email: payload.email,
      role: payload.role,
    };
    req.user = user;
  } catch {
    return next(Unauthorized('Invalid or expired token'));
  }
  next();
}
