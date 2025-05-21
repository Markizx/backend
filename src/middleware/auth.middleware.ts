import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '@config/config';
import { GlobalConfig, GlobalConfigDocument } from '@models/GlobalConfig';
import logger from '@utils/logger';
import { User, UserDocument } from '@models/User';
import { ApiResponse } from '@utils/response';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; roles: string[] };
  authDisabled?: boolean; // Новый флаг для отслеживания отключенной аутентификации
}

let JWT_SECRET: string;

async function initializeJwt() {
  try {
    const config = await getConfig();
    JWT_SECRET = config.JWT_SECRET;
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
        id: '', // Пустой id чтобы избежать ошибок ObjectId
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
    
    try {
      if (!JWT_SECRET) {
        const config = await getConfig();
        JWT_SECRET = config.JWT_SECRET;
        if (!JWT_SECRET) {
          throw new Error('JWT_SECRET не найден в конфигурации');
        }
      }
      
      // УЛУЧШЕНИЕ: Явно указываем алгоритмы JWT
      const decoded = jwt.verify(tokenString, JWT_SECRET, {
        algorithms: ['HS256'] // Явно указываем ожидаемый алгоритм
      }) as {
        id: string;
        email: string;
        roles: string[];
      };

      const user = await User.findById(decoded.id) as UserDocument | null;
      if (!user) {
        logger.warn('Пользователь не найден', { userId: decoded.id });
        return ApiResponse.sendError(res, 'Пользователь не найден', null, 404);
      }
      if (!user.isActive) {
        logger.warn('Аккаунт заблокирован', { userId: decoded.id });
        return ApiResponse.sendError(res, 'Аккаунт заблокирован', null, 403);
      }

      (req as AuthenticatedRequest).user = {
        id: decoded.id,
        email: decoded.email,
        roles: decoded.roles || ['user'],
      };
      
      next();
    } catch (jwtError: any) {
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
        id: '', // Пустой id чтобы избежать ошибок ObjectId
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
    
    try {
      if (!JWT_SECRET) {
        const config = await getConfig();
        JWT_SECRET = config.JWT_SECRET;
        if (!JWT_SECRET) {
          logger.warn('JWT_SECRET не найден в конфигурации при опциональной аутентификации');
          return next();
        }
      }
      
      // УЛУЧШЕНИЕ: Явно указываем алгоритмы JWT
      const decoded = jwt.verify(tokenString, JWT_SECRET, {
        algorithms: ['HS256'] // Явно указываем ожидаемый алгоритм
      }) as {
        id: string;
        email: string;
        roles: string[];
      };

      const user = await User.findById(decoded.id) as UserDocument | null;
      if (user && user.isActive) {
        (req as AuthenticatedRequest).user = {
          id: decoded.id,
          email: decoded.email,
          roles: decoded.roles || ['user'],
        };
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