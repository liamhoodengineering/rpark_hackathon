import { Router } from 'express';
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Auth routes — OWNER: Team Member #2 (Auth & Security).
 *
 * TODO:
 *  - POST /auth/register  → validate (zod), bcrypt hash, insert user, issue JWT
 *  - POST /auth/login     → verify bcrypt, issue JWT
 *  - GET  /auth/me        → return current user from req.auth (verifyJwt)
 *
 * Helpers to add: bcrypt hashing, jwt sign with env.jwtSecret/jwtExpiresIn.
 */
const router = Router();

router.post('/register', (_req, _res) => {
  throw new HttpError(
    501,
    'POST /auth/register not implemented (Team Member #2)',
  );
});

router.post('/login', (_req, _res) => {
  throw new HttpError(501, 'POST /auth/login not implemented (Team Member #2)');
});

router.get('/me', verifyJwt, (_req: AuthedRequest, _res) => {
  throw new HttpError(501, 'GET /auth/me not implemented (Team Member #2)');
});

export default router;
