import mongoose, { Schema, Document, Model } from 'mongoose';

export interface AnalyticsEventDocument extends Document {
  userId?: mongoose.Types.ObjectId;
  eventType: 'registration' | 'login' | 'subscription_start' | 'subscription_cancel' | 
            'subscription_renewal' | 'generation_text' | 'generation_image' | 'generation_video' |
            'chat_created' | 'chat_message' | 'support_ticket' | 'file_upload' | 'error';
  
  category: 'user' | 'subscription' | 'generation' | 'chat' | 'support' | 'system';
  
  // Детали события
  details: {
    plan?: string;
    amount?: number;      // Для подписок - сумма
    currency?: string;    // Валюта
    error_type?: string;  // Тип ошибки
    error_message?: string;
    generation_type?: 'text' | 'image' | 'video';
    user_agent?: string;
    ip_address?: string;
    country?: string;
    referrer?: string;
    [key: string]: any;
  };
  
  // Метрики производительности
  performance?: {
    duration_ms?: number;
    api_response_time?: number;
    database_query_time?: number;
  };
  
  timestamp: Date;
  date: string;  // YYYY-MM-DD для группировки
  hour: number;  // 0-23 для почасовой статистики
}

// Интерфейс для статических методов
export interface AnalyticsEventModel extends Model<AnalyticsEventDocument> {
  trackEvent(
    eventType: string,
    category: string,
    details?: Record<string, any>,
    userId?: string,
    performance?: Record<string, number>
  ): Promise<AnalyticsEventDocument>;
  
  getSubscriptionStats(startDate: Date, endDate: Date): Promise<any[]>;
  getGenerationStats(startDate: Date, endDate: Date): Promise<any[]>;
  getUserStats(startDate: Date, endDate: Date): Promise<any[]>;
  getHourlyTraffic(date: string): Promise<any[]>;
}

const AnalyticsEventSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', sparse: true },
  
  eventType: { 
    type: String, 
    required: true,
    enum: [
      'registration', 'login', 'subscription_start', 'subscription_cancel', 
      'subscription_renewal', 'generation_text', 'generation_image', 'generation_video',
      'chat_created', 'chat_message', 'support_ticket', 'file_upload', 'error'
    ]
  },
  
  category: { 
    type: String, 
    required: true,
    enum: ['user', 'subscription', 'generation', 'chat', 'support', 'system']
  },
  
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  performance: {
    duration_ms: Number,
    api_response_time: Number,
    database_query_time: Number
  },
  
  timestamp: { type: Date, default: Date.now },
  date: { type: String, required: true },  // Создается автоматически
  hour: { type: Number, required: true }   // Создается автоматически
});

// Индексы для быстрого поиска
AnalyticsEventSchema.index({ eventType: 1, date: 1 });
AnalyticsEventSchema.index({ category: 1, timestamp: -1 });
AnalyticsEventSchema.index({ userId: 1, timestamp: -1 });
AnalyticsEventSchema.index({ date: 1, hour: 1 });

// Автоматическое заполнение date и hour
AnalyticsEventSchema.pre('save', function(next) {
  const event = this as unknown as AnalyticsEventDocument;
  if (!event.timestamp) {
    event.timestamp = new Date();
  }
  event.date = event.timestamp.toISOString().split('T')[0];
  event.hour = event.timestamp.getHours();
  next();
});

// TTL индекс для автоматического удаления старых событий (через 1 год)
AnalyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Статические методы для аналитики
AnalyticsEventSchema.statics.trackEvent = async function(
  eventType: string,
  category: string,
  details: Record<string, any> = {},
  userId?: string,
  performance?: Record<string, number>
): Promise<AnalyticsEventDocument> {
  const timestamp = new Date();
  return this.create({
    userId,
    eventType,
    category,
    details,
    performance,
    timestamp,
    date: timestamp.toISOString().split('T')[0],
    hour: timestamp.getHours()
  });
};

AnalyticsEventSchema.statics.getSubscriptionStats = async function(startDate: Date, endDate: Date) {
  return this.aggregate([
    {
      $match: {
        category: 'subscription',
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          eventType: '$eventType',
          plan: '$details.plan',
          date: '$date'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$details.amount' }
      }
    },
    {
      $group: {
        _id: {
          eventType: '$_id.eventType',
          plan: '$_id.plan'
        },
        dailyStats: {
          $push: {
            date: '$_id.date',
            count: '$count',
            amount: '$totalAmount'
          }
        },
        totalCount: { $sum: '$count' },
        totalRevenue: { $sum: '$totalAmount' }
      }
    },
    { $sort: { '_id.eventType': 1, '_id.plan': 1 } }
  ]);
};

AnalyticsEventSchema.statics.getGenerationStats = async function(startDate: Date, endDate: Date) {
  return this.aggregate([
    {
      $match: {
        category: 'generation',
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          eventType: '$eventType',
          date: '$date'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$performance.duration_ms' }
      }
    },
    {
      $group: {
        _id: '$_id.eventType',
        dailyStats: {
          $push: {
            date: '$_id.date',
            count: '$count',
            avgDuration: '$avgDuration'
          }
        },
        totalCount: { $sum: '$count' },
        avgDuration: { $avg: '$avgDuration' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

AnalyticsEventSchema.statics.getUserStats = async function(startDate: Date, endDate: Date) {
  return this.aggregate([
    {
      $match: {
        category: 'user',
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          eventType: '$eventType',
          date: '$date'
        },
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        _id: 1,
        count: 1,
        uniqueUserCount: { $size: '$uniqueUsers' }
      }
    },
    {
      $group: {
        _id: '$_id.eventType',
        dailyStats: {
          $push: {
            date: '$_id.date',
            count: '$count',
            uniqueUsers: '$uniqueUserCount'
          }
        },
        totalCount: { $sum: '$count' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

AnalyticsEventSchema.statics.getHourlyTraffic = async function(date: string) {
  return this.aggregate([
    {
      $match: {
        date: date,
        category: { $ne: 'system' }
      }
    },
    {
      $group: {
        _id: {
          hour: '$hour',
          category: '$category'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.hour',
        categories: {
          $push: {
            category: '$_id.category',
            count: '$count'
          }
        },
        totalCount: { $sum: '$count' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

export const AnalyticsEvent: AnalyticsEventModel = mongoose.model<AnalyticsEventDocument, AnalyticsEventModel>('AnalyticsEvent', AnalyticsEventSchema);