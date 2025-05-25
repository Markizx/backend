import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry, retryConditions } from '@utils/retry';
import { circuitBreakerManager } from '@utils/circuit-breaker';
import { GrokService } from './ai/grok.service';
import { OpenAIService } from './ai/openai.service';
import { recordExternalApiMetric } from '@middleware/metrics.middleware';

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
    
    // Фильтруем и проверяем сообщения
    const validMessages = messages.filter(msg => {
      return msg && 
             msg.content && 
             typeof msg.content === 'string' && 
             msg.content.trim().length > 0 &&
             msg.role && 
             ['user', 'assistant', 'system'].includes(msg.role);
    });
    
    // Логируем для отладки
    enhancedLogger.debug('Проверка сообщений перед отправкой:', {
      originalCount: messages.length,
      validCount: validMessages.length,
      messages: validMessages.map(m => ({ 
        role: m.role, 
        contentLength: m.content.length,
        contentPreview: m.content.substring(0, 50) 
      }))
    });
    
    if (validMessages.length === 0) {
      enhancedLogger.error('Нет валидных сообщений после фильтрации');
      throw new Error('Нет валидных сообщений для отправки');
    }
    
    const startTime = Date.now();
    
    try {
      // Используем Circuit Breaker для защиты от каскадных сбоев
      const response = await circuitBreakerManager.execute(
        'grok-chat',
        async () => {
          return withRetry(
            async () => {
              return await GrokService.getChatResponse(validMessages);
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
      
      // Записываем метрику успешного вызова
      const duration = (Date.now() - startTime) / 1000;
      recordExternalApiMetric('grok', 'chat-completion', duration, true);
      
      return response;
    } catch (error: any) {
      // Записываем метрику неудачного вызова
      const duration = (Date.now() - startTime) / 1000;
      recordExternalApiMetric('grok', 'chat-completion', duration, false, error.response?.status);
      
      throw error;
    }
  }
  
  /**
   * Переводит текст с любого языка на английский
   * 
   * @param text исходный текст
   * @returns переведенный текст
   */
  static async translateToEnglish(text: string): Promise<string> {
    const startTime = Date.now();
    
    try {
      const translation = await OpenAIService.translateToEnglish(text);
      
      // Записываем метрику успешного перевода
      const duration = (Date.now() - startTime) / 1000;
      recordExternalApiMetric('openai', 'translation', duration, true);
      
      return translation;
    } catch (error: any) {
      // Записываем метрику неудачного перевода
      const duration = (Date.now() - startTime) / 1000;
      recordExternalApiMetric('openai', 'translation', duration, false, error.response?.status);
      
      enhancedLogger.error(`Ошибка перевода текста в chat.service`, error);
      // В случае ошибки возвращаем оригинальный текст
      return text;
    }
  }
}