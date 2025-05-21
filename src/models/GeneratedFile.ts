import mongoose, { Schema, Document, Model } from 'mongoose';
import logger from '@utils/logger';

export interface GeneratedFileDocument extends Document {
  user: mongoose.Types.ObjectId;
  s3Url: string;
  type: 'text' | 'image' | 'video' | 'description';
  metadata?: {
    generator?: string;
    processor?: string;
    originalProcessor?: string;
    processingType?: 'inpainting' | 'outpainting' | 'modify';
    prompt?: string;
    duration?: number;
    quality?: string;
  };
  createdAt: Date;
}

const GeneratedFileSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  s3Url: { type: String, required: true },
  type: { type: String, enum: ['text', 'image', 'video', 'description'], required: true },
  metadata: {
    generator: { type: String }, // dall-e-3, gpt-image, grok-2, runway-gen3a-turbo и т.д.
    processor: { type: String }, // stability-ai, openai-edit, dalle-recreation и т.д.
    originalProcessor: { type: String }, // для случаев, когда основной процессор не сработал
    processingType: { type: String, enum: ['inpainting', 'outpainting', 'modify'] },
    prompt: { type: String }, // сохраняем промт для истории
    duration: { type: Number }, // длительность видео в секундах
    quality: { type: String } // качество генерации: hd, standard и т.д.
  },
  createdAt: { type: Date, default: Date.now },
});

GeneratedFileSchema.index({ createdAt: -1 });
GeneratedFileSchema.index({ user: 1, type: 1 });
GeneratedFileSchema.index({ user: 1, createdAt: -1 });

GeneratedFileSchema.post('save', (doc: GeneratedFileDocument) => {
  logger.info(`Файл сохранён в историю: ${doc.s3Url} для пользователя ${doc.user}`);
});

export const GeneratedFile: Model<GeneratedFileDocument> = mongoose.model<GeneratedFileDocument>('GeneratedFile', GeneratedFileSchema);