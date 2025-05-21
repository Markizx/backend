import { Request, Response, NextFunction } from 'express';
import logger from '@utils/logger';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Обертка для асинхронных обработчиков маршрутов, которая перехватывает и передает ошибки 
 * в middleware обработки ошибок Express
 * 
 * @param fn Асинхронная функция-обработчик
 * @returns Обработчик маршрута с интегрированной обработкой ошибок
 */
export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error: Error) => {
      logger.error(`Асинхронная ошибка в обработчике маршрута: ${error.message}`, { 
        path: req.path,
        method: req.method,
        stack: error.stack,
        body: req.body
      });
      next(error);
    });
  };
};

/**
 * Проверяет, соответствует ли объект заданному интерфейсу
 * 
 * @param obj Объект для проверки
 * @param requiredProps Массив обязательных свойств
 * @returns true, если объект соответствует интерфейсу, иначе false
 */
export function validateInterface<T>(obj: any, requiredProps: (keyof T)[]): obj is T {
  if (!obj || typeof obj !== 'object') return false;
  
  for (const prop of requiredProps) {
    if (!(prop in obj)) return false;
  }
  
  return true;
}

/**
 * Обрабатывает исключения в неасинхронных операциях с базой данных
 * 
 * @param operation Функция для выполнения
 * @param errorMessage Сообщение для записи в лог при ошибке
 * @returns Результат операции или null в случае ошибки
 */
export function handleDatabaseOperation<T>(operation: () => T, errorMessage: string): T | null {
  try {
    return operation();
  } catch (error: any) {
    logger.error(`${errorMessage}: ${error.message}`, { stack: error.stack });
    return null;
  }
}