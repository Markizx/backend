import mongoose, { Schema, Document, Model } from 'mongoose';
import logger from '@utils/logger';

export interface UserDocument extends Document {
  name?: string;
  email: string;
  passwordHash?: string;
  roles: string[];
  isSubscribed: boolean;
  emailVerified: boolean;
  confirmToken?: string;
  confirmTokenExpires?: Date;
  resetToken?: string;
  resetTokenExpires?: Date;
  isActive: boolean;
  googleId?: string;
  appleId?: string;
  subscriptionPlan?: 'basic' | 'plus' | 'pro' | null;
  trialUsed?: boolean;
  trialStart?: Date;
  trialEnd?: Date;
  subscriptionEnd?: Date;
  textLimit?: number;
  imageLimit?: number;
  videoLimit?: number;
  textUsed: number;
  imageUsed: number;
  videoUsed: number;
  // Поля для чата
  chatUsed: number;
  chatLimit?: number;
  dailyChatReset?: Date;
  // Новое поле для языковых предпочтений
  preferredLanguage?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Метод для проверки и сброса счетчика чатов
  checkAndResetChatCounter: () => Promise<boolean>;
}

const UserSchema: Schema = new Schema({
  name: { type: String },
  email: { type: String, required: true },
  passwordHash: { type: String },
  roles: { type: [String], default: ['user'] },
  isSubscribed: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  confirmToken: { type: String },
  confirmTokenExpires: { type: Date },
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  isActive: { type: Boolean, default: true },
  googleId: { type: String },
  appleId: { type: String },
  subscriptionPlan: { type: String, enum: ['basic', 'plus', 'pro', null], default: null },
  trialUsed: { type: Boolean, default: false },
  trialStart: { type: Date },
  trialEnd: { type: Date },
  subscriptionEnd: { type: Date },
  textLimit: { type: Number, default: 0 },
  imageLimit: { type: Number, default: 0 },
  videoLimit: { type: Number, default: 0 },
  textUsed: { type: Number, default: 0 },
  imageUsed: { type: Number, default: 0 },
  videoUsed: { type: Number, default: 0 },
  // Поля для чата
  chatUsed: { type: Number, default: 0 },
  chatLimit: { type: Number, default: 0 },
  dailyChatReset: { type: Date, default: Date.now },
  // Новое поле для языковых предпочтений
  preferredLanguage: { 
    type: String, 
    enum: ['en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no'],
    default: 'en'
  },
}, { timestamps: true });

// Индексы для улучшения производительности
// ИСПРАВЛЕНО: Используем только один способ объявления индексов
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ appleId: 1 }, { sparse: true });
UserSchema.index({ isSubscribed: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ subscriptionPlan: 1, isSubscribed: 1 });
UserSchema.index({ isActive: 1 });

// Автоматическая инициализация dailyChatReset
UserSchema.pre('save', function(next) {
  // Явно приводим this к типу Document с нужными полями, вместо UserDocument
  if (!this.dailyChatReset) {
    this.dailyChatReset = new Date();
  }
  next();
});

// Метод для проверки и сброса счетчика чатов
UserSchema.methods.checkAndResetChatCounter = async function() {
  // Используем this без явного приведения к типу UserDocument
  const now = new Date();
  const resetDate = this.dailyChatReset || new Date(0);
  
  // Проверяем, нужно ли сбросить счетчик (если прошло более 24 часов)
  if (now.getTime() - resetDate.getTime() > 24 * 60 * 60 * 1000) {
    this.chatUsed = 0;
    this.dailyChatReset = now;
    await this.save();
    logger.info(`Сброшен дневной счетчик чатов для пользователя ${this.email}`);
    return true;
  }
  return false;
};

// Хуки для логирования
UserSchema.post('save', (doc: UserDocument) => {
  logger.info(`Пользователь сохранён: ${doc.email}`);
});

UserSchema.post('findOneAndUpdate', (doc: UserDocument) => {
  if (doc) {
    logger.info(`Пользователь обновлён: ${doc.email}`);
  }
});

// Хук для проверки срока действия подписки
UserSchema.pre('save', function(next) {
  // Используем this без явного приведения к типу UserDocument
  
  // Проверка истечения пробного периода
  if (this.isSubscribed && this.trialEnd && new Date() > this.trialEnd && !this.subscriptionEnd) {
    logger.info(`Пробный период для пользователя ${this.email} истек`);
    this.isSubscribed = false;
    this.trialUsed = true;
  }
  
  // Проверка истечения платной подписки
  if (this.isSubscribed && this.subscriptionEnd && new Date() > this.subscriptionEnd) {
    logger.info(`Подписка для пользователя ${this.email} истекла`);
    this.isSubscribed = false;
    this.subscriptionPlan = null;
    this.textLimit = 0;
    this.imageLimit = 0;
    this.videoLimit = 0;
    this.chatLimit = 0;
  }
  
  next();
});

export const User: Model<UserDocument> = mongoose.model<UserDocument>('User', UserSchema);