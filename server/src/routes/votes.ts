import { Router } from 'express';
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js';
import { voteLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Vote routes — OWNER: Team Member #4 (Votes API).
 * Mounted on `/pins`, so paths below resolve to /pins/:id/vote and /pins/:id/votes.
 *
 * TODO:
 *  - GET  /pins/:id/votes  → tally { up, down, total } (public)
 *  - POST /pins/:id/vote   → account-only (verifyJwt):
 *        server-side proximity gate (ST_DWithin caller vs pin.radius_m)
 *        one up/down per user (unique(pin_id,user_id), upsert on change)
 *        run removal-by-ratio logic (>=5 votes && down > up → status='removed')
 *        sync pins.upvotes/downvotes + reporter credibility counters
 */
const router = Router();

router.get('/:id/votes', (_req, _res) => {
  throw new HttpError(
    501,
    'GET /pins/:id/votes not implemented (Team Member #4)',
  );
});

router.post(
  '/:id/vote',
  voteLimiter,
  verifyJwt,
  (_req: AuthedRequest, _res) => {
    throw new HttpError(
      501,
      'POST /pins/:id/vote not implemented (Team Member #4)',
    );
  },
);

export default router;
