import { Response } from 'express';
import logger from '@utils/logger';

/**
 * Класс для стандартизации ответов API
 */
export class ApiResponse {
  /**
   * Формирует стандартный успешный ответ
   * 
   * @param data Данные для отправки
   * @param message Опциональное сообщение
   * @param meta Метаданные (пагинация и т.д.)
   * @returns Объект ответа
   */
  static success(data: any, message?: string, meta?: Record<string, any>) {
    return {
      success: true,
      data,
      message,
      ...(meta && { meta })
    };
  }
  
  /**
   * Формирует стандартный ответ с ошибкой
   * 
   * @param message Сообщение об ошибке
   * @param details Детали ошибки
   * @param status HTTP статус (по умолчанию 500)
   * @returns Объект ответа с ошибкой
   */
  static error(message: string, details?: any, status?: number) {
    return {
      success: false,
      error: message,
      ...(details && { details }),
      status: status || 500
    };
  }

  /**
   * Отправляет стандартный успешный ответ
   * 
   * @param res Express Response объект
   * @param data Данные для отправки
   * @param message Опциональное сообщение
   * @param status HTTP статус (по умолчанию 200)
   * @param meta Метаданные (пагинация и т.д.)
   */
  static send(res: Response, data: any, message?: string, status: number = 200, meta?: Record<string, any>) {
    return res.status(status).json(this.success(data, message, meta));
  }

  /**
   * Отправляет стандартный ответ с ошибкой
   * 
   * @param res Express Response объект
   * @param message Сообщение об ошибке
   * @param details Детали ошибки
   * @param status HTTP статус (по умолчанию 500)
   */
  static sendError(res: Response, message: string, details?: any, status: number = 500) {
    // Логируем ошибку, только если это серверная ошибка (5xx)
    if (status >= 500) {
      logger.error(`API Error (${status}): ${message}`, { details });
    } else if (status >= 400) {
      logger.warn(`Client Error (${status}): ${message}`, { details });
    }
    
    return res.status(status).json(this.error(message, details, status));
  }
}