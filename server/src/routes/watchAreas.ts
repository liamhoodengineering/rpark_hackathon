import { Router } from 'express';
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js';
import { watchAreaLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Watch-area routes — OWNER: Team Member #3 (Pins API).
 * All routes require a valid JWT (account-only).
 *
 * TODO:
 *  - GET    /watch-areas      → list the caller's watch areas
 *  - POST   /watch-areas      → create (lat, lng, radius, min_severity, email_enabled)
 *  - DELETE /watch-areas/:id  → owner-only delete
 */
const router = Router();

router.use(verifyJwt);

router.get('/', (_req: AuthedRequest, _res) => {
  throw new HttpError(501, 'GET /watch-areas not implemented (Team Member #3)');
});

router.post('/', watchAreaLimiter, (_req: AuthedRequest, _res) => {
  throw new HttpError(
    501,
    'POST /watch-areas not implemented (Team Member #3)',
  );
});

router.delete('/:id', (_req: AuthedRequest, _res) => {
  throw new HttpError(
    501,
    'DELETE /watch-areas/:id not implemented (Team Member #3)',
  );
});

export default router;
