import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import logger from '@utils/logger';
import { ApiResponse } from '@utils/response';

export const errorMiddleware = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Ошибка сервера:', { error: err.message, stack: err.stack });
  Sentry.captureException(err);

  const status = (err as any).status || 500;
  const message = err.message || 'Внутренняя ошибка сервера';
  const details = process.env.NODE_ENV === 'development' ? { 
    stack: err.stack || err.message,
    path: req.path,
    method: req.method
  } : undefined;

  // Используем ApiResponse для формирования стандартного ответа об ошибке
  return ApiResponse.sendError(res, message, details, status);
};