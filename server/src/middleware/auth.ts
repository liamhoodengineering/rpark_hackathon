import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthPayload } from '../types/index.js';

/**
 * Express request augmented with the decoded auth payload (when present).
 */
export interface AuthedRequest extends Request {
  auth?: AuthPayload;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
}

/**
 * Requires a valid JWT. Responds 401 if missing/invalid.
 * Use on votes, deletes, and any account-only route.
 */
export function verifyJwt(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    req.auth = jwt.verify(token, env.jwtSecret) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth: attaches `req.auth` when a valid token is present,
 * but never blocks the request. Use on `POST /pins` (anonymous allowed).
 */
export function optionalJwt(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  if (token) {
    try {
      req.auth = jwt.verify(token, env.jwtSecret) as AuthPayload;
    } catch {
      // ignore invalid token — treat as anonymous
    }
  }
  next();
}
