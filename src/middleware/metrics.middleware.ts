import { Request, Response, NextFunction } from 'express';
import * as promClient from 'prom-client';
import { enhancedLogger } from '@utils/enhanced-logger';

// Создаем реестр метрик
const register = new promClient.Registry();

// Добавляем метрики по умолчанию (CPU, память и т.д.)
promClient.collectDefaultMetrics({ register });

// HTTP метрики
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestSize = new promClient.Summary({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register],
});

const httpResponseSize = new promClient.Summary({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register],
});

// Метрики для внешних API
const externalApiDuration = new promClient.Histogram({
  name: 'external_api_request_duration_seconds',
  help: 'Duration of external API requests in seconds',
  labelNames: ['service', 'operation', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

const externalApiTotal = new promClient.Counter({
  name: 'external_api_requests_total',
  help: 'Total number of external API requests',
  labelNames: ['service', 'operation', 'status'],
  registers: [register],
});

// Метрики генерации контента
const contentGenerationDuration = new promClient.Histogram({
  name: 'content_generation_duration_seconds',
  help: 'Duration of content generation in seconds',
  labelNames: ['type', 'model', 'status'],
  buckets: [1, 2, 5, 10, 20, 30, 60, 120],
  registers: [register],
});

const contentGenerationTotal = new promClient.Counter({
  name: 'content_generation_total',
  help: 'Total number of content generations',
  labelNames: ['type', 'model', 'status'],
  registers: [register],
});

// Метрики кэша
const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_name'],
  registers: [register],
});

const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_name'],
  registers: [register],
});

// Метрики базы данных
const dbOperationDuration = new promClient.Histogram({
  name: 'db_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Метрики бизнес-логики
const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Number of active users',
  registers: [register],
});

const subscriptionMetrics = new promClient.Gauge({
  name: 'active_subscriptions',
  help: 'Number of active subscriptions',
  labelNames: ['plan'],
  registers: [register],
});

// Метрики ошибок
const errorTotal = new promClient.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'category'],
  registers: [register],
});

/**
 * Middleware для сбора метрик HTTP запросов
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Получаем размер запроса
  const requestSize = parseInt(req.get('content-length') || '0');
  
  // Нормализуем путь для метрик (убираем динамические параметры)
  const route = req.route?.path || req.path.replace(/\/[0-9a-fA-F]{24}/g, '/:id');
  
  // Сохраняем оригинальный end для перехвата
  const originalEnd = res.end;
  const originalWrite = res.write;
  
  let responseSize = 0;
  
  // Перехватываем write для подсчета размера ответа
  res.write = function(chunk: any, ...args: any[]): any {
    responseSize += Buffer.byteLength(chunk);
    return originalWrite.apply(res, [chunk, ...args]);
  };
  
  // Перехватываем end для записи метрик
  res.end = function(chunk?: any, ...args: any[]): any {
    if (chunk) {
      responseSize += Buffer.byteLength(chunk);
    }
    
    // Записываем метрики
    const duration = (Date.now() - start) / 1000;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
    
    if (requestSize > 0) {
      httpRequestSize.observe({ method: req.method, route }, requestSize);
    }
    
    if (responseSize > 0) {
      httpResponseSize.observe({ method: req.method, route }, responseSize);
    }
    
    // Логируем медленные запросы
    if (duration > 5) {
      enhancedLogger.warn('Медленный запрос', {
        method: req.method,
        route,
        duration,
        statusCode: res.statusCode,
      });
    }
    
    return originalEnd.apply(res, [chunk, ...args]);
  };
  
  next();
};

/**
 * Функции для записи метрик внешних API
 */
export const recordExternalApiMetric = (
  service: string,
  operation: string,
  duration: number,
  success: boolean,
  statusCode?: number
) => {
  const status = success ? 'success' : 'error';
  const labels = { service, operation, status };
  
  externalApiDuration.observe(labels, duration);
  externalApiTotal.inc(labels);
  
  enhancedLogger.metric('external_api_call', duration, 'seconds', {
    service,
    operation,
    status,
    statusCode,
  });
};

/**
 * Функция для записи метрик генерации контента
 */
export const recordContentGenerationMetric = (
  type: string,
  model: string,
  duration: number,
  success: boolean
) => {
  const status = success ? 'success' : 'error';
  const labels = { type, model, status };
  
  contentGenerationDuration.observe(labels, duration);
  contentGenerationTotal.inc(labels);
};

/**
 * Функция для записи метрик кэша
 */
export const recordCacheMetric = (cacheName: string, hit: boolean) => {
  if (hit) {
    cacheHits.inc({ cache_name: cacheName });
  } else {
    cacheMisses.inc({ cache_name: cacheName });
  }
};

/**
 * Функция для записи метрик базы данных
 */
export const recordDbOperationMetric = (operation: string, collection: string, duration: number) => {
  dbOperationDuration.observe({ operation, collection }, duration);
};

/**
 * Функция для записи метрик ошибок
 */
export const recordErrorMetric = (type: string, category: string) => {
  errorTotal.inc({ type, category });
};

/**
 * Функция для обновления бизнес-метрик
 */
export const updateBusinessMetrics = async () => {
  try {
    // Эти метрики обновляются периодически, не в реальном времени
    // Они будут вызываться из отдельного процесса или cron задачи
    
    // Пример обновления количества активных пользователей
    // const count = await User.countDocuments({ isActive: true });
    // activeUsers.set(count);
    
    // Пример обновления подписок по планам
    // const subscriptions = await User.aggregate([...]);
    // subscriptions.forEach(({ plan, count }) => {
    //   subscriptionMetrics.set({ plan }, count);
    // });
  } catch (error: any) {
    enhancedLogger.error('Ошибка обновления бизнес-метрик', { error: error.message });
  }
};

// Периодическое обновление бизнес-метрик
setInterval(updateBusinessMetrics, 60000); // Каждую минуту

// Экспортируем регистр для использования в роутах
export { register };