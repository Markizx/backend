import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthenticatedRequest, authenticate } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { publicRateLimiter } from '@middleware/rate.limiter';
import { User, UserDocument } from '@models/User';
import { SubscriptionPlan, SubscriptionPlanDocument } from '@models/SubscriptionPlan';
import { sendConfirmationEmail } from '@services/mailService';
import { ApiResponse } from '@utils/response';
import logger from '@utils/logger';
import { body, validationResult } from 'express-validator';

logger.info('Registering user routes');

const router = Router();

router.use(publicRateLimiter);
router.use(authenticate);

router.post('/update-profile', async (req: Request, res: Response) => {
  logger.info('Handling /user/update-profile');
  const authReq = req as AuthenticatedRequest & I18nRequest & { body: { name?: string } };
  const { name } = authReq.body;
  const userId = authReq.user?.id;

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    if (name && (typeof name !== 'string' || name.length < 2)) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (name) {
      user.name = name;
      await user.save();
      logger.info(`Пользователь ${user.email} обновил имя: ${name}`);
    }

    return ApiResponse.send(res, { 
      user: { id: user._id, email: user.email, name: user.name } 
    }, await authReq.t('success.profile_updated'));
  } catch (err: any) {
    logger.error('Ошибка обновления профиля:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
  }
});

// Новый роут для смены языка
router.put('/language', async (req: Request, res: Response) => {
  logger.info('Handling /user/language');
  const authReq = req as AuthenticatedRequest & I18nRequest & { body: { language: string } };
  const { language } = authReq.body;
  const userId = authReq.user?.id;

  if (!userId) {
    return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
  }

  const supportedLanguages = ['en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no'];
  
  if (!language || !supportedLanguages.includes(language)) {
    return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), {
      supportedLanguages
    }, 400);
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    user.preferredLanguage = language;
    await user.save();

    logger.info(`Пользователь ${user.email} изменил язык на: ${language}`);
    return ApiResponse.send(res, { 
      language: user.preferredLanguage
    }, await authReq.t('success.language_changed'));
  } catch (err: any) {
    logger.error('Ошибка смены языка:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
  }
});

// Роут для получения информации о пользователе включая предпочитаемый язык
router.get('/profile', async (req: Request, res: Response) => {
  logger.info('Handling /user/profile');
  const authReq = req as AuthenticatedRequest & I18nRequest;
  const userId = authReq.user?.id;

  // Проверяем случай отключенной аутентификации
  if (authReq.authDisabled) {
    return ApiResponse.send(res, { 
      user: {
        id: 'system',
        email: 'system@contentstar.app',
        name: 'System Admin',
        preferredLanguage: 'ru',
        isSubscribed: true,
        subscriptionPlan: 'pro',
        textLimit: 999999,
        imageLimit: 999999,
        videoLimit: 999999,
        textUsed: 0,
        imageUsed: 0,
        videoUsed: 0,
        roles: ['admin', 'user']
      }
    });
  }

  if (!userId) {
    return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
  }

  try {
    const user = await User.findById(userId).select('-passwordHash -confirmToken -resetToken') as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    return ApiResponse.send(res, { 
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        preferredLanguage: user.preferredLanguage || 'en',
        isSubscribed: user.isSubscribed,
        subscriptionPlan: user.subscriptionPlan,
        textLimit: user.textLimit,
        imageLimit: user.imageLimit,
        videoLimit: user.videoLimit,
        textUsed: user.textUsed,
        imageUsed: user.imageUsed,
        videoUsed: user.videoUsed,
      }
    });
  } catch (err: any) {
    logger.error('Ошибка получения профиля:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
  }
});

router.post(
  '/change-email',
  body('email').isEmail().withMessage('Неверный формат email'),
  async (req: Request, res: Response) => {
    logger.info('Handling /user/change-email');
    const authReq = req as AuthenticatedRequest & I18nRequest & { body: { email: string } };
    const { email } = authReq.body;
    const userId = authReq.user?.id;

    const errors = validationResult(authReq);
    if (!errors.isEmpty()) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), { errors: errors.array() }, 400);
    }

    try {
      const user = await User.findById(userId) as UserDocument | null;
      if (!user) {
        return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
      }

      const existingUser = await User.findOne({ email }) as UserDocument | null;
      if (existingUser && existingUser._id && existingUser._id.toString() !== userId) {
        return ApiResponse.sendError(res, await authReq.t('errors.email_already_registered'), null, 400);
      }

      user.email = email;
      user.emailVerified = false;
      const confirmToken = crypto.randomBytes(32).toString('hex');
      user.confirmToken = confirmToken;
      user.confirmTokenExpires = new Date(Date.now() + 24 * 3600 * 1000);
      await user.save();

      await sendConfirmationEmail(email, confirmToken);
      logger.info(`Пользователь ${user.email} запросил смену email на ${email}`);
      return ApiResponse.send(res, null, await authReq.t('success.email_changed'));
    } catch (err: any) {
      logger.error('Ошибка изменения email:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
    }
  }
);

router.post('/change-password', async (req: Request, res: Response) => {
  logger.info('Handling /user/change-password');
  const authReq = req as AuthenticatedRequest & I18nRequest & { body: { oldPassword: string; newPassword: string } };
  const { oldPassword, newPassword } = authReq.body;
  const userId = authReq.user?.id;

  if (!oldPassword || !newPassword) {
    return ApiResponse.sendError(res, await authReq.t('errors.email_password_required'), null, 400);
  }

  if (
    newPassword.length < 8 ||
    !/[A-Za-z]/.test(newPassword) ||
    !/\d/.test(newPassword) ||
    !/[!@#$%^&*]/.test(newPassword)
  ) {
    return ApiResponse.sendError(res, await authReq.t('errors.password_requirements'), null, 400);
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user || !user.passwordHash) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match) {
      return ApiResponse.sendError(res, await authReq.t('errors.invalid_credentials'), null, 400);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    logger.info(`Пользователь ${user.email} сменил пароль`);
    return ApiResponse.send(res, null, await authReq.t('success.password_changed'));
  } catch (err: any) {
    logger.error('Ошибка смены пароля:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
  }
});

router.post('/subscription/cancel', async (req: Request, res: Response) => {
  logger.info('Handling /user/subscription/cancel');
  const authReq = req as AuthenticatedRequest & I18nRequest;
  const userId = authReq.user?.id;

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    if (!user.isSubscribed) {
      return ApiResponse.sendError(res, await authReq.t('errors.subscription_required'), null, 400);
    }

    user.isSubscribed = false;
    user.subscriptionPlan = null;
    user.textLimit = 0;
    user.imageLimit = 0;
    user.videoLimit = 0;
    user.subscriptionEnd = undefined;
    await user.save();

    logger.info(`Пользователь ${user.email} отменил подписку через /user/subscription/cancel`);
    return ApiResponse.send(res, null, await authReq.t('success.subscription_cancelled'));
  } catch (err: any) {
    logger.error('Ошибка отмены подписки через /user/subscription/cancel:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
  }
});

router.post('/subscription/change', async (req: Request, res: Response) => {
  logger.info('Handling /user/subscription/change');
  const authReq = req as AuthenticatedRequest & I18nRequest & { body: { plan: 'basic' | 'plus' | 'pro' } };
  const { plan } = authReq.body;
  const userId = authReq.user?.id;

  if (!userId) {
    return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
  }

  if (!plan || !['basic', 'plus', 'pro'].includes(plan)) {
    return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    const planDoc = await SubscriptionPlan.findOne({ name: plan }) as SubscriptionPlanDocument | null;
    if (!planDoc) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    user.subscriptionPlan = plan;
    user.textLimit = planDoc.textLimit;
    user.imageLimit = planDoc.imageLimit;
    user.videoLimit = planDoc.videoLimit;
    user.isSubscribed = true;
    user.subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    logger.info(`Пользователь ${user.email} сменил план подписки на ${plan}`);
    return ApiResponse.send(res, { plan }, await authReq.t('success.subscription_changed'));
  } catch (err: any) {
    logger.error('Ошибка смены плана подписки:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
  }
});

router.get('/test', (req: Request, res: Response) => {
  logger.info('Handling /user/test');
  return ApiResponse.send(res, { message: 'User routes working' });
});

router.delete('/profile', async (req: Request, res: Response) => {
  logger.info('Handling /user/profile delete');
  const authReq = req as AuthenticatedRequest & I18nRequest;
  const userId = authReq.user?.id;

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    await user.deleteOne();
    logger.info(`Пользователь ${user.email} удалил свой профиль`);
    return ApiResponse.send(res, null, await authReq.t('success.profile_updated'));
  } catch (err: any) {
    logger.error('Ошибка удаления профиля:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, await authReq.t('errors.internal_error'), null, 500);
  }
});

export default router;