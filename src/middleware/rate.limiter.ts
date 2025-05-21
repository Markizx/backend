import rateLimit from 'express-rate-limit';
import { ApiResponse } from '@utils/response';

export const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // Максимум 100 запросов
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Слишком много запросов, попробуйте снова через 15 минут',
  skipFailedRequests: true,
  keyGenerator: (req) => req.ip || 'unknown',
  handler: (req, res) => {
    ApiResponse.sendError(
      res,
      'Слишком много запросов, попробуйте снова через 15 минут',
      null,
      429
    );
  },
  validate: {
    xForwardedForHeader: false,
    trustProxy: false,
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 50, // Максимум 50 запросов
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Слишком много запросов, попробуйте снова через 15 минут',
  skipFailedRequests: true,
  keyGenerator: (req) => req.ip || 'unknown',
  handler: (req, res) => {
    ApiResponse.sendError(
      res,
      'Слишком много запросов, попробуйте снова через 15 минут',
      null,
      429
    );
  },
  validate: {
    xForwardedForHeader: false,
    trustProxy: false,
  },
});