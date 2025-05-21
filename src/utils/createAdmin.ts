import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, UserDocument } from '@models/User';
import { getConfig } from '@config/config';
import logger from '@utils/logger';

async function createAdminIfNeeded() {
  try {
    logger.info('Проверка и создание административной учетной записи');
    
    const config = await getConfig();
    const adminEmail = config.ADMIN_EMAIL;
    
    if (!adminEmail) {
      logger.warn('ADMIN_EMAIL не указан в конфигурации, пропуск создания admin');
      return;
    }
    
    let adminUser = await User.findOne({ email: adminEmail }) as UserDocument | null;
    
    if (!adminUser) {
      logger.info(`Создание административной учетной записи с email: ${adminEmail}`);
      
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
      
      logger.info(`Admin пользователь создан с email: ${adminEmail}`);
      
      if (!config.ADMIN_PASSWORD) {
        logger.info(`Сгенерирован временный пароль для admin: ${adminPassword}`);
        logger.info('Рекомендуется сменить пароль после первого входа');
      }
    } else if (!adminUser.roles.includes('admin')) {
      adminUser.roles.push('admin');
      await adminUser.save();
      logger.info(`Роль admin добавлена для пользователя ${adminEmail}`);
    } else {
      logger.info(`Admin пользователь с email ${adminEmail} уже существует`);
    }
  } catch (err: any) {
    logger.error('Ошибка создания admin пользователя:', { 
      error: err.message, 
      stack: err.stack 
    });
  }
}

export { createAdminIfNeeded };