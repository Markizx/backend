import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';
import logger from '@utils/logger';

/**
 * Интерфейс для опций санитизации
 */
interface SanitizeOptions {
  allowHtml?: boolean;
  maxLength?: number;
  removeSpaces?: boolean;
  toLowerCase?: boolean;
}

/**
 * Класс для санитизации различных типов входных данных
 */
export class Sanitizer {
  /**
   * Санитизация строки
   */
  static sanitizeString(input: string, options: SanitizeOptions = {}): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input.trim();

    // Удаляем HTML теги, если не разрешены
    if (!options.allowHtml) {
      sanitized = this.stripHtml(sanitized);
    } else {
      // Если HTML разрешен, используем DOMPurify
      sanitized = DOMPurify.sanitize(sanitized, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
        ALLOWED_ATTR: ['href', 'target'],
      });
    }

    // Обрезаем по длине
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    // Удаляем лишние пробелы
    if (options.removeSpaces) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }

    // Приводим к нижнему регистру
    if (options.toLowerCase) {
      sanitized = sanitized.toLowerCase();
    }

    // Экранируем специальные символы
    sanitized = this.escapeSpecialChars(sanitized);

    return sanitized;
  }

  /**
   * Санитизация email
   */
  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }

    const normalized = validator.normalizeEmail(email.trim().toLowerCase()) || '';
    
    if (!validator.isEmail(normalized)) {
      logger.warn('Попытка использования невалидного email после санитизации', { 
        original: email,
        normalized 
      });
      return '';
    }

    return normalized;
  }

  /**
   * Санитизация URL
   */
  static sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    const trimmed = url.trim();

    // Проверяем протокол
    if (!trimmed.match(/^https?:\/\//i)) {
      return '';
    }

    // Проверяем валидность URL
    if (!validator.isURL(trimmed, {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
    })) {
      logger.warn('Попытка использования невалидного URL', { url });
      return '';
    }

    // Удаляем потенциально опасные части
    try {
      const urlObj = new URL(trimmed);
      
      // Удаляем credentials
      urlObj.username = '';
      urlObj.password = '';
      
      // Удаляем опасные протоколы
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return '';
      }
      
      return urlObj.toString();
    } catch (error) {
      logger.warn('Ошибка парсинга URL', { url, error });
      return '';
    }
  }

  /**
   * Санитизация имени файла
   */
  static sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return 'file';
    }

    // Удаляем путь, оставляем только имя файла
    const basename = filename.split(/[/\\]/).pop() || 'file';

    // Заменяем опасные символы
    let sanitized = basename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '_')
      .replace(/^\./, '_');

    // Ограничиваем длину
    if (sanitized.length > 255) {
      const ext = sanitized.split('.').pop() || '';
      const name = sanitized.substring(0, 250 - ext.length);
      sanitized = ext ? `${name}.${ext}` : name;
    }

    // Проверяем на пустоту после санитизации
    if (!sanitized || sanitized === '_') {
      sanitized = `file_${Date.now()}`;
    }

    return sanitized;
  }

  /**
   * Санитизация объекта (рекурсивно)
   */
  static sanitizeObject<T extends Record<string, any>>(
    obj: T,
    rules: Record<string, SanitizeOptions> = {}
  ): T {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      const rule = rules[key] || {};

      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value, rule);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item, rule) : item
        );
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value, rules);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as T;
  }

  /**
   * Санитизация SQL-подобных строк (для текстового поиска)
   */
  static sanitizeSearchQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '';
    }

    // Удаляем специальные символы SQL и MongoDB
    return query
      .replace(/[';\\%_\$\{\}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100); // Ограничиваем длину поискового запроса
  }

  /**
   * Удаление HTML тегов
   */
  private static stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
  }

  /**
   * Экранирование специальных символов
   */
  private static escapeSpecialChars(str: string): string {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return str.replace(/[&<>"'/]/g, char => escapeMap[char] || char);
  }

  /**
   * Проверка на наличие SQL инъекций
   */
  static containsSqlInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/i,
      /(--|\||;|\/\*|\*\/)/,
      /(\bOR\b\s*\d+\s*=\s*\d+)/i,
      /(\bAND\b\s*\d+\s*=\s*\d+)/i,
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Проверка на наличие NoSQL инъекций
   */
  static containsNoSqlInjection(input: string): boolean {
    const noSqlPatterns = [
      /\$where/i,
      /\$ne/i,
      /\$gt/i,
      /\$lt/i,
      /\$gte/i,
      /\$lte/i,
      /\$in/i,
      /\$nin/i,
      /\$regex/i,
      /\$exists/i,
      /\$type/i,
      /\$expr/i,
      /\$jsonSchema/i,
      /\$mod/i,
    ];

    return noSqlPatterns.some(pattern => pattern.test(input));
  }
}

/**
 * Middleware для автоматической санитизации входных данных
 */
export const sanitizeMiddleware = (req: any, res: any, next: any) => {
  // Санитизация query параметров
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        req.query[key] = Sanitizer.sanitizeString(value, { maxLength: 1000 });
      }
    }
  }

  // Санитизация body (для определенных полей)
  if (req.body) {
    const sanitizeRules: Record<string, SanitizeOptions> = {
      email: { maxLength: 255, toLowerCase: true },
      name: { maxLength: 100 },
      title: { maxLength: 200 },
      message: { maxLength: 5000, allowHtml: false },
      subject: { maxLength: 200 },
      prompt: { maxLength: 1000 },
    };

    for (const [field, rule] of Object.entries(sanitizeRules)) {
      if (req.body[field] && typeof req.body[field] === 'string') {
        if (field === 'email') {
          req.body[field] = Sanitizer.sanitizeEmail(req.body[field]);
        } else {
          req.body[field] = Sanitizer.sanitizeString(req.body[field], rule);
        }
      }
    }
  }

  next();
};