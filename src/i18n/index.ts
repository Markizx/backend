import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import { translationCache } from './cache.service';
import { aiTranslator, SupportedLanguage } from './translator.service';
import logger from '@utils/logger';
import path from 'path';

// Базовые переводы (fallback)
const baseTranslations = {
  en: {
    common: {
      error: 'Error',
      success: 'Success',
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
    }
  }
};

class I18nService {
  async initialize() {
    try {
      // Инициализируем AI переводчик
      await aiTranslator.initialize();

      // Инициализируем i18next
      await i18next
        .use(Backend)
        .init({
          lng: 'en', // язык по умолчанию
          fallbackLng: 'en',
          ns: ['common'],
          defaultNS: 'common',
          
          backend: {
            loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json'),
          },
          
          interpolation: {
            escapeValue: false,
          },
          
          // Отключаем автосохранение, мы используем свою систему
          saveMissing: false,
          
          resources: baseTranslations
        });

      logger.info('i18n initialized successfully');
    } catch (err: any) {
      logger.error('i18n initialization failed:', err);
    }
  }

  async translate(key: string, language: SupportedLanguage, options?: { context?: string; interpolation?: Record<string, any> }): Promise<string> {
    try {
      // Проверяем кэш
      const cached = await translationCache.get(key, language);
      if (cached) {
        return this.interpolate(cached, options?.interpolation);
      }

      // Получаем оригинальный текст
      const originalText = i18next.t(key, { lng: 'en' });
      
      // Если оригинальный текст не найден, возвращаем ключ
      if (originalText === key) {
        logger.warn(`Translation key not found: ${key}`);
        return key;
      }

      // Переводим с помощью AI
      const translated = await aiTranslator.translate({
        text: originalText,
        targetLanguage: language,
        sourceLanguage: 'en',
        context: options?.context
      });

      // Сохраняем в кэш
      await translationCache.set(key, language, translated, originalText);
      
      return this.interpolate(translated, options?.interpolation);
    } catch (err: any) {
      logger.error(`Translation error for ${key} -> ${language}:`, err);
      // В случае ошибки возвращаем английскую версию
      return i18next.t(key, { lng: 'en' });
    }
  }

  private interpolate(text: string, values?: Record<string, any>): string {
    if (!values) return text;
    
    return Object.entries(values).reduce((result, [key, value]) => {
      return result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }, text);
  }

  // Предзагрузка популярных переводов
  async preloadTranslations(language: SupportedLanguage, keys: string[]) {
    logger.info(`Preloading translations for ${language}:`, keys);
    const promises = keys.map(key => this.translate(key, language));
    await Promise.allSettled(promises);
  }

  getLanguageFromHeader(acceptLanguage: string | undefined): SupportedLanguage {
    if (!acceptLanguage) return 'en';
    
    // Парсим Accept-Language header
    const languages = acceptLanguage
      .split(',')
      .map(lang => lang.split(';')[0].trim().substring(0, 2))
      .filter(lang => aiTranslator.getSupportedLanguages().includes(lang as SupportedLanguage));
    
    return (languages[0] as SupportedLanguage) || 'en';
  }

  getCacheStats() {
    return translationCache.getCacheStats();
  }
}

export const i18nService = new I18nService();