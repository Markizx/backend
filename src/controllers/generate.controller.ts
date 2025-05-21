import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { User, UserDocument } from '@models/User';
import { GeneratedFile } from '@models/GeneratedFile';
import { GlobalConfig } from '@models/GlobalConfig';
import { asyncHandler } from '@utils/asyncHandler';
import { ApiResponse } from '@utils/response';
import logger from '@utils/logger';
import { getSecrets } from '@utils/getSecrets';
import { ImageService } from '@services/image.service';
import { VideoService } from '@services/video.service';
import { TextService } from '@services/text.service';

// Импорт констант и типов
import { 
  GenerationMode, 
  ImageModel, 
  FileType,
  ProcessingType,
  VideoDuration
} from '@constants/enums';

// Используем относительный путь для импорта типов вместо path alias
import { 
  GenerationResult, 
  TextGenerationResult, 
  ImageGenerationResult,
  VideoGenerationResult,
  DescriptionResult,
  isTextGenerationResult,
  isImageGenerationResult,
  isVideoGenerationResult,
  isDescriptionResult,
  extractMetadata
} from '../types/generation.types';

/**
 * Контроллер для генерации контента
 */
export const GenerateController = {
  /**
   * Обработчик генерации контента различных типов
   */
  handleGenerate: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & { 
      body: { 
        mode?: string; 
        prompt?: string; 
        style?: string; 
        imageModel?: string;
        processingType?: string;
        duration?: string;
      }; 
      file?: Express.Multer.File 
    };
    
    const { 
      mode = GenerationMode.TEXT, 
      prompt, 
      style, 
      imageModel = ImageModel.ART,
      processingType,
      duration = VideoDuration.STANDARD // По умолчанию 10 секунд
    } = authReq.body;
    
    const file = authReq.file;
    const userId = authReq.user?.id;

    // Проверяем случай отключенной аутентификации
    if (authReq.authDisabled) {
      logger.info('Генерация контента при отключенной аутентификации');
    } else if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    // Получаем пользователя, если аутентификация не отключена и ID не пустой
    let userDoc: UserDocument | null = null;
    if (!authReq.authDisabled && userId && userId.length > 0) {
      userDoc = await User.findById(userId);
      if (!userDoc) {
        return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
      }
    }

    // Проверка лимитов подписки
    const globalConfig = await GlobalConfig.findOne();
    if (!globalConfig?.subscriptionEnabled) {
      logger.info('Подписки отключены глобально - генерация без проверки лимитов');
    } else if (!authReq.authDisabled && userDoc) {
      if (!userDoc.isSubscribed) {
        return ApiResponse.sendError(res, await authReq.t('errors.subscription_required'), null, 403);
      }

      const now = new Date();
      if (userDoc.trialEnd && now > userDoc.trialEnd && !userDoc.subscriptionEnd) {
        userDoc.isSubscribed = false;
        userDoc.trialUsed = true;
        await userDoc.save();
        return ApiResponse.sendError(res, await authReq.t('limits.trial_expired'), null, 403);
      }
      if (userDoc.subscriptionEnd && now > userDoc.subscriptionEnd) {
        userDoc.isSubscribed = false;
        userDoc.subscriptionPlan = null;
        userDoc.textLimit = 0;
        userDoc.imageLimit = 0;
        userDoc.videoLimit = 0;
        await userDoc.save();
        return ApiResponse.sendError(res, await authReq.t('limits.subscription_expired'), null, 403);
      }

      if (mode === GenerationMode.TEXT && userDoc.textUsed >= (userDoc.textLimit ?? 0)) {
        return ApiResponse.sendError(res, await authReq.t('limits.text_limit_exceeded', { 
          interpolation: { limit: userDoc.textLimit ?? 0 } 
        }), null, 403);
      }
      if (mode === GenerationMode.IMAGE && userDoc.imageUsed >= (userDoc.imageLimit ?? 0)) {
        return ApiResponse.sendError(res, await authReq.t('limits.image_limit_exceeded', { 
          interpolation: { limit: userDoc.imageLimit ?? 0 } 
        }), null, 403);
      }
      if (mode === GenerationMode.VIDEO && userDoc.videoUsed >= (userDoc.videoLimit ?? 0)) {
        return ApiResponse.sendError(res, await authReq.t('limits.video_limit_exceeded', { 
          interpolation: { limit: userDoc.videoLimit ?? 0 } 
        }), null, 403);
      }
    }

    // Валидация входных данных
    if (!prompt && !file) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (!Object.values(GenerationMode).includes(mode as GenerationMode)) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (prompt && typeof prompt !== 'string') {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (prompt && prompt.length > 1000) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (style && typeof style !== 'string') {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    // Проверка валидности параметра duration
    if (mode === GenerationMode.VIDEO && !Object.values(VideoDuration).includes(duration as VideoDuration)) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), {
        details: 'Параметр duration должен быть 5 или 10'
      }, 400);
    }

    // Получение секретов API
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Secrets not loaded');
    }

    // Обработка генерации контента по типу
    try {
      let result: GenerationResult;
      
      // Направляем запрос в соответствующий сервис в зависимости от режима
      if (mode === GenerationMode.TEXT) {
        result = await TextService.generateText(prompt || '', file?.buffer);
        
        // Обновляем счетчики пользователя
        if (userDoc) {
          const session = await mongoose.startSession();
          try {
            session.startTransaction();
            
            await GeneratedFile.create([{ 
              user: userId, 
              s3Url: result.s3Url, 
              type: FileType.TEXT 
            }], { session });
            
            userDoc.textUsed += 1;
            await userDoc.save({ session });
            
            await session.commitTransaction();
          } catch (err: any) {
            await session.abortTransaction();
            logger.error('Ошибка обновления счетчиков:', { error: err.message });
          } finally {
            session.endSession();
          }
        }
      } 
      else if (mode === GenerationMode.IMAGE) {
        if (prompt && !file) {
          // Выбираем модель для генерации
          if (imageModel === ImageModel.ART) {
            result = await ImageService.generateWithDallE(prompt);
          } else if (imageModel === ImageModel.REAL) {
            result = await ImageService.generateWithStability(prompt);
          } else if (imageModel === ImageModel.PRO) {
            result = await ImageService.generateWithGrok(prompt);
          } else {
            // Если неизвестная модель, используем DALL-E по умолчанию
            result = await ImageService.generateWithDallE(prompt);
          }
        } 
        else if (file && processingType) {
          result = await ImageService.processImage(file.buffer, prompt || '', processingType);
        } 
        else if (file && !processingType) {
          result = await ImageService.modifyImage(file.buffer, prompt || style || 'Улучшить это изображение');
        } else {
          return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
        }
        
        // Обновляем счетчики пользователя
        if (userDoc && result) {
          const session = await mongoose.startSession();
          try {
            session.startTransaction();
            
            // Извлекаем метаданные из результата используя утилиту из типов
            const metadata = extractMetadata(result);
            
            // Добавляем промт в метаданные
            if (prompt) {
              metadata.prompt = prompt;
            }
            
            await GeneratedFile.create([{ 
              user: userId, 
              s3Url: result.s3Url, 
              type: FileType.IMAGE,
              metadata
            }], { session });
            
            userDoc.imageUsed += 1;
            await userDoc.save({ session });
            
            await session.commitTransaction();
          } catch (err: any) {
            await session.abortTransaction();
            logger.error('Ошибка обновления счетчиков:', { error: err.message });
          } finally {
            session.endSession();
          }
        }
      } 
      else if (mode === GenerationMode.VIDEO) {
        const videoDuration = duration === VideoDuration.SHORT ? 5 : 10;
        result = await VideoService.generateVideo(prompt || '', videoDuration, file?.buffer);
        
        // Обновляем счетчики пользователя
        if (userDoc) {
          const session = await mongoose.startSession();
          try {
            session.startTransaction();
            
            await GeneratedFile.create([{ 
              user: userId, 
              s3Url: result.s3Url, 
              type: FileType.VIDEO,
              metadata: {
                duration: videoDuration,
                prompt
              }
            }], { session });
            
            userDoc.videoUsed += 1;
            await userDoc.save({ session });
            
            await session.commitTransaction();
          } catch (err: any) {
            await session.abortTransaction();
            logger.error('Ошибка обновления счетчиков:', { error: err.message });
          } finally {
            session.endSession();
          }
        }
      } 
      else if (mode === GenerationMode.IMAGE_TO_TEXT) {
        if (!file) {
          return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
        }
        
        result = await TextService.generateImageDescription(file.buffer, prompt || 'Опишите это изображение');
        
        // Обновляем счетчики пользователя
        if (userDoc) {
          const session = await mongoose.startSession();
          try {
            session.startTransaction();
            
            await GeneratedFile.create([{ 
              user: userId, 
              s3Url: result.s3Url, 
              type: FileType.DESCRIPTION 
            }], { session });
            
            userDoc.textUsed += 1;
            await userDoc.save({ session });
            
            await session.commitTransaction();
          } catch (err: any) {
            await session.abortTransaction();
            logger.error('Ошибка обновления счетчиков:', { error: err.message });
          } finally {
            session.endSession();
          }
        }
      } else {
        return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
      }

      return ApiResponse.send(res, result);
    } catch (err: any) {
      logger.error('Ошибка генерации:', { error: err.message, stack: err.stack, response: err.response?.data });
      
      if (err.response) {
        return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), {
          details: err.response.data || err.message,
          status: err.response.status,
        }, err.response.status || 500);
      }
      
      if (err.code === 'ECONNABORTED') {
        return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), {
          details: 'Запрос занял слишком много времени. Попробуйте упростить запрос или повторить позже.',
        }, 504);
      }
      
      return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), err.message, 500);
    }
  }),

  /**
   * Получение истории файлов пользователя
   */
  getUserFiles: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const files = await GeneratedFile.find({
      user: userId,
      createdAt: { $gte: sevenDaysAgo },
    }).sort({ createdAt: -1 });

    logger.info(`Получена история файлов для пользователя: ${userId}`);
    return ApiResponse.send(res, files);
  })
};