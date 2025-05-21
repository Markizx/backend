/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: API для аутентификации пользователей
 * 
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
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
 *         isSubscribed:
 *           type: boolean
 *           description: Наличие активной подписки
 *         subscriptionPlan:
 *           type: string
 *           enum: [basic, plus, pro]
 *           description: План подписки
 *         preferredLanguage:
 *           type: string
 *           description: Предпочитаемый язык
 *         textLimit:
 *           type: integer
 *           description: Лимит генерации текста
 *         imageLimit:
 *           type: integer
 *           description: Лимит генерации изображений
 *         videoLimit:
 *           type: integer
 *           description: Лимит генерации видео
 *         chatLimit:
 *           type: integer
 *           description: Лимит сообщений в чате
 *         textUsed:
 *           type: integer
 *           description: Количество использованных текстовых генераций
 *         imageUsed:
 *           type: integer
 *           description: Количество использованных генераций изображений
 *         videoUsed:
 *           type: integer
 *           description: Количество использованных генераций видео
 *         chatUsed:
 *           type: integer
 *           description: Количество использованных сообщений чата
 *     
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Email пользователя
 *         password:
 *           type: string
 *           format: password
 *           description: Пароль
 *     
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Email пользователя
 *         password:
 *           type: string
 *           format: password
 *           description: Пароль
 *         name:
 *           type: string
 *           description: Имя пользователя
 *     
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             token:
 *               type: string
 *               description: JWT токен
 *             user:
 *               $ref: '#/components/schemas/User'
 *     
 *     MessageResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           nullable: true
 *         message:
 *           type: string
 *           description: Сообщение об успешной операции
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           description: Сообщение об ошибке
 *         details:
 *           type: object
 *           nullable: true
 *           description: Дополнительные детали ошибки
 *         status:
 *           type: integer
 *           description: HTTP статус-код ошибки
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Регистрация нового пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Пользователь успешно зарегистрирован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/auth/login:
 *   post:
 *     summary: Вход в систему
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Успешный вход
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Неверные учетные данные
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Email не подтвержден или аккаунт заблокирован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/auth/confirm/{token}:
 *   get:
 *     summary: Подтверждение email
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Токен подтверждения
 *     responses:
 *       200:
 *         description: Email успешно подтвержден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Недействительный токен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/auth/request-password-reset:
 *   post:
 *     summary: Запрос на сброс пароля
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email пользователя
 *     responses:
 *       200:
 *         description: Инструкции по сбросу пароля отправлены
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Сброс пароля
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Токен сброса пароля
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Новый пароль
 *     responses:
 *       200:
 *         description: Пароль успешно изменен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Недействительный токен или ошибка валидации
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/auth/google:
 *   get:
 *     summary: Аутентификация через Google
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Перенаправление на страницу аутентификации Google
 * 
 * /api/auth/google/callback:
 *   get:
 *     summary: Callback для аутентификации через Google
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Перенаправление на frontend с JWT токеном
 *       401:
 *         description: Ошибка аутентификации
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/auth/logout:
 *   post:
 *     summary: Выход из системы
 *     description: JWT токен удаляется на стороне клиента
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Успешный выход
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */