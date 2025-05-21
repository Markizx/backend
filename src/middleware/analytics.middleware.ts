import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@middleware/auth.middleware';
import { AnalyticsEvent } from '@models/Analytics';
import logger from '@utils/logger';

// Middleware для автоматического трекинга событий
export const trackEvent = (eventType: string, category: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const startTime = Date.now();

    // Сохраняем оригинальные методы response
    const originalSend = res.send;
    const originalJson = res.json;

    // Переопределяем send для отслеживания завершения запроса
    res.send = function(data: any) {
      trackEventCompletion();
      return originalSend.call(this, data);
    };

    // Переопределяем json для отслеживания завершения запроса
    res.json = function(data: any) {
      trackEventCompletion();
      return originalJson.call(this, data);
    };

    let eventTracked = false;

    const trackEventCompletion = async () => {
      if (eventTracked) return;
      eventTracked = true;

      try {
        const duration = Date.now() - startTime;
        const userId = authReq.user?.id;
        const timestamp = new Date();

        // Собираем дополнительную информацию
        const details: any = {
          path: req.path,
          method: req.method,
          status: res.statusCode,
          user_agent: req.headers['user-agent'],
          ip_address: req.ip
        };

        // Добавляем специфические детали в зависимости от eventType
        if (eventType === 'registration') {
          details.email = req.body?.email;
        } else if (eventType === 'login') {
          details.email = req.body?.email;
        } else if (eventType.startsWith('subscription_')) {
          details.plan = req.body?.plan;
          details.amount = req.body?.amount;
        } else if (eventType.startsWith('generation_')) {
          details.generation_type = eventType.split('_')[1];
          details.mode = req.body?.mode;
        }

        const performance = {
          duration_ms: duration,
          api_response_time: duration
        };

        await AnalyticsEvent.trackEvent(eventType, category, details, userId, performance);
      } catch (err: any) {
        logger.error('Ошибка трекинга события:', { 
          eventType, 
          category, 
          error: err.message 
        });
      }
    };

    next();
  };
};

// Middleware для трекинга ошибок
export const trackError = async (err: Error, req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const timestamp = new Date();

    await AnalyticsEvent.trackEvent(
      'error',
      'system',
      {
        error_type: err.name,
        error_message: err.message,
        path: req.path,
        method: req.method,
        user_agent: req.headers['user-agent'],
        ip_address: req.ip,
        stack: err.stack
      },
      userId
    );
  } catch (trackingErr: any) {
    logger.error('Ошибка трекинга ошибки:', { error: trackingErr.message });
  }

  next(err);
};

// Функция для ручного трекинга событий в контроллерах
export async function trackEventManual(
  eventType: string,
  category: string,
  details: Record<string, any> = {},
  userId?: string,
  performance?: Record<string, number>
) {
  try {
    await AnalyticsEvent.trackEvent(eventType, category, details, userId, performance);
  } catch (err: any) {
    logger.error('Ошибка ручного трекинга события:', { 
      eventType, 
      category, 
      error: err.message 
    });
  }
}