import { CronJob } from 'cron';
import { GeneratedFile } from '@models/GeneratedFile';
import { Chat } from '@models/Chat';
import { Message } from '@models/Message';
import { S3Service } from '@services/aws.service';
import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry } from '@utils/retry';

export const cleanupOldFiles = new CronJob('0 0 * * *', async () => {
  const startTime = Date.now();
  
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldFiles = await GeneratedFile.find({
      createdAt: { $lt: sevenDaysAgo },
    });

    let deletedCount = 0;
    let errorCount = 0;

    for (const file of oldFiles) {
      try {
        const filename = file.s3Url.split('/').pop();
        if (filename) {
          // Удаляем из S3 с retry
          await withRetry(
            async () => {
              await S3Service.deleteFile(filename);
            },
            {
              maxRetries: 2,
              retryCondition: (error) => {
                // Повторяем только при временных ошибках
                return error.code === 'RequestTimeout' || 
                       error.code === 'ServiceUnavailable';
              }
            }
          );
          
          await file.deleteOne();
          deletedCount++;
          enhancedLogger.info(`Удалён старый файл: ${file.s3Url}`);
        }
      } catch (err: any) {
        errorCount++;
        enhancedLogger.error(`Ошибка удаления файла ${file.s3Url}:`, err);
      }
    }
    
    // Логируем статистику
    enhancedLogger.info('Очистка старых файлов завершена', {
      totalFiles: oldFiles.length,
      deletedCount,
      errorCount,
      duration: Date.now() - startTime
    });
  } catch (err: any) {
    enhancedLogger.error('Ошибка очистки старых файлов:', err);
  }
});

// Очистка старых чатов (перенесено из chat.cleanup.service.ts)
export const cleanupOldChats = new CronJob('0 2 * * *', async () => {
  const startTime = Date.now();
  
  try {
    // Удаляем чаты старше 30 дней
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const oldChats = await Chat.find({
      updatedAt: { $lt: thirtyDaysAgo },
    });

    enhancedLogger.info(`Найдено ${oldChats.length} старых чатов для удаления`);

    let deletedChats = 0;
    let deletedMessages = 0;
    let errorCount = 0;

    for (const chat of oldChats) {
      try {
        // Удаляем все сообщения чата
        const deleteResult = await Message.deleteMany({ chat: chat._id });
        deletedMessages += deleteResult.deletedCount || 0;
        
        // Удаляем сам чат
        await chat.deleteOne();
        deletedChats++;
        
        enhancedLogger.debug(`Удален старый чат ${chat._id} с его сообщениями`);
      } catch (err: any) {
        errorCount++;
        enhancedLogger.error(`Ошибка удаления чата ${chat._id}:`, err);
      }
    }
    
    // Логируем статистику
    enhancedLogger.info('Очистка старых чатов завершена', {
      totalChats: oldChats.length,
      deletedChats,
      deletedMessages,
      errorCount,
      duration: Date.now() - startTime
    });
  } catch (err: any) {
    enhancedLogger.error('Ошибка очистки старых чатов:', err);
  }
});