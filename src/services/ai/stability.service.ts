import axios from 'axios';
import FormData from 'form-data';
import { getSecrets } from '@utils/getSecrets';
import logger from '@utils/logger';
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
    logger.info(`Использование Stability AI для генерации изображения`);
    
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
        responseType: 'arraybuffer'
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
    logger.info(`Inpainting изображения с помощью Stability AI`);
    
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
        responseType: 'arraybuffer'
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
  }
  
  /**
   * Применяет outpainting к изображению (расширение границ)
   * 
   * @param imageBuffer буфер изображения
   * @param prompt текстовый запрос
   * @returns результат обработки с URL изображения
   */
  static async outpaintImage(imageBuffer: Buffer, prompt: string): Promise<ImageGenerationResult> {
    logger.info(`Outpainting изображения с помощью Stability AI`);
    
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
        responseType: 'arraybuffer'
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
  }
  
  /**
   * Модифицирует всё изображение согласно промту
   * 
   * @param imageBuffer буфер изображения
   * @param prompt текстовый запрос
   * @returns результат обработки с URL изображения
   */
  static async modifyImage(imageBuffer: Buffer, prompt: string): Promise<ImageGenerationResult> {
    logger.info(`Модификация изображения с помощью Stability AI`);
    
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
        responseType: 'arraybuffer'
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
  }
}