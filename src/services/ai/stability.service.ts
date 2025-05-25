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
   * Генерирует изображение с помощью Stability AI
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
              'stable-diffusion-xl',
              async () => {
                return withRetry(
                  async () => {
                    const stabilityApiKey = await this.getApiKey();
                    
                    // Используем v1 API endpoint который работает
                    const stabilityResponse = await axios.post(
                      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
                      {
                        text_prompts: [
                          {
                            text: prompt,
                            weight: 1
                          }
                        ],
                        cfg_scale: 7,
                        height: 1024,
                        width: 1024,
                        steps: 30,
                        samples: 1,
                        style_preset: "photographic"
                      },
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          'Accept': 'application/json',
                          'Authorization': `Bearer ${stabilityApiKey}`
                        },
                        timeout: 60000,
                        validateStatus: (status) => {
                          enhancedLogger.debug(`Stability AI response status: ${status}`);
                          return status >= 200 && status < 300;
                        }
                      }
                    );
                    
                    enhancedLogger.debug('Stability AI response structure:', {
                      hasArtifacts: !!stabilityResponse.data?.artifacts,
                      artifactsCount: stabilityResponse.data?.artifacts?.length
                    });
                    
                    if (!stabilityResponse.data?.artifacts?.[0]?.base64) {
                      throw new Error('Stability AI не вернул изображение');
                    }
                    
                    // Получаем base64 изображение из ответа
                    const base64Image = stabilityResponse.data.artifacts[0].base64;
                    const dataUrl = `data:image/png;base64,${base64Image}`;
                    
                    return { 
                      imageUrl: dataUrl, 
                      s3Url: '', // s3Url будет добавлен в image.service
                      generator: 'stable-diffusion-xl',
                      quality: 'ultra-hd'
                    };
                  },
                  {
                    maxRetries: 3,
                    baseDelay: 2000,
                    retryCondition: (error) => {
                      enhancedLogger.debug('Stability AI error details:', {
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                        data: error.response?.data
                      });
                      
                      // Не повторяем при ошибках клиента (4xx)
                      if (error.response?.status >= 400 && error.response?.status < 500) {
                        enhancedLogger.error(`Stability AI client error: ${error.response?.status}`);
                        return false;
                      }
                      
                      return retryConditions.stability(error);
                    },
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
            resetTimeout: 60000,
            fallback: async () => {
              enhancedLogger.error('Circuit breaker открыт для Stability AI, используем fallback на OpenAI');
              // Возвращаем специальную ошибку, чтобы ImageService мог использовать OpenAI
              throw new Error('STABILITY_CIRCUIT_OPEN');
            }
          }
        );
      },
      30 * 60 // Кэшируем на 30 минут
    );
  }

  /**
   * Применяет inpainting к изображению (изменение части)
   * Для v1 API используем image-to-image с маской
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
            
            // Для v1 API используем image-to-image endpoint с init_image
            const imageBase64 = imageBuffer.toString('base64');
            
            const stabilityResponse = await axios.post(
              'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
              {
                text_prompts: [
                  {
                    text: prompt,
                    weight: 1
                  }
                ],
                cfg_scale: 7,
                image_strength: 0.35, // Сила изменения изображения
                init_image: imageBase64,
                steps: 30,
                samples: 1
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${stabilityApiKey}`
                },
                timeout: 60000,
                validateStatus: (status) => status >= 200 && status < 300
              }
            );

            if (!stabilityResponse.data?.artifacts?.[0]?.base64) {
              throw new Error('Stability AI не вернул обработанное изображение');
            }

            const base64Image = stabilityResponse.data.artifacts[0].base64;
            const dataUrl = `data:image/png;base64,${base64Image}`;
            
            return { 
              imageUrl: dataUrl,
              s3Url: '', // s3Url будет добавлен в image.service
              processor: 'stability-ai',
              processingType: 'inpainting'
            };
          },
          {
            maxRetries: 3,
            retryCondition: (error) => {
              if (error.response?.status >= 400 && error.response?.status < 500) {
                return false;
              }
              return retryConditions.stability(error);
            }
          }
        );
      }
    );
  }
  
  /**
   * Применяет outpainting к изображению (расширение границ)
   * Для v1 API используем генерацию с увеличенным размером
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
            
            // Для v1 API используем image-to-image с уменьшенной силой
            const imageBase64 = imageBuffer.toString('base64');
            
            const stabilityResponse = await axios.post(
              'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
              {
                text_prompts: [
                  {
                    text: `${prompt}, seamlessly extend the image, maintain style and composition`,
                    weight: 1
                  }
                ],
                cfg_scale: 7,
                image_strength: 0.2, // Низкая сила для сохранения оригинала
                init_image: imageBase64,
                steps: 30,
                samples: 1
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${stabilityApiKey}`
                },
                timeout: 60000,
                validateStatus: (status) => status >= 200 && status < 300
              }
            );

            if (!stabilityResponse.data?.artifacts?.[0]?.base64) {
              throw new Error('Stability AI не вернул обработанное изображение');
            }

            const base64Image = stabilityResponse.data.artifacts[0].base64;
            const dataUrl = `data:image/png;base64,${base64Image}`;
            
            return { 
              imageUrl: dataUrl,
              s3Url: '', // s3Url будет добавлен в image.service
              processor: 'stability-ai',
              processingType: 'outpainting'
            };
          },
          {
            maxRetries: 3,
            retryCondition: (error) => {
              if (error.response?.status >= 400 && error.response?.status < 500) {
                return false;
              }
              return retryConditions.stability(error);
            }
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
            
            // Используем image-to-image endpoint
            const imageBase64 = imageBuffer.toString('base64');
            
            const stabilityResponse = await axios.post(
              'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
              {
                text_prompts: [
                  {
                    text: prompt,
                    weight: 1
                  }
                ],
                cfg_scale: 7,
                image_strength: 0.65, // Средняя сила изменения
                init_image: imageBase64,
                steps: 30,
                samples: 1
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${stabilityApiKey}`
                },
                timeout: 60000,
                validateStatus: (status) => status >= 200 && status < 300
              }
            );

            if (!stabilityResponse.data?.artifacts?.[0]?.base64) {
              throw new Error('Stability AI не вернул модифицированное изображение');
            }

            const base64Image = stabilityResponse.data.artifacts[0].base64;
            const dataUrl = `data:image/png;base64,${base64Image}`;
            
            return { 
              imageUrl: dataUrl,
              s3Url: '', // s3Url будет добавлен в image.service
              processor: 'stability-ai',
              processingType: 'modify'
            };
          },
          {
            maxRetries: 3,
            retryCondition: (error) => {
              if (error.response?.status >= 400 && error.response?.status < 500) {
                return false;
              }
              return retryConditions.stability(error);
            }
          }
        );
      }
    );
  }
}