import { Request, Response } from 'express';
import Stripe from 'stripe';
import { User, UserDocument } from '@models/User';
import { SubscriptionPlan, SubscriptionPlanDocument } from '@models/SubscriptionPlan';
import { GlobalConfig } from '@models/GlobalConfig';
import { AuthenticatedRequest } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { trackEventManual } from '@middleware/analytics.middleware';
import { getSecrets } from '@utils/getSecrets';
import { getConfig } from '@config/config';
import { ApiResponse } from '@utils/response';
import logger from '@utils/logger';

let stripe: Stripe;
let cfg: any;

async function initializeStripe() {
  try {
    cfg = await getConfig();
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Secrets not loaded');
    }
    const STRIPE_SECRET_KEY = secrets.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = secrets.STRIPE_WEBHOOK_SECRET;
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_SECRET_KEY или STRIPE_WEBHOOK_SECRET не найдены в секретах');
    }
    stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    logger.info('Stripe инициализирован успешно');
  } catch (err: any) {
    logger.error('Ошибка инициализации Stripe:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

initializeStripe();

/**
 * Контроллер для работы с подписками
 */
export const SubscriptionController = {
  /**
   * Создание сессии оформления подписки
   */
  createCheckoutSessionHandler: async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & { body: { plan: 'basic' | 'plus' | 'pro' } };
    const userId = authReq.user?.id;
    const { plan } = authReq.body;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    if (!plan || !['basic', 'plus', 'pro'].includes(plan)) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    try {
      const globalConfig = await GlobalConfig.findOne();
      if (!globalConfig?.subscriptionEnabled) {
        return ApiResponse.sendError(res, await authReq.t('errors.subscription_disabled'), null, 403);
      }

      const user = await User.findById(userId) as UserDocument | null;
      if (!user) {
        return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
      }

      const planDoc = await SubscriptionPlan.findOne({ name: plan }) as SubscriptionPlanDocument | null;
      if (!planDoc) {
        return ApiResponse.sendError(res, `План ${plan} не найден`, null, 404);
      }

      // Проверяем, не имеет ли пользователь уже активную подписку на этот план
      if (user.isSubscribed && user.subscriptionPlan === plan) {
        return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), {
          message: `У вас уже есть активная подписка на план ${plan}`
        }, 400);
      }

      const sessionCreateParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: planDoc.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: `${cfg.frontendUrl}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cfg.frontendUrl}/?canceled=true`,
        metadata: {
          userId,
          plan,
          userEmail: user.email,
        },
        subscription_data: {
          trial_period_days: user.trialUsed ? 0 : planDoc.trialDays,
          metadata: {
            userId,
            plan,
            userEmail: user.email,
          },
        },
        customer_email: user.email,
        allow_promotion_codes: true,
      };

      const session = await stripe.checkout.sessions.create(sessionCreateParams);

      // Трекинг попытки оформления подписки
      await trackEventManual(
        'subscription_checkout_initiated',
        'subscription',
        {
          plan,
          amount: planDoc.price,
          currency: 'usd',
          sessionId: session.id,
          hasActiveTrial: !user.trialUsed,
          trialDays: user.trialUsed ? 0 : planDoc.trialDays
        },
        userId
      );

      logger.info(`Создана сессия Stripe для пользователя ${userId}: ${session.id}, план: ${plan}`);
      return ApiResponse.send(res, { url: session.url, sessionId: session.id });
    } catch (err: any) {
      logger.error('Ошибка создания сессии оплаты:', { error: err.message, stack: err.stack });
      
      // Трекинг ошибки при оформлении
      await trackEventManual(
        'subscription_checkout_error',
        'subscription',
        {
          plan,
          error: err.message,
          errorType: err.type || 'unknown'
        },
        userId
      );
      
      return ApiResponse.sendError(res, 'Не удалось создать сессию оплаты', err.message, 500);
    }
  },

  /**
   * Проверка статуса подписки
   */
  checkSubscriptionStatusHandler: async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest;
    const userId = authReq.user?.id;

    // Проверяем случай отключенной аутентификации
    if (authReq.authDisabled) {
      return ApiResponse.send(res, {
        isSubscribed: true,
        plan: 'unlimited',
        textLimit: 999999,
        imageLimit: 999999,
        videoLimit: 999999,
        chatLimit: 999999,
        maxChats: 999999,
        textUsed: 0,
        imageUsed: 0,
        videoUsed: 0,
        chatUsed: 0,
        note: 'Подписки отключены - полный доступ'
      });
    }

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    try {
      const globalConfig = await GlobalConfig.findOne();
      if (!globalConfig?.subscriptionEnabled) {
        return ApiResponse.send(res, {
          isSubscribed: true, // Если подписки отключены, считаем всех как подписанных
          plan: 'unlimited',
          note: 'Подписки отключены - полный доступ'
        });
      }

      const user = await User.findById(userId) as UserDocument | null;
      if (!user) {
        return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
      }

      const now = new Date();
      let isSubscribed = user.isSubscribed;
      let statusChanged = false;

      // Проверяем истечение триала
      if (user.trialEnd && now > user.trialEnd && !user.subscriptionEnd) {
        isSubscribed = false;
        user.isSubscribed = false;
        user.trialUsed = true;
        statusChanged = true;
      }
      
      // Проверяем истечение подписки
      if (user.subscriptionEnd && now > user.subscriptionEnd) {
        isSubscribed = false;
        user.isSubscribed = false;
        user.subscriptionPlan = null;
        user.textLimit = 0;
        user.imageLimit = 0;
        user.videoLimit = 0;
        statusChanged = true;
      }

      if (statusChanged) {
        await user.save();
        
        // Трекинг истечения подписки
        await trackEventManual(
          'subscription_expired',
          'subscription',
          {
            previousPlan: user.subscriptionPlan,
            expirationDate: user.subscriptionEnd || user.trialEnd
          },
          userId
        );
      }

      logger.info(`Проверка статуса подписки для пользователя ${userId}: ${isSubscribed}`);
      return ApiResponse.send(res, {
        isSubscribed,
        plan: user.subscriptionPlan,
        trialEnd: user.trialEnd,
        subscriptionEnd: user.subscriptionEnd,
        textLimit: user.textLimit,
        imageLimit: user.imageLimit,
        videoLimit: user.videoLimit,
        chatLimit: user.chatLimit,
        maxChats: isSubscribed ? (user.subscriptionPlan === 'basic' ? 10 : user.subscriptionPlan === 'plus' ? 25 : 50) : 0,
        textUsed: user.textUsed,
        imageUsed: user.imageUsed,
        videoUsed: user.videoUsed,
        chatUsed: user.chatUsed,
        trialUsed: user.trialUsed,
      });
    } catch (err: any) {
      logger.error('Ошибка проверки статуса подписки:', { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, 'Не удалось проверить статус подписки', err.message, 500);
    }
  },

  /**
   * Обработчик Stripe вебхуков
   */
  webhookHandler: async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      logger.error('Отсутствует заголовок stripe-signature');
      return ApiResponse.sendError(res, 'Отсутствует заголовок stripe-signature', null, 400);
    }

    let event: Stripe.Event;

    try {
      const secrets = await getSecrets();
      if (!secrets) {
        throw new Error('Secrets not loaded');
      }
      const STRIPE_WEBHOOK_SECRET = secrets.STRIPE_WEBHOOK_SECRET;
      event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      logger.error('Ошибка подписи вебхука:', { error: err.message, stack: err.stack });
      return res.status(400).send(`Ошибка вебхука: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await SubscriptionController.handleCheckoutSessionCompleted(event);
          break;
        case 'customer.subscription.created':
          await SubscriptionController.handleSubscriptionCreated(event);
          break;
        case 'customer.subscription.updated':
          await SubscriptionController.handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          await SubscriptionController.handleSubscriptionDeleted(event);
          break;
        case 'invoice.payment_succeeded':
          await SubscriptionController.handleInvoicePaymentSucceeded(event);
          break;
        case 'invoice.payment_failed':
          await SubscriptionController.handleInvoicePaymentFailed(event);
          break;
        case 'payment_intent.payment_failed':
          logger.warn(`Платёж не удался, событие: ${event.id}`, { event: event.data.object });
          break;
        default:
          logger.info(`Необработанное событие Stripe: ${event.type}, событие: ${event.id}`);
      }

      // Исправляем ошибку - передаем undefined вместо null
      return ApiResponse.send(res, { received: true }, undefined, 200);
    } catch (err: any) {
      logger.error(`Ошибка обработки вебхука, событие: ${event?.id || 'неизвестно'}`, { error: err.message, stack: err.stack });
      return ApiResponse.sendError(res, 'Ошибка обработки вебхука', err.message, 500);
    }
  },

  /**
   * Обработка события успешного оформления заказа
   */
  handleCheckoutSessionCompleted: async (event: Stripe.Event) => {
    const session = event.data.object as Stripe.Checkout.Session;
    const userIdSession = session.metadata?.userId;
    const planSession = session.metadata?.plan;
    
    if (!userIdSession || !planSession) {
      logger.warn(`Отсутствует userId или plan в метаданных сессии, событие: ${event.id}`);
      return;
    }

    const user = await User.findById(userIdSession) as UserDocument | null;
    if (!user) {
      logger.warn(`Пользователь ${userIdSession} не найден для активации подписки, событие: ${event.id}`);
      return;
    }

    const planDoc = await SubscriptionPlan.findOne({ name: planSession }) as SubscriptionPlanDocument | null;
    if (!planDoc) {
      logger.warn(`План ${planSession} не найден, событие: ${event.id}`);
      return;
    }

    user.isSubscribed = true;
    user.subscriptionPlan = planSession as 'basic' | 'plus' | 'pro';
    user.textLimit = planDoc.textLimit;
    user.imageLimit = planDoc.imageLimit;
    user.videoLimit = planDoc.videoLimit;
    user.chatLimit = planDoc.chatLimit;

    if (!user.trialUsed) {
      user.trialUsed = true;
      user.trialStart = new Date();
      user.trialEnd = new Date(Date.now() + planDoc.trialDays * 24 * 60 * 60 * 1000);
    }
    
    user.subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    // Трекинг успешного оформления подписки
    await trackEventManual(
      'subscription_start',
      'subscription',
      {
        plan: planSession,
        amount: session.amount_total ? session.amount_total / 100 : planDoc.price,
        currency: session.currency,
        sessionId: session.id,
        subscriptionId: session.subscription,
        paymentStatus: session.payment_status
      },
      userIdSession
    );

    logger.info(`Подписка активирована для пользователя ${userIdSession}, план: ${planSession}, событие: ${event.id}`);
  },

  /**
   * Обработка события создания подписки
   */
  handleSubscriptionCreated: async (event: Stripe.Event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const userIdCreated = subscription.metadata?.userId;
    const planCreated = subscription.metadata?.plan;
    
    if (!userIdCreated || !planCreated) {
      logger.warn(`Отсутствует userId или plan в метаданных подписки, событие: ${event.id}`);
      return;
    }

    // Трекинг создания подписки
    await trackEventManual(
      'subscription_created',
      'subscription',
      {
        plan: planCreated,
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      },
      userIdCreated
    );

    logger.info(`Подписка создана в Stripe для пользователя ${userIdCreated}, план: ${planCreated}, событие: ${event.id}`);
  },

  /**
   * Обработка события обновления подписки
   */
  handleSubscriptionUpdated: async (event: Stripe.Event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const userIdUpdated = subscription.metadata?.userId;
    const planUpdated = subscription.metadata?.plan;
    
    if (!userIdUpdated || !planUpdated) {
      logger.warn(`Отсутствует userId или plan в метаданных обновления подписки, событие: ${event.id}`);
      return;
    }

    const user = await User.findById(userIdUpdated) as UserDocument | null;
    if (!user) {
      logger.warn(`Пользователь ${userIdUpdated} не найден для обновления подписки, событие: ${event.id}`);
      return;
    }

    const planDoc = await SubscriptionPlan.findOne({ name: planUpdated }) as SubscriptionPlanDocument | null;
    if (!planDoc) {
      logger.warn(`План ${planUpdated} не найден, событие: ${event.id}`);
      return;
    }

    user.isSubscribed = subscription.status === 'active';
    user.subscriptionPlan = planUpdated as 'basic' | 'plus' | 'pro';
    user.textLimit = planDoc.textLimit;
    user.imageLimit = planDoc.imageLimit;
    user.videoLimit = planDoc.videoLimit;
    user.chatLimit = planDoc.chatLimit;
    user.subscriptionEnd = new Date(subscription.current_period_end * 1000);
    await user.save();

    // Трекинг обновления подписки
    await trackEventManual(
      'subscription_updated',
      'subscription',
      {
        plan: planUpdated,
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      },
      userIdUpdated
    );

    logger.info(`Подписка обновлена для пользователя ${userIdUpdated}, план: ${planUpdated}, статус: ${subscription.status}, событие: ${event.id}`);
  },

  /**
   * Обработка события удаления подписки
   */
  handleSubscriptionDeleted: async (event: Stripe.Event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const userIdDeleted = subscription.metadata?.userId;
    
    if (!userIdDeleted) {
      logger.warn(`Отсутствует userId в метаданных удаления подписки, событие: ${event.id}`);
      return;
    }

    const user = await User.findById(userIdDeleted) as UserDocument | null;
    if (!user) {
      logger.warn(`Пользователь ${userIdDeleted} не найден для отмены подписки, событие: ${event.id}`);
      return;
    }

    const previousPlan = user.subscriptionPlan;
    
    user.isSubscribed = false;
    user.subscriptionPlan = null;
    user.subscriptionEnd = undefined;
    user.textLimit = 0;
    user.imageLimit = 0;
    user.videoLimit = 0;
    user.chatLimit = 0;
    await user.save();

    // Трекинг отмены подписки
    await trackEventManual(
      'subscription_cancel',
      'subscription',
      {
        previousPlan,
        subscriptionId: subscription.id,
        canceledAt: new Date(subscription.canceled_at ? subscription.canceled_at * 1000 : Date.now())
      },
      userIdDeleted
    );

    logger.info(`Подписка отменена для пользователя ${userIdDeleted}, событие: ${event.id}`);
  },

  /**
   * Обработка события успешной оплаты счета
   */
  handleInvoicePaymentSucceeded: async (event: Stripe.Event) => {
    const invoice = event.data.object as Stripe.Invoice;
    const subscription = invoice.subscription as string | null;
    
    if (!subscription) {
      logger.warn(`Инвойс без подписки, событие: ${event.id}`);
      return;
    }

    // Получаем информацию о подписке
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription);
    const userIdInvoice = stripeSubscription.metadata?.userId;
    const planInvoice = stripeSubscription.metadata?.plan;
    
    if (!userIdInvoice || !planInvoice) {
      logger.warn(`Отсутствует userId или plan в метаданных инвойса, событие: ${event.id}`);
      return;
    }

    const user = await User.findById(userIdInvoice) as UserDocument | null;
    if (!user) {
      logger.warn(`Пользователь ${userIdInvoice} не найден для продления подписки, событие: ${event.id}`);
      return;
    }

    const planDoc = await SubscriptionPlan.findOne({ name: planInvoice }) as SubscriptionPlanDocument | null;
    if (!planDoc) {
      logger.warn(`План ${planInvoice} не найден, событие: ${event.id}`);
      return;
    }

    user.isSubscribed = true;
    user.subscriptionPlan = planInvoice as 'basic' | 'plus' | 'pro';
    user.textLimit = planDoc.textLimit;
    user.imageLimit = planDoc.imageLimit;
    user.videoLimit = planDoc.videoLimit;
    user.chatLimit = planDoc.chatLimit;
    user.subscriptionEnd = new Date(stripeSubscription.current_period_end * 1000);
    await user.save();

    // Трекинг успешного платежа и продления
    await trackEventManual(
      'subscription_renewal',
      'subscription',
      {
        plan: planInvoice,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        invoiceId: invoice.id,
        subscriptionId: subscription,
        billingReason: invoice.billing_reason,
        periodEnd: new Date(stripeSubscription.current_period_end * 1000)
      },
      userIdInvoice
    );

    logger.info(`Подписка продлена для пользователя ${userIdInvoice}, план: ${planInvoice}, событие: ${event.id}`);
  },

  /**
   * Обработка события неудачной оплаты счета
   */
  handleInvoicePaymentFailed: async (event: Stripe.Event) => {
    const invoice = event.data.object as Stripe.Invoice;
    const subscription = invoice.subscription as string | null;
    
    if (!subscription) {
      logger.warn(`Инвойс без подписки при ошибке платежа, событие: ${event.id}`);
      return;
    }

    // Получаем информацию о подписке
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription);
    const userIdInvoice = stripeSubscription.metadata?.userId;
    
    if (!userIdInvoice) {
      logger.warn(`Отсутствует userId при ошибке платежа, событие: ${event.id}`);
      return;
    }

    // Трекинг неудачного платежа
    await trackEventManual(
      'subscription_payment_failed',
      'subscription',
      {
        amount: invoice.amount_due / 100,
        currency: invoice.currency,
        invoiceId: invoice.id,
        subscriptionId: subscription,
        attemptCount: invoice.attempt_count,
        nextPaymentAttempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null
      },
      userIdInvoice
    );

    logger.warn(`Платёж по подписке не удался для пользователя ${userIdInvoice}, событие: ${event.id}`);
  }
};