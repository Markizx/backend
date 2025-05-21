import mongoose, { Schema, Document, Model } from 'mongoose';
import logger from '@utils/logger';

export interface MessageDocument extends Document {
  _id: mongoose.Types.ObjectId;
  chat: mongoose.Types.ObjectId;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  createdAt: Date;
}

const MessageSchema: Schema = new Schema({
  chat: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
  content: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

MessageSchema.index({ chat: 1, timestamp: 1 });

MessageSchema.post('save', (doc: MessageDocument) => {
  logger.info(`Сообщение сохранено: ${doc._id} в чате ${doc.chat}, роль: ${doc.role}`);
});

export const Message: Model<MessageDocument> = mongoose.model<MessageDocument>('Message', MessageSchema);