import 'module-alias/register';
import express, { Express } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import * as Sentry from '@sentry/node';
import { getConfig } from '@config/config';
import logger from '@utils/logger';
import userRoutes from '@routes/user.routes';
import generateRoutes from '@routes/generate.routes';
import authRoutes from '@routes/auth.routes';
import chatRoutes from '@routes/chat.routes';
import subscriptionRoutes from '@routes/subscription.routes';
import supportRoutes from '@routes/support.routes';
import adminRoutes from '@routes/admin.routes';
import i18nRoutes from '@routes/i18n.routes';
import { initPlans } from './init-plans';
import { configurePassport } from '@config/passport';
// Импортируем непосредственно из utils/cleanup.service, избегая алиасов
import { cleanupOldFiles, cleanupOldChats } from './utils/cleanup.service';
import { i18nService } from '@i18n/index';
import { i18nMiddleware } from '@middleware/i18n.middleware';
import { maintenanceMiddleware } from '@middleware/maintenance.middleware';
import { trackError } from '@middleware/analytics.middleware';
import { errorMiddleware } from '@middleware/error.middleware';
import { GlobalConfig } from '@models/GlobalConfig';
import { createAdminIfNeeded } from './utils/createAdmin';

const app: Express = express();

// Функция для ожидания подключения к MongoDB
async function waitForMongoConnection(maxRetries = 60, retryInterval = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await mongoose.connection.asPromise();
      const state = mongoose.connection.readyState;
      logger.info(`MongoDB соединение подтверждено, readyState: ${state}`);
      if (state === 1) return true; // 1 = connected
      throw new Error(`MongoDB readyState не 1, текущее значение: ${state}`);
    } catch (err: any) {
      logger.warn(`Попытка ${i + 1} подключения к MongoDB не удалась: ${err.message}`);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
  }
  throw new Error('Не удалось установить соединение с MongoDB после нескольких попыток');
}

// Функция для проверки/переподключения к MongoDB
async function ensureMongoConnection(cfg: any) {
  if (mongoose.connection.readyState !== 1) {
    logger.warn('MongoDB не подключена, пытаемся переподключиться');
    await mongoose.connect(cfg.mongodbUri, mongoOptions);
  }
}

// MongoDB connection options - исправляем тип 'w'
const mongoOptions: mongoose.ConnectOptions = {
  serverSelectionTimeoutMS: 50000,
  connectTimeoutMS: 60000,
  socketTimeoutMS: 240000,
  family: 4,
  maxPoolSize: 50,
  minPoolSize: 5,
  heartbeatFrequencyMS: 1000,
  retryWrites: true,
  w: 'majority' as mongoose.WriteConcern['w'], // Исправление типа
  retryReads: true,
  maxIdleTimeMS: 900000,
  autoIndex: true,
};

// Инициализация приложения
async function initializeApp() {
  try {
    logger.info('Запуск инициализации приложения');
    const cfg = await getConfig();

    // Инициализация Sentry
    Sentry.init({
      dsn: cfg.SENTRY_DSN,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app }),
        new Sentry.Integrations.Mongo({
          useMongoose: true,
        }),
      ],
      tracesSampleRate: 1.0,
      environment: process.env.NODE_ENV || 'development',
      beforeSend: (event, hint) => {
        // Фильтруем чувствительные данные
        if (event.request) {
          delete event.request.headers?.['authorization'];
          delete event.request.headers?.['cookie'];
        }
        return event;
      },
    });

    // Request tracking middleware
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());

    // Базовые middleware
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // CORS с улучшенной конфигурацией
    const corsOptions = {
      origin: function (origin: string | undefined, callback: Function) {
        // Разрешаем запросы без origin (мобильные приложения, Postman, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          cfg.frontendUrl,
          'http://localhost:3000',
          'http://localhost:3001'
        ];
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language']
    };
    
    app.use(cors(corsOptions));
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // Логирование с улучшенным форматом
    app.use(morgan('combined', { 
      stream: { 
        write: (message: string) => logger.info(message.trim(), { component: 'http' })
      },
      skip: (req) => req.path === '/health' // Пропускаем health check
    }));

    // Подключение к MongoDB
    mongoose.set('strictQuery', false);
    logger.info('Подключение к MongoDB...', {
      uri: cfg.mongodbUri.replace(/:.*@/, ':<hidden>@')
    });

    // Event listeners для MongoDB
    mongoose.connection.on('error', err => {
      logger.error('Ошибка соединения с MongoDB:', { error: err.message, stack: err.stack });
      // Не выходим из процесса, пытаемся переподключиться
    });

    mongoose.connection.on('connected', () => {
      logger.info('MongoDB успешно подключена');
    });

    mongoose.connection.on('disconnected', async () => {
      logger.warn('MongoDB отключена, пытаемся переподключиться');
      try {
        await mongoose.connect(cfg.mongodbUri, mongoOptions);
      } catch (err: any) {
        logger.error('Ошибка переподключения MongoDB:', { error: err.message, stack: err.stack });
      }
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB успешно переподключена');
    });

    // Первоначальное подключение
    await mongoose.connect(cfg.mongodbUri, mongoOptions);
    await waitForMongoConnection();

    // Проверяем возможность выполнения операций
    if (mongoose.connection.db) {
      try {
        await mongoose.connection.db.command({ ping: 1 });
        logger.info('MongoDB ping успешен');
      } catch (pingErr: any) {
        logger.error('MongoDB ping не удался:', { error: pingErr.message });
        throw pingErr;
      }
    } else {
      throw new Error('MongoDB db объект не определён');
    }

    // Инициализируем глобальную конфигурацию
    await GlobalConfig.findOne() || await GlobalConfig.create({});
    logger.info('Глобальная конфигурация инициализирована');

    // Инициализируем i18n
    await i18nService.initialize();
    logger.info('i18n инициализирован');

    // Настройка Passport
    await configurePassport(app);
    logger.info('Passport настроен');

    // Health check route (до всех middleware)
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // Middleware порядок важен!
    app.use(maintenanceMiddleware);  // Проверка режима обслуживания
    app.use(i18nMiddleware);         // i18n должен быть перед роутами

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/user', userRoutes);
    app.use('/api/generate', generateRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/subscription', subscriptionRoutes);
    app.use('/api/support', supportRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/i18n', i18nRoutes);
    logger.info('Routes загружены');

    // Swagger Documentation (только в разработке)
    if (process.env.NODE_ENV !== 'production') {
      const { setupSwagger } = require('@utils/swagger');
      setupSwagger(app);
      logger.info('Swagger документация настроена на /api-docs');
    }

    // Убеждаемся, что соединение стабильно перед инициализацией планов
    await ensureMongoConnection(cfg);
    
    // Даем время для стабилизации соединения
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Инициализируем планы подписок
    try {
      await initPlans();
      logger.info('Планы подписок инициализированы');
    } catch (planError: any) {
      logger.error('Ошибка инициализации планов:', { error: planError.message });
      // Не останавливаем приложение, планы могут быть инициализированы позже
    }

    // Создаем административного пользователя, если нужно
    try {
      await createAdminIfNeeded();
      logger.info('Проверка и создание административного пользователя выполнена');
    } catch (adminError: any) {
      logger.error('Ошибка при создании административного пользователя:', { error: adminError.message });
      // Не останавливаем приложение, можно будет создать админа позже
    }

    // Запускаем задачи по очистке
    try {
      cleanupOldFiles.start();
      cleanupOldChats.start();
      logger.info('Cron задачи очистки запущены');
    } catch (cronError: any) {
      logger.error('Ошибка запуска cron задач:', { error: cronError.message });
    }

    // Error handling middleware (должны быть в самом конце)
    app.use(trackError);  // Трекинг ошибок для аналитики
    app.use(Sentry.Handlers.errorHandler({
      shouldHandleError: (error) => {
        // Логируем все ошибки в Sentry
        return true;
      }
    }));
    app.use(errorMiddleware);  // Общий обработчик ошибок

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Получен сигнал ${signal}, начинаем graceful shutdown...`);
      
      try {
        // Останавливаем cron задачи
        if (cleanupOldFiles) cleanupOldFiles.stop();
        if (cleanupOldChats) cleanupOldChats.stop();
        
        // Закрываем MongoDB соединение
        await mongoose.connection.close();
        logger.info('MongoDB соединение закрыто');
        
        // Закрываем Sentry
        await Sentry.close(2000);
        logger.info('Sentry closed');
        
        process.exit(0);
      } catch (err: any) {
        logger.error('Ошибка при graceful shutdown:', { error: err.message });
        process.exit(1);
      }
    };

    // Обработчики сигналов завершения
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Обработка необработанных исключений
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', { error: err.message, stack: err.stack });
      Sentry.captureException(err);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason: any, promise) => {
      logger.error('Unhandled Rejection:', { 
        reason: reason?.message || reason, 
        stack: reason?.stack,
        promise 
      });
      Sentry.captureException(reason);
    });

    // Запуск сервера
    const server = app.listen(cfg.port, '0.0.0.0', () => {
      logger.info(`🚀 Сервер запущен на порту ${cfg.port}`, {
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        port: cfg.port
      });
    });

    // Настройка таймаутов сервера
    server.timeout = 60000; // 60 секунд
    server.keepAliveTimeout = 65000; // 65 секунд
    server.headersTimeout = 66000; // 66 секунд

    return server;
  } catch (err: any) {
    logger.error('❌ Критическая ошибка инициализации приложения:', { 
      error: err.message, 
      stack: err.stack 
    });
    Sentry.captureException(err);
    process.exit(1);
  }
}

// Запуск приложения
initializeApp().catch((err) => {
  logger.error('❌ Не удалось запустить приложение:', { error: err.message });
  process.exit(1);
});