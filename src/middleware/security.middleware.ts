import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiResponse } from '@utils/response';
import logger from '@utils/logger';

/**
 * Расширенные настройки безопасности
 */
export const enhancedSecurityMiddleware = (app: any) => {
  // Расширенная конфигурация Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https://api.stripe.com", "https://api.x.ai", "https://api.openai.com"],
        frameSrc: ["'self'", "https://checkout.stripe.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:", "https:"],
        workerSrc: ["'self'", "blob:"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        blockAllMixedContent: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false,
  }));

  // Дополнительные заголовки безопасности
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Удаляем заголовки, раскрывающие информацию о сервере
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    next();
  });
};

/**
 * Middleware для проверки размера тела запроса
 */
export const bodySizeLimit = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const size = parseInt(contentLength);
      const maxBytes = parseSize(maxSize);
      
      if (size > maxBytes) {
        logger.warn(`Запрос превышает лимит размера: ${size} > ${maxBytes}`, {
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        return ApiResponse.sendError(res, 'Размер запроса превышает допустимый лимит', null, 413);
      }
    }
    next();
  };
};

/**
 * Middleware для проверки заголовков запроса
 */
export const validateHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Проверяем наличие подозрительных заголовков
  const suspiciousHeaders = [
    'x-forwarded-host',
    'x-original-url',
    'x-rewrite-url'
  ];
  
  for (const header of suspiciousHeaders) {
    if (req.headers[header]) {
      logger.warn(`Обнаружен подозрительный заголовок: ${header}`, {
        value: req.headers[header],
        ip: req.ip,
        path: req.path
      });
    }
  }
  
  // Проверяем User-Agent
  const userAgent = req.headers['user-agent'];
  if (!userAgent || userAgent.length < 10) {
    logger.warn('Отсутствует или подозрительный User-Agent', {
      userAgent,
      ip: req.ip,
      path: req.path
    });
  }
  
  next();
};

/**
 * Middleware для предотвращения timing атак
 */
export const timingSafeResponse = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  
  res.json = function(data: any) {
    // Добавляем случайную задержку для предотвращения timing атак
    const delay = Math.random() * 50; // 0-50ms
    
    setTimeout(() => {
      originalJson.call(this, data);
    }, delay);
    
    return this;
  };
  
  next();
};

/**
 * Вспомогательная функция для парсинга размера
 */
function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  const [, value, unit] = match;
  const multiplier = units[unit] || 1;
  
  return parseFloat(value) * multiplier;
}