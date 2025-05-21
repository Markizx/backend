import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, UserDocument } from '@models/User';
import { sendConfirmationEmail, sendResetPasswordEmail } from '@services/mailService';
import { AuthenticatedRequest } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { trackEventManual } from '@middleware/analytics.middleware';
import { getConfig } from '@config/config';
import logger from '@utils/logger';
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
    logger.error('Ошибка инициализации JWT_SECRET:', { error: err.message, stack: err.stack });
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
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.validation_error'), { errors: errors.array() }, 400);
    }

    const { name, email, password } = req.body;

    if (!email || !password) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.email_password_required'), null, 400);
    }

    if (!validatePassword(password)) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.password_requirements'), null, 400);
    }

    try {
      const existing = await User.findOne({ email }).lean() as UserDocument | null;
      if (existing) {
        logger.warn(`Попытка повторной регистрации: ${email}`);
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
      await sendConfirmationEmail(email, confirmToken);
      
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
      
      logger.info(`Новый пользователь зарегистрирован: ${email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.registration_successful'), 201);
    } catch (err: any) {
      if (err.code === 11000) {
        logger.warn(`Дублирование email при регистрации: ${email}`);
        return ApiResponse.sendError(res, await i18nReq.t('errors.email_already_registered'), null, 400);
      }
      logger.error('Ошибка регистрации:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Подтверждение email
   */
  confirmEmail: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
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
      
      logger.info(`Email подтверждён для пользователя: ${user.email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.email_confirmed'));
    } catch (err: any) {
      logger.error('Ошибка подтверждения email:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Вход в систему
   */
  login: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const startTime = Date.now();
    
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
        return ApiResponse.sendError(res, await i18nReq.t('errors.invalid_credentials'), null, 400);
      }

      if (!user._id) {
        throw new Error('ID пользователя отсутствует');
      }

      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, roles: user.roles },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

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

      logger.info(`Пользователь вошёл в систему: ${email}`);
      return ApiResponse.send(res, {
        token,
        user: { id: user._id.toString(), email: user.email, roles: user.roles }
      });
    } catch (err: any) {
      logger.error('Ошибка входа:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Запрос на сброс пароля
   */
  requestPasswordReset: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
    const { email } = req.body;

    if (!email) {
      return ApiResponse.sendError(res, await i18nReq.t('errors.email_password_required'), null, 400);
    }

    try {
      const user = await User.findOne({ email }) as UserDocument | null;
      if (!user) {
        // Не раскрываем информацию о том, существует ли пользователь
        return ApiResponse.send(res, null, await i18nReq.t('success.password_reset_sent'));
      }

      const token = crypto.randomBytes(32).toString('hex');
      user.resetToken = token;
      user.resetTokenExpires = new Date(Date.now() + 3600000);
      await user.save();

      await sendResetPasswordEmail(email, token);
      
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
      
      logger.info(`Запрошен сброс пароля для: ${email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.password_reset_sent'));
    } catch (err: any) {
      logger.error('Ошибка запроса сброса пароля:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, await i18nReq.t('errors.internal_error'), err.message, 500);
    }
  },

  /**
   * Сброс пароля
   */
  resetPassword: async (req: Request, res: Response) => {
    const i18nReq = req as Request & I18nRequest;
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

      logger.info(`Пароль сброшен для пользователя: ${user.email}`);
      return ApiResponse.send(res, null, await i18nReq.t('success.password_changed'));
    } catch (err: any) {
      logger.error('Ошибка сброса пароля:', { error: err.message, stack: err.stack });
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
    try {
      const user = req.user as UserDocument | null;
      if (!user) {
        return ApiResponse.sendError(res, 'Ошибка аутентификации через Google', null, 401);
      }

      if (!user._id) {
        throw new Error('ID пользователя отсутствует');
      }

      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, roles: user.roles },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

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

      logger.info(`Пользователь вошёл через Google: ${user.email}`);
      res.redirect(`${cfg.frontendUrl}/auth/callback?token=${token}`);
    } catch (err: any) {
      logger.error('Ошибка Google OAuth:', { error: err.message, stack: err.stack });
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
      logger.error('Ошибка Apple Sign In:', { error: err.message, stack: err.stack });
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
      logger.error('Ошибка Apple OAuth:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, 'Ошибка аутентификации через Apple', err.message, 500);
    }
  }
};