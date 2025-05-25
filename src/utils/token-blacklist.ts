import NodeCache from 'node-cache';
import crypto from 'crypto';
import logger from '@utils/logger';

/**
 * Сервис для управления черным списком JWT токенов
 */
class TokenBlacklistService {
  private cache: NodeCache;
  private hashCache: NodeCache; // Кэш для хранения хэшей токенов (для экономии памяти)

  constructor() {
    // Основной кэш для коротких токенов
    this.cache = new NodeCache({
      stdTTL: 7 * 24 * 60 * 60, // 7 дней (время жизни токена)
      checkperiod: 60 * 60, // Проверка каждый час
      deleteOnExpire: true,
      maxKeys: 10000, // Максимум 10000 токенов
    });

    // Кэш для хэшей длинных токенов
    this.hashCache = new NodeCache({
      stdTTL: 7 * 24 * 60 * 60,
      checkperiod: 60 * 60,
      deleteOnExpire: true,
      maxKeys: 50000, // Больше места для хэшей
    });

    // Логирование статистики
    setInterval(() => {
      const stats = this.getStats();
      logger.info('Статистика черного списка токенов', stats);
    }, 60 * 60 * 1000); // Каждый час
  }

  /**
   * Добавляет токен в черный список
   */
  async addToBlacklist(token: string, reason?: string, expiresIn?: number): Promise<void> {
    if (!token) return;

    try {
      const ttl = expiresIn || 7 * 24 * 60 * 60; // По умолчанию 7 дней
      const timestamp = Date.now();
      const data = { reason, timestamp };

      // Для коротких токенов храним как есть
      if (token.length < 500) {
        this.cache.set(token, data, ttl);
      } else {
        // Для длинных токенов храним хэш
        const hash = this.hashToken(token);
        this.hashCache.set(hash, data, ttl);
      }

      logger.info('Токен добавлен в черный список', {
        tokenLength: token.length,
        reason,
        ttl,
      });
    } catch (error: any) {
      logger.error('Ошибка добавления токена в черный список', {
        error: error.message,
      });
    }
  }

  /**
   * Проверяет, находится ли токен в черном списке
   */
  async isBlacklisted(token: string): Promise<boolean> {
    if (!token) return false;

    try {
      // Проверяем короткие токены
      if (token.length < 500) {
        return this.cache.has(token);
      }

      // Проверяем хэш для длинных токенов
      const hash = this.hashToken(token);
      return this.hashCache.has(hash);
    } catch (error: any) {
      logger.error('Ошибка проверки токена в черном списке', {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Удаляет токен из черного списка
   */
  async removeFromBlacklist(token: string): Promise<void> {
    if (!token) return;

    try {
      if (token.length < 500) {
        this.cache.del(token);
      } else {
        const hash = this.hashToken(token);
        this.hashCache.del(hash);
      }

      logger.info('Токен удален из черного списка');
    } catch (error: any) {
      logger.error('Ошибка удаления токена из черного списка', {
        error: error.message,
      });
    }
  }

  /**
   * Очищает весь черный список
   */
  async clearBlacklist(): Promise<void> {
    try {
      this.cache.flushAll();
      this.hashCache.flushAll();
      logger.info('Черный список токенов очищен');
    } catch (error: any) {
      logger.error('Ошибка очистки черного списка', {
        error: error.message,
      });
    }
  }

  /**
   * Получает статистику черного списка
   */
  getStats(): {
    shortTokens: number;
    hashedTokens: number;
    totalTokens: number;
    cacheHits: number;
    cacheMisses: number;
  } {
    const cacheStats = this.cache.getStats();
    const hashStats = this.hashCache.getStats();

    return {
      shortTokens: this.cache.keys().length,
      hashedTokens: this.hashCache.keys().length,
      totalTokens: this.cache.keys().length + this.hashCache.keys().length,
      cacheHits: cacheStats.hits + hashStats.hits,
      cacheMisses: cacheStats.misses + hashStats.misses,
    };
  }

  /**
   * Добавляет несколько токенов в черный список (batch операция)
   */
  async addMultipleToBlacklist(tokens: string[], reason?: string): Promise<void> {
    const promises = tokens.map(token => this.addToBlacklist(token, reason));
    await Promise.all(promises);
  }

  /**
   * Автоматическая очистка истекших токенов
   */
  private startCleanupJob(): void {
    setInterval(() => {
      try {
        // NodeCache автоматически удаляет истекшие ключи,
        // но мы можем добавить дополнительную логику при необходимости
        const expiredCount = this.cache.keys().filter(key => {
          const ttl = this.cache.getTtl(key);
          return ttl && ttl < Date.now();
        }).length;

        if (expiredCount > 0) {
          logger.info(`Автоматически удалено ${expiredCount} истекших токенов`);
        }
      } catch (error: any) {
        logger.error('Ошибка в задаче очистки черного списка', {
          error: error.message,
        });
      }
    }, 60 * 60 * 1000); // Каждый час
  }

  /**
   * Хэширует токен для экономии памяти
   */
  private hashToken(token: string): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }
}

// Экспортируем singleton экземпляр
export const blacklistService = new TokenBlacklistService();

/**
 * Middleware для автоматического добавления токена в черный список при logout
 */
export const blacklistOnLogout = async (req: any, res: any, next: any) => {
  try {
    const token = req.token || req.headers.authorization?.split(' ')[1];
    
    if (token) {
      await blacklistService.addToBlacklist(token, 'logout');
    }
    
    next();
  } catch (error: any) {
    logger.error('Ошибка добавления токена в черный список при logout', {
      error: error.message,
    });
    next();
  }
};