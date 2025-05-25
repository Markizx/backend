import { Translation, TranslationDocument } from '@models/Translation';
import logger from '@utils/logger';
import { cacheManager } from '@utils/cache.service';
import { recordCacheMetric } from '@middleware/metrics.middleware';

class TranslationCacheService {
  private cache = cacheManager.getCache<string>('translations', { 
    ttl: 24 * 60 * 60, // 24 часа
    maxKeys: 10000 
  });

  async get(key: string, language: string): Promise<string | null> {
    const cacheKey = `${language}:${key}`;
    
    // Проверяем кэш
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.info(`Translation cached hit: ${cacheKey}`);
      recordCacheMetric('translations', true);
      return cached;
    }

    recordCacheMetric('translations', false);

    // Проверяем БД
    try {
      const translation = await Translation.findOne({ key, language }) as TranslationDocument | null;
      if (translation) {
        this.cache.set(cacheKey, translation.translation);
        // Обновляем lastUsed
        translation.lastUsed = new Date();
        await translation.save();
        return translation.translation;
      }
    } catch (err) {
      logger.error('Error getting translation from DB:', err);
    }

    return null;
  }

  async set(key: string, language: string, translation: string, originalText: string): Promise<void> {
    const cacheKey = `${language}:${key}`;
    
    // Сохраняем в кэш
    this.cache.set(cacheKey, translation);
    
    // Сохраняем в БД
    try {
      await Translation.findOneAndUpdate(
        { key, language },
        { 
          translation, 
          originalText, 
          lastUsed: new Date() 
        },
        { 
          upsert: true, 
          new: true 
        }
      );
      logger.info(`Translation saved: ${cacheKey}`);
    } catch (err) {
      logger.error('Error saving translation to DB:', err);
    }
  }

  invalidate(key: string, language?: string): void {
    if (language) {
      this.cache.del(`${language}:${key}`);
    } else {
      // Invalidate all languages for this key
      const keys = this.cache.keys();
      const keysToDelete = keys.filter(cacheKey => cacheKey.endsWith(`:${key}`));
      this.cache.del(keysToDelete);
    }
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  flush() {
    this.cache.flush();
  }
}

export const translationCache = new TranslationCacheService();