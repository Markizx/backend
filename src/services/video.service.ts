import axios from 'axios';
import sharp from 'sharp';
import logger from '@utils/logger';
import { S3Service } from '@services/aws.service';
import { OpenAIService } from './ai/openai.service';
import { RunwayService } from './ai/runway.service';
import { imageCache } from '@utils/cache.service';
import { BatchProfiler } from '@utils/performance';

/**
 * Сервис для работы с генерацией видео
 */
export class VideoService {
  /**
   * Генерирует видео с помощью Runway ML
   * 
   * @param prompt текстовый запрос
   * @param duration длительность видео в секундах (5 или 10)
   * @param inputImageBuffer опциональный буфер входного изображения
   * @returns URL сгенерированного видео и URL в S3
   */
  static async generateVideo(prompt: string, duration: number = 10, inputImageBuffer?: Buffer) {
    logger.info(`Начало генерации видео, prompt: ${prompt}`);
    
    const profiler = new BatchProfiler('video-generation');
    
    try {
      let promptImageS3Url: string | undefined;
      
      // Если нет входного изображения, создаем концептуальное изображение
      if (!inputImageBuffer) {
        logger.info(`Генерация видео из текста через промежуточное изображение`);
        
        // Создаем концептуальное изображение на основе промта с помощью OpenAI
        const conceptPrompt = `Create a visual concept for this scene: ${prompt}. Style: cinematic, highly detailed, 8K, suitable for professional video production`;
        
        // Проверяем кэш для концептуального изображения
        const conceptCacheKey = `video-concept:${conceptPrompt}`;
        
        const conceptImageUrl = await imageCache.getOrFetch(
          conceptCacheKey,
          async () => {
            const conceptImageResult = await profiler.measureOperation(
              'generate-concept-image',
              () => OpenAIService.generateImage(conceptPrompt)
            );
            return conceptImageResult.imageUrl;
          },
          30 * 60 // Кэшируем концептуальные изображения на 30 минут
        );
        
        // Загружаем изображение в S3
        if (conceptImageUrl) {
          promptImageS3Url = await profiler.measureOperation(
            's3-upload-concept',
            async () => {
              const response = await fetch(conceptImageUrl);
              const imageBuffer = Buffer.from(await response.arrayBuffer());
              return S3Service.uploadBuffer(imageBuffer, `concept-image-${Date.now()}.png`, 'image/png');
            }
          );
        }
      } else {
        // Используем входное изображение пользователя
        logger.info(`Генерация видео из существующего изображения`);
        
        // Обрабатываем и улучшаем изображение перед отправкой
        promptImageS3Url = await profiler.measureOperation(
          's3-upload-input',
          async () => {
            const enhancedBuffer = await sharp(inputImageBuffer)
              .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
              .png()
              .toBuffer();
            
            return S3Service.uploadBuffer(enhancedBuffer, `input-video-image-${Date.now()}.png`, 'image/png');
          }
        );
      }
      
      if (!promptImageS3Url) {
        throw new Error('Не удалось подготовить изображение для генерации видео');
      }
      
      // Используем RunwayService для генерации видео
      const result = await profiler.measureOperation(
        'runway-generate-video',
        () => RunwayService.generateVideo(prompt, duration, promptImageS3Url)
      );
      
      // Загружаем видео в S3
      if (result.videoUrl) {
        const s3Url = await profiler.measureOperation(
          's3-upload-video',
          async () => {
            const response = await axios.get(result.videoUrl, {
              responseType: 'arraybuffer',
              timeout: 120000,
            });
            
            const buffer = Buffer.from(response.data);
            return S3Service.uploadBuffer(buffer, 'generated-video.mp4', 'video/mp4');
          }
        );
        result.s3Url = s3Url;
      }
      
      const stats = profiler.finish();
      logger.info(`Генерация видео завершена за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка генерации видео после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
}