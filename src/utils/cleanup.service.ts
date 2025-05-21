import { CronJob } from 'cron';
import { GeneratedFile } from '@models/GeneratedFile';
import { Chat } from '@models/Chat';
import { Message } from '@models/Message';
import { S3Service } from '@services/aws.service';
import logger from '@utils/logger';

export const cleanupOldFiles = new CronJob('0 0 * * *', async () => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldFiles = await GeneratedFile.find({
      createdAt: { $lt: sevenDaysAgo },
    });

    for (const file of oldFiles) {
      try {
        const filename = file.s3Url.split('/').pop();
        if (filename) {
          await S3Service.deleteFile(filename);
          await file.deleteOne();
          logger.info(`Удалён старый файл: ${file.s3Url}`);
        }
      } catch (err: any) {
        logger.error(`Ошибка удаления файла ${file.s3Url}:`, { error: err.message, stack: err.stack });
      }
    }
  } catch (err: any) {
    logger.error('Ошибка очистки старых файлов:', { error: err.message, stack: err.stack });
  }
});

// Очистка старых чатов (перенесено из chat.cleanup.service.ts)
export const cleanupOldChats = new CronJob('0 2 * * *', async () => {
  try {
    // Удаляем чаты старше 30 дней
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const oldChats = await Chat.find({
      updatedAt: { $lt: thirtyDaysAgo },
    });

    logger.info(`Найдено ${oldChats.length} старых чатов для удаления`);

    for (const chat of oldChats) {
      try {
        // Удаляем все сообщения чата
        await Message.deleteMany({ chat: chat._id });
        
        // Удаляем сам чат
        await chat.deleteOne();
        
        logger.info(`Удален старый чат ${chat._id} с его сообщениями`);
      } catch (err: any) {
        logger.error(`Ошибка удаления чата ${chat._id}:`, { error: err.message, stack: err.stack });
      }
    }
    
    logger.info('Очистка старых чатов завершена');
  } catch (err: any) {
    logger.error('Ошибка очистки старых чатов:', { error: err.message, stack: err.stack });
  }
});