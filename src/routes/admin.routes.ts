import { Router, Response, Request, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import * as Sentry from '@sentry/node';
import { AuthenticatedRequest, authenticate } from '@middleware/auth.middleware';
import { requireAdmin } from '@middleware/role.middleware';
import { publicRateLimiter } from '@middleware/rate.limiter';
import { User, UserDocument } from '@models/User';
import { GlobalConfig, GlobalConfigDocument } from '@models/GlobalConfig';
import { SupportTicket } from '@models/SupportTicket';
import { SubscriptionPlan, SubscriptionPlanDocument } from '@models/SubscriptionPlan';
import { AnalyticsEvent } from '@models/Analytics';
import { Chat } from '@models/Chat';
import { Message } from '@models/Message';
import { GeneratedFile } from '@models/GeneratedFile';
import { sendConfirmationEmail } from '@services/mailService';
import { getSecretsStats, clearSecretsCache } from '@utils/getSecrets';
import logger from '@utils/logger';

const router = Router();

router.use(publicRateLimiter);
router.use(authenticate);
router.use(requireAdmin);
// ЧАСТЬ 2: ПОЛЬЗОВАТЕЛИ - Получение списка пользователей
// ==================== ПОЛЬЗОВАТЕЛИ ====================

router.get('/users', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & {
    query: { 
      search?: string; 
      isActive?: string; 
      emailVerified?: string;
      page?: string;
      limit?: string;
      sortBy?: string;
      sortOrder?: string;
    };
  };
  
  const { 
    search, 
    isActive, 
    emailVerified, 
    page = '1', 
    limit = '20',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = authReq.query;
  
  const filter: any = {};
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  if (search) {
    const searchStr = typeof search === 'string' ? search.trim().substring(0, 50) : '';
    if (searchStr) {
      const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: new RegExp(escapedSearch, 'i') },
        { email: new RegExp(escapedSearch, 'i') },
      ];
    }
  }
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }
  if (emailVerified !== undefined) {
    filter.emailVerified = emailVerified === 'true';
  }

  try {
    const sortObj: any = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash -confirmToken -resetToken')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(filter)
    ]);

    res.json({
      users,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum
      }
    });
  } catch (err: any) {
    logger.error('Ошибка получения пользователей:', {
      error: err.message,
      stack: err.stack,
    });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось получить пользователей' });
  }
});
// ЧАСТЬ 3: ПОЛЬЗОВАТЕЛИ - Блокировка и смена пароля

router.post('/users/:id/block', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & {
    params: { id: string };
    body: { block: boolean };
  };
  const userId = authReq.params.id;
  const { block } = authReq.body;

  if (block === undefined) {
    return res.status(400).json({ message: 'Поле block должно быть передано и иметь булево значение' });
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    user.isActive = !block;
    await user.save();
    
    // Аналитика
    await AnalyticsEvent.trackEvent(
      block ? 'user_blocked' : 'user_unblocked',
      'user',
      { targetUserId: userId, targetUserEmail: user.email },
      authReq.user?.id
    );
    
    logger.info(
      `Админ ${authReq.user?.email} ${block ? 'заблокировал' : 'разблокировал'} пользователя ${user.email}`
    );
    res.json({ message: `Пользователь ${block ? 'заблокирован' : 'разблокирован'}` });
  } catch (err: any) {
    logger.error('Ошибка блокировки пользователя:', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Не удалось заблокировать/разблокировать пользователя' });
  }
});

router.post('/users/:id/change-password', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & {
    params: { id: string };
    body: { newPassword: string };
  };
  const userId = authReq.params.id;
  const { newPassword } = authReq.body;

  if (
    !newPassword ||
    newPassword.length < 8 ||
    !/[A-Za-z]/.test(newPassword) ||
    !/\d/.test(newPassword) ||
    !/[!@#$%^&*]/.test(newPassword)
  ) {
    return res.status(400).json({
      message: 'Новый пароль обязателен, должен быть не короче 8 символов и содержать хотя бы одну букву, одну цифру и один специальный символ (!@#$%^&*)',
    });
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    user.passwordHash = hashed;
    await user.save();
    
    logger.info(`Админ ${authReq.user?.email} сменил пароль пользователя ${user.email}`);
    res.json({ message: 'Пароль пользователя обновлён' });
  } catch (err: any) {
    logger.error('Ошибка смены пароля:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось сменить пароль' });
  }
});
// ЧАСТЬ 4: ПОЛЬЗОВАТЕЛИ - Роли, удаление, подписки

router.post('/users/:id/role', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & {
    params: { id: string };
    body: { role: string };
  };
  const userId = authReq.params.id;
  const { role } = authReq.body;

  if (!role || !['user', 'admin'].includes(role)) {
    return res.status(400).json({
      message: 'Недопустимая роль. Допустимые значения: user, admin',
    });
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    user.roles = [role];
    await user.save();
    
    logger.info(`Админ ${authReq.user?.email} изменил роль пользователя ${user.email} на ${role}`);
    res.json({
      message: 'Роль пользователя обновлена',
      user: {
        id: user._id ? user._id.toString() : '',
        email: user.email,
        roles: user.roles,
      },
    });
  } catch (err: any) {
    logger.error('Ошибка изменения роли:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось изменить роль' });
  }
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & { params: { id: string } };
  const userId = authReq.params.id;

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await user.deleteOne();
    
    // Аналитика
    await AnalyticsEvent.trackEvent(
      'user_deleted',
      'user',
      { targetUserId: userId, targetUserEmail: user.email },
      authReq.user?.id
    );
    
    logger.info(`Админ ${authReq.user?.email} удалил пользователя ${user.email}`);
    res.json({ message: 'Пользователь успешно удалён' });
  } catch (err: any) {
    logger.error('Ошибка удаления пользователя:', {
      error: err.message,
      stack: err.stack,
    });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось удалить пользователя' });
  }
});

router.post('/users/:id/subscription', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & {
    params: { id: string };
    body: { isSubscribed: boolean; plan?: 'basic' | 'plus' | 'pro'; trial?: boolean };
  };
  const userId = authReq.params.id;
  const { isSubscribed, plan, trial } = authReq.body;

  if (typeof isSubscribed !== 'boolean') {
    return res.status(400).json({ message: 'Поле isSubscribed должно быть булевым' });
  }

  if (plan && !['basic', 'plus', 'pro'].includes(plan)) {
    return res.status(400).json({ message: 'Недопустимый план подписки: basic, plus, pro' });
  }

  if (trial !== undefined && typeof trial !== 'boolean') {
    return res.status(400).json({ message: 'Поле trial должно быть булевым' });
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    user.isSubscribed = isSubscribed;
    if (plan) {
      const planDoc = await SubscriptionPlan.findOne({ name: plan });
      if (planDoc) {
        user.subscriptionPlan = plan;
        user.textLimit = planDoc.textLimit;
        user.imageLimit = planDoc.imageLimit;
        user.videoLimit = planDoc.videoLimit;
        user.chatLimit = planDoc.chatLimit;
      }
    }
    if (trial !== undefined && trial && !user.trialUsed) {
      user.trialUsed = true;
      user.trialStart = new Date();
      user.trialEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 дня
      user.isSubscribed = true;
    }
    if (!isSubscribed) {
      user.subscriptionPlan = null;
      user.trialUsed = false;
      user.trialStart = undefined;
      user.trialEnd = undefined;
      user.subscriptionEnd = undefined;
      user.textLimit = 0;
      user.imageLimit = 0;
      user.videoLimit = 0;
      user.chatLimit = 0;
    }
    await user.save();
    
    // Аналитика
    await AnalyticsEvent.trackEvent(
      isSubscribed ? 'subscription_start' : 'subscription_cancel',
      'subscription',
      { plan, targetUserId: userId, adminAction: true },
      authReq.user?.id
    );
    
    logger.info(`Админ ${authReq.user?.email} обновил подписку пользователя ${user.email}: isSubscribed=${isSubscribed}, plan=${plan || 'none'}`);
    res.json({ message: 'Подписка пользователя обновлена' });
  } catch (err: any) {
    logger.error('Ошибка обновления подписки:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось обновить подписку' });
  }
});
// ЧАСТЬ 5: ПОЛЬЗОВАТЕЛИ - Сообщения и смена email

router.post('/users/:id/message', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & {
    params: { id: string };
    body: { message: string };
  };
  const userId = authReq.params.id;
  const { message } = authReq.body;

  if (!message || typeof message !== 'string' || message.length > 1000) {
    return res.status(400).json({ message: 'Сообщение должно быть строкой длиной до 1000 символов' });
  }

  try {
    const user = await User.findById(userId) as UserDocument | null;
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const ticket = await SupportTicket.create({
      user: userId,
      subject: `Сообщение от администратора`,
      message: `Администратор (${authReq.user?.email}): ${message}`,
      status: 'answered',
      response: message,
    });

    logger.info(`Админ ${authReq.user?.email} отправил сообщение пользователю ${user.email}: ${ticket._id}`);
    res.json({ message: 'Сообщение отправлено', ticket });
  } catch (err: any) {
    logger.error('Ошибка отправки сообщения:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось отправить сообщение' });
  }
});

router.post(
  '/users/:id/change-email',
  body('email').isEmail().withMessage('Неверный формат email'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & {
      params: { id: string };
      body: { email: string };
    };
    const userId = authReq.params.id;
    const { email } = authReq.body;

    const errors = validationResult(authReq);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await User.findById(userId) as UserDocument | null;
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const existingUser = await User.findOne({ email }) as UserDocument | null;
      if (existingUser && existingUser._id && existingUser._id.toString() !== userId) {
        return res.status(400).json({ error: 'Email уже зарегистрирован' });
      }

      user.email = email;
      user.emailVerified = false;
      const confirmToken = crypto.randomBytes(32).toString('hex');
      user.confirmToken = confirmToken;
      user.confirmTokenExpires = new Date(Date.now() + 24 * 3600 * 1000);
      await user.save();

      await sendConfirmationEmail(email, confirmToken);
      logger.info(`Админ ${authReq.user?.email} изменил email пользователя на ${email}`);
      res.json({ message: 'Email изменён, отправлено письмо для подтверждения' });
    } catch (err: any) {
      logger.error('Ошибка изменения email:', { error: err.message, stack: err.stack });
      Sentry.captureException(err);
      res.status(500).json({ error: 'Не удалось изменить email' });
    }
  }
);
// ЧАСТЬ 6: ГЛОБАЛЬНЫЕ НАСТРОЙКИ
// ==================== ГЛОБАЛЬНЫЕ НАСТРОЙКИ ====================

router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = await GlobalConfig.findOne() || await GlobalConfig.create({});
    res.json(config);
  } catch (err: any) {
    logger.error('Ошибка получения конфигурации:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить конфигурацию' });
  }
});

router.put('/config', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const config = await GlobalConfig.findOne() || await GlobalConfig.create({});
    
    // Обновляем только разрешенные поля
    const allowedFields = [
      'subscriptionEnabled', 'authenticationEnabled', 'maintenanceMode',
      'maxFileSize', 'maxFileCount', 'sessionTimeout',
      'apiRateLimit', 'i18nSettings', 'notifications'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        (config as any)[field] = req.body[field];
      }
    });
    
    config.lastModifiedBy = authReq.user?.id;
    await config.save();
    
    logger.info(`Админ ${authReq.user?.email} обновил глобальную конфигурацию`);
    res.json({ message: 'Конфигурация обновлена', config });
  } catch (err: any) {
    logger.error('Ошибка обновления конфигурации:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось обновить конфигурацию' });
  }
});

// Отдельные эндпоинты для основных переключателей
router.post('/subscription/toggle', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & { body: { enabled: boolean } };
  const { enabled } = authReq.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Поле enabled должно быть булевым' });
  }

  try {
    const config = await GlobalConfig.findOne() || await GlobalConfig.create({});
    config.subscriptionEnabled = enabled;
    config.lastModifiedBy = authReq.user?.id;
    await config.save();
    
    logger.info(`Админ ${authReq.user?.email} ${enabled ? 'включил' : 'выключил'} подписки для сервиса`);
    res.json({ message: `Подписки ${enabled ? 'включены' : 'выключены'}` });
  } catch (err: any) {
    logger.error('Ошибка переключения подписок:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось переключить подписки' });
  }
});

router.post('/authentication/toggle', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & { body: { enabled: boolean } };
  const { enabled } = authReq.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Поле enabled должно быть булевым' });
  }

  try {
    const config = await GlobalConfig.findOne() || await GlobalConfig.create({});
    config.authenticationEnabled = enabled;
    config.lastModifiedBy = authReq.user?.id;
    await config.save();
    
    logger.info(`Админ ${authReq.user?.email} ${enabled ? 'включил' : 'выключил'} аутентификацию для сервиса`);
    
    if (!enabled) {
      logger.warn('ВНИМАНИЕ: Аутентификация отключена глобально! Все API будут доступны без токенов');
    }
    
    res.json({ 
      message: `Аутентификация ${enabled ? 'включена' : 'отключена'}`,
      warning: !enabled ? 'ВНИМАНИЕ: Все API теперь доступны без аутентификации!' : undefined
    });
  } catch (err: any) {
    logger.error('Ошибка переключения аутентификации:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось переключить аутентификацию' });
  }
});

router.post('/maintenance', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & { body: { enabled: boolean } };
  const { enabled } = authReq.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Поле enabled должно быть нулевым' });
  }

  try {
    const config = await GlobalConfig.findOne() || await GlobalConfig.create({});
    config.maintenanceMode = enabled;
    config.lastModifiedBy = authReq.user?.id;
    await config.save();
    
    logger.info(`Админ ${authReq.user?.email} ${enabled ? 'включил' : 'выключил'} режим обслуживания`);
    res.json({ message: `Режим обслуживания ${enabled ? 'включён' : 'выключен'}` });
  } catch (err: any) {
    logger.error('Ошибка переключения режима обслуживания:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Не удалось переключить режим обслуживания' });
  }
});
// ЧАСТЬ 7: ПЛАНЫ ПОДПИСОК
// ==================== ПЛАНЫ ПОДПИСОК (CRUD) ====================

router.get('/subscription-plans', async (req: Request, res: Response) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ price: 1 });
    res.json(plans);
  } catch (err: any) {
    logger.error('Ошибка получения планов подписок:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить планы подписок' });
  }
});

router.post('/subscription-plans', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const {
    name,
    price,
    textLimit,
    imageLimit,
    videoLimit,
    chatLimit,
    maxChats,
    trialDays,
    stripePriceId
  } = req.body;

  // Валидация
  const requiredFields = ['name', 'price', 'textLimit', 'imageLimit', 'videoLimit', 'chatLimit', 'maxChats', 'stripePriceId'];
  const missingFields = requiredFields.filter(field => req.body[field] === undefined);
  
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      error: 'Отсутствуют обязательные поля', 
      missingFields 
    });
  }

  if (!['basic', 'plus', 'pro'].includes(name)) {
    return res.status(400).json({ error: 'Название плана должно быть: basic, plus или pro' });
  }

  try {
    const existingPlan = await SubscriptionPlan.findOne({ name });
    if (existingPlan) {
      return res.status(400).json({ error: `План ${name} уже существует` });
    }

    const plan = await SubscriptionPlan.create({
      name,
      price,
      textLimit,
      imageLimit,
      videoLimit,
      chatLimit,
      maxChats,
      trialDays: trialDays || 3,
      stripePriceId
    });

    logger.info(`Админ ${authReq.user?.email} создал новый план подписки: ${name}`);
    res.status(201).json({ message: 'План подписки создан', plan });
  } catch (err: any) {
    logger.error('Ошибка создания плана подписки:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось создать план подписки' });
  }
});

router.put('/subscription-plans/:name', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & { params: { name: string } };
  const { name } = authReq.params;

  if (!['basic', 'plus', 'pro'].includes(name)) {
    return res.status(400).json({ error: 'Недопустимое название плана' });
  }

  try {
    const plan = await SubscriptionPlan.findOne({ name }) as SubscriptionPlanDocument | null;
    if (!plan) {
      return res.status(404).json({ error: 'План не найден' });
    }

    // Обновляем только разрешенные поля
    const allowedFields = ['price', 'textLimit', 'imageLimit', 'videoLimit', 'chatLimit', 'maxChats', 'trialDays', 'stripePriceId'];
    let hasChanges = false;

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined && req.body[field] !== (plan as any)[field]) {
        (plan as any)[field] = req.body[field];
        hasChanges = true;
      }
    });

    if (!hasChanges) {
      return res.status(400).json({ error: 'Нет изменений для сохранения' });
    }

    await plan.save();

    logger.info(`Админ ${authReq.user?.email} обновил план подписки: ${name}`);
    res.json({ message: 'План подписки обновлён', plan });
  } catch (err: any) {
    logger.error('Ошибка обновления плана подписки:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось обновить план подписки' });
  }
});

router.delete('/subscription-plans/:name', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest & { params: { name: string } };
  const { name } = authReq.params;

  if (!['basic', 'plus', 'pro'].includes(name)) {
    return res.status(400).json({ error: 'Недопустимое название плана' });
  }

  try {
    const plan = await SubscriptionPlan.findOne({ name });
    if (!plan) {
      return res.status(404).json({ error: 'План не найден' });
    }

    // Проверяем, есть ли пользователи с этим планом
    const usersWithPlan = await User.countDocuments({ subscriptionPlan: name });
    if (usersWithPlan > 0) {
      return res.status(400).json({ 
        error: `Нельзя удалить план - ${usersWithPlan} пользователей используют его`,
        usersCount: usersWithPlan
      });
    }

    await plan.deleteOne();

    logger.info(`Админ ${authReq.user?.email} удалил план подписки: ${name}`);
    res.json({ message: 'План подписки удалён' });
  } catch (err: any) {
    logger.error('Ошибка удаления плана подписки:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось удалить план подписки' });
  }
});
// ЧАСТЬ 8: АНАЛИТИКА
// ==================== АНАЛИТИКА И СТАТИСТИКА ====================

router.get('/analytics/overview', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period = '30d' } = req.query;
    
    // Определяем период для анализа
    let start: Date, end: Date;
    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);
    } else {
      end = new Date();
      const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // Параллельно получаем различную статистику
    const [
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      newRegistrations,
      subscriptionStats,
      generationStats,
      userStats,
      recentErrors
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isSubscribed: true }),
      AnalyticsEvent.aggregate([
        {
          $match: {
            category: 'subscription',
            eventType: { $in: ['subscription_start', 'subscription_renewal'] },
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$details.amount' }
          }
        }
      ]).then(result => result[0]?.totalRevenue || 0),
      User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      AnalyticsEvent.getSubscriptionStats(start, end),
      AnalyticsEvent.getGenerationStats(start, end),
      AnalyticsEvent.getUserStats(start, end),
      AnalyticsEvent.find({
        category: 'system',
        eventType: 'error',
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).limit(10).sort({ timestamp: -1 })
    ]);

    // Получаем статистику по планам
    const planStats = await User.aggregate([
      {
        $group: {
          _id: '$subscriptionPlan',
          count: { $sum: 1 },
          active: {
            $sum: { $cond: ['$isSubscribed', 1, 0] }
          }
        }
      }
    ]);

    // Расчет конверсии
    const totalRegistered = await User.countDocuments({ createdAt: { $gte: start, $lte: end } });
    const totalSubscribed = await User.countDocuments({ 
      isSubscribed: true,
      createdAt: { $gte: start, $lte: end }
    });
    const conversionRate = totalRegistered > 0 ? (totalSubscribed / totalRegistered * 100) : 0;

    res.json({
      overview: {
        totalUsers,
        activeSubscriptions,
        totalRevenue,
        newRegistrations,
        conversionRate: Math.round(conversionRate * 100) / 100
      },
      planStats,
      subscriptionStats,
      generationStats,
      userStats,
      recentErrors,
      period: { start, end }
    });
  } catch (err: any) {
    logger.error('Ошибка получения аналитики:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить аналитику' });
  }
});

router.get('/analytics/revenue', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    let start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let end = endDate ? new Date(endDate as string) : new Date();

    const groupFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-W%U' : '%Y-%m-%d';
    
    const revenueData = await AnalyticsEvent.aggregate([
      {
        $match: {
          category: 'subscription',
          eventType: { $in: ['subscription_start', 'subscription_renewal'] },
          timestamp: { $gte: start, $lte: end },
          'details.amount': { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: groupFormat, date: '$timestamp' } },
            plan: '$details.plan'
          },
          revenue: { $sum: '$details.amount' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.period',
          plans: {
            $push: {
              plan: '$_id.plan',
              revenue: '$revenue',
              count: '$count'
            }
          },
          totalRevenue: { $sum: '$revenue' },
          totalSubscriptions: { $sum: '$count' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.json({ revenueData, period: { start, end } });
  } catch (err: any) {
    logger.error('Ошибка получения статистики доходов:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить статистику доходов' });
  }
});
// ЧАСТЬ 9: АНАЛИТИКА (продолжение)

router.get('/analytics/users', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    let start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let end = endDate ? new Date(endDate as string) : new Date();

    const userAnalytics = await Promise.all([
      // Регистрации по дням
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            registrations: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]),
      
      // Активность пользователей
      AnalyticsEvent.aggregate([
        {
          $match: {
            category: { $ne: 'system' },
            timestamp: { $gte: start, $lte: end },
            userId: { $exists: true }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              user: '$userId'
            }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            activeUsers: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]),
      
      // Статистика по странам (if tracking)
      User.aggregate([
        {
          $group: {
            _id: '$details.country',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      registrations: userAnalytics[0],
      activeUsers: userAnalytics[1],
      topCountries: userAnalytics[2],
      period: { start, end }
    });
  } catch (err: any) {
    logger.error('Ошибка получения пользовательской аналитики:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить пользовательскую аналитику' });
  }
});

router.get('/analytics/generation', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    let start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let end = endDate ? new Date(endDate as string) : new Date();

    const generationAnalytics = await AnalyticsEvent.aggregate([
      {
        $match: {
          category: 'generation',
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            type: '$eventType',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
          },
          count: { $sum: 1 },
          avgDuration: { $avg: '$performance.duration_ms' }
        }
      },
      {
        $group: {
          _id: '$_id.type',
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

    res.json({ generationAnalytics, period: { start, end } });
  } catch (err: any) {
    logger.error('Ошибка получения статистики генерации:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить статистику генерации' });
  }
});

router.get('/analytics/errors', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit = 50 } = req.query;
    
    let start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let end = endDate ? new Date(endDate as string) : new Date();

    const errors = await AnalyticsEvent.find({
      category: 'system',
      eventType: 'error',
      timestamp: { $gte: start, $lte: end }
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit as string));

    const errorStats = await AnalyticsEvent.aggregate([
      {
        $match: {
          category: 'system',
          eventType: 'error',
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$details.error_type',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ errors, errorStats, period: { start, end } });
  } catch (err: any) {
    logger.error('Ошибка получения статистики ошибок:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить статистику ошибок' });
  }
});
// ЧАСТЬ 10: СИСТЕМНАЯ ИНФОРМАЦИЯ И MAINTENANCE (финальная)
// ==================== СИСТЕМНАЯ ИНФОРМАЦИЯ ====================

router.get('/system/info', async (req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      totalSubscriptions,
      totalFiles,
      totalChats,
      totalTickets,
      secretsStats,
      globalConfig
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isSubscribed: true }),
      User.aggregate([{ $group: { _id: null, total: { $sum: { $add: ['$textUsed', '$imageUsed', '$videoUsed'] } } } }]),
      Chat.countDocuments(),
      SupportTicket.countDocuments(),
      getSecretsStats(),
      GlobalConfig.findOne()
    ]);

    res.json({
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      database: {
        totalUsers,
        totalSubscriptions,
        totalFilesGenerated: totalFiles[0]?.total || 0,
        totalChats,
        totalTickets
      },
      config: {
        subscriptionEnabled: globalConfig?.subscriptionEnabled ?? true,
        authenticationEnabled: globalConfig?.authenticationEnabled ?? true,
        maintenanceMode: globalConfig?.maintenanceMode ?? false,
        version: globalConfig?.version ?? 1
      },
      secrets: secretsStats
    });
  } catch (err: any) {
    logger.error('Ошибка получения системной информации:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось получить системную информацию' });
  }
});

router.post('/system/secrets/refresh', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    clearSecretsCache();
    const newStats = getSecretsStats();
    
    logger.info(`Админ ${authReq.user?.email} принудительно обновил кеш секретов`);
    res.json({ message: 'Кеш секретов очищен и будет обновлен при следующем запросе', stats: newStats });
  } catch (err: any) {
    logger.error('Ошибка обновления секретов:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось обновить секреты' });
  }
});

// ==================== MAINTENANCE ROUTES ====================

router.post('/maintenance/cleanup', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { target, days = 30 } = req.body;
    
    if (!target || !['files', 'chats', 'analytics', 'all'].includes(target)) {
      return res.status(400).json({ error: 'Недопустимая цель очистки: files, chats, analytics, all' });
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let results: any = {};

    if (target === 'files' || target === 'all') {
      const oldFiles = await GeneratedFile.countDocuments({ createdAt: { $lt: cutoff } });
      await GeneratedFile.deleteMany({ createdAt: { $lt: cutoff } });
      results.files = oldFiles;
    }

    if (target === 'chats' || target === 'all') {
      const oldChats = await Chat.countDocuments({ updatedAt: { $lt: cutoff } });
      const chatIds = await Chat.find({ updatedAt: { $lt: cutoff } }).distinct('_id');
      await Message.deleteMany({ chat: { $in: chatIds } });
      await Chat.deleteMany({ updatedAt: { $lt: cutoff } });
      results.chats = oldChats;
    }

    if (target === 'analytics' || target === 'all') {
      const oldAnalytics = await AnalyticsEvent.countDocuments({ timestamp: { $lt: cutoff } });
      await AnalyticsEvent.deleteMany({ timestamp: { $lt: cutoff } });
      results.analytics = oldAnalytics;
    }

    logger.info(`Админ ${authReq.user?.email} выполнил очистку: ${target}, удалено записей старше ${days} дней`, results);
    res.json({ message: 'Очистка выполнена', results, target, days });
  } catch (err: any) {
    logger.error('Ошибка очистки:', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Не удалось выполнить очистку' });
  }
});

export default router;
