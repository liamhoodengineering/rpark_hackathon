import { Router } from 'express';
import { z } from 'zod';
import {
  optionalJwt,
  verifyJwt,
  type AuthedRequest,
} from '../middleware/auth.js';
import { pinsLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';
import { PinService } from '../service/PinService.js';
import type { PinStatus } from '../types/index.js';

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

const ANON_PIN_TTL_MS = 60 * 60 * 1000;
const ANON_COOLDOWN_MS = 5 * 60 * 1000;
const anonymousPinCooldowns = new Map<string, number>();

const listPinsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(5000),
});

const createPinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  severity: z.enum(['Low', 'Medium', 'High']),
  radius_m: z.number().int().positive().max(5000),
});

const updatePinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  severity: z.enum(['Low', 'Medium', 'High']),
  radius_m: z.number().int().positive().max(5000),
  status: z.enum(['active', 'removed']).optional(),
});

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getAnonymousReporterKey(req: AuthedRequest): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function enforceAnonymousCooldown(req: AuthedRequest): void {
  const reporterKey = getAnonymousReporterKey(req);
  const now = Date.now();
  const lastCreatedAt = anonymousPinCooldowns.get(reporterKey);

  if (lastCreatedAt && now - lastCreatedAt < ANON_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil(
      (ANON_COOLDOWN_MS - (now - lastCreatedAt)) / 1000,
    );
    throw new HttpError(
      429,
      `Anonymous pin cooldown active. Try again in ${retryAfterSeconds}s.`,
    );
  }

  anonymousPinCooldowns.set(reporterKey, now);
}

router.get('/', async (req, res, next) => {
  try {
    const query = listPinsSchema.parse(req.query);
    const pins = await PinService.listNearby(query);
    res.json(pins);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const pin = await PinService.getById(req.params.id);
    if (!pin) {
      throw new HttpError(404, 'Pin not found');
    }
    res.json(pin);
  } catch (error) {
    next(error);
  }
});

router.post('/', pinsLimiter, optionalJwt, async (req: AuthedRequest, res, next) => {
  try {
    const body = createPinSchema.parse(req.body);
    const isAnonymous = !req.auth;

    if (isAnonymous) {
      enforceAnonymousCooldown(req);
    }

    const pin = await PinService.create({
      reporter_id: req.auth?.sub ?? null,
      lat: body.lat,
      lng: body.lng,
      name: normalizeOptionalText(body.name),
      description: normalizeOptionalText(body.description),
      severity: body.severity,
      radius_m: body.radius_m,
      expires_at: isAnonymous
        ? new Date(Date.now() + ANON_PIN_TTL_MS).toISOString()
        : null,
    });

    res.status(201).json(pin);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', verifyJwt, async (req: AuthedRequest, res, next) => {
  try {
    const body = updatePinSchema.parse(req.body);
    const existingPin = await PinService.getById(req.params.id);

    if (!existingPin) {
      throw new HttpError(404, 'Pin not found');
    }
    if (!existingPin.reporter_id || existingPin.reporter_id !== req.auth?.sub) {
      throw new HttpError(403, 'You can only update your own account pins');
    }

    const pin = await PinService.update(req.params.id, {
      lat: body.lat,
      lng: body.lng,
      name: normalizeOptionalText(body.name),
      description: normalizeOptionalText(body.description),
      severity: body.severity,
      radius_m: body.radius_m,
      status: (body.status ?? existingPin.status) as PinStatus,
    });

    if (!pin) {
      throw new HttpError(404, 'Pin not found');
    }

    res.json(pin);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', verifyJwt, async (req: AuthedRequest, res, next) => {
  try {
    const existingPin = await PinService.getById(req.params.id);

    if (!existingPin) {
      throw new HttpError(404, 'Pin not found');
    }
    if (!existingPin.reporter_id || existingPin.reporter_id !== req.auth?.sub) {
      throw new HttpError(403, 'You can only delete your own account pins');
    }

    const deleted = await PinService.delete(req.params.id);
    if (!deleted) {
      throw new HttpError(404, 'Pin not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
