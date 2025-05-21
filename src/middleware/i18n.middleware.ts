import { Request, Response, NextFunction } from 'express';
import { i18nService } from '@i18n/index';
import { SupportedLanguage } from '@i18n/translator.service';
import { User, UserDocument } from '@models/User';

export interface I18nRequest extends Request {
  language: SupportedLanguage;
  t: (key: string, options?: { context?: string; interpolation?: Record<string, any> }) => Promise<string>;
}

export const i18nMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const i18nReq = req as I18nRequest;
  
  // Определяем язык в следующем порядке приоритета:
  // 1. Query параметр (?lang=ru)
  // 2. Предпочтения пользователя из базы данных
  // 3. Заголовок Accept-Language
  // 4. Дефолтное значение (en)
  
  const queryLang = req.query.lang as string;
  let language: SupportedLanguage = 'en';
  
  // Проверяем query параметр
  if (queryLang && ['en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no'].includes(queryLang)) {
    language = queryLang as SupportedLanguage;
  } else {
    // Если пользователь авторизован, проверяем его предпочтения
    const authReq = req as any;
    if (authReq.user?.id) {
      try {
        const user = await User.findById(authReq.user.id) as UserDocument | null;
        if (user?.preferredLanguage) {
          language = user.preferredLanguage as SupportedLanguage;
        } else {
          // Если у пользователя нет предпочтений, используем Accept-Language
          language = i18nService.getLanguageFromHeader(req.headers['accept-language']);
        }
      } catch (err) {
        // В случае ошибки используем Accept-Language
        language = i18nService.getLanguageFromHeader(req.headers['accept-language']);
      }
    } else {
      // Неавторизованные пользователи - используем Accept-Language
      language = i18nService.getLanguageFromHeader(req.headers['accept-language']);
    }
  }
  
  i18nReq.language = language;
  
  // Добавляем функцию перевода в запрос
  i18nReq.t = async (key: string, options?: { context?: string; interpolation?: Record<string, any> }) => {
    return i18nService.translate(key, language, options);
  };
  
  next();
};