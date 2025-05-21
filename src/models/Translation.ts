import mongoose, { Schema, Document, Model } from 'mongoose';

export interface TranslationDocument extends Document {
  key: string;
  language: string;
  translation: string;
  originalText: string;
  lastUsed: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TranslationSchema: Schema = new Schema({
  key: { type: String, required: true, index: true },
  language: { type: String, required: true },
  translation: { type: String, required: true },
  originalText: { type: String, required: true },
  lastUsed: { type: Date, default: Date.now },
}, { timestamps: true });

// Создаем составной индекс для быстрого поиска
TranslationSchema.index({ key: 1, language: 1 }, { unique: true });

export const Translation: Model<TranslationDocument> = mongoose.model<TranslationDocument>('Translation', TranslationSchema);