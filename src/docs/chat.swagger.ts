/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: API для работы с чатами и сообщениями
 * 
 * components:
 *   schemas:
 *     Chat:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID чата
 *         user:
 *           type: string
 *           description: ID пользователя, которому принадлежит чат
 *         title:
 *           type: string
 *           description: Заголовок чата
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата создания
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Дата обновления
 *     
 *     Message:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID сообщения
 *         chat:
 *           type: string
 *           description: ID чата, к которому относится сообщение
 *         content:
 *           type: string
 *           description: Содержимое сообщения
 *         role:
 *           type: string
 *           enum: [user, assistant]
 *           description: Роль отправителя
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Метка времени
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата создания
 *     
 *     ChatHistory:
 *       type: object
 *       properties:
 *         chat:
 *           $ref: '#/components/schemas/Chat'
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Message'
 *     
 *     MessageRequest:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: Содержимое сообщения
 *     
 *     MessageResponse:
 *       type: object
 *       properties:
 *         userMessage:
 *           $ref: '#/components/schemas/Message'
 *         assistantMessage:
 *           $ref: '#/components/schemas/Message'
 *     
 *     TitleUpdateRequest:
 *       type: object
 *       required:
 *         - title
 *       properties:
 *         title:
 *           type: string
 *           description: Новый заголовок чата
 *     
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
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
 * /api/chat:
 *   post:
 *     summary: Создание нового чата
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Заголовок чата
 *     responses:
 *       201:
 *         description: Чат успешно создан
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
 *                     chat:
 *                       $ref: '#/components/schemas/Chat'
 *                 message:
 *                   type: string
 *                   example: Чат успешно создан
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Нет доступа или превышены лимиты
 *       500:
 *         description: Внутренняя ошибка сервера
 *   
 *   get:
 *     summary: Получение всех чатов пользователя
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список чатов
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
 *                     chats:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Chat'
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Нет доступа
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/chat/{id}:
 *   get:
 *     summary: Получение истории конкретного чата
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID чата
 *     responses:
 *       200:
 *         description: История чата
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ChatHistory'
 *       400:
 *         description: Некорректный ID
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Нет доступа
 *       404:
 *         description: Чат не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 *   
 *   delete:
 *     summary: Удаление чата
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID чата
 *     responses:
 *       200:
 *         description: Чат успешно удален
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
 *                   example: Чат успешно удален
 *       400:
 *         description: Некорректный ID
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Чат не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/chat/{id}/message:
 *   post:
 *     summary: Отправка сообщения в чат
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID чата
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MessageRequest'
 *     responses:
 *       200:
 *         description: Сообщение отправлено и получен ответ AI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *                 message:
 *                   type: string
 *                   example: Сообщение отправлено
 *       400:
 *         description: Некорректный ID или сообщение
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Нет доступа или превышены лимиты
 *       404:
 *         description: Чат не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 *       504:
 *         description: Превышено время ожидания от AI
 * 
 * /api/chat/{id}/title:
 *   patch:
 *     summary: Обновление заголовка чата
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID чата
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TitleUpdateRequest'
 *     responses:
 *       200:
 *         description: Заголовок успешно обновлен
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
 *                     chat:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                 message:
 *                   type: string
 *                   example: Заголовок чата обновлен
 *       400:
 *         description: Некорректный ID или заголовок
 *       401:
 *         description: Неавторизован
 *       404:
 *         description: Чат не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 */