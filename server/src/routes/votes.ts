import { Router } from 'express';
import { z } from 'zod';
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js';
import { voteLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';
import { PinService } from '../service/PinService.js';
import { VoteService } from '../service/VoteService.js';

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

const pinIdSchema = z.string().uuid();
const voteBodySchema = z.object({
  vote_type: z.enum(['up', 'down']),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
});

interface Coordinates {
  lat: number;
  lng: number;
}

function haversineMeters(from: Coordinates, to: Coordinates): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const arc =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function isPinExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= Date.now();
}

router.get('/:id/votes', async (req, res, next) => {
  try {
    const pinId = pinIdSchema.parse(req.params.id);
    const pin = await PinService.getById(pinId);

    if (!pin) {
      throw new HttpError(404, 'Pin not found');
    }

    const tally = await VoteService.getTally(pinId);
    res.json(tally);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/vote',
  voteLimiter,
  verifyJwt,
  async (req: AuthedRequest, res, next) => {
    try {
      const pinId = pinIdSchema.parse(req.params.id);
      const { vote_type: voteType, lat, lng } = voteBodySchema.parse(req.body);
      const userId = req.auth?.sub;

      if (!userId) {
        throw new HttpError(401, 'Authentication required');
      }

      const pin = await PinService.getById(pinId);
      if (!pin) {
        throw new HttpError(404, 'Pin not found');
      }
      if (pin.status === 'removed' || isPinExpired(pin.expires_at)) {
        throw new HttpError(409, 'Pin is no longer active');
      }

      const callerCoordinates = { lat, lng };
      const pinCoordinates = { lat: pin.lat, lng: pin.lng };
      const distanceMeters = haversineMeters(callerCoordinates, pinCoordinates);

      if (distanceMeters > pin.radius_m) {
        throw new HttpError(403, 'You must be within the pin radius to vote');
      }

      const existingVote = await VoteService.getUserVote(pinId, userId);
      let message = 'Vote recorded';

      if (!existingVote) {
        await VoteService.createVote({
          pinId,
          userId,
          voteType,
        });
      } else if (existingVote.vote_type !== voteType) {
        await VoteService.updateVote(existingVote.id, voteType);
        message = 'Vote updated';
      } else {
        message = 'Vote already recorded';
      }

      const tally = await VoteService.getTally(pinId);
      const status = await VoteService.syncPinVoteState(pinId, tally);

      if (pin.reporter_id) {
        await VoteService.syncReporterCredibility(pin.reporter_id);
      }

      res.json({ message, tally, status });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
