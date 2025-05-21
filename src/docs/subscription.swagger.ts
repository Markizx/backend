/**
 * @swagger
 * tags:
 *   name: Subscription
 *   description: API для работы с подписками пользователей
 * 
 * components:
 *   schemas:
 *     SubscriptionPlan:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           enum: [basic, plus, pro]
 *           description: Имя плана подписки
 *         price:
 *           type: number
 *           format: float
 *           description: Цена подписки в USD
 *         textLimit:
 *           type: integer
 *           description: Лимит на генерацию текста
 *         imageLimit:
 *           type: integer
 *           description: Лимит на генерацию изображений
 *         videoLimit:
 *           type: integer
 *           description: Лимит на генерацию видео
 *         chatLimit:
 *           type: integer
 *           description: Лимит на сообщения в чате (в день)
 *         maxChats:
 *           type: integer
 *           description: Максимальное количество чатов
 *         trialDays:
 *           type: integer
 *           description: Количество дней пробного периода
 *         stripePriceId:
 *           type: string
 *           description: ID цены в Stripe
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата создания плана
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Дата последнего обновления плана
 *     
 *     SubscriptionStatus:
 *       type: object
 *       properties:
 *         isSubscribed:
 *           type: boolean
 *           description: Активирована ли подписка
 *         plan:
 *           type: string
 *           enum: [basic, plus, pro, unlimited]
 *           description: Текущий план подписки
 *         trialEnd:
 *           type: string
 *           format: date-time
 *           description: Дата окончания пробного периода
 *         subscriptionEnd:
 *           type: string
 *           format: date-time
 *           description: Дата окончания подписки
 *         textLimit:
 *           type: integer
 *           description: Лимит на генерацию текста
 *         imageLimit:
 *           type: integer
 *           description: Лимит на генерацию изображений
 *         videoLimit:
 *           type: integer
 *           description: Лимит на генерацию видео
 *         chatLimit:
 *           type: integer
 *           description: Лимит на сообщения в чате (в день)
 *         maxChats:
 *           type: integer
 *           description: Максимальное количество чатов
 *         textUsed:
 *           type: integer
 *           description: Использовано генераций текста
 *         imageUsed:
 *           type: integer
 *           description: Использовано генераций изображений
 *         videoUsed:
 *           type: integer
 *           description: Использовано генераций видео
 *         chatUsed:
 *           type: integer
 *           description: Использовано сообщений в чате
 *         trialUsed:
 *           type: boolean
 *           description: Был ли использован пробный период
 *         note:
 *           type: string
 *           description: Дополнительная информация о подписке
 */

/**
 * @swagger
 * /api/subscription/checkout:
 *   post:
 *     summary: Создание сессии оформления подписки
 *     description: Создает сессию Stripe для оформления подписки
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [basic, plus, pro]
 *                 description: План подписки
 *     responses:
 *       200:
 *         description: Сессия успешно создана
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
 *                     url:
 *                       type: string
 *                       description: URL для перехода на страницу оплаты
 *                     sessionId:
 *                       type: string
 *                       description: ID сессии Stripe
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Подписки отключены
 *       404:
 *         description: План не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/subscription/status:
 *   get:
 *     summary: Проверка статуса подписки
 *     description: Возвращает текущий статус подписки пользователя
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Текущий статус подписки
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SubscriptionStatus'
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/subscription/webhook:
 *   post:
 *     summary: Webhook для Stripe
 *     description: Обрабатывает события от Stripe (checkout.session.completed, customer.subscription.created и т.д.)
 *     tags: [Subscription]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Событие успешно обработано
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
 *                     received:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Ошибка подписи вебхука
 *       500:
 *         description: Внутренняя ошибка сервера
 */