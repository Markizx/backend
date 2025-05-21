/**
 * @swagger
 * tags:
 *   name: I18n
 *   description: API для интернационализации и локализации
 * 
 * components:
 *   schemas:
 *     SupportedLanguage:
 *       type: string
 *       enum:
 *         - en
 *         - ru
 *         - es
 *         - fr
 *         - de
 *         - it
 *         - pt
 *         - ja
 *         - ko
 *         - zh
 *         - ar
 *         - hi
 *         - th
 *         - vi
 *         - tr
 *         - pl
 *         - nl
 *         - sv
 *         - da
 *         - no
 *       description: |
 *         Поддерживаемые языки:
 *         * en - Английский
 *         * ru - Русский
 *         * es - Испанский
 *         * fr - Французский
 *         * de - Немецкий
 *         * it - Итальянский
 *         * pt - Португальский
 *         * ja - Японский
 *         * ko - Корейский
 *         * zh - Китайский
 *         * ar - Арабский
 *         * hi - Хинди
 *         * th - Тайский
 *         * vi - Вьетнамский
 *         * tr - Турецкий
 *         * pl - Польский
 *         * nl - Голландский
 *         * sv - Шведский
 *         * da - Датский
 *         * no - Норвежский
 *     
 *     LanguagesResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             languages:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SupportedLanguage'
 *     
 *     TranslationResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             key:
 *               type: string
 *               description: Ключ перевода
 *             language:
 *               $ref: '#/components/schemas/SupportedLanguage'
 *             translation:
 *               type: string
 *               description: Перевод на указанный язык
 *     
 *     BatchTranslateRequest:
 *       type: object
 *       required:
 *         - keys
 *       properties:
 *         keys:
 *           type: array
 *           items:
 *             type: string
 *           description: Массив ключей для перевода
 *         language:
 *           $ref: '#/components/schemas/SupportedLanguage'
 *           description: Целевой язык (опционально, если не указан, используется язык пользователя)
 *     
 *     BatchTranslateResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             language:
 *               $ref: '#/components/schemas/SupportedLanguage'
 *             translations:
 *               type: object
 *               additionalProperties:
 *                 type: string
 *               description: Объект с переводами (ключ -> перевод)
 *             keys:
 *               type: array
 *               items:
 *                 type: string
 *               description: Массив переведенных ключей
 *     
 *     ExportResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             language:
 *               $ref: '#/components/schemas/SupportedLanguage'
 *             translations:
 *               type: object
 *               additionalProperties:
 *                 type: string
 *               description: Объект с переводами (ключ -> перевод)
 *             version:
 *               type: string
 *               format: date-time
 *               description: Версия экспорта (дата/время)
 *             count:
 *               type: integer
 *               description: Количество переводов
 *     
 *     CacheStats:
 *       type: object
 *       properties:
 *         hits:
 *           type: integer
 *           description: Количество успешных обращений к кэшу
 *         misses:
 *           type: integer
 *           description: Количество промахов кэша
 *         keys:
 *           type: integer
 *           description: Количество ключей в кэше
 *         ksize:
 *           type: integer
 *           description: Размер ключей в байтах
 *         vsize:
 *           type: integer
 *           description: Размер значений в байтах
 *     
 *     I18nAnalytics:
 *       type: object
 *       properties:
 *         languageStats:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 $ref: '#/components/schemas/SupportedLanguage'
 *               count:
 *                 type: integer
 *                 description: Количество переводов
 *               lastUsed:
 *                 type: string
 *                 format: date-time
 *                 description: Последнее использование
 *         popularKeys:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 type: string
 *                 description: Ключ перевода
 *               usage:
 *                 type: integer
 *                 description: Количество использований
 *               languages:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/SupportedLanguage'
 *                 description: Языки, на которые переведен ключ
 *         totalTranslations:
 *           type: integer
 *           description: Общее количество переводов
 */

/**
 * @swagger
 * /api/i18n/languages:
 *   get:
 *     summary: Получить поддерживаемые языки
 *     description: Возвращает список всех поддерживаемых языков в системе
 *     tags: [I18n]
 *     responses:
 *       200:
 *         description: Список поддерживаемых языков
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LanguagesResponse'
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/i18n/translate/{key}:
 *   get:
 *     summary: Получить перевод для ключа
 *     description: Возвращает перевод для указанного ключа на нужный язык
 *     tags: [I18n]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         schema:
 *           type: string
 *         required: true
 *         description: Ключ перевода
 *       - in: query
 *         name: lang
 *         schema:
 *           $ref: '#/components/schemas/SupportedLanguage'
 *         required: false
 *         description: Целевой язык (если не указан, используется язык пользователя)
 *       - in: query
 *         name: context
 *         schema:
 *           type: string
 *         required: false
 *         description: Контекст для перевода
 *     responses:
 *       200:
 *         description: Перевод для указанного ключа
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TranslationResponse'
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/i18n/batch-translate:
 *   post:
 *     summary: Пакетный перевод ключей
 *     description: Возвращает переводы для нескольких ключей одновременно
 *     tags: [I18n]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BatchTranslateRequest'
 *     responses:
 *       200:
 *         description: Переводы для указанных ключей
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchTranslateResponse'
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/i18n/export/{language}:
 *   get:
 *     summary: Экспорт переводов для языка
 *     description: Возвращает все переводы для указанного языка
 *     tags: [I18n]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: language
 *         schema:
 *           $ref: '#/components/schemas/SupportedLanguage'
 *         required: true
 *         description: Язык для экспорта
 *       - in: query
 *         name: keys
 *         schema:
 *           type: string
 *         required: false
 *         description: Comma-separated список ключей для экспорта (если не указан, экспортируются все)
 *     responses:
 *       200:
 *         description: Экспорт переводов
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExportResponse'
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/i18n/preload:
 *   post:
 *     summary: Предзагрузка переводов
 *     description: Предзагружает переводы в кэш для быстрого доступа
 *     tags: [I18n]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - language
 *               - keys
 *             properties:
 *               language:
 *                 $ref: '#/components/schemas/SupportedLanguage'
 *               keys:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Переводы успешно предзагружены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     language:
 *                       $ref: '#/components/schemas/SupportedLanguage'
 *                     count:
 *                       type: integer
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/i18n/stats:
 *   get:
 *     summary: Статистика кэша переводов
 *     description: Возвращает статистику использования кэша переводов
 *     tags: [I18n]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Статистика кэша
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     cacheStats:
 *                       $ref: '#/components/schemas/CacheStats'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/i18n/cache/{key}:
 *   delete:
 *     summary: Инвалидация кэша для ключа
 *     description: Удаляет кэш для указанного ключа
 *     tags: [I18n]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         schema:
 *           type: string
 *         required: true
 *         description: Ключ перевода
 *       - in: query
 *         name: language
 *         schema:
 *           $ref: '#/components/schemas/SupportedLanguage'
 *         required: false
 *         description: Язык (если не указан, инвалидируются все языки для ключа)
 *     responses:
 *       200:
 *         description: Кэш успешно инвалидирован
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     key:
 *                       type: string
 *                     language:
 *                       $ref: '#/components/schemas/SupportedLanguage'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/i18n/analytics:
 *   get:
 *     summary: Аналитика использования переводов
 *     description: Возвращает статистику использования переводов
 *     tags: [I18n]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Аналитика переводов
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/I18nAnalytics'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 */