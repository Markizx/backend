import { Router, Request, Response } from 'express';
import { register } from '@middleware/metrics.middleware';
import { authenticate } from '@middleware/auth.middleware';
import { requireAdmin } from '@middleware/role.middleware';
import { cacheManager } from '@utils/cache.service';
import { circuitBreakerManager } from '@utils/circuit-breaker';
import { blacklistService } from '@utils/token-blacklist';
import { ApiResponse } from '@utils/response';
import logger from '@utils/logger';

const router = Router();

/**
 * Endpoint для Prometheus
 * GET /metrics
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Для Prometheus не требуется аутентификация,
    // но можно ограничить доступ по IP или использовать basic auth
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err: any) {
    logger.error('Ошибка получения метрик:', err);
    res.status(500).end();
  }
});

/**
 * Endpoint для получения детальной статистики приложения
 * GET /metrics/stats
 */
router.get('/stats', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    // Собираем статистику из различных компонентов
    const stats = {
      cache: cacheManager.getAllStats(),
      circuitBreakers: Array.from(circuitBreakerManager.getAllStats()).map(([name, stats]) => ({
        name,
        ...stats,
      })),
      tokenBlacklist: blacklistService.getStats(),
      process: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      },
      timestamp: new Date().toISOString(),
    };
    
    return ApiResponse.send(res, stats);
  } catch (err: any) {
    logger.error('Ошибка получения статистики:', err);
    return ApiResponse.sendError(res, 'Не удалось получить статистику', err.message, 500);
  }
});

/**
 * Endpoint для сброса метрик (только для админов)
 * POST /metrics/reset
 */
router.post('/reset', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    // Сбрасываем различные счетчики
    register.resetMetrics();
    
    logger.info('Метрики сброшены администратором', { adminId: (req as any).user?.id });
    return ApiResponse.send(res, null, 'Метрики успешно сброшены');
  } catch (err: any) {
    logger.error('Ошибка сброса метрик:', err);
    return ApiResponse.sendError(res, 'Не удалось сбросить метрики', err.message, 500);
  }
});

/**
 * Endpoint для получения метрик в формате JSON
 * GET /metrics/json
 */
router.get('/json', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const metrics = await register.getMetricsAsJSON();
    return ApiResponse.send(res, metrics);
  } catch (err: any) {
    logger.error('Ошибка получения метрик в JSON:', err);
    return ApiResponse.sendError(res, 'Не удалось получить метрики', err.message, 500);
  }
});

export default router;