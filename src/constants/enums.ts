/**
 * Константы для режимов генерации контента
 */
export enum GenerationMode {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  IMAGE_TO_TEXT = 'image-to-text'
}

/**
 * Константы для моделей генерации изображений
 */
export enum ImageModel {
  ART = 'art',        // DALL-E 3 для художественных изображений
  REAL = 'real',      // Stability AI SD3.5 для фотореалистичных изображений
  PRO = 'pro'         // Grok 2 Image Gen для профессиональных изображений
}

/**
 * Константы для типов обработки изображений
 */
export enum ProcessingType {
  INPAINTING = 'inpainting',    // Изменение центральной части изображения
  OUTPAINTING = 'outpainting',  // Расширение границ изображения
  MODIFY = 'modify'             // Модификация всего изображения
}

/**
 * Константы для продолжительности видео (в секундах)
 */
export enum VideoDuration {
  SHORT = '5',     // 5 секунд
  STANDARD = '10'  // 10 секунд
}

/**
 * Константы для типов файлов в системе
 */
export enum FileType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  DESCRIPTION = 'description'
}

/**
 * Константы для ролей пользователей
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

/**
 * Константы для статусов подписки
 */
export enum SubscriptionPlan {
  BASIC = 'basic',
  PLUS = 'plus',
  PRO = 'pro'
}

/**
 * Константы для статусов тикетов поддержки
 */
export enum TicketStatus {
  OPEN = 'open',
  ANSWERED = 'answered',
  CLOSED = 'closed'
}

/**
 * Константы для языков системы
 */
export enum SupportedLanguage {
  EN = 'en',  // Английский
  RU = 'ru',  // Русский
  ES = 'es',  // Испанский
  FR = 'fr',  // Французский
  DE = 'de',  // Немецкий
  IT = 'it',  // Итальянский
  PT = 'pt',  // Португальский
  JA = 'ja',  // Японский
  KO = 'ko',  // Корейский
  ZH = 'zh',  // Китайский
  AR = 'ar',  // Арабский
  HI = 'hi',  // Хинди
  TH = 'th',  // Тайский
  VI = 'vi',  // Вьетнамский
  TR = 'tr',  // Турецкий
  PL = 'pl',  // Польский
  NL = 'nl',  // Голландский
  SV = 'sv',  // Шведский
  DA = 'da',  // Датский
  NO = 'no'   // Норвежский
}

/**
 * Константы для категорий аналитики
 */
export enum AnalyticsCategory {
  USER = 'user',
  SUBSCRIPTION = 'subscription',
  GENERATION = 'generation',
  CHAT = 'chat',
  SUPPORT = 'support',
  SYSTEM = 'system'
}