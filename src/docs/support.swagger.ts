/**
 * @swagger
 * tags:
 *   name: Support
 *   description: API для работы с тикетами поддержки
 * 
 * components:
 *   schemas:
 *     TicketStatus:
 *       type: string
 *       enum: [open, answered, closed]
 *       description: |
 *         Статус тикета:
 *         * open - Открыт, ожидает ответа
 *         * answered - Отвечен администратором
 *         * closed - Закрыт
 *     
 *     SupportTicket:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID тикета
 *         user:
 *           type: string
 *           description: ID пользователя, создавшего тикет
 *         subject:
 *           type: string
 *           description: Тема тикета
 *         message:
 *           type: string
 *           description: Сообщение пользователя
 *         status:
 *           $ref: '#/components/schemas/TicketStatus'
 *         response:
 *           type: string
 *           description: Ответ администратора
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата создания
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Дата обновления
 *     
 *     CreateTicketRequest:
 *       type: object
 *       required:
 *         - subject
 *         - message
 *       properties:
 *         subject:
 *           type: string
 *           description: Тема тикета
 *           maxLength: 100
 *         message:
 *           type: string
 *           description: Сообщение пользователя
 *           maxLength: 1000
 *     
 *     CreateTicketResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             ticket:
 *               $ref: '#/components/schemas/SupportTicket'
 *         message:
 *           type: string
 *           example: Тикет создан
 *     
 *     RespondTicketRequest:
 *       type: object
 *       required:
 *         - response
 *       properties:
 *         response:
 *           type: string
 *           description: Ответ администратора
 *           maxLength: 1000
 */

/**
 * @swagger
 * /api/support/ticket:
 *   post:
 *     summary: Создание нового тикета поддержки
 *     description: Создает новый тикет поддержки от имени пользователя
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTicketRequest'
 *     responses:
 *       201:
 *         description: Тикет успешно создан
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateTicketResponse'
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/support/tickets:
 *   get:
 *     summary: Получение тикетов пользователя
 *     description: Возвращает список тикетов поддержки текущего пользователя
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список тикетов пользователя
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SupportTicket'
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/support/tickets/all:
 *   get:
 *     summary: Получение всех тикетов (администратор)
 *     description: Возвращает список всех тикетов поддержки (требует прав администратора)
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список всех тикетов
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/SupportTicket'
 *                       - type: object
 *                         properties:
 *                           user:
 *                             type: object
 *                             properties:
 *                               email:
 *                                 type: string
 *                                 format: email
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/support/tickets/{id}/respond:
 *   patch:
 *     summary: Ответ на тикет (администратор)
 *     description: Отправляет ответ администратора на тикет поддержки
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID тикета
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RespondTicketRequest'
 *     responses:
 *       200:
 *         description: Ответ успешно отправлен
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
 *                     ticket:
 *                       $ref: '#/components/schemas/SupportTicket'
 *                 message:
 *                   type: string
 *                   example: Ответ на тикет отправлен
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Недостаточно прав
 *       404:
 *         description: Тикет не найден
 *       500:
 *         description: Внутренняя ошибка сервера
 */