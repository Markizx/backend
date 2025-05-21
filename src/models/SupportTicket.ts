import mongoose, { Schema, Document, Model } from 'mongoose';

export interface SupportTicketDocument extends Document {
  user: mongoose.Types.ObjectId;
  subject: string;
  message: string;
  status: 'open' | 'answered' | 'closed';
  response?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
  response: { type: String },
}, { timestamps: true });

SupportTicketSchema.index({ user: 1, status: 1 });

export const SupportTicket: Model<SupportTicketDocument> = mongoose.model<SupportTicketDocument>('SupportTicket', SupportTicketSchema);