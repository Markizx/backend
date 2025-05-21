import { OpenAIService } from './ai/openai.service';
import logger from '@utils/logger';

/**
 * Сервис для работы с переводом текста
 */
export class TranslationService {
  /**
   * Переводит текст с любого языка на английский
   * 
   * @param text исходный текст
   * @param openaiApiKey ключ API OpenAI
   * @returns переведенный текст
   */
  static async translateToEnglish(text: string, openaiApiKey: string): Promise<string> {
    try {
      // Используем OpenAIService для перевода текста
      return await OpenAIService.translateToEnglish(text);
    } catch (error: any) {
      logger.error(`Ошибка перевода текста: ${error.message}`);
      // В случае ошибки возвращаем оригинальный текст
      return text;
    }
  }

  /**
   * Определяет, является ли текст на английском языке
   * 
   * @param text исходный текст
   * @returns true, если текст на английском языке
   */
  static isEnglishText(text: string): boolean {
    // Проверяем наличие не-ASCII символов (упрощенное определение не-английского текста)
    return !/[^\x00-\x7F]/.test(text);
  }

  /**
   * Обрезает текст до указанной длины с многоточием
   * 
   * @param text исходный текст
   * @param maxLength максимальная длина
   * @returns обрезанный текст
   */
  static truncateText(text: string, maxLength: number = 50): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}