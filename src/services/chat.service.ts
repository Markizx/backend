import logger from '@utils/logger';
import { GrokService } from './ai/grok.service';
import { OpenAIService } from './ai/openai.service';

/**
 * Сервис для работы с функциями генерации чата
 */
export class ChatService {
  /**
   * Получает ответ от Grok AI
   * 
   * @param messages массив сообщений для контекста
   * @returns ответ от Grok AI
   */
  static async getGrokResponse(messages: Array<{role: string, content: string}>) {
    logger.info(`Отправка запроса в Grok AI`);
    
    // Используем GrokService для получения ответа
    return await GrokService.getChatResponse(messages);
  }
  
  /**
   * Переводит текст с любого языка на английский
   * 
   * @param text исходный текст
   * @returns переведенный текст
   */
  static async translateToEnglish(text: string): Promise<string> {
    try {
      return await OpenAIService.translateToEnglish(text);
    } catch (error: any) {
      logger.error(`Ошибка перевода текста в chat.service: ${error.message}`);
      // В случае ошибки возвращаем оригинальный текст
      return text;
    }
  }
}