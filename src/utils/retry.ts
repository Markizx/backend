import logger from '@utils/logger';

/**
 * Опции для механизма повторных попыток
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  factor?: number;
  jitter?: boolean;
  retryCondition?: (error: any) => boolean;
  onRetry?: (error: any, attemptNumber: number) => void;
}

/**
 * Декоратор для повторных попыток
 */
export function Retry(options: RetryOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Выполняет функцию с автоматическими повторными попытками
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 300,
    maxDelay = 10000,
    factor = 2,
    jitter = true,
    retryCondition = isRetriableError,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Проверяем, нужно ли повторять попытку
      if (attempt === maxRetries || !retryCondition(error)) {
        throw error;
      }

      // Вычисляем задержку с экспоненциальным увеличением
      let delay = Math.min(baseDelay * Math.pow(factor, attempt), maxDelay);

      // Добавляем случайный jitter для предотвращения thundering herd
      if (jitter) {
        delay *= 0.5 + Math.random();
      }

      logger.warn(`Попытка ${attempt + 1}/${maxRetries} не удалась, повтор через ${Math.round(delay)}ms`, {
        error: error.message,
        code: error.code,
        statusCode: error.response?.status,
      });

      // Callback при повторе
      if (onRetry) {
        onRetry(error, attempt + 1);
      }

      // Ждем перед следующей попыткой
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Выполняет несколько операций параллельно с повторными попытками
 */
export async function withRetryAll<T>(
  operations: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<T[]> {
  return Promise.all(
    operations.map(operation => withRetry(operation, options))
  );
}

/**
 * Выполняет операции последовательно с повторными попытками
 */
export async function withRetrySequential<T>(
  operations: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<T[]> {
  const results: T[] = [];

  for (const operation of operations) {
    const result = await withRetry(operation, options);
    results.push(result);
  }

  return results;
}

/**
 * Определяет, является ли ошибка подходящей для повторной попытки
 */
export function isRetriableError(error: any): boolean {
  // Сетевые ошибки
  if (error.code) {
    const retriableCodes = [
      'ECONNRESET',
      'ENOTFOUND',
      'ESOCKETTIMEDOUT',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'EPIPE',
      'EAI_AGAIN',
    ];
    
    if (retriableCodes.includes(error.code)) {
      return true;
    }
  }

  // HTTP статусы
  if (error.response?.status) {
    const status = error.response.status;
    
    // Повторяем при временных ошибках сервера
    if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
      return true;
    }
    
    // Не повторяем при ошибках клиента (кроме 429)
    if (status >= 400 && status < 500 && status !== 429) {
      return false;
    }
  }

  // AWS SDK ошибки
  if (error.name) {
    const retriableAwsErrors = [
      'ProvisionedThroughputExceededException',
      'Throttling',
      'ThrottlingException',
      'RequestLimitExceeded',
      'ServiceUnavailable',
      'RequestTimeout',
    ];
    
    if (retriableAwsErrors.includes(error.name)) {
      return true;
    }
  }

  // MongoDB ошибки
  if (error.name === 'MongoNetworkError' || error.codeName === 'NetworkTimeout') {
    return true;
  }

  // По умолчанию не повторяем
  return false;
}

/**
 * Специфичные условия для разных сервисов
 */
export const retryConditions = {
  // OpenAI
  openai: (error: any): boolean => {
    if (isRetriableError(error)) return true;
    
    // Специфичные ошибки OpenAI
    if (error.response?.status === 502 || error.response?.status === 503) {
      return true;
    }
    
    if (error.message?.includes('rate limit')) {
      return true;
    }
    
    return false;
  },

  // Stripe
  stripe: (error: any): boolean => {
    if (isRetriableError(error)) return true;
    
    // Специфичные ошибки Stripe
    if (error.type === 'StripeAPIError' || error.type === 'StripeConnectionError') {
      return true;
    }
    
    return false;
  },

  // AWS S3
  s3: (error: any): boolean => {
    if (isRetriableError(error)) return true;
    
    // Специфичные ошибки S3
    if (error.code === 'SlowDown' || error.code === 'RequestTimeout') {
      return true;
    }
    
    return false;
  },

  // Stability AI
  stability: (error: any): boolean => {
    if (isRetriableError(error)) return true;
    
    // Специфичные ошибки Stability
    if (error.response?.status === 429 || error.response?.status >= 500) {
      return true;
    }
    
    return false;
  },

  // Runway ML
  runway: (error: any): boolean => {
    if (isRetriableError(error)) return true;
    
    // Специфичные ошибки Runway
    if (error.response?.data?.error?.includes('capacity')) {
      return true;
    }
    
    return false;
  },
};

/**
 * Вспомогательная функция для задержки
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Класс для управления повторными попытками с состоянием
 */
export class RetryManager {
  private attempts: Map<string, number> = new Map();
  private lastAttemptTime: Map<string, number> = new Map();

  constructor(private options: RetryOptions = {}) {}

  /**
   * Выполняет операцию с учетом истории попыток
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    customOptions?: RetryOptions
  ): Promise<T> {
    const mergedOptions = { ...this.options, ...customOptions };
    const currentAttempts = this.attempts.get(key) || 0;

    // Проверяем cooldown период
    const lastTime = this.lastAttemptTime.get(key) || 0;
    const cooldownPeriod = 60000; // 1 минута
    
    if (currentAttempts >= (mergedOptions.maxRetries || 3)) {
      const timeSinceLastAttempt = Date.now() - lastTime;
      
      if (timeSinceLastAttempt < cooldownPeriod) {
        throw new Error(`Операция ${key} превысила лимит попыток. Повторите через ${Math.ceil((cooldownPeriod - timeSinceLastAttempt) / 1000)} секунд.`);
      } else {
        // Сбрасываем счетчик после cooldown
        this.attempts.delete(key);
      }
    }

    try {
      const result = await withRetry(fn, {
        ...mergedOptions,
        onRetry: (error, attempt) => {
          this.attempts.set(key, currentAttempts + attempt);
          this.lastAttemptTime.set(key, Date.now());
          
          if (mergedOptions.onRetry) {
            mergedOptions.onRetry(error, attempt);
          }
        },
      });

      // Успех - сбрасываем счетчик
      this.attempts.delete(key);
      this.lastAttemptTime.delete(key);

      return result;
    } catch (error) {
      this.lastAttemptTime.set(key, Date.now());
      throw error;
    }
  }

  /**
   * Сбрасывает историю попыток для ключа
   */
  reset(key: string): void {
    this.attempts.delete(key);
    this.lastAttemptTime.delete(key);
  }

  /**
   * Получает статистику попыток
   */
  getStats(): Map<string, { attempts: number; lastAttempt: Date }> {
    const stats = new Map<string, { attempts: number; lastAttempt: Date }>();

    for (const [key, attempts] of this.attempts) {
      const lastTime = this.lastAttemptTime.get(key);
      stats.set(key, {
        attempts,
        lastAttempt: lastTime ? new Date(lastTime) : new Date(0),
      });
    }

    return stats;
  }
}