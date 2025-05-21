import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { requireAdmin } from '@middleware/role.middleware';
import { i18nService } from '@i18n/index';
import { aiTranslator } from '@i18n/translator.service';
import { translationCache } from '@i18n/cache.service';
import { Translation } from '@models/Translation';
import { User, UserDocument } from '@models/User';
import logger from '@utils/logger';

const router = Router();

// Получить поддерживаемые языки
router.get('/languages', (req: Request, res: Response) => {
  const languages = aiTranslator.getSupportedLanguages();
  res.json({ languages });
});

// Получить перевод (для фронтенда)
router.get('/translate/:key', authenticate, async (req: Request, res: Response) => {
  const { key } = req.params;
  const authReq = req as AuthenticatedRequest & I18nRequest;
  let { lang } = req.query;
  
  try {
    // Если язык не указан, используем предпочтения пользователя
    if (!lang && authReq.user?.id) {
      const user = await User.findById(authReq.user.id) as UserDocument | null;
      if (user?.preferredLanguage) {
        lang = user.preferredLanguage;
      }
    }
    
    // Если все еще нет языка, используем язык из заголовков
    if (!lang) {
      lang = authReq.language || 'en';
    }
    
    const translation = await i18nService.translate(
      key, 
      lang as any, 
      { context: req.query.context as string }
    );
    res.json({ key, language: lang, translation });
  } catch (err: any) {
    res.status(500).json({ error: 'Translation failed', details: err.message });
  }
});

// Батч-перевод для оптимизации клиентских приложений
router.post('/batch-translate', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & I18nRequest & { body: { keys: string[], language?: string } };
  const { keys, language } = authReq.body;
  
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: 'Keys array required' });
  }
  
  if (keys.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 keys allowed per request' });
  }
  
  try {
    let targetLanguage = language;
    
    // Если язык не указан, используем предпочтения пользователя
    if (!targetLanguage && authReq.user?.id) {
      const user = await User.findById(authReq.user.id) as UserDocument | null;
      if (user?.preferredLanguage) {
        targetLanguage = user.preferredLanguage;
      }
    }
    
    // Если все еще нет языка, используем язык из заголовков
    if (!targetLanguage) {
      targetLanguage = authReq.language || 'en';
    }
    
    const translations: Record<string, string> = {};
    
    // Обрабатываем переводы параллельно
    await Promise.all(
      keys.map(async (key) => {
        try {
          const translation = await i18nService.translate(key, targetLanguage as any);
          translations[key] = translation;
        } catch (err: any) {
          logger.error(`Batch translation error for key ${key}:`, err);
          translations[key] = key; // fallback к ключу
        }
      })
    );
    
    res.json({ 
      language: targetLanguage, 
      translations,
      keys: Object.keys(translations)
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Batch translation failed', details: err.message });
  }
});

// Экспорт переводов для оффлайн режима
router.get('/export/:language', authenticate, async (req: Request, res: Response) => {
  const { language } = req.params;
  const { keys: requestedKeys } = req.query;
  
  if (!aiTranslator.getSupportedLanguages().includes(language as any)) {
    return res.status(400).json({ error: 'Unsupported language' });
  }
  
  try {
    let keysToExport: string[] = [];
    
    // Если указаны конкретные ключи
    if (requestedKeys && typeof requestedKeys === 'string') {
      keysToExport = requestedKeys.split(',');
    } else {
      // Экспортируем все доступные переводы для языка
      const translations = await Translation.find({ language }).select('key translation');
      return res.json({
        language,
        translations: translations.reduce((acc, t) => {
          acc[t.key] = t.translation;
          return acc;
        }, {} as Record<string, string>),
        version: new Date().toISOString(),
        count: translations.length
      });
    }
    
    // Для конкретных ключей получаем переводы
    const result: Record<string, string> = {};
    for (const key of keysToExport) {
      try {
        const translation = await i18nService.translate(key, language as any);
        result[key] = translation;
      } catch (err: any) {
        logger.error(`Export translation error for key ${key}:`, err);
        result[key] = key; // fallback
      }
    }
    
    res.json({
      language,
      translations: result,
      version: new Date().toISOString(),
      count: Object.keys(result).length
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

// Предзагрузить переводы (оптимизация)
router.post('/preload', authenticate, async (req: Request, res: Response) => {
  const { language, keys } = req.body;
  
  if (!language || !Array.isArray(keys)) {
    return res.status(400).json({ error: 'Language and keys array required' });
  }
  
  try {
    await i18nService.preloadTranslations(language, keys);
    res.json({ message: 'Translations preloaded', language, count: keys.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Preload failed', details: err.message });
  }
});

// Административные функции
router.get('/stats', authenticate, requireAdmin, (req: Request, res: Response) => {
  const stats = i18nService.getCacheStats();
  res.json({ cacheStats: stats });
});

router.delete('/cache/:key', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { key } = req.params;
  const { language } = req.query;
  
  translationCache.invalidate(key, language as string);
  res.json({ message: 'Cache invalidated', key, language });
});

// Аналитика использования переводов
router.get('/analytics', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const analytics = await Translation.aggregate([
      {
        $group: {
          _id: '$language',
          count: { $sum: 1 },
          lastUsed: { $max: '$lastUsed' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const popularKeys = await Translation.aggregate([
      {
        $group: {
          _id: '$key',
          usage: { $sum: 1 },
          languages: { $addToSet: '$language' }
        }
      },
      { $sort: { usage: -1 } },
      { $limit: 10 }
    ]);

    res.json({ 
      languageStats: analytics,
      popularKeys,
      totalTranslations: await Translation.countDocuments()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Analytics failed', details: err.message });
  }
});

export default router;