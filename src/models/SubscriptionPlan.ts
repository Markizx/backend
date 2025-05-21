import mongoose, { Schema, Document, Model } from 'mongoose';
import logger from '@utils/logger';

export interface SubscriptionPlanDocument extends Document {
  name: 'basic' | 'plus' | 'pro';
  price: number;
  textLimit: number;
  imageLimit: number;
  videoLimit: number;
  // Новые поля для чата
  chatLimit: number; // Лимит сообщений в чатах за день
  maxChats: number; // Максимальное количество чатов
  trialDays: number;
  stripePriceId: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema: Schema = new Schema({
  name: { type: String, enum: ['basic', 'plus', 'pro'], required: true, unique: true },
  price: { type: Number, required: true },
  textLimit: { type: Number, required: true },
  imageLimit: { type: Number, required: true },
  videoLimit: { type: Number, required: true },
  // Новые поля для чата
  chatLimit: { type: Number, required: true },
  maxChats: { type: Number, required: true },
  trialDays: { type: Number, default: 3 },
  stripePriceId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SubscriptionPlanSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

SubscriptionPlanSchema.post('save', (doc: SubscriptionPlanDocument) => {
  logger.info(`План подписки сохранён: ${doc.name}`);
});

export const SubscriptionPlan: Model<SubscriptionPlanDocument> = mongoose.model<SubscriptionPlanDocument>('SubscriptionPlan', SubscriptionPlanSchema);