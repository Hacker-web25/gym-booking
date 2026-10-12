import { Request, Response, NextFunction } from 'express';
import { Forbidden, Unauthorized } from '../errors';

export function requireRole(role: 'admin' | 'member') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Unauthorized());
    if (req.user.role !== role) return next(Forbidden(`Requires ${role}`));
    next();
  };
}
