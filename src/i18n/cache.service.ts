import NodeCache from 'node-cache';
import { Translation, TranslationDocument } from '@models/Translation';
import logger from '@utils/logger';

class TranslationCacheService {
  private cache: NodeCache;

  constructor() {
    // Кэш на 24 часа
    this.cache = new NodeCache({ 
      stdTTL: 24 * 60 * 60,
      checkperiod: 60 * 60 
    });
  }

  async get(key: string, language: string): Promise<string | null> {
    const cacheKey = `${language}:${key}`;
    
    // Проверяем in-memory кэш
    const cached = this.cache.get<string>(cacheKey);
    if (cached) {
      logger.info(`Translation cached hit: ${cacheKey}`);
      return cached;
    }

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
    
    // Сохраняем в memory кэш
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
      keys.forEach(cacheKey => {
        if (cacheKey.endsWith(`:${key}`)) {
          this.cache.del(cacheKey);
        }
      });
    }
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}

export const translationCache = new TranslationCacheService();