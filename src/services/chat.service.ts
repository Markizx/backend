import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry, retryConditions } from '@utils/retry';
import { circuitBreakerManager } from '@utils/circuit-breaker';
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
    enhancedLogger.info(`Отправка запроса в Grok AI`);
    
    // Используем Circuit Breaker для защиты от каскадных сбоев
    return circuitBreakerManager.execute(
      'grok-chat',
      async () => {
        return withRetry(
          async () => {
            return await GrokService.getChatResponse(messages);
          },
          {
            maxRetries: 3,
            baseDelay: 1000,
            retryCondition: (error) => {
              // Повторяем при сетевых ошибках и временных сбоях
              if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                return true;
              }
              if (error.response?.status >= 500) {
                return true;
              }
              return false;
            },
            onRetry: (error, attempt) => {
              enhancedLogger.warn(`Повтор запроса к Grok AI, попытка ${attempt}`, { 
                error: error.message,
                status: error.response?.status 
              });
            }
          }
        );
      },
      {
        failureThreshold: 5,
        resetTimeout: 60000, // 1 минута
        fallback: async () => {
          enhancedLogger.error('Circuit breaker открыт для Grok AI, используем fallback');
          return "Извините, сервис временно недоступен. Пожалуйста, попробуйте позже.";
        }
      }
    );
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
      enhancedLogger.error(`Ошибка перевода текста в chat.service`, error);
      // В случае ошибки возвращаем оригинальный текст
      return text;
    }
  }
}