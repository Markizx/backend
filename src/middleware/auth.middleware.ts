import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '@config/config';
import { GlobalConfig, GlobalConfigDocument } from '@models/GlobalConfig';
import { blacklistService } from '@utils/token-blacklist';
import logger from '@utils/logger';
import { User, UserDocument } from '@models/User';
import { ApiResponse } from '@utils/response';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; roles: string[] };
  authDisabled?: boolean;
}

export interface JWTPayload {
  id: string;
  email: string;
  roles: string[];
  iss?: string;
  iat?: number;
  exp?: number;
}

let JWT_SECRET: string;
let JWT_ISSUER: string = 'contentstar.app';

async function initializeJwt() {
  try {
    const config = await getConfig();
    JWT_SECRET = config.JWT_SECRET;
    JWT_ISSUER = config.JWT_ISSUER || 'contentstar.app';
    
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET не найден в конфигурации');
    }
    logger.info('JWT_SECRET инициализирован');
  } catch (err: any) {
    logger.error('Ошибка инициализации JWT_SECRET:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

initializeJwt();

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Проверяем глобальную настройку аутентификации
    const globalConfig = await GlobalConfig.findOne() as GlobalConfigDocument | null;
    
    // Если аутентификация отключена глобально, пропускаем всех пользователей
    if (globalConfig && globalConfig.authenticationEnabled === false) {
      logger.info('Аутентификация отключена глобально - доступ разрешен без проверки токена');
      
      // Устанавливаем флаг отключенной аутентификации
      (req as AuthenticatedRequest).authDisabled = true;
      
      // Создаем системного пользователя с админскими правами
      (req as AuthenticatedRequest).user = {
        id: '',
        email: 'system@contentstar.app',
        roles: ['admin', 'user']
      };
      
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn('Токен не предоставлен');
      return ApiResponse.sendError(res, 'Токен не предоставлен', null, 401);
    }

    const tokenString = authHeader.split(' ')[1];
    
    // Проверяем токен в черном списке
    const isBlacklisted = await blacklistService.isBlacklisted(tokenString);
    if (isBlacklisted) {
      logger.warn('Попытка использования токена из черного списка');
      return ApiResponse.sendError(res, 'Токен недействителен', null, 401);
    }
    
    try {
      if (!JWT_SECRET) {
        const config = await getConfig();
        JWT_SECRET = config.JWT_SECRET;
        JWT_ISSUER = config.JWT_ISSUER || 'contentstar.app';
        
        if (!JWT_SECRET) {
          throw new Error('JWT_SECRET не найден в конфигурации');
        }
      }
      
      // Улучшенная проверка JWT с дополнительными параметрами безопасности
      const decoded = jwt.verify(tokenString, JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        maxAge: '7d', // Максимальный возраст токена
        clockTolerance: 30, // Допустимое расхождение времени в секундах
      }) as JWTPayload;

      // Дополнительные проверки payload
      if (!decoded.id || !decoded.email || !Array.isArray(decoded.roles)) {
        logger.warn('Неполный payload в JWT токене');
        return ApiResponse.sendError(res, 'Недействительный токен', null, 401);
      }

      // Проверяем существование пользователя и его активность
      const user = await User.findById(decoded.id) as UserDocument | null;
      if (!user) {
        logger.warn('Пользователь не найден', { userId: decoded.id });
        return ApiResponse.sendError(res, 'Пользователь не найден', null, 404);
      }
      
      if (!user.isActive) {
        logger.warn('Аккаунт заблокирован', { userId: decoded.id });
        return ApiResponse.sendError(res, 'Аккаунт заблокирован', null, 403);
      }

      // Проверяем, что email в токене соответствует email пользователя
      if (user.email !== decoded.email) {
        logger.warn('Email в токене не соответствует email пользователя', {
          tokenEmail: decoded.email,
          userEmail: user.email
        });
        return ApiResponse.sendError(res, 'Недействительный токен', null, 401);
      }

      (req as AuthenticatedRequest).user = {
        id: decoded.id,
        email: decoded.email,
        roles: decoded.roles || ['user'],
      };
      
      // Сохраняем токен в запросе для возможного добавления в черный список
      (req as any).token = tokenString;
      
      next();
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        logger.info('JWT токен истек', { error: jwtError.message });
        return ApiResponse.sendError(res, 'Токен истек', null, 401);
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        logger.warn('Недействительный JWT токен', { error: jwtError.message });
        return ApiResponse.sendError(res, 'Недействительный токен', null, 401);
      }
      
      logger.error('Ошибка проверки JWT:', { error: jwtError.message });
      return ApiResponse.sendError(res, 'Не авторизован', jwtError.message, 401);
    }
  } catch (err: any) {
    logger.error('Ошибка авторизации:', { error: err.message, stack: err.stack });
    return ApiResponse.sendError(res, 'Не авторизован', err.message, 401);
  }
};

// Опциональная аутентификация - не требует токен, но проверяет его если есть
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Проверяем глобальную настройку аутентификации
    const globalConfig = await GlobalConfig.findOne() as GlobalConfigDocument | null;
    
    // Если аутентификация отключена глобально, создаем системного пользователя
    if (globalConfig && globalConfig.authenticationEnabled === false) {
      (req as AuthenticatedRequest).authDisabled = true;
      (req as AuthenticatedRequest).user = {
        id: '',
        email: 'system@contentstar.app',
        roles: ['admin', 'user']
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    
    // Если токен не предоставлен, продолжаем без аутентификации
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    // Если токен есть, пытаемся его проверить
    const tokenString = authHeader.split(' ')[1];
    
    // Проверяем токен в черном списке
    const isBlacklisted = await blacklistService.isBlacklisted(tokenString);
    if (isBlacklisted) {
      // Для опциональной аутентификации просто игнорируем токен из черного списка
      return next();
    }
    
    try {
      if (!JWT_SECRET) {
        const config = await getConfig();
        JWT_SECRET = config.JWT_SECRET;
        JWT_ISSUER = config.JWT_ISSUER || 'contentstar.app';
        
        if (!JWT_SECRET) {
          logger.warn('JWT_SECRET не найден в конфигурации при опциональной аутентификации');
          return next();
        }
      }
      
      const decoded = jwt.verify(tokenString, JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        maxAge: '7d',
        clockTolerance: 30,
      }) as JWTPayload;

      if (!decoded.id || !decoded.email || !Array.isArray(decoded.roles)) {
        // Игнорируем неполный токен при опциональной аутентификации
        return next();
      }

      const user = await User.findById(decoded.id) as UserDocument | null;
      if (user && user.isActive && user.email === decoded.email) {
        (req as AuthenticatedRequest).user = {
          id: decoded.id,
          email: decoded.email,
          roles: decoded.roles || ['user'],
        };
        (req as any).token = tokenString;
      }
    } catch (jwtError) {
      // Игнорируем ошибки JWT для опциональной аутентификации
      logger.debug('Недействительный токен при опциональной аутентификации');
    }

    next();
  } catch (err: any) {
    logger.error('Ошибка опциональной авторизации:', { error: err.message, stack: err.stack });
    next(); // Продолжаем даже при ошибке
  }
};

/**
 * Функция для генерации JWT токена с улучшенной безопасностью
 */
export async function generateToken(user: UserDocument): Promise<string> {
  if (!JWT_SECRET) {
    const config = await getConfig();
    JWT_SECRET = config.JWT_SECRET;
    JWT_ISSUER = config.JWT_ISSUER || 'contentstar.app';
  }

  const payload: JWTPayload = {
    id: user._id.toString(),
    email: user.email,
    roles: user.roles,
    iss: JWT_ISSUER,
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
    issuer: JWT_ISSUER,
  });
}