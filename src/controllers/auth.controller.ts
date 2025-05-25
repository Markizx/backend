import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, UserDocument } from '@models/User';
import { sendConfirmationEmail, sendResetPasswordEmail } from '@services/mailService';
import { AuthenticatedRequest, generateToken } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { trackEventManual } from '@middleware/analytics.middleware';
import { blacklistService } from '@utils/token-blacklist';
import { withRetry } from '@utils/retry';
import { enhancedLogger } from '@utils/enhanced-logger';
import { Sanitizer } from '@utils/sanitizer';
import { getConfig } from '@config/config';
import passport from 'passport';
import { ApiResponse } from '@utils/response';

let JWT_SECRET: string;
let cfg: any;

async function initializeAuth() {
  try {
    cfg = await getConfig();
    JWT_SECRET = cfg.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET не найден в конфигурации');
    }
  } catch (err: any) {
    enhancedLogger.error('Ошибка инициализации JWT_SECRET:', err);
    process.exit(1);
  }
}

initializeAuth();

const validatePassword = (password: string): boolean => {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && /[!@#$%^&*]/.test(password);
};

/**
 * Контроллер для аутентификации пользователей
 */
export const AuthController = {
  /**
   * Регистрация нового пользователя
   */
  register: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const startTime = Date.now();
    const requestLogger = (req as any).logger || enhancedLogger;
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.validation_error'), { errors: errors.array() }, 400);
    }

    const { name, email, password } = req.body;

    // Дополнительная проверка на SQL/NoSQL инъекции
    if (Sanitizer.containsSqlInjection(email) || Sanitizer.containsNoSqlInjection(email)) {
      requestLogger.warn('Попытка SQL/NoSQL инъекции при регистрации', { email });
      return ApiResponse.sendError(res, await i18nReq.t('errors.validation_error'), null, 400);
    }

    if (!email || !password) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.email_password_required'), null, 400);
    }

    if (!validatePassword(password)) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.password_requirements'), null, 400);
    }

    try {
      const existing = await User.findOne({ email }).lean() as UserDocument | null;
      if (existing) {
        requestLogger.warn(`Попытка повторной регистрации: ${email}`);
        return ApiResponse.sendError(res, await i18nReq.t('errors.email_already_registered'), null, 400);
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const confirmToken = crypto.randomBytes(32).toString('hex');

      const user = new User({
        name: name || undefined,
        email,
        passwordHash,
        roles: ['user'],
        emailVerified: false,
        confirmToken,
        confirmTokenExpires: new Date(Date.now() + 24 * 3600 * 1000),
      });

      await user.save();
      
      // Отправка email с retry
      await withRetry(
        () => sendConfirmationEmail(email, confirmToken),
        {
          maxRetries: 3,
          baseDelay: 1000,
          retryCondition: (error) => error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT'
        }
      );
      
      // Трекинг события регистрации
      await trackEventManual(
        'registration',
        'user',
        { 
          email,
          name: name || undefined,
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        },
        user._id?.toString(),
        { duration_ms: Date.now() - startTime }
      );
      
      requestLogger.info(`Новый пользователь зарегистрирован: ${email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.registration_successful'), 201);
    } catch (err: any) {
      if (err.code === 11000) {
        requestLogger.warn(`Дублирование email при регистрации: ${email}`);
        return ApiResponse.sendError(res, await i18nReq.t('errors.email_already_registered'), null, 400);
      }
      requestLogger.error('Ошибка регистрации:', err);
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Подтверждение email
   */
  confirmEmail: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const requestLogger = (req as any).logger || enhancedLogger;
    const { token } = req.params;

    if (!token) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.invalid_token'), null, 400);
    }

    try {
      const user = await User.findOne({
        confirmToken: token,
        confirmTokenExpires: { $gt: new Date() },
      }) as UserDocument | null;

      if (!user) {
        return ApiResponse.sendError(res, await i18nReq.t('errors.invalid_token'), null, 400);
      }

      user.emailVerified = true;
      user.confirmToken = undefined;
      user.confirmTokenExpires = undefined;

      await user.save();
      
      // Трекинг подтверждения email
      await trackEventManual(
        'email_confirmed',
        'user',
        { email: user.email },
        user._id?.toString()
      );
      
      requestLogger.info(`Email подтверждён для пользователя: ${user.email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.email_confirmed'));
    } catch (err: any) {
      requestLogger.error('Ошибка подтверждения email:', err);
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Вход в систему
   */
  login: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const startTime = Date.now();
    const requestLogger = (req as any).logger || enhancedLogger;
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.validation_error'), { errors: errors.array() }, 400);
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.email_password_required'), null, 400);
    }

    try {
      const user = await User.findOne({ email }) as UserDocument | null;
      if (!user || !user.passwordHash) {
        // Трекинг неудачной попытки входа
        await trackEventManual(
          'login_failed',
          'user',
          { 
            email,
            reason: 'user_not_found',
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
          }
        );
        
        // Добавляем небольшую задержку для защиты от timing атак
        await new Promise(resolve => setTimeout(resolve, 500));
        return ApiResponse.sendError(res, await i18nReq.t('errors.invalid_credentials'), null, 400);
      }

      if (!user.emailVerified) {
        return ApiResponse.sendError(res, await i18nReq.t('errors.email_not_verified'), null, 403);
      }

      if (!user.isActive) {
        return ApiResponse.sendError(res, await i18nReq.t('errors.account_blocked'), null, 403);
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        // Трекинг неудачной попытки входа
        await trackEventManual(
          'login_failed',
          'user',
          { 
            email,
            reason: 'invalid_password',
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
          },
          user._id?.toString()
        );
        
        // Добавляем небольшую задержку для защиты от timing атак
        await new Promise(resolve => setTimeout(resolve, 500));
        return ApiResponse.sendError(res, await i18nReq.t('errors.invalid_credentials'), null, 400);
      }

      if (!user._id) {
        throw new Error('ID пользователя отсутствует');
      }

      // Генерируем токен с улучшенной безопасностью
      const token = await generateToken(user);

      // Трекинг успешного входа
      await trackEventManual(
        'login',
        'user',
        { 
          email,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          roles: user.roles
        },
        user._id.toString(),
        { duration_ms: Date.now() - startTime }
      );

      requestLogger.info(`Пользователь вошёл в систему: ${email}`);
      return ApiResponse.send(res, {
        token,
        user: { id: user._id.toString(), email: user.email, roles: user.roles }
      });
    } catch (err: any) {
      requestLogger.error('Ошибка входа:', err);
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Выход из системы
   */
  logout: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const requestLogger = (req as any).logger || enhancedLogger;
    const token = (req as any).token;

    try {
      // Добавляем токен в черный список
      if (token) {
        await blacklistService.addToBlacklist(token, 'logout');
        requestLogger.info('Токен добавлен в черный список при logout');
      }

      // Трекинг выхода
      const authReq = req as AuthenticatedRequest;
      if (authReq.user?.id) {
        await trackEventManual(
          'logout',
          'user',
          { 
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
          },
          authReq.user.id
        );
      }

      return ApiResponse.send(res, null, await i18nReq.t('success.logout'));
    } catch (err: any) {
      requestLogger.error('Ошибка при logout:', err);
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Запрос на сброс пароля
   */
  requestPasswordReset: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const requestLogger = (req as any).logger || enhancedLogger;
    const { email } = req.body;

    if (!email) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.email_password_required'), null, 400);
    }

    try {
      const user = await User.findOne({ email }) as UserDocument | null;
      if (!user) {
        // Не раскрываем информацию о том, существует ли пользователь
        // Добавляем задержку для имитации обработки
        await new Promise(resolve => setTimeout(resolve, 1000));
        return ApiResponse.send(res, null, await i18nReq.t('success.password_reset_sent'));
      }

      const token = crypto.randomBytes(32).toString('hex');
      user.resetToken = token;
      user.resetTokenExpires = new Date(Date.now() + 3600000);
      await user.save();

      // Отправка email с retry
      await withRetry(
        () => sendResetPasswordEmail(email, token),
        {
          maxRetries: 3,
          baseDelay: 1000,
          retryCondition: (error) => error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT'
        }
      );
      
      // Трекинг запроса сброса пароля
      await trackEventManual(
        'password_reset_requested',
        'user',
        { 
          email,
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        },
        user._id?.toString()
      );
      
      requestLogger.info(`Запрошен сброс пароля для: ${email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.password_reset_sent'));
    } catch (err: any) {
      requestLogger.error('Ошибка запроса сброса пароля:', err);
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Сброс пароля
   */
  resetPassword: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const requestLogger = (req as any).logger || enhancedLogger;
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.invalid_token'), null, 400);
    }

    if (!password) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.email_password_required'), null, 400);
    }

    if (!validatePassword(password)) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.password_requirements'), null, 400);
    }

    try {
      const user = await User.findOne({
        resetToken: token,
        resetTokenExpires: { $gt: new Date() },
      }) as UserDocument | null;

      if (!user) {
        return ApiResponse.sendError(res, await i18nReq.t('errors.invalid_token'), null, 400);
      }

      user.passwordHash = await bcrypt.hash(password, 12);
      user.resetToken = undefined;
      user.resetTokenExpires = undefined;
      await user.save();

      // Добавляем все активные токены пользователя в черный список
      // (в реальном приложении нужно хранить активные токены)
      requestLogger.info('Пароль изменен, старые токены должны быть инвалидированы');

      // Трекинг сброса пароля
      await trackEventManual(
        'password_reset_completed',
        'user',
        { 
          email: user.email,
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        },
        user._id?.toString()
      );

      requestLogger.info(`Пароль сброшен для пользователя: ${user.email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.password_changed'));
    } catch (err: any) {
      requestLogger.error('Ошибка сброса пароля:', err);
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Аутентификация через Google
   */
  googleAuth: (req: Request, res: Response, next: NextFunction) => {
    return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  },

  /**
   * Обратный вызов для аутентификации через Google
   */
  googleAuthCallback: async (req: Request, res: Response) => {
    const requestLogger = (req as any).logger || enhancedLogger;
    
    try {
      const user = req.user as UserDocument | null;
      if (!user) {
        return ApiResponse.sendError(res, 'Ошибка аутентификации через Google', null, 401);
      }

      if (!user._id) {
        throw new Error('ID пользователя отсутствует');
      }

      // Генерируем токен с улучшенной безопасностью
      const token = await generateToken(user);

      // Трекинг OAuth входа
      await trackEventManual(
        'login_oauth_google',
        'user',
        { 
          email: user.email,
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        },
        user._id.toString()
      );

      requestLogger.info(`Пользователь вошёл через Google: ${user.email}`);
      res.redirect(`${cfg.frontendUrl}/auth/callback?token=${token}`);
    } catch (err: any) {
      requestLogger.error('Ошибка Google OAuth:', err);
      return ApiResponse.sendError(res, 'Ошибка аутентификации через Google', err.message, 500);
    }
  },

  /**
   * Аутентификация через Apple
   */
  appleAuth: async (req: Request, res: Response, next: NextFunction) => {
    try {
      return ApiResponse.sendError(res, 'Apple Sign In временно недоступен', null, 503);
    } catch (err: any) {
      enhancedLogger.error('Ошибка Apple Sign In:', err);
      return ApiResponse.sendError(res, 'Ошибка сервера', null, 500);
    }
  },

  /**
   * Обратный вызов для аутентификации через Apple
   */
  appleAuthCallback: async (req: Request, res: Response) => {
    try {
      return ApiResponse.sendError(res, 'Apple Sign In временно недоступен', null, 503);
    } catch (err: any) {
      enhancedLogger.error('Ошибка Apple OAuth:', err);
      return ApiResponse.sendError(res, 'Ошибка аутентификации через Apple', err.message, 500);
    }
  }
};