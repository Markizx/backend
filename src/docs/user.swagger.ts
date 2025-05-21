/**
 * @swagger
 * tags:
 *   name: User
 *   description: API для работы с профилем пользователя
 * 
 * components:
 *   schemas:
 *     UserProfile:
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
 *         preferredLanguage:
 *           type: string
 *           description: Предпочитаемый язык
 *         isSubscribed:
 *           type: boolean
 *           description: Наличие активной подписки
 *         subscriptionPlan:
 *           type: string
 *           enum: [basic, plus, pro]
 *           description: План подписки
 *         textLimit:
 *           type: integer
 *           description: Лимит генерации текста
 *         imageLimit:
 *           type: integer
 *           description: Лимит генерации изображений
 *         videoLimit:
 *           type: integer
 *           description: Лимит генерации видео
 *         textUsed:
 *           type: integer
 *           description: Использовано генераций текста
 *         imageUsed:
 *           type: integer
 *           description: Использовано генераций изображений
 *         videoUsed:
 *           type: integer
 *           description: Использовано генераций видео
 */

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Получение профиля пользователя
 *     description: Возвращает информацию о текущем авторизованном пользователе
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Профиль пользователя
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
 *                     user:
 *                       $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/user/update-profile:
 *   post:
 *     summary: Обновление профиля пользователя
 *     description: Обновляет информацию о профиле пользователя
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Новое имя пользователя
 *     responses:
 *       200:
 *         description: Профиль успешно обновлен
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
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                 message:
 *                   type: string
 *                   example: Профиль обновлен
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/user/language:
 *   put:
 *     summary: Установка предпочитаемого языка
 *     description: Изменяет предпочитаемый язык пользователя
 *     tags: [User]
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
 *             properties:
 *               language:
 *                 type: string
 *                 description: Код языка (en, ru, es и т.д.)
 *     responses:
 *       200:
 *         description: Язык успешно установлен
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
 *                     language:
 *                       type: string
 *                 message:
 *                   type: string
 *                   example: Язык изменен
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/user/change-email:
 *   post:
 *     summary: Смена email пользователя
 *     description: Изменяет email пользователя и отправляет письмо подтверждения
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
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
 *                 description: Новый email
 *     responses:
 *       200:
 *         description: Email успешно изменен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email изменен, отправлено письмо для подтверждения
 *       400:
 *         description: Ошибка валидации или email уже зарегистрирован
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/user/change-password:
 *   post:
 *     summary: Смена пароля пользователя
 *     description: Изменяет пароль пользователя
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 format: password
 *                 description: Текущий пароль
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Новый пароль
 *     responses:
 *       200:
 *         description: Пароль успешно изменен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Пароль успешно изменен
 *       400:
 *         description: Ошибка валидации или неверный текущий пароль
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/user/subscription/cancel:
 *   post:
 *     summary: Отмена подписки
 *     description: Отменяет текущую подписку пользователя
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Подписка успешно отменена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Подписка отменена
 *       400:
 *         description: Нет активной подписки
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/user/subscription/change:
 *   post:
 *     summary: Изменение плана подписки
 *     description: Изменяет план подписки пользователя
 *     tags: [User]
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
 *                 description: Новый план подписки
 *     responses:
 *       200:
 *         description: План подписки успешно изменен
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
 *                     plan:
 *                       type: string
 *                       enum: [basic, plus, pro]
 *                 message:
 *                   type: string
 *                   example: План подписки изменен
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь или план не найдены
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/user/delete-profile:
 *   delete:
 *     summary: Удаление аккаунта пользователя
 *     description: Удаляет аккаунт текущего пользователя
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Аккаунт успешно удален
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Профиль удален
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Пользователь не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 */