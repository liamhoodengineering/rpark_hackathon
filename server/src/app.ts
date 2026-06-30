import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import pinsRouter from './routes/pins.js';
import votesRouter from './routes/votes.js';
import watchAreasRouter from './routes/watchAreas.js';

/**
 * Builds and configures the Express application.
 * Kept separate from `index.ts` so it can be imported in tests.
 */
export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.clientOrigin.length > 0 ? env.clientOrigin : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'pinpoint-api',
      timestamp: new Date().toISOString(),
    });
  });

  // Feature routers
  app.use('/auth', authRouter);
  app.use('/pins', pinsRouter);
  // Votes live under /pins/:id/vote — mounted on /pins as well
  app.use('/pins', votesRouter);
  app.use('/watch-areas', watchAreasRouter);

  // 404 + error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
