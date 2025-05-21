import mongoose, { Schema, Document, Model } from 'mongoose';
import logger from '@utils/logger';

export interface ChatDocument extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
}, { timestamps: true });

ChatSchema.index({ user: 1, createdAt: -1 });

ChatSchema.post('save', (doc: ChatDocument) => {
  logger.info(`Чат сохранён: ${doc._id} для пользователя ${doc.user}`);
});

export const Chat: Model<ChatDocument> = mongoose.model<ChatDocument>('Chat', ChatSchema);