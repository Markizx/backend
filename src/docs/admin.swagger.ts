/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: API для административных функций
 * 
 * components:
 *   schemas:
 *     AdminUser:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID пользователя
 *         email:
 *           type: string
 *           format: email
 *           description: Email пользователя
 *         name:
 *           type: string
 *           description: Имя пользователя
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *           description: Роли пользователя
 *         isActive:
 *           type: boolean
 *           description: Активен ли пользователь
 *         emailVerified:
 *           type: boolean
 *           description: Подтвержден ли email
 *         isSubscribed:
 *           type: boolean
 *           description: Наличие активной подписки
 *         subscriptionPlan:
 *           type: string
 *           enum: [basic, plus, pro]
 *           description: План подписки
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата регистрации
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Дата обновления
 *     
 *     GlobalConfig:
 *       type: object
 *       properties:
 *         subscriptionEnabled:
 *           type: boolean
 *           description: Включены ли подписки
 *         authenticationEnabled:
 *           type: boolean
 *           description: Включена ли аутентификация
 *         maintenanceMode:
 *           type: boolean
 *           description: Режим обслуживания
 *         maxFileSize:
 *           type: integer
 *           description: Максимальный размер файла в байтах
 *         maxFileCount:
 *           type: integer
 *           description: Максимальное количество файлов
 *         sessionTimeout:
 *           type: integer
 *           description: Время жизни сессии в минутах
 *         apiRateLimit:
 *           type: object
 *           properties:
 *             windowMs:
 *               type: integer
 *               description: Окно времени в мс
 *             maxRequests:
 *               type: integer
 *               description: Максимальное количество запросов
 *             enabled:
 *               type: boolean
 *               description: Включено ли ограничение
 *         i18nSettings:
 *           type: object
 *           properties:
 *             defaultLanguage:
 *               type: string
 *               description: Язык по умолчанию
 *             enabledLanguages:
 *               type: array
 *               items:
 *                 type: string
 *               description: Включенные языки
 *             cacheEnabled:
 *               type: boolean
 *               description: Включен ли кэш переводов
 *             fallbackToEnglish:
 *               type: boolean
 *               description: Использовать английский как запасной язык
 *         notifications:
 *           type: object
 *           properties:
 *             errorReporting:
 *               type: boolean
 *               description: Включены ли уведомления об ошибках
 *             newUserRegistration:
 *               type: boolean
 *               description: Включены ли уведомления о регистрации
 *             subscriptionEvents:
 *               type: boolean
 *               description: Включены ли уведомления о подписках
 *             systemAlerts:
 *               type: boolean
 *               description: Включены ли системные уведомления
 *         version:
 *           type: integer
 *           description: Версия конфигурации
 *         lastModifiedBy:
 *           type: string
 *           description: ID администратора, последним изменившего конфигурацию
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Дата обновления
 *     
 *     UsersPagination:
 *       type: object
 *       properties:
 *         current:
 *           type: integer
 *           description: Текущая страница
 *         pages:
 *           type: integer
 *           description: Общее количество страниц
 *         total:
 *           type: integer
 *           description: Общее количество пользователей
 *         limit:
 *           type: integer
 *           description: Количество пользователей на странице
 *     
 *     SystemInfo:
 *       type: object
 *       properties:
 *         system:
 *           type: object
 *           properties:
 *             nodeVersion:
 *               type: string
 *               description: Версия Node.js
 *             platform:
 *               type: string
 *               description: Платформа
 *             arch:
 *               type: string
 *               description: Архитектура
 *             uptime:
 *               type: number
 *               description: Время работы сервера в секундах
 *             memoryUsage:
 *               type: object
 *               description: Использование памяти
 *         database:
 *           type: object
 *           properties:
 *             totalUsers:
 *               type: integer
 *               description: Общее количество пользователей
 *             totalSubscriptions:
 *               type: integer
 *               description: Количество активных подписок
 *             totalFilesGenerated:
 *               type: integer
 *               description: Количество сгенерированных файлов
 *             totalChats:
 *               type: integer
 *               description: Общее количество чатов
 *             totalTickets:
 *               type: integer
 *               description: Общее количество тикетов
 *         config:
 *           type: object
 *           properties:
 *             subscriptionEnabled:
 *               type: boolean
 *               description: Включены ли подписки
 *             authenticationEnabled:
 *               type: boolean
 *               description: Включена ли аутентификация
 *             maintenanceMode:
 *               type: boolean
 *               description: Режим обслуживания
 *             version:
 *               type: integer
 *               description: Версия конфигурации
 *         secrets:
 *           type: object
 *           properties:
 *             cached:
 *               type: boolean
 *               description: Наличие кэшированных секретов
 *             age:
 *               type: integer
 *               nullable: true
 *               description: Возраст кэша в мс
 *             keys:
 *               type: array
 *               items:
 *                 type: string
 *               description: Список ключей в кэше
 *             autoRefreshActive:
 *               type: boolean
 *               description: Активен ли автообновление кэша
 *     
 *     AnalyticsOverview:
 *       type: object
 *       properties:
 *         overview:
 *           type: object
 *           properties:
 *             totalUsers:
 *               type: integer
 *               description: Общее количество пользователей
 *             activeSubscriptions:
 *               type: integer
 *               description: Количество активных подписок
 *             totalRevenue:
 *               type: number
 *               description: Общий доход
 *             newRegistrations:
 *               type: integer
 *               description: Количество новых регистраций
 *             conversionRate:
 *               type: number
 *               description: Конверсия (%)
 *         planStats:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 type: string
 *                 description: Название плана
 *               count:
 *                 type: integer
 *                 description: Количество пользователей
 *               active:
 *                 type: integer
 *                 description: Количество активных подписок
 *         subscriptionStats:
 *           type: array
 *           items:
 *             type: object
 *             description: Статистика по подпискам
 *         generationStats:
 *           type: array
 *           items:
 *             type: object
 *             description: Статистика по генерации контента
 *         userStats:
 *           type: array
 *           items:
 *             type: object
 *             description: Статистика по пользователям
 *         recentErrors:
 *           type: array
 *           items:
 *             type: object
 *             description: Недавние ошибки
 *         period:
 *           type: object
 *           properties:
 *             start:
 *               type: string
 *               format: date-time
 *               description: Начало периода
 *             end:
 *               type: string
 *               format: date-time
 *               description: Конец периода
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Получение списка пользователей
 *     description: Возвращает список пользователей с пагинацией, фильтрацией и сортировкой
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Строка поиска (имя или email)
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Фильтр по активным/заблокированным пользователям
 *       - in: query
 *         name: emailVerified
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Фильтр по подтвержденным email
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Количество пользователей на странице
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: 'createdAt'
 *         description: Поле для сортировки
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: ['asc', 'desc']
 *           default: 'desc'
 *         description: Направление сортировки
 *     responses:
 *       200:
 *         description: Список пользователей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminUser'
 *                 pagination:
 *                   $ref: '#/components/schemas/UsersPagination'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/users/{id}/block:
 *   post:
 *     summary: Блокировка/разблокировка пользователя
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - block
 *             properties:
 *               block:
 *                 type: boolean
 *                 description: true - блокировать, false - разблокировать
 *     responses:
 *       200:
 *         description: Пользователь заблокирован/разблокирован
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/users/{id}/change-password:
 *   post:
 *     summary: Смена пароля пользователя
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Новый пароль
 *     responses:
 *       200:
 *         description: Пароль изменен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/users/{id}/role:
 *   post:
 *     summary: Изменение роли пользователя
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: Новая роль
 *     responses:
 *       200:
 *         description: Роль изменена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Удаление пользователя
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID пользователя
 *     responses:
 *       200:
 *         description: Пользователь удален
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/users/{id}/subscription:
 *   post:
 *     summary: Управление подпиской пользователя
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isSubscribed
 *             properties:
 *               isSubscribed:
 *                 type: boolean
 *                 description: Активация/деактивация подписки
 *               plan:
 *                 type: string
 *                 enum: [basic, plus, pro]
 *                 description: План подписки
 *               trial:
 *                 type: boolean
 *                 description: Активация пробного периода
 *     responses:
 *       200:
 *         description: Подписка обновлена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/users/{id}/message:
 *   post:
 *     summary: Отправка сообщения пользователю
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: Текст сообщения
 *     responses:
 *       200:
 *         description: Сообщение отправлено
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 ticket:
 *                   type: object
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/config:
 *   get:
 *     summary: Получение глобальной конфигурации
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Глобальная конфигурация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GlobalConfig'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 *   put:
 *     summary: Обновление глобальной конфигурации
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GlobalConfig'
 *     responses:
 *       200:
 *         description: Конфигурация обновлена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 config:
 *                   $ref: '#/components/schemas/GlobalConfig'
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/subscription/toggle:
 *   post:
 *     summary: Включение/отключение системы подписок
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Включить/выключить подписки
 *     responses:
 *       200:
 *         description: Статус подписок изменен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/authentication/toggle:
 *   post:
 *     summary: Включение/отключение системы аутентификации
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Включить/выключить аутентификацию
 *     responses:
 *       200:
 *         description: Статус аутентификации изменен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 warning:
 *                   type: string
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/maintenance:
 *   post:
 *     summary: Включение/отключение режима обслуживания
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Включить/выключить режим обслуживания
 *     responses:
 *       200:
 *         description: Режим обслуживания изменен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/subscription-plans:
 *   get:
 *     summary: Получение планов подписок
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список планов подписок
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SubscriptionPlan'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 *   post:
 *     summary: Создание плана подписки
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionPlan'
 *     responses:
 *       201:
 *         description: План создан
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 plan:
 *                   $ref: '#/components/schemas/SubscriptionPlan'
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/system/info:
 *   get:
 *     summary: Получение системной информации
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Системная информация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SystemInfo'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/admin/analytics/overview:
 *   get:
 *     summary: Обзор аналитики
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Начальная дата (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Конечная дата (YYYY-MM-DD)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d]
 *           default: 30d
 *         description: Период для анализа
 *     responses:
 *       200:
 *         description: Обзор аналитики
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsOverview'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 */