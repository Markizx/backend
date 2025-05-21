import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import * as Sentry from '@sentry/node';
import { AuthController } from '@controllers/auth.controller';
import { authenticate, optionalAuthenticate } from '@middleware/auth.middleware';
import { authRateLimiter } from '@middleware/rate.limiter';
import { trackEvent } from '@middleware/analytics.middleware';
import { ApiResponse } from '@utils/response';
import passport from 'passport';
import logger from '@utils/logger';
import { UserDocument } from '@models/User';

const router = Router();

const passwordValidation = body('password')
  .isLength({ min: 8 })
  .withMessage('Пароль должен быть не короче 8 символов')
  .matches(/[A-Za-z]/)
  .withMessage('Пароль должен содержать хотя бы одну букву')
  .matches(/\d/)
  .withMessage('Пароль должен содержать хотя бы одну цифру')
  .matches(/[!@#$%^&*]/)
  .withMessage('Пароль должен содержать хотя бы один специальный символ (!@#$%^&*)');

router.post(
  '/register',
  authRateLimiter,
  body('email').isEmail().withMessage('Неверный формат email'),
  body('name').optional().isLength({ min: 2 }).withMessage('Имя должно быть не короче 2 символов'),
  passwordValidation,
  trackEvent('registration', 'user'),
  AuthController.register
);

router.get('/confirm/:token', trackEvent('email_confirmed', 'user'), AuthController.confirmEmail);

router.post(
  '/login',
  authRateLimiter,
  body('email').isEmail().withMessage('Неверный формат email'),
  body('password').notEmpty().withMessage('Пароль обязателен'),
  trackEvent('login', 'user'),
  AuthController.login
);

router.post(
  '/request-password-reset',
  authRateLimiter,
  body('email').isEmail().withMessage('Неверный формат email'),
  trackEvent('password_reset_requested', 'user'),
  AuthController.requestPasswordReset
);

router.post(
  '/reset-password/:token',
  passwordValidation,
  trackEvent('password_reset_completed', 'user'),
  AuthController.resetPassword
);

router.get('/google', (req: Request, res: Response, next: NextFunction) => {
  logger.info('Handling /auth/google');
  try {
    AuthController.googleAuth(req, res, next);
  } catch (err: any) {
    logger.error('Ошибка в /auth/google:', { error: err.message, stack: err.stack });
    ApiResponse.sendError(res, 'Ошибка Google OAuth', null, 500);
  }
});

router.get('/google/callback', (req: Request, res: Response, next: NextFunction) => {
  logger.info('Handling /auth/google/callback');
  passport.authenticate('google', { session: false }, (err: any, user: UserDocument | false, info: any) => {
    if (err) {
      logger.error('Ошибка в /auth/google/callback:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, 'Ошибка Google OAuth', null, 500);
    }
    if (!user) {
      logger.warn('Google OAuth: пользователь не аутентифицирован', { info });
      return ApiResponse.sendError(res, 'Аутентификация через Google не удалась', null, 401);
    }
    req.user = user;
    AuthController.googleAuthCallback(req, res);
  })(req, res, next);
});

router.get('/apple', AuthController.appleAuth);
// Временно отключено до получения секретов Apple
// router.post('/apple/callback', passport.authenticate('apple', { session: false }), AuthController.appleAuthCallback);

// Logout route (опциональный, для явного logout на фронтенде)
router.post('/logout', optionalAuthenticate, trackEvent('logout', 'user'), (req: Request, res: Response) => {
  // В случае JWT logout происходит на клиенте (удаление токена)
  // Здесь можно добавить логику для blacklist токенов если нужно
  ApiResponse.send(res, null, 'Successfully logged out');
});

export default router;