import mongoose, { Schema, Document, Model } from 'mongoose';
import logger from '@utils/logger';

export interface GlobalConfigDocument extends Document {
  // Основные переключатели
  subscriptionEnabled: boolean;
  authenticationEnabled: boolean;  // НОВОЕ: глобальное отключение аутентификации
  maintenanceMode: boolean;
  
  // Настройки системы
  maxFileSize: number;  // в байтах
  maxFileCount: number; // максимальное количество файлов на пользователя
  sessionTimeout: number; // время жизни сессии в минутах
  
  // Ограничения API
  apiRateLimit: {
    windowMs: number;    // окно времени в мс
    maxRequests: number; // максимальное количество запросов
    enabled: boolean;
  };
  
  // Настройки мультиязычности
  i18nSettings: {
    defaultLanguage: string;
    enabledLanguages: string[];
    cacheEnabled: boolean;
    fallbackToEnglish: boolean;
  };
  
  // Уведомления администраторов
  notifications: {
    errorReporting: boolean;
    newUserRegistration: boolean;
    subscriptionEvents: boolean;
    systemAlerts: boolean;
  };
  
  // Метаданные
  lastModifiedBy?: string; // ID администратора
  version: number;
  updatedAt: Date;
  createdAt: Date;
}

// Интерфейс для статических методов
export interface GlobalConfigModel extends Model<GlobalConfigDocument> {
  getSingle(): Promise<GlobalConfigDocument>;
  updateSetting(key: string, value: any, modifiedBy?: string): Promise<GlobalConfigDocument>;
}

const GlobalConfigSchema: Schema = new Schema({
  // Основные переключатели
  subscriptionEnabled: { type: Boolean, default: true },
  authenticationEnabled: { type: Boolean, default: true },
  maintenanceMode: { type: Boolean, default: false },
  
  // Настройки системы
  maxFileSize: { type: Number, default: 25 * 1024 * 1024 }, // 25MB
  maxFileCount: { type: Number, default: 100 },
  sessionTimeout: { type: Number, default: 7 * 24 * 60 }, // 7 дней в минутах
  
  // Ограничения API
  apiRateLimit: {
    windowMs: { type: Number, default: 15 * 60 * 1000 }, // 15 минут
    maxRequests: { type: Number, default: 100 },
    enabled: { type: Boolean, default: true }
  },
  
  // Настройки мультиязычности
  i18nSettings: {
    defaultLanguage: { type: String, default: 'en' },
    enabledLanguages: { 
      type: [String], 
      default: ['en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'] 
    },
    cacheEnabled: { type: Boolean, default: true },
    fallbackToEnglish: { type: Boolean, default: true }
  },
  
  // Уведомления администраторов
  notifications: {
    errorReporting: { type: Boolean, default: true },
    newUserRegistration: { type: Boolean, default: false },
    subscriptionEvents: { type: Boolean, default: true },
    systemAlerts: { type: Boolean, default: true }
  },
  
  // Метаданные
  lastModifiedBy: { type: String },
  version: { type: Number, default: 1 }
}, { 
  timestamps: true,
  // Ensures only one document exists
  capped: { size: 1024, max: 1 }
});

// Автоинкремент версии при изменении
GlobalConfigSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    const doc = this as unknown as GlobalConfigDocument;
    doc.version += 1;
  }
  next();
});

// Middleware для логирования изменений
GlobalConfigSchema.post('save', (doc: GlobalConfigDocument) => {
  logger.info('Глобальная конфигурация обновлена', {
    subscriptionEnabled: doc.subscriptionEnabled,
    authenticationEnabled: doc.authenticationEnabled,
    maintenanceMode: doc.maintenanceMode,
    version: doc.version,
    lastModifiedBy: doc.lastModifiedBy
  });
});

// Статические методы
GlobalConfigSchema.statics.getSingle = async function(): Promise<GlobalConfigDocument> {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
    logger.info('Создана новая глобальная конфигурация с настройками по умолчанию');
  }
  return config;
};

GlobalConfigSchema.statics.updateSetting = async function(
  key: string, 
  value: any, 
  modifiedBy?: string
): Promise<GlobalConfigDocument> {
  // Используем findOne() вместо this.getSingle()
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
    logger.info('Создана новая глобальная конфигурация с настройками по умолчанию');
  }
  
  // Поддержка вложенных ключей (например, 'apiRateLimit.enabled')
  const keys = key.split('.');
  let target: any = config;
  
  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]]) {
      target[keys[i]] = {};
    }
    target = target[keys[i]];
  }
  
  target[keys[keys.length - 1]] = value;
  
  if (modifiedBy) {
    config.lastModifiedBy = modifiedBy;
  }
  
  await config.save();
  return config;
};

export const GlobalConfig: GlobalConfigModel = mongoose.model<GlobalConfigDocument, GlobalConfigModel>('GlobalConfig', GlobalConfigSchema);