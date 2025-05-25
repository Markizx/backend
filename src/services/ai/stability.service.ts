import axios from 'axios';
import FormData from 'form-data';
import { getSecrets } from '@utils/getSecrets';
import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry, retryConditions } from '@utils/retry';
import { circuitBreakerManager } from '@utils/circuit-breaker';
import { imageCache } from '@utils/cache.service';
import { measureContentGeneration } from '@utils/performance';
import { ImageGenerationResult } from '../../types/generation.types';

/**
 * Сервис-обертка для взаимодействия со Stability AI API
 */
export class StabilityService {
  /**
   * Получает API ключ Stability AI из секретов
   * @returns API ключ
   */
  private static async getApiKey(): Promise<string> {
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Secrets not loaded');
    }
    
    const stabilityApiKey = secrets.STABILITY_API_KEY;
    if (!stabilityApiKey) {
      throw new Error('STABILITY_API_KEY не найден в секретах');
    }
    
    return stabilityApiKey;
  }

  /**
   * Генерирует изображение с помощью Stability AI SD3.5
   * 
   * @param prompt текстовый запрос
   * @returns результат генерации с URL изображения
   */
  static async generateImage(prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Использование Stability AI для генерации изображения`);
    
    const cacheKey = `stability:${prompt}`;
    
    return imageCache.getOrFetch(
      cacheKey,
      async () => {
        return circuitBreakerManager.execute(
          'stability-image-generation',
          async () => {
            return measureContentGeneration(
              'image',
              'sd3.5-large',
              async () => {
                return withRetry(
                  async () => {
                    const stabilityApiKey = await this.getApiKey();
                    
                    // Создаем multipart/form-data для Stability AI
                    const formData = new FormData();
                    formData.append('prompt', prompt);
                    formData.append('model', 'sd3.5-large');
                    formData.append('output_format', 'png');
                    formData.append('style_preset', 'photographic');
                    
                    // Запрос к Stability AI через API v2beta
                    const stabilityResponse = await axios.post(
                      'https://api.stability.ai/v2beta/stable-image/generate/sd3',
                      formData,
                      {
                        headers: {
                          ...formData.getHeaders(),
                          'Authorization': `Bearer ${stabilityApiKey}`,
                          'Accept': 'image/*'
                        },
                        responseType: 'arraybuffer',
                        timeout: 60000 // 60 секунд
                      }
                    );
                    
                    if (!stabilityResponse.data) {
                      throw new Error('Stability AI не вернул данные изображения');
                    }
                    
                    // Создаем data URL для отображения в клиенте
                    const imageBuffer = Buffer.from(stabilityResponse.data);
                    const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                    
                    return { 
                      imageUrl: dataUrl, 
                      s3Url: '', // s3Url будет добавлен в image.service
                      generator: 'stability-sd3.5-large',
                      quality: 'ultra-hd'
                    };
                  },
                  {
                    maxRetries: 3,
                    baseDelay: 2000,
                    retryCondition: retryConditions.stability,
                    onRetry: (error, attempt) => {
                      enhancedLogger.warn(`Повтор генерации изображения Stability AI, попытка ${attempt}`, { 
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
            resetTimeout: 60000
          }
        );
      },
      30 * 60 // Кэшируем на 30 минут
    );
  }

  /**
   * Применяет inpainting к изображению (изменение центральной части)
   * 
   * @param imageBuffer буфер изображения
   * @param maskBuffer буфер маски (где белые области будут изменены)
   * @param prompt текстовый запрос
   * @returns результат обработки с URL изображения
   */
  static async inpaintImage(imageBuffer: Buffer, maskBuffer: Buffer, prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Inpainting изображения с помощью Stability AI`);
    
    return measureContentGeneration(
      'image-inpaint',
      'stability-inpaint',
      async () => {
        return withRetry(
          async () => {
            const stabilityApiKey = await this.getApiKey();
            
            // Создаем multipart/form-data
            const formData = new FormData();
            formData.append('image', imageBuffer, { filename: 'image.png', contentType: 'image/png' });
            formData.append('mask', maskBuffer, { filename: 'mask.png', contentType: 'image/png' });
            formData.append('prompt', prompt);
            formData.append('output_format', 'png');
            formData.append('grow_mask', '5');
            
            // Запрос к Stability AI API
            const stabilityResponse = await axios.post(
              'https://api.stability.ai/v2beta/stable-image/edit/inpaint',
              formData,
              {
                headers: {
                  ...formData.getHeaders(),
                  'Authorization': `Bearer ${stabilityApiKey}`,
                  'Accept': 'image/*'
                },
                responseType: 'arraybuffer',
                timeout: 60000
              }
            );

            // Обработка результата
            const resultBuffer = Buffer.from(stabilityResponse.data);
            const dataUrl = `data:image/png;base64,${resultBuffer.toString('base64')}`;
            
            return { 
              imageUrl: dataUrl,
              s3Url: '', // s3Url будет добавлен в image.service
              processor: 'stability-ai',
              processingType: 'inpainting'
            };
          },
          {
            maxRetries: 3,
            retryCondition: retryConditions.stability
          }
        );
      }
    );
  }
  
  /**
   * Применяет outpainting к изображению (расширение границ)
   * 
   * @param imageBuffer буфер изображения
   * @param prompt текстовый запрос
   * @returns результат обработки с URL изображения
   */
  static async outpaintImage(imageBuffer: Buffer, prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Outpainting изображения с помощью Stability AI`);
    
    return measureContentGeneration(
      'image-outpaint',
      'stability-outpaint',
      async () => {
        return withRetry(
          async () => {
            const stabilityApiKey = await this.getApiKey();
            
            // Создаем multipart/form-data
            const formData = new FormData();
            formData.append('image', imageBuffer, { filename: 'image.png', contentType: 'image/png' });
            formData.append('prompt', prompt);
            formData.append('output_format', 'png');
            formData.append('left', '128');
            formData.append('right', '128');
            formData.append('up', '128');
            formData.append('down', '128');
            formData.append('creativity', '0.5');
            
            // Запрос к Stability AI API
            const stabilityResponse = await axios.post(
              'https://api.stability.ai/v2beta/stable-image/edit/outpaint',
              formData,
              {
                headers: {
                  ...formData.getHeaders(),
                  'Authorization': `Bearer ${stabilityApiKey}`,
                  'Accept': 'image/*'
                },
                responseType: 'arraybuffer',
                timeout: 60000
              }
            );

            // Обработка результата
            const resultBuffer = Buffer.from(stabilityResponse.data);
            const dataUrl = `data:image/png;base64,${resultBuffer.toString('base64')}`;
            
            return { 
              imageUrl: dataUrl,
              s3Url: '', // s3Url будет добавлен в image.service
              processor: 'stability-ai',
              processingType: 'outpainting'
            };
          },
          {
            maxRetries: 3,
            retryCondition: retryConditions.stability
          }
        );
      }
    );
  }
  
  /**
   * Модифицирует всё изображение согласно промту
   * 
   * @param imageBuffer буфер изображения
   * @param prompt текстовый запрос
   * @returns результат обработки с URL изображения
   */
  static async modifyImage(imageBuffer: Buffer, prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Модификация изображения с помощью Stability AI`);
    
    return measureContentGeneration(
      'image-modify',
      'stability-modify',
      async () => {
        return withRetry(
          async () => {
            const stabilityApiKey = await this.getApiKey();
            
            // Создаем multipart/form-data
            const formData = new FormData();
            formData.append('image', imageBuffer, { filename: 'image.png', contentType: 'image/png' });
            formData.append('prompt', prompt);
            formData.append('output_format', 'png');
            formData.append('mode', 'image-to-image');
            formData.append('strength', '0.65');
            formData.append('model', 'sd3.5-large');
            
            // Запрос к Stability AI API
            const stabilityResponse = await axios.post(
              'https://api.stability.ai/v2beta/stable-image/generate/sd3',
              formData,
              {
                headers: {
                  ...formData.getHeaders(),
                  'Authorization': `Bearer ${stabilityApiKey}`,
                  'Accept': 'image/*'
                },
                responseType: 'arraybuffer',
                timeout: 60000
              }
            );

            // Обработка результата
            const resultBuffer = Buffer.from(stabilityResponse.data);
            const dataUrl = `data:image/png;base64,${resultBuffer.toString('base64')}`;
            
            return { 
              imageUrl: dataUrl,
              s3Url: '', // s3Url будет добавлен в image.service
              processor: 'stability-ai',
              processingType: 'modify'
            };
          },
          {
            maxRetries: 3,
            retryCondition: retryConditions.stability
          }
        );
      }
    );
  }
}