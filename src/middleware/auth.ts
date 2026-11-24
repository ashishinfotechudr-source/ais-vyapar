import { NextFunction, Request, Response } from 'express';
import { verifySessionToken } from '../lib/authCrypto.ts';
import { getUserByUid } from '../db/users.ts';

export interface AuthRequest extends Request {
  dbUser?: {
    id: number;
    uid: string;
    username: string | null;
    email: string;
    name: string | null;
    role: string;
    active: boolean;
    companyIds: number[] | null;
    perms: {
      menus: Record<string, 'none' | 'view' | 'edit'>;
      options: { delete: boolean; export: boolean };
    } | null;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token' });
  }

  try {
    const claims = verifySessionToken(token);
    const dbUser = await getUserByUid(claims.uid);

    if (!dbUser) {
      return res.status(401).json({ error: 'Unauthorized: Account not found' });
    }
    if (!dbUser.active) {
      return res.status(403).json({ error: 'Account is disabled. Contact your administrator.' });
    }

    req.dbUser = dbUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser || req.dbUser.role !== 'Admin') {
    return res.status(403).json({ error: 'Administrator privileges required.' });
  }
  next();
};
