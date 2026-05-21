import { Request, Response, NextFunction } from 'express';
import { env } from '../utils/env';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(`Error: ${err.message}`, { stack: err.stack });

  res.status(500).json({
    success: false,
    error: env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    stack: env.NODE_ENV === 'production' ? undefined : err.stack
  });
}
