import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { AuthenticatedRequest } from '@middleware/auth.middleware';
import logger from '@utils/logger';
import { ApiResponse } from '@utils/response';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.roles.includes('admin')) {
    logger.warn(`Доступ запрещён для пользователя ${authReq.user?.email}: требуется роль admin`);
    Sentry.captureMessage(`Доступ запрещён для пользователя ${authReq.user?.email}: требуется роль admin`);
    return ApiResponse.sendError(res, 'Требуется доступ администратора', null, 403);
  }
  next();
};

export const requireUser = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    logger.warn('Доступ запрещён: пользователь не авторизован');
    Sentry.captureMessage('Доступ запрещён: пользователь не авторизован');
    return ApiResponse.sendError(res, 'Требуется авторизация пользователя', null, 403);
  }
  next();
};