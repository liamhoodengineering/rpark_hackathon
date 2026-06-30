import { Router, type NextFunction, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { supabase } from '../lib/supabase.js';
import { env } from '../config/env.js';
import type { AuthPayload, PublicUser, User } from '../types/index.js';

/**
 * Auth routes — OWNER: Team Member #2 (Auth & Security).
 *
 *  - POST /auth/register  → validate (zod), bcrypt hash, insert user, issue JWT
 *  - POST /auth/login     → verify bcrypt, issue JWT
 *  - GET  /auth/me        → return current user from req.auth (verifyJwt)
 */
const router = Router();

/** Internal DB row shape — includes the password hash (never returned). */
interface UserRow extends User {
  password_hash: string;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  display_name: z.string().trim().min(1).max(60),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** Strip the password hash and add the computed credibility score. */
function toPublicUser(row: UserRow): PublicUser {
  const { password_hash: _password_hash, ...user } = row;
  return {
    ...user,
    credibility_score: user.upvotes_received - user.downvotes_received,
  };
}

router.post(
  '/register',
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, display_name } = registerSchema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();

      const { data: existing, error: lookupError } = await supabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (lookupError) throw new HttpError(500, 'Failed to check email');
      if (existing) throw new HttpError(409, 'Email already registered');

      const password_hash = await bcrypt.hash(password, 10);

      const { data: created, error: insertError } = await supabase
        .from('users')
        .insert({ email: normalizedEmail, password_hash, display_name })
        .select('*')
        .single<UserRow>();
      if (insertError || !created) {
        throw new HttpError(500, 'Failed to create account');
      }

      const token = signToken({ sub: created.id, email: created.email });
      res.status(201).json({ token, user: toPublicUser(created) });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/login',
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle<UserRow>();
      if (error) throw new HttpError(500, 'Failed to look up account');
      if (!user) throw new HttpError(401, 'Invalid email or password');

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) throw new HttpError(401, 'Invalid email or password');

      const token = signToken({ sub: user.id, email: user.email });
      res.json({ token, user: toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/me',
  verifyJwt,
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', req.auth!.sub)
        .maybeSingle<UserRow>();
      if (error) throw new HttpError(500, 'Failed to load account');
      if (!user) throw new HttpError(404, 'User not found');

      res.json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/me/location',
  verifyJwt,
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { lat, lng } = locationSchema.parse(req.body);

      const { data: user, error } = await supabase
        .from('users')
        .update({ lat, lng })
        .eq('id', req.auth!.sub)
        .select('*')
        .maybeSingle<UserRow>();
      if (error) throw new HttpError(500, 'Failed to update location');
      if (!user) throw new HttpError(404, 'User not found');

      res.json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
