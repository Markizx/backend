import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, UserDocument } from '@models/User';
import { getConfig } from '@config/config';
import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry } from '@utils/retry';

async function createAdminIfNeeded() {
  try {
    enhancedLogger.info('Проверка и создание административной учетной записи');
    
    const config = await getConfig();
    const adminEmail = config.ADMIN_EMAIL;
    
    if (!adminEmail) {
      enhancedLogger.warn('ADMIN_EMAIL не указан в конфигурации, пропуск создания admin');
      return;
    }
    
    // Ищем пользователя с retry (на случай если БД еще не готова)
    let adminUser = await withRetry(
      async () => {
        return await User.findOne({ email: adminEmail }) as UserDocument | null;
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        retryCondition: (error) => {
          // Повторяем при ошибках подключения к БД
          return error.name === 'MongoNetworkError' || 
                 error.name === 'MongooseServerSelectionError';
        }
      }
    );
    
    if (!adminUser) {
      enhancedLogger.info(`Создание административной учетной записи с email: ${adminEmail}`);
      
      // Генерация случайного пароля, если не задан
      const adminPassword = config.ADMIN_PASSWORD || Math.random().toString(36).slice(-12);
      
      // Обходим проблему с типами, используя asString и parseInt
      const saltAsString = String(10);
      const rounds = parseInt(saltAsString, 10);
      const salt = await bcrypt.genSalt(rounds);
      const passwordHash = await bcrypt.hash(String(adminPassword), salt);
      
      adminUser = await User.create({
        email: adminEmail,
        name: 'Admin',
        passwordHash,
        roles: ['admin', 'user'],
        isActive: true,
        emailVerified: true,
        isSubscribed: true,
        preferredLanguage: 'ru'
      });
      
      enhancedLogger.info(`Admin пользователь создан с email: ${adminEmail}`, {
        roles: adminUser.roles,
        isActive: adminUser.isActive,
        emailVerified: adminUser.emailVerified
      });
      
      if (!config.ADMIN_PASSWORD) {
        enhancedLogger.warn(`Сгенерирован временный пароль для admin: ${adminPassword}`);
        enhancedLogger.warn('ВАЖНО: Рекомендуется сменить пароль после первого входа');
      }
    } else if (!adminUser.roles.includes('admin')) {
      adminUser.roles.push('admin');
      await adminUser.save();
      enhancedLogger.info(`Роль admin добавлена для пользователя ${adminEmail}`);
    } else {
      enhancedLogger.info(`Admin пользователь с email ${adminEmail} уже существует`);
    }
  } catch (err: any) {
    enhancedLogger.error('Ошибка создания admin пользователя:', err);
  }
}

export { createAdminIfNeeded };