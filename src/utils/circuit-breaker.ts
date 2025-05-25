import logger from '@utils/logger';
import EventEmitter from 'events';

/**
 * Состояния Circuit Breaker
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // Нормальная работа
  OPEN = 'OPEN',         // Блокировка запросов
  HALF_OPEN = 'HALF_OPEN' // Тестовый режим
}

/**
 * Опции для Circuit Breaker
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;      // Количество ошибок для открытия
  successThreshold?: number;      // Количество успехов для закрытия
  timeout?: number;              // Время ожидания в открытом состоянии (мс)
  resetTimeout?: number;         // Время до попытки восстановления (мс)
  monitoringPeriod?: number;     // Период мониторинга ошибок (мс)
  volumeThreshold?: number;      // Минимальное количество запросов для анализа
  errorThresholdPercentage?: number; // Процент ошибок для открытия
  fallback?: () => Promise<any>; // Функция fallback
}

/**
 * Статистика Circuit Breaker
 */
interface CircuitStats {
  failures: number;
  successes: number;
  rejections: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  state: CircuitState;
  stateChangedAt: Date;
}

/**
 * Circuit Breaker для предотвращения каскадных сбоев
 */
export class CircuitBreaker<T = any> extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private rejections = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttempt?: Date;
  private stateChangedAt = new Date();
  
  // Скользящее окно для подсчета ошибок
  private requestHistory: Array<{ time: number; success: boolean }> = [];
  
  constructor(
    private name: string,
    private options: CircuitBreakerOptions = {}
  ) {
    super();
    
    // Дефолтные значения
    this.options = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 минута
      resetTimeout: 30000, // 30 секунд
      monitoringPeriod: 60000, // 1 минута
      volumeThreshold: 10,
      errorThresholdPercentage: 50,
      ...options
    };
    
    // Периодическая очистка истории
    setInterval(() => this.cleanupHistory(), 10000);
  }

  /**
   * Выполняет функцию через Circuit Breaker
   */
  async execute<R = T>(fn: () => Promise<R>): Promise<R> {
    // Проверяем состояние
    if (this.state === CircuitState.OPEN) {
      const canRetry = this.nextAttempt && new Date() >= this.nextAttempt;
      
      if (!canRetry) {
        this.onRejection();
        
        // Пробуем fallback
        if (this.options.fallback) {
          logger.info(`Circuit Breaker ${this.name}: используется fallback`);
          return this.options.fallback() as Promise<R>;
        }
        
        const waitTime = this.nextAttempt 
          ? Math.ceil((this.nextAttempt.getTime() - Date.now()) / 1000)
          : 0;
          
        throw new Error(
          `Circuit breaker is OPEN for ${this.name}. Service unavailable. Retry in ${waitTime}s`
        );
      }
      
      // Переходим в HALF_OPEN для тестирования
      this.transition(CircuitState.HALF_OPEN);
    }

    try {
      const result = await this.callWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Декоратор для методов класса
   */
  static decorator<T extends Function>(
    name: string,
    options: CircuitBreakerOptions = {}
  ) {
    const breaker = new CircuitBreaker(name, options);
    
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function (...args: any[]) {
        return breaker.execute(() => originalMethod.apply(this, args));
      };
      
      return descriptor;
    };
  }

  /**
   * Получает текущее состояние
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Получает статистику
   */
  getStats(): CircuitStats {
    const recentRequests = this.getRecentRequests();
    const errorRate = this.calculateErrorRate(recentRequests);
    
    return {
      failures: this.failures,
      successes: this.successes,
      rejections: this.rejections,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      state: this.state,
      stateChangedAt: this.stateChangedAt,
    };
  }

  /**
   * Сбрасывает Circuit Breaker
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.rejections = 0;
    this.requestHistory = [];
    this.transition(CircuitState.CLOSED);
    
    logger.info(`Circuit Breaker ${this.name}: сброшен вручную`);
  }

  /**
   * Обработка успешного вызова
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = new Date();
    this.recordRequest(true);
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.options.successThreshold!) {
        this.transition(CircuitState.CLOSED);
      }
    }
    
    this.emit('success');
  }

  /**
   * Обработка неудачного вызова
   */
  private onFailure(error: any): void {
    this.failures++;
    this.lastFailureTime = new Date();
    this.recordRequest(false);
    
    logger.warn(`Circuit Breaker ${this.name}: ошибка`, {
      error: error.message,
      failures: this.failures,
      state: this.state,
    });
    
    // Проверяем условия открытия
    if (this.shouldOpen()) {
      this.transition(CircuitState.OPEN);
    }
    
    this.emit('failure', error);
  }

  /**
   * Обработка отклоненного вызова
   */
  private onRejection(): void {
    this.rejections++;
    this.emit('rejection');
  }

  /**
   * Переход между состояниями
   */
  private transition(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = new Date();
    
    logger.info(`Circuit Breaker ${this.name}: ${oldState} -> ${newState}`);
    
    switch (newState) {
      case CircuitState.CLOSED:
        this.failures = 0;
        this.nextAttempt = undefined;
        break;
        
      case CircuitState.OPEN:
        this.nextAttempt = new Date(Date.now() + this.options.resetTimeout!);
        this.successes = 0;
        break;
        
      case CircuitState.HALF_OPEN:
        this.successes = 0;
        this.failures = 0;
        break;
    }
    
    this.emit('stateChange', { from: oldState, to: newState });
  }

  /**
   * Определяет, нужно ли открыть Circuit Breaker
   */
  private shouldOpen(): boolean {
    // Проверка по абсолютному количеству ошибок
    if (this.state === CircuitState.HALF_OPEN && this.failures >= 1) {
      return true;
    }
    
    if (this.failures >= this.options.failureThreshold!) {
      return true;
    }
    
    // Проверка по проценту ошибок
    const recentRequests = this.getRecentRequests();
    
    if (recentRequests.length >= this.options.volumeThreshold!) {
      const errorRate = this.calculateErrorRate(recentRequests);
      
      if (errorRate >= this.options.errorThresholdPercentage!) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Вызов функции с таймаутом
   */
  private async callWithTimeout<R>(fn: () => Promise<R>): Promise<R> {
    if (!this.options.timeout) {
      return fn();
    }
    
    return Promise.race([
      fn(),
      new Promise<R>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Circuit breaker timeout after ${this.options.timeout}ms`));
        }, this.options.timeout);
      }),
    ]);
  }

  /**
   * Записывает результат запроса
   */
  private recordRequest(success: boolean): void {
    this.requestHistory.push({
      time: Date.now(),
      success,
    });
  }

  /**
   * Получает недавние запросы
   */
  private getRecentRequests(): Array<{ time: number; success: boolean }> {
    const cutoff = Date.now() - this.options.monitoringPeriod!;
    return this.requestHistory.filter(req => req.time >= cutoff);
  }

  /**
   * Вычисляет процент ошибок
   */
  private calculateErrorRate(requests: Array<{ success: boolean }>): number {
    if (requests.length === 0) return 0;
    
    const failures = requests.filter(req => !req.success).length;
    return (failures / requests.length) * 100;
  }

  /**
   * Очищает старую историю
   */
  private cleanupHistory(): void {
    const cutoff = Date.now() - this.options.monitoringPeriod! * 2;
    this.requestHistory = this.requestHistory.filter(req => req.time >= cutoff);
  }
}

/**
 * Менеджер для управления несколькими Circuit Breakers
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Получает или создает Circuit Breaker
   */
  getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
      
      // Подписываемся на события для логирования
      breaker.on('stateChange', ({ from, to }) => {
        logger.info(`Circuit Breaker ${name}: состояние изменено ${from} -> ${to}`);
      });
    }
    
    return this.breakers.get(name)!;
  }

  /**
   * Выполняет функцию через Circuit Breaker
   */
  async execute<T>(
    name: string,
    fn: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn);
  }

  /**
   * Получает статистику всех Circuit Breakers
   */
  getAllStats(): Map<string, CircuitStats> {
    const stats = new Map<string, CircuitStats>();
    
    for (const [name, breaker] of this.breakers) {
      stats.set(name, breaker.getStats());
    }
    
    return stats;
  }

  /**
   * Сбрасывает конкретный Circuit Breaker
   */
  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Сбрасывает все Circuit Breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Экспортируем глобальный менеджер
export const circuitBreakerManager = new CircuitBreakerManager();