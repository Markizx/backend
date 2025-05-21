import axios from 'axios';
import sharp from 'sharp';
import logger from '@utils/logger';
import { S3Service } from '@services/aws.service';
import { OpenAIService } from './ai/openai.service';
import { RunwayService } from './ai/runway.service';

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
    
    let promptImageS3Url: string | undefined;
    
    // Если нет входного изображения, создаем концептуальное изображение
    if (!inputImageBuffer) {
      logger.info(`Генерация видео из текста через промежуточное изображение`);
      
      // Создаем концептуальное изображение на основе промта с помощью OpenAI
      const conceptPrompt = `Create a visual concept for this scene: ${prompt}. Style: cinematic, highly detailed, 8K, suitable for professional video production`;
      const conceptImageResult = await OpenAIService.generateImage(conceptPrompt);
      
      // Загружаем изображение в S3
      if (conceptImageResult.imageUrl) {
        const response = await fetch(conceptImageResult.imageUrl);
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        promptImageS3Url = await S3Service.uploadBuffer(imageBuffer, `concept-image-${Date.now()}.png`, 'image/png');
      }
    } else {
      // Используем входное изображение пользователя
      logger.info(`Генерация видео из существующего изображения`);
      
      // Обрабатываем и улучшаем изображение перед отправкой
      const enhancedBuffer = await sharp(inputImageBuffer)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      
      promptImageS3Url = await S3Service.uploadBuffer(enhancedBuffer, `input-video-image-${Date.now()}.png`, 'image/png');
    }
    
    if (!promptImageS3Url) {
      throw new Error('Не удалось подготовить изображение для генерации видео');
    }
    
    // Используем RunwayService для генерации видео
    const result = await RunwayService.generateVideo(prompt, duration, promptImageS3Url);
    
    // Загружаем видео в S3
    if (result.videoUrl) {
      const response = await axios.get(result.videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
      });
      
      const buffer = Buffer.from(response.data);
      const s3Url = await S3Service.uploadBuffer(buffer, 'generated-video.mp4', 'video/mp4');
      result.s3Url = s3Url;
    }
    
    return result;
  }
}