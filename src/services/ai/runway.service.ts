import axios from 'axios';
import { getSecrets } from '@utils/getSecrets';
import logger from '@utils/logger';
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
    logger.info(`Начало генерации видео с Runway ML, prompt: ${prompt.substring(0, 50)}...`);
    
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
    const runwayRes = await axios.post(
      'https://api.dev.runwayml.com/v1/image_to_video',
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${runwayApiKey}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06',
        },
        timeout: 240000,
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
  }
  
  /**
   * Опрашивает статус задачи Runway ML
   * 
   * @param taskId идентификатор задачи
   * @param runwayApiKey ключ API Runway
   * @returns URL результата или null, если задача не завершилась вовремя
   */
  private static async pollTaskStatus(taskId: string, runwayApiKey: string): Promise<string | null> {
    // Максимальное время ожидания - 30 попыток с интервалом 5 секунд (2.5 минуты)
    for (let i = 0; i < 30; i++) {
      try {
        const taskRes = await axios.get(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
          headers: {
            Authorization: `Bearer ${runwayApiKey}`,
            'X-Runway-Version': '2024-11-06',
          },
          timeout: 10000,
        });
        
        if (taskRes.status === 200) {
          const status = taskRes.data.status;
          logger.info(`Task ${taskId} status: ${status}`);
          
          if (status === 'SUCCEEDED') {
            return taskRes.data.output && taskRes.data.output.length > 0 ? taskRes.data.output[0] : null;
          }
          
          if (status === 'FAILED') {
            throw new Error(`Task ${taskId} failed: ${JSON.stringify(taskRes.data)}`);
          }
        }
      } catch (taskErr: any) {
        logger.error(`Ошибка проверки статуса задачи RunwayML: ${taskErr.message}`);
      }
      
      // Ждем 5 секунд перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return null;
  }
}