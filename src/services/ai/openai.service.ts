import { OpenAI } from 'openai';
import axios from 'axios';
import sharp from 'sharp';
import FormData from 'form-data';
import { getSecrets } from '@utils/getSecrets';
import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry, retryConditions } from '@utils/retry';
import { circuitBreakerManager } from '@utils/circuit-breaker';
import { imageCache, textCache } from '@utils/cache.service';
import { measureContentGeneration } from '@utils/performance';
import { ImageGenerationResult, TextGenerationResult, DescriptionResult } from '../../types/generation.types';

/**
 * Сервис-обертка для взаимодействия с OpenAI API
 */
export class OpenAIService {
  /**
   * Инициализирует клиент OpenAI с API ключом
   * @returns OpenAI клиент
   */
  private static async createClient(): Promise<OpenAI> {
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Secrets not loaded');
    }
    
    const openaiApiKey = secrets.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY не найден в секретах');
    }
    
    return new OpenAI({ apiKey: openaiApiKey });
  }

  /**
   * Генерирует изображение с помощью DALL-E 3
   * 
   * @param prompt текстовый запрос
   * @returns результат генерации с URL изображения
   */
  static async generateImage(prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Генерация изображения с DALL-E, prompt: ${prompt.substring(0, 50)}...`);
    
    const cacheKey = `dalle:${prompt}`;
    
    return imageCache.getOrFetch(
      cacheKey,
      async () => {
        return circuitBreakerManager.execute(
          'openai-image-generation',
          async () => {
            return measureContentGeneration(
              'image',
              'dall-e-3',
              async () => {
                return withRetry(
                  async () => {
                    const openai = await this.createClient();
                    
                    const dallEResponse = await openai.images.generate({
                      prompt,
                      model: 'dall-e-3',
                      size: '1024x1024',
                      quality: 'hd',
                      n: 1,
                    });
                    
                    const imageUrl = dallEResponse.data?.[0]?.url;
                    if (!imageUrl) {
                      throw new Error('DALL-E не вернул URL изображения');
                    }
                    
                    // Скачиваем изображение с retry
                    const response = await withRetry(
                      () => axios.get(imageUrl, { responseType: 'arraybuffer' }),
                      { maxRetries: 2, retryCondition: retryConditions.openai }
                    );
                    const buffer = Buffer.from(response.data);
                    
                    return { 
                      imageUrl, 
                      s3Url: '', // s3Url будет добавлен в image.service
                      generator: 'dall-e-3',
                      quality: 'hd'
                    };
                  },
                  {
                    maxRetries: 3,
                    retryCondition: retryConditions.openai,
                    onRetry: (error, attempt) => {
                      enhancedLogger.warn(`Повтор генерации изображения OpenAI, попытка ${attempt}`, { error: error.message });
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
              enhancedLogger.error('Circuit breaker открыт для OpenAI image generation');
              throw new Error('Сервис генерации изображений временно недоступен');
            }
          }
        );
      },
      30 * 60 // Кэшируем на 30 минут
    );
  }

  /**
   * Редактирует изображение с помощью OpenAI API
   * 
   * @param imageBuffer буфер изображения для редактирования
   * @param prompt текстовый запрос для редактирования
   * @returns результат редактирования с URL изображения
   */
  static async editImage(imageBuffer: Buffer, prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Редактирование изображения с OpenAI, prompt: ${prompt.substring(0, 50)}...`);
    
    return measureContentGeneration(
      'image-edit',
      'dall-e-3',
      async () => {
        return withRetry(
          async () => {
            const secrets = await getSecrets();
            if (!secrets) {
              throw new Error('Secrets not loaded');
            }
            
            const openaiApiKey = secrets.OPENAI_API_KEY;
            
            // Создаем form-data для OpenAI API
            const form = new FormData();
            
            // Конвертируем изображение в нужный формат (PNG) и размер
            const processedImageBuffer = await sharp(imageBuffer)
              .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
              .png()
              .toBuffer();
            
            form.append('image', processedImageBuffer, { 
              filename: 'image.png',
              contentType: 'image/png'
            });
            form.append('prompt', prompt);
            form.append('model', 'dall-e-3');
            form.append('size', '1024x1024');
            form.append('quality', 'hd');
            form.append('n', '1');

            // Делаем прямой запрос к API OpenAI для редактирования
            const formHeaders = form.getHeaders();
            const response = await axios.post('https://api.openai.com/v1/images/edits', form, {
              headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                ...formHeaders
              }
            });

            const imageUrl = response.data?.data?.[0]?.url;
            if (!imageUrl) {
              throw new Error('OpenAI не вернул отредактированное изображение');
            }
            
            return { 
              imageUrl, 
              s3Url: '', // s3Url будет добавлен в image.service 
              method: 'openai-edit',
              quality: 'hd'
            };
          },
          {
            maxRetries: 3,
            retryCondition: retryConditions.openai
          }
        );
      }
    );
  }
  
  /**
   * Создает новое изображение на основе описания существующего
   * 
   * @param imageBuffer буфер исходного изображения
   * @param prompt текстовый запрос для новой версии
   * @returns результат генерации с URL изображения
   */
  static async recreateImageFromDescription(imageBuffer: Buffer, prompt: string): Promise<ImageGenerationResult> {
    enhancedLogger.info(`Создание нового изображения на основе анализа и промта`);
    
    return measureContentGeneration(
      'image-recreate',
      'dall-e-3',
      async () => {
        const openai = await this.createClient();
        
        // Анализируем изображение и создаем новое
        const base64Image = await sharp(imageBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer()
          .then((buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`);

        const imageAnalysis = await withRetry(
          async () => {
            return openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Опишите это изображение очень подробно, включая все детали, объекты, цвета, композицию и стиль.' },
                    { type: 'image_url', image_url: { url: base64Image } },
                  ],
                },
              ],
              max_tokens: 1000,
            });
          },
          { retryCondition: retryConditions.openai }
        );

        const imageDescription = imageAnalysis.choices[0]?.message?.content || '';
        
        // Создаем новое изображение на основе описания и промта пользователя
        const combinedPrompt = `${imageDescription}\n\nПрименить следующие изменения: ${prompt}\n\nСохранить общую композицию, но применить запрошенные изменения. Создать изображение высочайшего качества с детализированными текстурами и освещением.`;
        
        const newImage = await withRetry(
          async () => {
            return openai.images.generate({
              prompt: combinedPrompt,
              model: 'dall-e-3',
              size: '1024x1024',
              quality: 'hd',
              n: 1,
            });
          },
          { retryCondition: retryConditions.openai }
        );

        const newImageUrl = newImage.data?.[0]?.url;
        if (!newImageUrl) {
          throw new Error('DALL·E не вернул новое изображение');
        }

        return { 
          imageUrl: newImageUrl, 
          s3Url: '', // s3Url будет добавлен в image.service
          method: 'dalle-recreation',
          quality: 'hd'
        };
      }
    );
  }
  
  /**
   * Генерирует текст на основе запроса
   * 
   * @param prompt текстовый запрос
   * @returns сгенерированный текст
   */
  static async generateText(prompt: string): Promise<TextGenerationResult> {
    enhancedLogger.info(`Генерация текста, prompt: ${prompt.substring(0, 50)}...`);
    
    const cacheKey = `text:${prompt}`;
    
    return textCache.getOrFetch(
      cacheKey,
      async () => {
        return circuitBreakerManager.execute(
          'openai-text-generation',
          async () => {
            return measureContentGeneration(
              'text',
              'gpt-4',
              async () => {
                return withRetry(
                  async () => {
                    const openai = await this.createClient();
                    
                    const chat = await openai.chat.completions.create({
                      model: 'gpt-4',
                      messages: [{ role: 'user', content: prompt }],
                      max_tokens: 1500,
                      temperature: 0.7,
                    });

                    const result = chat.choices[0]?.message?.content;
                    if (!result) {
                      throw new Error('OpenAI не вернул текст');
                    }
                    
                    return { text: result, s3Url: '' }; // s3Url будет добавлен в text.service
                  },
                  {
                    maxRetries: 3,
                    retryCondition: retryConditions.openai
                  }
                );
              }
            );
          }
        );
      },
      15 * 60 // Кэшируем на 15 минут
    );
  }
  
  /**
   * Генерирует описание изображения
   * 
   * @param imageBuffer буфер изображения
   * @param prompt текстовый запрос для анализа
   * @returns описание изображения
   */
  static async generateImageDescription(imageBuffer: Buffer, prompt: string): Promise<DescriptionResult> {
    enhancedLogger.info(`Генерация описания изображения`);
    
    return measureContentGeneration(
      'image-description',
      'gpt-4-vision',
      async () => {
        return withRetry(
          async () => {
            const openai = await this.createClient();
            
            const base64Image = await sharp(imageBuffer)
              .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
              .png()
              .toBuffer()
              .then((buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`);

            const response = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: base64Image } },
                  ],
                },
              ],
              max_tokens: 1500,
            });

            const description = response.choices[0]?.message?.content;
            if (!description) {
              throw new Error('OpenAI не вернул описание');
            }
            
            return { description, s3Url: '' }; // s3Url будет добавлен в text.service
          },
          {
            maxRetries: 2,
            retryCondition: retryConditions.openai
          }
        );
      }
    );
  }

  /**
   * Переводит текст на английский язык
   * 
   * @param text текст для перевода
   * @returns переведенный текст
   */
  static async translateToEnglish(text: string): Promise<string> {
    try {
      // Проверяем наличие не-ASCII символов (упрощенное определение не-английского текста)
      const isNonEnglish = /[^\x00-\x7F]/.test(text);
      if (!isNonEnglish) {
        // Текст уже на английском языке
        return text;
      }
      
      const cacheKey = `translate:${text}`;
      
      return textCache.getOrFetch(
        cacheKey,
        async () => {
          enhancedLogger.info(`Перевод текста на английский: "${text.substring(0, 50)}..."`);
          
          return withRetry(
            async () => {
              const openai = await this.createClient();
              
              const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                  {
                    role: 'system',
                    content: 'You are a translator. Translate the following text to English. Provide only the translation, no explanations or additional text.'
                  },
                  {
                    role: 'user',
                    content: text
                  }
                ],
                max_tokens: 300,
                temperature: 0.3 // Низкая температура для более точного перевода
              });

              const translation = response.choices[0]?.message?.content?.trim() || text;
              enhancedLogger.info(`Текст переведен на английский: "${translation.substring(0, 50)}..."`);
              
              return translation;
            },
            {
              maxRetries: 2,
              retryCondition: retryConditions.openai
            }
          );
        },
        60 * 60 // Кэшируем переводы на 1 час
      );
    } catch (error: any) {
      enhancedLogger.error(`Ошибка перевода текста: ${error.message}`);
      // В случае ошибки возвращаем оригинальный текст
      return text;
    }
  }
}