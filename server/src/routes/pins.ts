import { Router } from 'express';
import {
  optionalJwt,
  verifyJwt,
  type AuthedRequest,
} from '../middleware/auth.js';
import { pinsLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Pins routes — OWNER: Team Member #3 (Pins API).
 *
 * TODO:
 *  - GET    /pins?lat=&lng=&radius=  → active, non-expired pins via ST_DWithin (public)
 *  - POST   /pins                    → create pin (optionalJwt):
 *        anonymous → reporter_id=NULL, expires_at=now()+1h, 5-min per-device cooldown
 *        account   → persistent
 *  - DELETE /pins/:id                → owner-only delete (verifyJwt)
 *  - POST   /pins/:id/photo          → upload to Supabase Storage, EXIF-stripped (Team Member #2)
 *
 * Note: vote routes (/pins/:id/vote, /pins/:id/votes) live in routes/votes.ts (Team Member #4).
 */
const router = Router();

router.get('/', (_req, _res) => {
  throw new HttpError(501, 'GET /pins not implemented (Team Member #3)');
});

router.post('/', pinsLimiter, optionalJwt, (_req: AuthedRequest, _res) => {
  throw new HttpError(501, 'POST /pins not implemented (Team Member #3)');
});

router.delete('/:id', verifyJwt, (_req: AuthedRequest, _res) => {
  throw new HttpError(501, 'DELETE /pins/:id not implemented (Team Member #3)');
});

export default router;
