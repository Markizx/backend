import NodeCache from 'node-cache';
import { enhancedLogger } from '@utils/enhanced-logger';
import crypto from 'crypto';

/**
 * Интерфейс для статистики кэша
 */
export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  ksize: number;
  vsize: number;
}

/**
 * Опции для кэша
 */
export interface CacheOptions {
  ttl?: number;
  checkperiod?: number;
  useClones?: boolean;
  deleteOnExpire?: boolean;
  maxKeys?: number;
  forceString?: boolean;
}

/**
 * Универсальный сервис кэширования
 */
export class CacheService<T = any> {
  private cache: NodeCache;
  private namespace: string;
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;

  constructor(namespace: string, options: CacheOptions = {}) {
    this.namespace = namespace;
    
    const defaultOptions: NodeCache.Options = {
      stdTTL: options.ttl || 300, // 5 минут по умолчанию
      checkperiod: options.checkperiod || 60,
      useClones: options.useClones !== undefined ? options.useClones : false,
      deleteOnExpire: options.deleteOnExpire !== undefined ? options.deleteOnExpire : true,
      forceString: options.forceString || false,
    };

    this.cache = new NodeCache(defaultOptions);

    // Ограничение количества ключей
    if (options.maxKeys) {
      this.cache.on('set', () => {
        const keys = this.cache.keys();
        if (keys.length > options.maxKeys!) {
          // Удаляем самые старые ключи
          const stats = this.cache.getStats();
          const keysToDelete = keys.slice(0, keys.length - options.maxKeys!);
          this.cache.del(keysToDelete);
          enhancedLogger.debug(`Cache ${this.namespace}: удалено ${keysToDelete.length} старых ключей`);
        }
      });
    }

    // Логирование событий
    this.cache.on('expired', (key, value) => {
      enhancedLogger.debug(`Cache ${this.namespace}: ключ ${key} истек`);
    });

    this.cache.on('flush', () => {
      enhancedLogger.info(`Cache ${this.namespace}: очищен`);
    });

    // Периодическая отправка метрик
    setInterval(() => {
      this.logStats();
    }, 60000); // Каждую минуту
  }

  /**
   * Получает значение из кэша или вызывает функцию для получения
   */
  async getOrFetch(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cacheKey = this.getCacheKey(key);
    
    try {
      const cachedValue = this.get(key);
      if (cachedValue !== undefined) {
        return cachedValue;
      }
    } catch (err) {
      // Продолжаем, если ошибка получения из кэша
      enhancedLogger.debug(`Cache ${this.namespace}: ошибка получения ${cacheKey}`, { error: err });
    }

    // Защита от одновременных запросов (cache stampede)
    const lockKey = `${cacheKey}:lock`;
    const existingLock = this.cache.get<Promise<T>>(lockKey);
    
    if (existingLock) {
      enhancedLogger.debug(`Cache ${this.namespace}: ожидание блокировки для ${cacheKey}`);
      try {
        return await existingLock;
      } catch (err) {
        // Если заблокированный запрос завершился ошибкой, пробуем снова
        enhancedLogger.debug(`Cache ${this.namespace}: заблокированный запрос завершился ошибкой для ${cacheKey}`);
      }
    }

    // Создаем promise для блокировки
    const fetchPromise = fetcher();
    this.cache.set(lockKey, fetchPromise, 30); // Блокировка на 30 секунд

    try {
      const freshValue = await fetchPromise;
      this.set(key, freshValue, ttl);
      return freshValue;
    } catch (error) {
      this.misses++;
      enhancedLogger.error(`Cache ${this.namespace}: ошибка получения данных для ${cacheKey}`, { error });
      throw error;
    } finally {
      this.cache.del(lockKey);
    }
  }

  /**
   * Получает значение из кэша
   */
  get(key: string): T | undefined {
    const cacheKey = this.getCacheKey(key);
    const value = this.cache.get<T>(cacheKey);
    
    if (value !== undefined) {
      this.hits++;
      enhancedLogger.debug(`Cache ${this.namespace}: попадание для ${cacheKey}`);
    } else {
      this.misses++;
      enhancedLogger.debug(`Cache ${this.namespace}: промах для ${cacheKey}`);
    }
    
    return value;
  }

  /**
   * Сохраняет значение в кэш
   */
  set(key: string, value: T, ttl?: number): boolean {
    const cacheKey = this.getCacheKey(key);
    this.sets++;
    
    const success = ttl ? this.cache.set(cacheKey, value, ttl) : this.cache.set(cacheKey, value);
    
    if (success) {
      enhancedLogger.debug(`Cache ${this.namespace}: сохранено ${cacheKey}`);
    } else {
      enhancedLogger.warn(`Cache ${this.namespace}: не удалось сохранить ${cacheKey}`);
    }
    
    return success;
  }

  /**
   * Удаляет значение из кэша
   */
  del(key: string | string[]): number {
    const keys = Array.isArray(key) ? key : [key];
    const cacheKeys = keys.map(k => this.getCacheKey(k));
    
    const deleted = this.cache.del(cacheKeys);
    this.deletes += deleted;
    
    enhancedLogger.debug(`Cache ${this.namespace}: удалено ${deleted} ключей`);
    return deleted;
  }

  /**
   * Проверяет наличие ключа в кэше
   */
  has(key: string): boolean {
    const cacheKey = this.getCacheKey(key);
    return this.cache.has(cacheKey);
  }

  /**
   * Очищает весь кэш
   */
  flush(): void {
    this.cache.flushAll();
    this.resetStats();
    enhancedLogger.info(`Cache ${this.namespace}: полностью очищен`);
  }

  /**
   * Получает все ключи
   */
  keys(): string[] {
    return this.cache.keys().map(key => key.replace(`${this.namespace}:`, ''));
  }

  /**
   * Получает TTL для ключа
   */
  getTtl(key: string): number | undefined {
    const cacheKey = this.getCacheKey(key);
    const ttl = this.cache.getTtl(cacheKey);
    return ttl || undefined;
  }

  /**
   * Устанавливает новый TTL для ключа
   */
  ttl(key: string, ttl: number): boolean {
    const cacheKey = this.getCacheKey(key);
    return this.cache.ttl(cacheKey, ttl);
  }

  /**
   * Получает статистику кэша
   */
  getStats(): CacheStats & { namespace: string; hitRate: number } {
    const stats = this.cache.getStats();
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
    
    return {
      ...stats,
      namespace: this.namespace,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Мультиполучение значений
   */
  mget(keys: string[]): { [key: string]: T } {
    const cacheKeys = keys.map(k => this.getCacheKey(k));
    const values = this.cache.mget<T>(cacheKeys);
    
    const result: { [key: string]: T } = {};
    keys.forEach((key, index) => {
      const cacheKey = cacheKeys[index];
      if (values[cacheKey] !== undefined) {
        result[key] = values[cacheKey];
        this.hits++;
      } else {
        this.misses++;
      }
    });
    
    return result;
  }

  /**
   * Мультисохранение значений
   */
  mset(keyValuePairs: Array<{ key: string; val: T; ttl?: number }>): boolean {
    const cacheData = keyValuePairs.map(({ key, val, ttl }) => ({
      key: this.getCacheKey(key),
      val,
      ttl,
    }));
    
    this.sets += keyValuePairs.length;
    return this.cache.mset(cacheData);
  }

  /**
   * Создает хэш-ключ для длинных строк
   */
  hashKey(key: string): string {
    if (key.length <= 250) return key;
    
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return `${key.substring(0, 200)}:${hash.substring(0, 16)}`;
  }

  /**
   * Закрывает кэш
   */
  close(): void {
    this.cache.close();
    enhancedLogger.info(`Cache ${this.namespace}: закрыт`);
  }

  /**
   * Получает полный ключ кэша с namespace
   */
  private getCacheKey(key: string): string {
    const hashedKey = this.hashKey(key);
    return `${this.namespace}:${hashedKey}`;
  }

  /**
   * Логирует статистику
   */
  private logStats(): void {
    const stats = this.getStats();
    enhancedLogger.metric('cache_stats', stats.hitRate, 'percent', {
      namespace: this.namespace,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      keys: stats.keys,
    });
  }

  /**
   * Сбрасывает статистику
   */
  private resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.deletes = 0;
  }
}

/**
 * Менеджер для управления несколькими кэшами
 */
export class CacheManager {
  private caches = new Map<string, CacheService>();

  /**
   * Получает или создает кэш
   */
  getCache<T = any>(namespace: string, options?: CacheOptions): CacheService<T> {
    if (!this.caches.has(namespace)) {
      const cache = new CacheService<T>(namespace, options);
      this.caches.set(namespace, cache);
    }
    
    return this.caches.get(namespace) as CacheService<T>;
  }

  /**
   * Получает статистику всех кэшей
   */
  getAllStats(): Array<CacheStats & { namespace: string; hitRate: number }> {
    return Array.from(this.caches.values()).map(cache => cache.getStats());
  }

  /**
   * Очищает все кэши
   */
  flushAll(): void {
    this.caches.forEach(cache => cache.flush());
  }

  /**
   * Закрывает все кэши
   */
  closeAll(): void {
    this.caches.forEach(cache => cache.close());
    this.caches.clear();
  }
}

// Экспортируем глобальный менеджер кэшей
export const cacheManager = new CacheManager();

// Предопределенные кэши
export const secretsCache = cacheManager.getCache('secrets', { ttl: 300 }); // 5 минут
export const imageCache = cacheManager.getCache('images', { ttl: 1800, maxKeys: 1000 }); // 30 минут
export const textCache = cacheManager.getCache('text', { ttl: 900, maxKeys: 500 }); // 15 минут
export const videoCache = cacheManager.getCache('video', { ttl: 3600, maxKeys: 100 }); // 1 час
export const translationCache = cacheManager.getCache('translations', { ttl: 86400, maxKeys: 10000 }); // 24 часа