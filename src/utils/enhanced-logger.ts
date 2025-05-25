import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as Sentry from '@sentry/node';
import { hostname } from 'os';

/**
 * Уровни логирования
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly'
}

/**
 * Категории ошибок для классификации
 */
export enum ErrorCategory {
  NETWORK = 'network',
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_SERVICE = 'external_service',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

/**
 * Интерфейс для контекста логирования
 */
interface LogContext {
  userId?: string;
  requestId?: string;
  service?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: any;
}

/**
 * Класс для улучшенного структурированного логирования
 */
class EnhancedLogger {
  private logger: winston.Logger;
  private defaultContext: LogContext = {};
  private errorStats: Map<ErrorCategory, number> = new Map();

  constructor() {
    this.logger = this.createLogger();
    this.initializeErrorStats();
    
    // Периодический вывод статистики ошибок
    setInterval(() => this.logErrorStats(), 60 * 60 * 1000); // Каждый час
  }

  /**
   * Создает Winston логгер с настройками
   */
  private createLogger(): winston.Logger {
    const customFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] }),
      winston.format.json()
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, metadata }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        
        if (metadata && Object.keys(metadata).length > 0) {
          // Форматируем метаданные для читаемости в консоли
          const metaStr = this.formatMetadata(metadata);
          if (metaStr) log += ` ${metaStr}`;
        }
        
        return log;
      })
    );

    const transports: winston.transport[] = [
      // Ротация файлов для ошибок
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '30d',
        maxSize: '100m',
        format: customFormat,
      }),
      
      // Ротация файлов для всех логов
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        maxSize: '200m',
        format: customFormat,
      }),
      
      // Отдельный файл для критических ошибок
      new winston.transports.File({
        filename: 'logs/critical.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
          winston.format.printf(info => {
            // Логируем только критические ошибки
            if ((info as any).metadata?.critical) {
              return JSON.stringify(info);
            }
            return '';
          })
        ),
      }),
    ];

    // Консольный вывод для разработки
    if (process.env.NODE_ENV !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: consoleFormat,
          level: 'debug',
        })
      );
    } else {
      // В продакшене тоже выводим в консоль, но только важные сообщения
      transports.push(
        new winston.transports.Console({
          format: customFormat,
          level: 'info',
        })
      );
    }

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      defaultMeta: {
        service: 'contentstar-api',
        hostname: hostname(),
        pid: process.pid,
      },
      transports,
    });
  }

  /**
   * Форматирует метаданные для вывода в консоль
   */
  private formatMetadata(metadata: any): string {
    const formatted: string[] = [];
    
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null && value !== '') {
        if (typeof value === 'object') {
          formatted.push(`${key}=${JSON.stringify(value)}`);
        } else {
          formatted.push(`${key}=${value}`);
        }
      }
    }
    
    return formatted.length > 0 ? `[${formatted.join(', ')}]` : '';
  }

  /**
   * Устанавливает контекст по умолчанию
   */
  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Очищает контекст по умолчанию
   */
  clearDefaultContext(): void {
    this.defaultContext = {};
  }

  /**
   * Логирование с уровнем ERROR
   */
  error(message: string, error?: Error | any, context?: LogContext): void {
    const category = this.categorizeError(error);
    this.errorStats.set(category, (this.errorStats.get(category) || 0) + 1);

    const logData = {
      message,
      level: LogLevel.ERROR,
      ...this.defaultContext,
      ...context,
      errorCategory: category,
      error: this.serializeError(error),
    };

    this.logger.error(message, logData);

    // Отправляем критические ошибки в Sentry
    if (this.isCriticalError(error, category)) {
      this.sendToSentry(message, error, context);
    }
  }

  /**
   * Логирование с уровнем WARN
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, {
      ...this.defaultContext,
      ...context,
    });
  }

  /**
   * Логирование с уровнем INFO
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(message, {
      ...this.defaultContext,
      ...context,
    });
  }

  /**
   * Логирование с уровнем HTTP
   */
  http(message: string, context?: LogContext): void {
    this.logger.http(message, {
      ...this.defaultContext,
      ...context,
    });
  }

  /**
   * Логирование с уровнем DEBUG
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, {
      ...this.defaultContext,
      ...context,
    });
  }

  /**
   * Логирование с уровнем VERBOSE
   */
  verbose(message: string, context?: LogContext): void {
    this.logger.verbose(message, {
      ...this.defaultContext,
      ...context,
    });
  }

  /**
   * Создает дочерний логгер с дополнительным контекстом
   */
  child(context: LogContext): EnhancedLogger {
    const childLogger = new EnhancedLogger();
    childLogger.setDefaultContext({ ...this.defaultContext, ...context });
    return childLogger;
  }

  /**
   * Категоризирует ошибку
   */
  private categorizeError(error: any): ErrorCategory {
    if (!error) return ErrorCategory.UNKNOWN;

    // Сетевые ошибки
    if (error.code && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code)) {
      return ErrorCategory.NETWORK;
    }

    // Ошибки базы данных
    if (error.name && ['MongoError', 'MongoNetworkError', 'ValidationError'].includes(error.name)) {
      return ErrorCategory.DATABASE;
    }

    // Ошибки аутентификации
    if (error.message && error.message.toLowerCase().includes('auth')) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Ошибки валидации
    if (error.name === 'ValidationError' || (error.message && error.message.includes('validation'))) {
      return ErrorCategory.VALIDATION;
    }

    // Ошибки внешних сервисов
    if (error.response && error.response.status) {
      return ErrorCategory.EXTERNAL_SERVICE;
    }

    // HTTP статусы
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode;
      if (status === 401) return ErrorCategory.AUTHENTICATION;
      if (status === 403) return ErrorCategory.AUTHORIZATION;
      if (status >= 400 && status < 500) return ErrorCategory.VALIDATION;
      if (status >= 500) return ErrorCategory.SYSTEM;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Определяет, является ли ошибка критической
   */
  private isCriticalError(error: any, category: ErrorCategory): boolean {
    // Критические категории
    if ([ErrorCategory.SYSTEM, ErrorCategory.DATABASE].includes(category)) {
      return true;
    }

    // Критические коды ошибок
    if (error?.code && ['EACCES', 'EMFILE', 'ENOMEM'].includes(error.code)) {
      return true;
    }

    // Критические HTTP статусы
    if (error?.status >= 500 || error?.statusCode >= 500) {
      return true;
    }

    return false;
  }

  /**
   * Сериализует ошибку для логирования
   */
  private serializeError(error: any): any {
    if (!error) return null;

    if (error instanceof Error) {
      // Сначала извлекаем базовые свойства
      const serialized: any = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
      
      // Затем добавляем дополнительные свойства, если они есть
      Object.keys(error).forEach(key => {
        if (key !== 'name' && key !== 'message' && key !== 'stack') {
          serialized[key] = (error as any)[key];
        }
      });
      
      return serialized;
    }

    return error;
  }

  /**
   * Отправляет ошибку в Sentry
   */
  private sendToSentry(message: string, error: any, context?: LogContext): void {
    Sentry.withScope(scope => {
      // Добавляем контекст
      if (context) {
        scope.setContext('additional', context);
        
        if (context.userId) {
          scope.setUser({ id: context.userId });
        }
        
        if (context.requestId) {
          scope.setTag('request_id', context.requestId);
        }
      }

      // Добавляем категорию ошибки
      const category = this.categorizeError(error);
      scope.setTag('error_category', category);

      // Отправляем
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(message, 'error');
      }
    });
  }

  /**
   * Инициализирует статистику ошибок
   */
  private initializeErrorStats(): void {
    for (const category of Object.values(ErrorCategory)) {
      this.errorStats.set(category as ErrorCategory, 0);
    }
  }

  /**
   * Логирует статистику ошибок
   */
  private logErrorStats(): void {
    const stats: Record<string, number> = {};
    
    for (const [category, count] of this.errorStats) {
      if (count > 0) {
        stats[category] = count;
      }
    }

    if (Object.keys(stats).length > 0) {
      this.info('Статистика ошибок за последний час', { errorStats: stats });
      
      // Сбрасываем счетчики
      this.initializeErrorStats();
    }
  }

  /**
   * Метод для логирования производительности
   */
  performance(operation: string, duration: number, context?: LogContext): void {
    const level = duration > 5000 ? LogLevel.WARN : LogLevel.INFO;
    
    this.logger.log(level, `Performance: ${operation}`, {
      ...this.defaultContext,
      ...context,
      performance: {
        operation,
        duration,
        slow: duration > 5000,
      },
    });
  }

  /**
   * Метод для логирования метрик
   */
  metric(name: string, value: number, unit: string, context?: LogContext): void {
    this.logger.info(`Metric: ${name}`, {
      ...this.defaultContext,
      ...context,
      metric: {
        name,
        value,
        unit,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Создаем и экспортируем singleton экземпляр
export const enhancedLogger = new EnhancedLogger();

/**
 * Middleware для добавления контекста запроса в логгер
 */
export const loggerMiddleware = (req: any, res: any, next: any) => {
  const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Добавляем requestId в заголовки ответа
  res.setHeader('X-Request-ID', requestId);
  
  // Создаем логгер с контекстом запроса
  const logger = enhancedLogger.child({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
  });
  
  // Добавляем логгер к запросу
  req.logger = logger;
  
  // Логируем начало запроса
  const startTime = Date.now();
  
  // Перехватываем завершение запроса
  const originalEnd = res.end;
  res.end = function(...args: any[]) {
    const duration = Date.now() - startTime;
    
    logger.http('Request completed', {
      statusCode: res.statusCode,
      duration,
      responseSize: res.get('content-length'),
    });
    
    originalEnd.apply(res, args);
  };
  
  next();
};