import logger from '@utils/logger';
import { S3Service } from '@services/aws.service';
import { OpenAIService } from './ai/openai.service';
import { textCache } from '@utils/cache.service';
import { BatchProfiler } from '@utils/performance';

/**
 * Сервис для работы с генерацией текста
 */
export class TextService {
  /**
   * Генерирует текст с помощью OpenAI
   * 
   * @param prompt текстовый запрос
   * @param imageBuffer опциональный буфер изображения для анализа
   * @returns сгенерированный текст и URL в S3
   */
  static async generateText(prompt: string, imageBuffer?: Buffer) {
    const profiler = new BatchProfiler('text-generation');
    
    try {
      let finalPrompt = prompt;
      let cacheKey = `text-gen:${prompt}`;

      // Если есть изображение, анализируем его и добавляем к промту
      if (imageBuffer) {
        // Используем OpenAIService для анализа изображения
        const imageDescription = await profiler.measureOperation(
          'analyze-image',
          () => OpenAIService.generateImageDescription(
            imageBuffer,
            'Опишите это изображение подробно для дальнейшего использования в контексте.'
          )
        );

        finalPrompt = `На основе изображения: ${imageDescription.description}\n\nПользовательский запрос: ${finalPrompt}`;
        cacheKey = `text-gen-with-image:${prompt}:${imageDescription.description.substring(0, 50)}`;
      }

      logger.info(`Генерация текста, prompt: ${finalPrompt.substring(0, 50)}...`);
      
      // Проверяем кэш или генерируем новый текст
      const result = await textCache.getOrFetch(
        cacheKey,
        async () => {
          // Используем OpenAIService для генерации текста
          return await profiler.measureOperation(
            'generate-text',
            () => OpenAIService.generateText(finalPrompt)
          );
        },
        15 * 60 // Кэшируем на 15 минут
      );
      
      // Загружаем в S3
      const s3Url = await profiler.measureOperation(
        's3-upload',
        async () => {
          const buffer = Buffer.from(result.text);
          return S3Service.uploadBuffer(buffer, 'generated-text.txt', 'text/plain');
        }
      );
      result.s3Url = s3Url;
      
      const stats = profiler.finish();
      logger.info(`Генерация текста завершена за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка генерации текста после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
  
  /**
   * Генерирует описание изображения
   * 
   * @param imageBuffer буфер изображения
   * @param prompt текстовый запрос для анализа изображения
   * @returns описание изображения и URL в S3
   */
  static async generateImageDescription(imageBuffer: Buffer, prompt: string) {
    logger.info(`Генерация описания изображения`);
    
    const profiler = new BatchProfiler('image-description');
    
    try {
      // Используем OpenAIService для генерации описания изображения
      const result = await profiler.measureOperation(
        'describe-image',
        () => OpenAIService.generateImageDescription(imageBuffer, prompt)
      );
      
      // Загружаем в S3
      const s3Url = await profiler.measureOperation(
        's3-upload',
        async () => {
          const buffer = Buffer.from(result.description);
          return S3Service.uploadBuffer(buffer, 'image-description.txt', 'text/plain');
        }
      );
      result.s3Url = s3Url;
      
      const stats = profiler.finish();
      logger.info(`Описание изображения сгенерировано за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка генерации описания после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
}