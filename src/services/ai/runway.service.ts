import axios from 'axios';
import { getSecrets } from '@utils/getSecrets';
import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry, retryConditions } from '@utils/retry';
import { circuitBreakerManager } from '@utils/circuit-breaker';
import { videoCache } from '@utils/cache.service';
import { measureContentGeneration, measureExternalApi } from '@utils/performance';
import { VideoGenerationResult } from '../../types/generation.types';

/**
 * Сервис-обертка для взаимодействия с Runway API
 */
export class RunwayService {
  /**
   * Получает API ключ Runway из секретов
   * @returns API ключ
   */
  private static async getApiKey(): Promise<string> {
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Secrets not loaded');
    }
    
    const runwayApiKey = secrets.RUNWAY_API_KEY;
    if (!runwayApiKey) {
      throw new Error('RUNWAY_API_KEY не найден в секретах');
    }
    
    return runwayApiKey;
  }

  /**
   * Генерирует видео на основе текстового описания и опционального изображения
   * 
   * @param prompt текстовый запрос
   * @param duration длительность видео в секундах (5 или 10)
   * @param promptImageUrl URL изображения для генерации видео (опционально)
   * @returns результат генерации с URL видео
   */
  static async generateVideo(prompt: string, duration: number = 10, promptImageUrl?: string): Promise<VideoGenerationResult> {
    enhancedLogger.info(`Начало генерации видео с Runway ML, prompt: ${prompt.substring(0, 50)}...`);
    
    // Создаем ключ кэша с учетом всех параметров
    const cacheKey = `runway:${prompt}:${duration}:${promptImageUrl || 'no-image'}`;
    
    return videoCache.getOrFetch(
      cacheKey,
      async () => {
        return circuitBreakerManager.execute(
          'runway-video-generation',
          async () => {
            return measureContentGeneration(
              'video',
              'gen3a_turbo',
              async () => {
                return withRetry(
                  async () => {
                    const runwayApiKey = await this.getApiKey();
                    
                    const requestBody: any = {
                      model: 'gen3a_turbo',
                      ratio: '1280:768',
                      seed: Math.floor(Math.random() * 4294967295),
                      duration: duration, // 5 или 10 секунд
                    };
                    
                    // Добавляем изображение-концепт и промт, если они есть
                    if (promptImageUrl) {
                      requestBody.promptImage = promptImageUrl;
                    }
                    
                    if (prompt) {
                      requestBody.promptText = `${prompt} Create a high-quality cinematic video with professional lighting and smooth motion.`;
                    } else if (promptImageUrl) {
                      requestBody.promptText = "Create a high-quality cinematic video from this image with professional lighting and smooth motion.";
                    }
                    
                    // Отправляем запрос в Runway ML
                    const runwayRes = await measureExternalApi(
                      'runway',
                      'create-video-task',
                      async () => {
                        return axios.post(
                          'https://api.dev.runwayml.com/v1/image_to_video',
                          requestBody,
                          {
                            headers: {
                              Authorization: `Bearer ${runwayApiKey}`,
                              'Content-Type': 'application/json',
                              'X-Runway-Version': '2024-11-06',
                            },
                            timeout: 240000, // 4 минуты
                          }
                        );
                      }
                    );
                    
                    if (runwayRes.status !== 200) {
                      throw new Error(`Ошибка API RunwayML: ${runwayRes.status}: ${JSON.stringify(runwayRes.data)}`);
                    }
                    
                    const taskId = runwayRes.data?.id;
                    if (!taskId) {
                      throw new Error('Runway не вернул taskId');
                    }
                    
                    // Ждем завершения генерации видео
                    const videoUrl = await this.pollTaskStatus(taskId, runwayApiKey);
                    if (!videoUrl) {
                      throw new Error('Runway не завершил задачу вовремя');
                    }
                    
                    return { 
                      videoUrl, 
                      s3Url: '', // s3Url будет добавлен в video.service
                      duration,
                      resolution: '1280x768',
                      quality: 'high-definition'
                    };
                  },
                  {
                    maxRetries: 3,
                    baseDelay: 5000,
                    retryCondition: retryConditions.runway,
                    onRetry: (error, attempt) => {
                      enhancedLogger.warn(`Повтор генерации видео Runway, попытка ${attempt}`, { 
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
            failureThreshold: 2,
            resetTimeout: 120000, // 2 минуты
            fallback: async () => {
              enhancedLogger.error('Circuit breaker открыт для Runway video generation');
              throw new Error('Сервис генерации видео временно недоступен');
            }
          }
        );
      },
      60 * 60 // Кэшируем видео на 1 час
    );
  }
  
  /**
   * Опрашивает статус задачи Runway ML
   * 
   * @param taskId идентификатор задачи
   * @param runwayApiKey ключ API Runway
   * @returns URL результата или null, если задача не завершилась вовремя
   */
  private static async pollTaskStatus(taskId: string, runwayApiKey: string): Promise<string | null> {
    const startTime = Date.now();
    const maxWaitTime = 150000; // 2.5 минуты
    const pollInterval = 5000; // 5 секунд
    
    enhancedLogger.info(`Начало опроса статуса задачи Runway: ${taskId}`);
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const taskRes = await measureExternalApi(
          'runway',
          'check-task-status',
          async () => {
            return axios.get(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
              headers: {
                Authorization: `Bearer ${runwayApiKey}`,
                'X-Runway-Version': '2024-11-06',
              },
              timeout: 10000,
            });
          }
        );
        
        if (taskRes.status === 200) {
          const status = taskRes.data.status;
          enhancedLogger.debug(`Task ${taskId} status: ${status}`, {
            progress: taskRes.data.progress,
            elapsedTime: Date.now() - startTime
          });
          
          if (status === 'SUCCEEDED') {
            enhancedLogger.info(`Задача Runway ${taskId} успешно завершена`);
            return taskRes.data.output && taskRes.data.output.length > 0 ? taskRes.data.output[0] : null;
          }
          
          if (status === 'FAILED') {
            enhancedLogger.error(`Задача Runway ${taskId} завершилась с ошибкой`, {
              error: taskRes.data.error,
              details: taskRes.data
            });
            throw new Error(`Task ${taskId} failed: ${JSON.stringify(taskRes.data)}`);
          }
        }
      } catch (taskErr: any) {
        if (taskErr.message?.includes('failed')) {
          throw taskErr; // Пробрасываем ошибки о неудачной задаче
        }
        enhancedLogger.warn(`Ошибка проверки статуса задачи RunwayML: ${taskErr.message}`);
      }
      
      // Ждем перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    enhancedLogger.error(`Таймаут ожидания завершения задачи Runway: ${taskId}`, {
      elapsedTime: Date.now() - startTime
    });
    return null;
  }
}