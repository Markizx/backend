import logger from '@utils/logger';
import { S3Service } from '@services/aws.service';
import { OpenAIService } from './ai/openai.service';

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
    let finalPrompt = prompt;

    // Если есть изображение, анализируем его и добавляем к промту
    if (imageBuffer) {
      // Используем OpenAIService для анализа изображения
      const imageDescription = await OpenAIService.generateImageDescription(
        imageBuffer,
        'Опишите это изображение подробно для дальнейшего использования в контексте.'
      );

      finalPrompt = `На основе изображения: ${imageDescription.description}\n\nПользовательский запрос: ${finalPrompt}`;
    }

    logger.info(`Генерация текста, prompt: ${finalPrompt.substring(0, 50)}...`);
    
    // Используем OpenAIService для генерации текста
    const result = await OpenAIService.generateText(finalPrompt);
    
    // Загружаем в S3
    const buffer = Buffer.from(result.text);
    const s3Url = await S3Service.uploadBuffer(buffer, 'generated-text.txt', 'text/plain');
    result.s3Url = s3Url;
    
    return result;
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
    
    // Используем OpenAIService для генерации описания изображения
    const result = await OpenAIService.generateImageDescription(imageBuffer, prompt);
    
    // Загружаем в S3
    const buffer = Buffer.from(result.description);
    const s3Url = await S3Service.uploadBuffer(buffer, 'image-description.txt', 'text/plain');
    result.s3Url = s3Url;
    
    return result;
  }
}