import axios from 'axios';
import { getSecrets } from '@utils/getSecrets';
import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry, retryConditions } from '@utils/retry';
import { circuitBreakerManager } from '@utils/circuit-breaker';
import { imageCache, textCache } from '@utils/cache.service';
import { measureContentGeneration, measureExternalApi } from '@utils/performance';
import { ImageGenerationResult } from '../../types/generation.types';

/**
 * Сервис-обертка для взаимодействия с Grok AI (X.AI) API
 */
export class GrokService {
  /**
   * Получает API ключ Grok из секретов
   * @returns API ключ
   */
  private static async getApiKey(): Promise<string> {
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Secrets not loaded');
    }
    
    const grokApiKey = secrets.GROK_API_KEY || secrets.XAI_API_KEY;
    if (!grokApiKey) {
      throw new Error('GROK_API_KEY или XAI_API_KEY не найден в секретах');
    }
    
    return grokApiKey;
  }

  /**
   * Генерирует изображение с помощью Grok AI
   * 
   * @param prompt текстовый запрос
   * @returns результат генерации с URL изображения
   */
  static async generateImage(prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Использование Grok для генерации изображения Pro`);
    
    const cacheKey = `grok-image:${prompt}`;
    
    return imageCache.getOrFetch(
      cacheKey,
      async () => {
        return circuitBreakerManager.execute(
          'grok-image-generation',
          async () => {
            return measureContentGeneration(
              'image',
              'grok-2-image',
              async () => {
                return withRetry(
                  async () => {
                    const grokApiKey = await this.getApiKey();
                    
                    // Делаем запрос к API X.AI для генерации изображения
                    const grokResponse = await axios.post(
                      'https://api.x.ai/v1/images/generations',
                      {
                        prompt: prompt,
                        model: 'grok-2-image',
                        response_format: 'url',
                        n: 1
                      },
                      {
                        headers: {
                          'Authorization': `Bearer ${grokApiKey}`,
                          'Content-Type': 'application/json'
                        },
                        timeout: 60000 // 60 секунд для генерации изображения
                      }
                    );
                    
                    if (!grokResponse.data?.data?.[0]?.url) {
                      throw new Error('Grok API не вернул URL изображения');
                    }
                    
                    const imageUrl = grokResponse.data.data[0].url;
                    
                    // Логируем полученный промпт (если есть)
                    if (grokResponse.data.data[0].revised_prompt) {
                      enhancedLogger.info(`Grok переработал промпт: ${grokResponse.data.data[0].revised_prompt.substring(0, 100)}`);
                    }
                    
                    return { imageUrl, s3Url: '', generator: 'grok-2-image', quality: 'hd' };
                  },
                  {
                    maxRetries: 3,
                    baseDelay: 2000,
                    retryCondition: (error) => {
                      // Специфичные условия retry для Grok
                      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                        return true;
                      }
                      if (error.response?.status === 429) { // Rate limit
                        return true;
                      }
                      if (error.response?.status >= 500) { // Server errors
                        return true;
                      }
                      return false;
                    },
                    onRetry: (error, attempt) => {
                      enhancedLogger.warn(`Повтор генерации изображения Grok, попытка ${attempt}`, { 
                        error: error.message,
                        status: error.response?.status 
                      });
                    }
                  }
                );
              }
            );
          },
          {
            failureThreshold: 3,
            resetTimeout: 60000,
            fallback: async () => {
              enhancedLogger.error('Circuit breaker открыт для Grok image generation');
              throw new Error('Сервис генерации изображений Grok временно недоступен');
            }
          }
        );
      },
      30 * 60 // Кэшируем на 30 минут
    );
  }

  /**
   * Получает ответ от Grok AI для чата
   * 
   * @param messages массив сообщений для контекста
   * @returns ответ от Grok AI
   */
  static async getChatResponse(messages: Array<{role: string, content: string}>): Promise<string> {
    enhancedLogger.info(`Отправка запроса в Grok AI для чата`);
    
    // Для чата не используем кэш, так как контекст уникален
    return circuitBreakerManager.execute(
      'grok-chat',
      async () => {
        return measureExternalApi(
          'grok',
          'chat-completion',
          async () => {
            return withRetry(
              async () => {
                const grokApiKey = await this.getApiKey();
                
                const grokResponse = await axios.post('https://api.x.ai/v1/chat/completions', {
                  messages,
                  model: 'grok-3-beta',
                  max_tokens: 2000,
                  temperature: 0.7,
                  stream: false
                }, {
                  headers: {
                    'Authorization': `Bearer ${grokApiKey}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 30000
                });

                const aiResponse = grokResponse.data?.choices?.[0]?.message?.content;
                if (!aiResponse) {
                  throw new Error('Grok AI не вернул ответ');
                }
                
                return aiResponse;
              },
              {
                maxRetries: 3,
                baseDelay: 1000,
                retryCondition: (error) => {
                  // Специфичные условия retry для Grok chat
                  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    return true;
                  }
                  if (error.response?.status === 429) { // Rate limit
                    enhancedLogger.warn('Grok API rate limit достигнут', {
                      retryAfter: error.response?.headers?.['retry-after']
                    });
                    return true;
                  }
                  if (error.response?.status >= 500) { // Server errors
                    return true;
                  }
                  // Не повторяем при ошибках клиента (4xx кроме 429)
                  if (error.response?.status >= 400 && error.response?.status < 500) {
                    return false;
                  }
                  return false;
                },
                onRetry: (error, attempt) => {
                  enhancedLogger.warn(`Повтор запроса к Grok chat, попытка ${attempt}`, { 
                    error: error.message,
                    status: error.response?.status 
                  });
                }
              }
            );
          }
        );
      },
      {
        failureThreshold: 5,
        resetTimeout: 60000,
        fallback: async () => {
          enhancedLogger.error('Circuit breaker открыт для Grok chat');
          return "Извините, сервис временно недоступен. Пожалуйста, попробуйте позже.";
        }
      }
    );
  }
}