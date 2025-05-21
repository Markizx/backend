import { Request, Response, NextFunction } from 'express';
import { GlobalConfig } from '@models/GlobalConfig';
import logger from '@utils/logger';
import { ApiResponse } from '@utils/response';

export const maintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const globalConfig = await GlobalConfig.findOne();
    if (globalConfig?.maintenanceMode) {
      logger.warn(`Запрос отклонён из-за режима обслуживания: ${req.method} ${req.path}`);
      return ApiResponse.sendError(
        res, 
        'Сервис находится в режиме обслуживания. Попробуйте позже.', 
        null, 
        503
      );
    }
    next();
  } catch (err: any) {
    logger.error('Ошибка проверки режима обслуживания:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(
      res, 
      'Внутренняя ошибка сервера', 
      err.message, 
      500
    );
  }
};