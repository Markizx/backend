import { Router, Request, Response } from 'express';
import { authenticate } from '@middleware/auth.middleware';
import { publicRateLimiter } from '@middleware/rate.limiter';
import { validateObjectId } from '@middleware/objectId.middleware';
import { ChatController } from '@controllers/chat.controller';
import logger from '@utils/logger';

const router = Router();

logger.info('Registering chat routes');

router.use(publicRateLimiter);
router.use(authenticate);

// Создать новый чат
router.post('/', ChatController.createChatHandler);

// Получить все чаты пользователя
router.get('/', ChatController.getUserChatsHandler);

// Получить историю конкретного чата
router.get('/:id', validateObjectId('id'), ChatController.getChatHistoryHandler);

// Отправить сообщение в чат
router.post('/:id/message', validateObjectId('id'), ChatController.sendMessageHandler);

// Обновить заголовок чата
router.patch('/:id/title', validateObjectId('id'), ChatController.updateChatTitleHandler);

// Удалить чат
router.delete('/:id', validateObjectId('id'), ChatController.deleteChatHandler);

export default router;