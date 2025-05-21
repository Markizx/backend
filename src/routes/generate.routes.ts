import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as Sentry from '@sentry/node';
import { GenerateController } from '@controllers/generate.controller';
import { authenticate } from '@middleware/auth.middleware';
import { publicRateLimiter } from '@middleware/rate.limiter';
import { ApiResponse } from '@utils/response';

const router = Router();

// Увеличиваем лимит размера файла до 25MB
const upload = multer({
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

// Эндпоинт для генерации контента с расширенными параметрами
router.post('/', publicRateLimiter, authenticate, upload.single('file'), GenerateController.handleGenerate);

// Эндпоинт для получения истории сгенерированных файлов
router.get('/files', authenticate, GenerateController.getUserFiles);

// Новый эндпоинт для получения доступных опций генерации
router.get('/options', authenticate, (req: Request, res: Response) => {
  ApiResponse.send(res, {
    imageModels: [
      {
        id: 'art',
        name: 'Art',
        description: 'Генерация художественных изображений в различных стилях с использованием Dall-E',
        maxDimension: 1024,
        quality: 'hd',
        features: ['Высокое качество', 'Художественные стили', 'Креативность']
      },
      {
        id: 'real',
        name: 'Real',
        description: 'Создание реалистичных фотографических изображений с естественным освещением и текстурами',
        maxDimension: 1024,
        quality: 'hd',
        features: ['Фотореализм', 'Естественность', 'Детализация']
      },
      {
        id: 'pro',
        name: 'Pro',
        description: 'Профессиональная генерация изображений с использованием Grok 2 Image Gen для наилучшего качества',
        maxDimension: 1024,
        quality: 'ultra-hd',
        features: ['Наивысшее качество', 'Сложные композиции', 'Продвинутая детализация']
      }
    ],
    processingTypes: [
      {
        id: 'inpainting',
        name: 'Изменение части изображения',
        description: 'Изменяет центральную область изображения, сохраняя внешние части нетронутыми'
      },
      {
        id: 'outpainting',
        name: 'Расширение границ',
        description: 'Расширяет существующее изображение за его текущие границы, добавляя новый контент по краям'
      },
      {
        id: 'modify',
        name: 'Модификация изображения',
        description: 'Изменяет все изображение согласно текстовому запросу, сохраняя общую композицию'
      }
    ],
    videoOptions: {
      durations: [
        {
          id: '5',
          name: '5 секунд',
          description: 'Короткое видео продолжительностью 5 секунд'
        },
        {
          id: '10',
          name: '10 секунд',
          description: 'Стандартное видео продолжительностью 10 секунд'
        }
      ],
      maxResolution: '1280x768',
      quality: 'high-definition'
    }
  });
});

export default router;
