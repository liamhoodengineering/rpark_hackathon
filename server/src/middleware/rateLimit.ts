import rateLimit from 'express-rate-limit';

/**
 * Rate limiters for write-heavy routes. Tune windows/limits as needed.
 * These cap abuse per IP/account window. The anonymous-report 5-minute
 * cooldown is enforced separately in the pins route (per-device).
 */

export const pinsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pin requests, please try again later' },
});

export const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many vote requests, please try again later' },
});

export const watchAreaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many watch-area requests, please try again later' },
});
