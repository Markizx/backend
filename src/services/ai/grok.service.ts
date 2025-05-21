import axios from 'axios';
import { getSecrets } from '@utils/getSecrets';
import logger from '@utils/logger';
import { ImageGenerationResult } from '../../types/generation.types';

/**
 * Сервис-обертка для взаимодействия с Grok AI (X.AI) API
 */
export class GrokService {
  /**
   * Получает API ключ Grok из секретов
   * @returns API ключ
   */
  private static async getApiKey(): Promise<string> {
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Secrets not loaded');
    }
    
    const grokApiKey = secrets.GROK_API_KEY || secrets.XAI_API_KEY;
    if (!grokApiKey) {
      throw new Error('GROK_API_KEY или XAI_API_KEY не найден в секретах');
    }
    
    return grokApiKey;
  }

  /**
   * Генерирует изображение с помощью Grok AI
   * 
   * @param prompt текстовый запрос
   * @returns результат генерации с URL изображения
   */
  static async generateImage(prompt: string): Promise<ImageGenerationResult> {
    logger.info(`Использование Grok для генерации изображения Pro`);
    
    const grokApiKey = await this.getApiKey();
    
    // Делаем запрос к API X.AI для генерации изображения
    const grokResponse = await axios.post(
      'https://api.x.ai/v1/images/generations',
      {
        prompt: prompt,
        model: 'grok-2-image',
        response_format: 'url',
        n: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${grokApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!grokResponse.data?.data?.[0]?.url) {
      throw new Error('Grok API не вернул URL изображения');
    }
    
    const imageUrl = grokResponse.data.data[0].url;
    
    // Логируем полученный промпт (если есть)
    if (grokResponse.data.data[0].revised_prompt) {
      logger.info(`Grok переработал промпт: ${grokResponse.data.data[0].revised_prompt.substring(0, 100)}`);
    }
    
    return { imageUrl, s3Url: '', generator: 'grok-2-image', quality: 'hd' };
  }

  /**
   * Получает ответ от Grok AI для чата
   * 
   * @param messages массив сообщений для контекста
   * @returns ответ от Grok AI
   */
  static async getChatResponse(messages: Array<{role: string, content: string}>): Promise<string> {
    const grokApiKey = await this.getApiKey();

    logger.info(`Отправка запроса в Grok AI для чата`);
    
    const grokResponse = await axios.post('https://api.x.ai/v1/chat/completions', {
      messages,
      model: 'grok-3-beta',
      max_tokens: 2000,
      temperature: 0.7,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${grokApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const aiResponse = grokResponse.data?.choices?.[0]?.message?.content;
    if (!aiResponse) {
      throw new Error('Grok AI не вернул ответ');
    }
    
    return aiResponse;
  }
}