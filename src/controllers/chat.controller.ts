import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { Chat, ChatDocument } from '@models/Chat';
import { Message, MessageDocument } from '@models/Message';
import { User, UserDocument } from '@models/User';
import { asyncHandler } from '@utils/asyncHandler';
import { ApiResponse } from '@utils/response';
import logger from '@utils/logger';
import { ChatService } from '@services/chat.service';

/**
 * Контроллер для работы с чатами
 */
export const ChatController = {
  /**
   * Создание нового чата
   */
  createChatHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & { body: { title?: string } };
    const userId = authReq.user?.id;
    const { title } = authReq.body;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    // Проверка активной подписки
    if (!user.isSubscribed) {
      return ApiResponse.sendError(res, await authReq.t('errors.subscription_required'), null, 403);
    }

    // Ограничение на количество чатов
    const chatCount = await Chat.countDocuments({ user: userId });
    const maxChats = user.subscriptionPlan === 'basic' ? 10 : 
                    user.subscriptionPlan === 'plus' ? 25 : 50;
    
    if (chatCount >= maxChats) {
      return ApiResponse.sendError(res, await authReq.t('limits.max_chats_exceeded', { 
        interpolation: { limit: maxChats } 
      }), null, 403);
    }

    const chat = await Chat.create({
      user: userId,
      title: title || await authReq.t('chat.new_chat'),
    });

    logger.info(`Создан новый чат: ${chat._id} для пользователя ${userId}`);
    return ApiResponse.send(res, { chat }, await authReq.t('success.chat_created'), 201);
  }),

  /**
   * Получение всех чатов пользователя
   */
  getUserChatsHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    if (!user.isSubscribed) {
      return ApiResponse.sendError(res, await authReq.t('errors.subscription_required'), null, 403);
    }

    const chats = await Chat.find({ user: userId })
      .sort({ updatedAt: -1 })
      .select('_id title createdAt updatedAt');

    logger.info(`Получены чаты для пользователя ${userId}: ${chats.length} чатов`);
    return ApiResponse.send(res, { chats });
  }),

  /**
   * Удаление чата и всех его сообщений
   */
  deleteChatHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & { params: { id: string } };
    const userId = authReq.user?.id;
    const { id } = authReq.params;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    const chat = await Chat.findOne({ _id: id, user: userId }) as ChatDocument | null;
    if (!chat) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    // УЛУЧШЕНИЕ: Добавляем транзакцию для атомарного удаления чата и его сообщений
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      // Удаляем все сообщения чата
      await Message.deleteMany({ chat: id }).session(session);
      
      // Удаляем сам чат
      await chat.deleteOne({ session });
      
      await session.commitTransaction();
      
      logger.info(`Удален чат ${id} и его сообщения для пользователя ${userId}`);
      return ApiResponse.send(res, null, await authReq.t('success.chat_deleted'));
    } catch (err: any) {
      await session.abortTransaction();
      logger.error('Ошибка удаления чата:', { error: err.message, stack: err.stack, chatId: id, userId });
      return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), err.message, 500);
    } finally {
      session.endSession();
    }
  }),

  /**
   * Получение истории чата
   */
  getChatHistoryHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & { params: { id: string } };
    const userId = authReq.user?.id;
    const { id } = authReq.params;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    if (!user.isSubscribed) {
      return ApiResponse.sendError(res, await authReq.t('errors.subscription_required'), null, 403);
    }

    const chat = await Chat.findOne({ _id: id, user: userId }) as ChatDocument | null;
    if (!chat) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    const messages = await Message.find({ chat: id })
      .sort({ timestamp: 1 })
      .select('_id content role timestamp createdAt');

    logger.info(`Получена история чата ${id} для пользователя ${userId}: ${messages.length} сообщений`);
    return ApiResponse.send(res, { chat, messages });
  }),

  /**
   * Отправка сообщения в чат
   */
  sendMessageHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & { 
      params: { id: string }, 
      body: { message: string } 
    };
    const userId = authReq.user?.id;
    const { id } = authReq.params;
    const { message } = authReq.body;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return ApiResponse.sendError(res, await authReq.t('chat.message_required'), null, 400);
    }

    if (message.length > 5000) {
      return ApiResponse.sendError(res, await authReq.t('chat.message_too_long'), null, 400);
    }

    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    if (!user.isSubscribed) {
      return ApiResponse.sendError(res, await authReq.t('errors.subscription_required'), null, 403);
    }

    const chat = await Chat.findOne({ _id: id, user: userId }) as ChatDocument | null;
    if (!chat) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    // Проверяем лимиты использования чата
    const messageCount = await Message.countDocuments({ 
      chat: id, 
      role: 'user',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // за последние 24 часа
    });

    const maxMessages = user.subscriptionPlan === 'basic' ? 50 : 
                       user.subscriptionPlan === 'plus' ? 150 : 300;

    if (messageCount >= maxMessages) {
      return ApiResponse.sendError(res, await authReq.t('limits.chat_limit_exceeded', { 
        interpolation: { limit: maxMessages } 
      }), null, 403);
    }

    // УЛУЧШЕНИЕ: Используем транзакцию для атомарной операции
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      // Сохраняем сообщение пользователя
      const userMessage = await Message.create([{
        chat: id,
        content: message.trim(),
        role: 'user',
      }], { session });

      // Увеличиваем счетчик использования чата
      await User.updateOne({ _id: userId }, { $inc: { chatUsed: 1 } }, { session });

      // Получаем последние сообщения для контекста
      const recentMessages = await Message.find({ chat: id })
        .sort({ timestamp: -1 })
        .limit(10)
        .session(session);

      // Переворачиваем массив, чтобы сообщения были в хронологическом порядке
      const chronologicalMessages = recentMessages.reverse();

      // Формируем массив сообщений для Grok API
      const messages = chronologicalMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      logger.info(`Отправка запроса в Grok AI для чата ${id}, пользователь ${userId}`);
      logger.debug('Сообщения для отправки в Grok:', {
        count: messages.length,
        messages: messages.map(m => ({ role: m.role, contentLength: m.content.length }))
      });
      
      try {
        // Используем ChatService для получения ответа от Grok AI
        const aiResponse = await ChatService.getGrokResponse(messages);

        // Сохраняем ответ AI
        const assistantMessage = await Message.create([{
          chat: id,
          content: aiResponse,
          role: 'assistant',
        }], { session });

        // Обновляем время последнего обновления чата
        chat.updatedAt = new Date();
        await chat.save({ session });
        
        await session.commitTransaction();

        logger.info(`Сообщения сохранены для чата ${id}: пользователь ${userMessage[0]._id}, AI ${assistantMessage[0]._id}`);
        
        return ApiResponse.send(res, { 
          userMessage: {
            _id: userMessage[0]._id,
            content: userMessage[0].content,
            role: userMessage[0].role,
            timestamp: userMessage[0].timestamp
          },
          assistantMessage: {
            _id: assistantMessage[0]._id,
            content: assistantMessage[0].content,
            role: assistantMessage[0].role,
            timestamp: assistantMessage[0].timestamp
          }
        }, await authReq.t('success.message_sent'));
      } catch (grokError: any) {
        // В случае ошибки запроса к AI откатываем транзакцию и создаем новую
        await session.abortTransaction();
        session.startTransaction();

        logger.error(`Ошибка запроса к Grok AI: ${grokError.message}`, {
          statusCode: grokError.response?.status,
          responseData: grokError.response?.data,
          chatId: id
        });
        
        // Все равно сохраняем сообщение пользователя
        const savedUserMessage = await Message.create([{
          chat: id,
          content: message.trim(),
          role: 'user',
        }], { session });
        
        // Создаем сообщение с ошибкой
        const errorMessage = await Message.create([{
          chat: id,
          content: "Извините, произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.",
          role: 'assistant',
        }], { session });
        
        // Обновляем счетчик и время чата
        await User.updateOne({ _id: userId }, { $inc: { chatUsed: 1 } }, { session });
        chat.updatedAt = new Date();
        await chat.save({ session });
        
        await session.commitTransaction();
        
        return ApiResponse.sendError(res, await authReq.t('chat.ai_error'), {
          userMessage: {
            _id: savedUserMessage[0]._id,
            content: savedUserMessage[0].content,
            role: savedUserMessage[0].role,
            timestamp: savedUserMessage[0].timestamp
          },
          assistantMessage: {
            _id: errorMessage[0]._id,
            content: errorMessage[0].content,
            role: errorMessage[0].role,
            timestamp: errorMessage[0].timestamp
          }
        }, 500);
      }
    } catch (err: any) {
      await session.abortTransaction();
      
      logger.error('Ошибка отправки сообщения:', { 
        error: err.message, 
        stack: err.stack,
        chatId: id,
        userId
      });

      if (err.response) {
        logger.error('Ошибка Grok API:', { 
          status: err.response.status, 
          data: err.response.data 
        });
      }

      if (err.code === 'ECONNABORTED') {
        return ApiResponse.sendError(res, await authReq.t('chat.ai_timeout'), null, 504);
      }

      return ApiResponse.sendError(res, await authReq.t('chat.ai_error'), err.message, 500);
    } finally {
      session.endSession();
    }
  }),

  /**
   * Обновление заголовка чата
   */
  updateChatTitleHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & { 
      params: { id: string }, 
      body: { title: string } 
    };
    const userId = authReq.user?.id;
    const { id } = authReq.params;
    const { title } = authReq.body;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return ApiResponse.sendError(res, await authReq.t('chat.title_required'), null, 400);
    }

    if (title.length > 100) {
      return ApiResponse.sendError(res, await authReq.t('chat.title_too_long'), null, 400);
    }

    const chat = await Chat.findOne({ _id: id, user: userId }) as ChatDocument | null;
    if (!chat) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    chat.title = title.trim();
    chat.updatedAt = new Date();
    await chat.save();

    logger.info(`Обновлен заголовок чата ${id}: ${title}`);
    return ApiResponse.send(res, { 
      chat: { _id: chat._id, title: chat.title, updatedAt: chat.updatedAt }
    }, await authReq.t('success.chat_title_updated'));
  })
};