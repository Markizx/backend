import sharp from 'sharp';
import logger from '@utils/logger';
import { S3Service } from '@services/aws.service';
import { ProcessingType } from '@constants/enums';
import { OpenAIService } from './ai/openai.service';
import { StabilityService } from './ai/stability.service';
import { GrokService } from './ai/grok.service';
import { ImageGenerationResult } from '../types/generation.types';
import { BatchProfiler } from '@utils/performance';

/**
 * Сервис для работы с генерацией изображений
 */
export class ImageService {
  /**
   * Генерирует изображение с помощью DALL-E 3
   * 
   * @param prompt текстовый запрос
   * @returns URL сгенерированного изображения и URL в S3
   */
  static async generateWithDallE(prompt: string) {
    logger.info(`Генерация изображения с DALL-E, prompt: ${prompt.substring(0, 50)}...`);
    
    const profiler = new BatchProfiler('dalle-generation');
    
    try {
      // Используем OpenAIService для генерации изображения
      const result = await profiler.measureOperation(
        'openai-generate',
        () => OpenAIService.generateImage(prompt)
      );
      
      // Загружаем изображение в S3
      if (result.imageUrl) {
        const s3Url = await profiler.measureOperation(
          's3-upload',
          async () => {
            const response = await fetch(result.imageUrl);
            const buffer = Buffer.from(await response.arrayBuffer());
            return S3Service.uploadBuffer(buffer, `generated-image-dalle-3.png`, 'image/png');
          }
        );
        result.s3Url = s3Url;
      }
      
      const stats = profiler.finish();
      logger.info(`DALL-E генерация завершена за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка DALL-E генерации после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
  
  /**
   * Генерирует изображение с помощью Stability AI SD3.5
   * 
   * @param prompt текстовый запрос
   * @returns URL сгенерированного изображения и URL в S3
   */
  static async generateWithStability(prompt: string) {
    logger.info('Использование Stability AI для генерации изображения');
    
    const profiler = new BatchProfiler('stability-generation');
    
    try {
      // Используем OpenAIService для перевода промта на английский
      let translatedPrompt = await profiler.measureOperation(
        'translate-prompt',
        () => OpenAIService.translateToEnglish(prompt)
      );
      
      // Используем StabilityService для генерации изображения
      const result = await profiler.measureOperation(
        'stability-generate',
        () => StabilityService.generateImage(translatedPrompt)
      );
      
      // Извлекаем содержимое из data URL и загружаем в S3
      if (result.imageUrl.startsWith('data:image/')) {
        const s3Url = await profiler.measureOperation(
          's3-upload',
          async () => {
            const base64Data = result.imageUrl.split(',')[1];
            const imageBuffer = Buffer.from(base64Data, 'base64');
            return S3Service.uploadBuffer(imageBuffer, `stability-sd35-large-${Date.now()}.png`, 'image/png');
          }
        );
        result.s3Url = s3Url;
      }
      
      // Добавляем информацию о переводе
      if (translatedPrompt !== prompt) {
        result.translatedPrompt = translatedPrompt;
      }
      
      const stats = profiler.finish();
      logger.info(`Stability генерация завершена за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка Stability генерации после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
  
  /**
   * Генерирует изображение с помощью Grok Image Gen
   * 
   * @param prompt текстовый запрос
   * @returns URL сгенерированного изображения и URL в S3
   */
  static async generateWithGrok(prompt: string) {
    logger.info(`Использование Grok для генерации изображения Pro`);
    
    const profiler = new BatchProfiler('grok-generation');
    
    try {
      // Используем GrokService для генерации изображения
      const result = await profiler.measureOperation(
        'grok-generate',
        () => GrokService.generateImage(prompt)
      );
      
      // Загружаем изображение в S3
      if (result.imageUrl) {
        const s3Url = await profiler.measureOperation(
          's3-upload',
          async () => {
            const response = await fetch(result.imageUrl);
            const buffer = Buffer.from(await response.arrayBuffer());
            return S3Service.uploadBuffer(buffer, `generated-image-grok-2.png`, 'image/png');
          }
        );
        result.s3Url = s3Url;
      }
      
      const stats = profiler.finish();
      logger.info(`Grok генерация завершена за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка Grok генерации после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }

  /**
   * Обрабатывает изображение с помощью Stability AI
   * 
   * @param inputBuffer буфер входного изображения
   * @param prompt текстовый запрос
   * @param processingType тип обработки ('inpainting', 'outpainting', 'modify')
   * @returns URL обработанного изображения и URL в S3
   */
  static async processImage(inputBuffer: Buffer, prompt: string, processingType: string) {
    const profiler = new BatchProfiler('image-processing');
    
    try {
      // Подготовка изображения
      const processedImageBuffer = await profiler.measureOperation(
        'prepare-image',
        () => sharp(inputBuffer)
          .resize(1024, 1024, { fit: 'fill' })
          .png()
          .toBuffer()
      );

      try {
        // Переводим промт с любого языка на английский
        let translatedPrompt = await profiler.measureOperation(
          'translate-prompt',
          () => prompt ? OpenAIService.translateToEnglish(prompt) : Promise.resolve('Enhance this image')
        );

        // Используем соответствующий метод Stability AI в зависимости от типа обработки
        let result: ImageGenerationResult;

        switch(processingType) {
          case ProcessingType.INPAINTING:
            // Создаем маску (центральная часть изображения)
            const maskBuffer = await profiler.measureOperation(
              'create-mask',
              () => sharp({
                create: {
                  width: 1024,
                  height: 1024,
                  channels: 4,
                  background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
              })
              .composite([{
                input: {
                  create: {
                    width: 512,
                    height: 512,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 255 }
                  }
                },
                top: 256,
                left: 256
              }])
              .png()
              .toBuffer()
            );
            
            result = await profiler.measureOperation(
              'stability-inpaint',
              () => StabilityService.inpaintImage(processedImageBuffer, maskBuffer, translatedPrompt)
            );
            break;

          case ProcessingType.OUTPAINTING:
            result = await profiler.measureOperation(
              'stability-outpaint',
              () => StabilityService.outpaintImage(processedImageBuffer, translatedPrompt)
            );
            break;

          case ProcessingType.MODIFY:
            result = await profiler.measureOperation(
              'stability-modify',
              () => StabilityService.modifyImage(processedImageBuffer, translatedPrompt)
            );
            break;

          default:
            throw new Error(`Неизвестный тип обработки изображения: ${processingType}`);
        }

        // Загружаем результат в S3
        if (result.imageUrl.startsWith('data:image/')) {
          const s3Url = await profiler.measureOperation(
            's3-upload',
            async () => {
              const base64Data = result.imageUrl.split(',')[1];
              const imageBuffer = Buffer.from(base64Data, 'base64');
              return S3Service.uploadBuffer(imageBuffer, `processed-image-${processingType}.png`, 'image/png');
            }
          );
          result.s3Url = s3Url;
        }
        
        const stats = profiler.finish();
        logger.info(`Обработка изображения завершена за ${Math.round(stats.totalDuration)}ms`);
        
        return result;
      } catch (stabilityError: any) {
        // В случае ошибки используем OpenAI как резервный вариант
        logger.error(`Ошибка при обработке изображения через Stability AI: ${stabilityError.message}`);
        return await ImageService.processFallbackWithOpenAI(inputBuffer, prompt, processingType);
      }
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка обработки изображения после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
  
  /**
   * Резервный метод обработки изображения через OpenAI
   * 
   * @private
   */
  private static async processFallbackWithOpenAI(imageBuffer: Buffer, prompt: string | undefined, processingType: string) {
    logger.info('Используем OpenAI в качестве резервного варианта для обработки изображения');
    
    const profiler = new BatchProfiler('openai-fallback');
    
    try {
      // Анализируем исходное изображение с OpenAI
      const base64Image = await profiler.measureOperation(
        'prepare-image',
        () => sharp(imageBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer()
          .then((buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`)
      );

      // Формируем промт в зависимости от типа обработки и получаем описание изображения
      let fallbackPrompt: string;
      
      // Используем OpenAI для анализа изображения и генерации нового
      const base64ImageData = base64Image.split(',')[1];
      const imageDescription = await profiler.measureOperation(
        'describe-image',
        () => OpenAIService.generateImageDescription(
          Buffer.from(base64ImageData, 'base64'), 
          'Опишите это изображение очень подробно, включая все детали, объекты, цвета, композицию и стиль.'
        )
      );
      
      switch(processingType) {
        case ProcessingType.INPAINTING:
          fallbackPrompt = `${imageDescription.description}\n\nИзмените центральную часть изображения согласно запросу: ${prompt || 'Улучшить центральную часть изображения'}`;
          break;
        case ProcessingType.OUTPAINTING:
          fallbackPrompt = `${imageDescription.description}\n\nРасширьте границы изображения, сохраняя его стиль и содержание: ${prompt || 'Расширить границы этого изображения'}`;
          break;
        case ProcessingType.MODIFY:
          fallbackPrompt = `${imageDescription.description}\n\nМодифицируйте изображение: ${prompt || 'Улучшить качество этого изображения'}`;
          break;
        default:
          fallbackPrompt = `${imageDescription.description}\n\n${prompt || 'Улучшить это изображение'}`;
      }
      
      // Используем OpenAI для создания нового изображения
      const newImageResult = await profiler.measureOperation(
        'generate-new-image',
        () => OpenAIService.generateImage(fallbackPrompt)
      );
      
      // Загружаем изображение в S3
      const s3Url = await profiler.measureOperation(
        's3-upload',
        async () => {
          const response = await fetch(newImageResult.imageUrl);
          const newImageBuffer = Buffer.from(await response.arrayBuffer());
          return S3Service.uploadBuffer(newImageBuffer, `fallback-processed-image-${processingType}.png`, 'image/png');
        }
      );
      
      const stats = profiler.finish();
      logger.info(`Изображение обработано с помощью OpenAI (fallback для ${processingType}) за ${Math.round(stats.totalDuration)}ms`);
      
      return { 
        imageUrl: newImageResult.imageUrl, 
        s3Url, 
        processor: 'openai-fallback',
        originalProcessor: 'stability-ai',
        processingType,
        message: 'Обработка выполнена с использованием резервного метода из-за ошибки в Stability AI'
      };
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка fallback обработки после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
  
  /**
   * Модифицирует изображение без указания типа обработки
   * 
   * @param inputBuffer буфер входного изображения 
   * @param prompt текстовый запрос
   * @returns URL модифицированного изображения и URL в S3
   */
  static async modifyImage(inputBuffer: Buffer, prompt: string) {
    logger.info(`Модификация изображения с помощью OpenAI`);

    const profiler = new BatchProfiler('image-modification');

    try {
      // Пробуем использовать OpenAI Image Edit
      logger.info(`Использование OpenAI Image Edit`);
      
      // Используем OpenAIService для редактирования изображения
      const result = await profiler.measureOperation(
        'openai-edit',
        () => OpenAIService.editImage(inputBuffer, prompt)
      );
      
      // Загружаем изображение в S3
      const s3Url = await profiler.measureOperation(
        's3-upload',
        async () => {
          const response = await fetch(result.imageUrl);
          const buffer = Buffer.from(await response.arrayBuffer());
          return S3Service.uploadBuffer(buffer, 'edited-image.png', 'image/png');
        }
      );
      result.s3Url = s3Url;
      
      const stats = profiler.finish();
      logger.info(`Изображение отредактировано через OpenAI за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (openAIError: any) {
      // Альтернативный подход при ошибке
      logger.warn(`OpenAI Image Edit не сработал: ${openAIError.message}`);
      
      return await ImageService.createNewImageFromDescription(inputBuffer, prompt);
    }
  }
  
  /**
   * Создает новое изображение на основе описания существующего и промта
   * 
   * @private
   */
  private static async createNewImageFromDescription(imageBuffer: Buffer, prompt: string) {
    const profiler = new BatchProfiler('image-recreation');
    
    try {
      // Используем OpenAIService для создания нового изображения на основе описания
      const result = await profiler.measureOperation(
        'recreate-image',
        () => OpenAIService.recreateImageFromDescription(imageBuffer, prompt)
      );
      
      // Загружаем изображение в S3
      const s3Url = await profiler.measureOperation(
        's3-upload',
        async () => {
          const response = await fetch(result.imageUrl);
          const newImageBuffer = Buffer.from(await response.arrayBuffer());
          return S3Service.uploadBuffer(newImageBuffer, 'modified-image.png', 'image/png');
        }
      );
      result.s3Url = s3Url;
      
      const stats = profiler.finish();
      logger.info(`Изображение модифицировано через анализ и создание нового за ${Math.round(stats.totalDuration)}ms`);
      
      return result;
    } catch (error) {
      const stats = profiler.finish();
      logger.error(`Ошибка создания нового изображения после ${Math.round(stats.totalDuration)}ms`, { error });
      throw error;
    }
  }
}