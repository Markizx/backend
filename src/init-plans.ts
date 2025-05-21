import mongoose from 'mongoose';
import { SubscriptionPlan } from '@models/SubscriptionPlan';
import logger from '@utils/logger';

export async function initPlans() {
  try {
    // Проверка соединения
    if (mongoose.connection.readyState !== 1) {
      logger.error('MongoDB не подключена перед initPlans');
      throw new Error('MongoDB не подключена');
    }
    logger.info('MongoDB подключена для инициализации планов');

    const plans = [
      {
        name: 'basic',
        price: 10,
        textLimit: 50,
        imageLimit: 30,
        videoLimit: 5,
        chatLimit: 50,      // 50 сообщений в день
        maxChats: 10,       // максимум 10 чатов
        trialDays: 3,
        stripePriceId: 'price_basic',
      },
      {
        name: 'plus',
        price: 30,
        textLimit: 100,
        imageLimit: 50,
        videoLimit: 30,
        chatLimit: 150,     // 150 сообщений в день
        maxChats: 25,       // максимум 25 чатов
        trialDays: 3,
        stripePriceId: 'price_plus',
      },
      {
        name: 'pro',
        price: 70,
        textLimit: 200,
        imageLimit: 100,
        videoLimit: 100,
        chatLimit: 300,     // 300 сообщений в день
        maxChats: 50,       // максимум 50 чатов
        trialDays: 3,
        stripePriceId: 'price_pro',
      },
    ];

    for (const plan of plans) {
      const existing = await SubscriptionPlan.findOne({ name: plan.name });
      if (!existing) {
        await SubscriptionPlan.create(plan);
        logger.info(`План ${plan.name} создан`);
      } else {
        await SubscriptionPlan.updateOne({ name: plan.name }, plan);
        logger.info(`План ${plan.name} обновлён`);
      }
    }

    logger.info('Инициализация планов завершена');
  } catch (err: any) {
    logger.error('Ошибка инициализации планов:', { error: err.message, stack: err.stack });
    throw err;
  }
}