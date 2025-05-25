import 'module-alias/register';
import express, { Express } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import * as Sentry from '@sentry/node';
import { getConfig } from '@config/config';
import logger from '@utils/logger';
import { enhancedLogger, loggerMiddleware } from '@utils/enhanced-logger';
import userRoutes from '@routes/user.routes';
import generateRoutes from '@routes/generate.routes';
import authRoutes from '@routes/auth.routes';
import chatRoutes from '@routes/chat.routes';
import subscriptionRoutes from '@routes/subscription.routes';
import supportRoutes from '@routes/support.routes';
import adminRoutes from '@routes/admin.routes';
import i18nRoutes from '@routes/i18n.routes';
import metricsRoutes from '@routes/metrics.routes';
import { initPlans } from './init-plans';
import { configurePassport } from '@config/passport';
// Импортируем непосредственно из utils/cleanup.service, избегая алиасов
import { cleanupOldFiles, cleanupOldChats } from './utils/cleanup.service';
import { i18nService } from '@i18n/index';
import { i18nMiddleware } from '@middleware/i18n.middleware';
import { maintenanceMiddleware } from '@middleware/maintenance.middleware';
import { trackError } from '@middleware/analytics.middleware';
import { metricsMiddleware } from '@middleware/metrics.middleware';
import { errorMiddleware } from '@middleware/error.middleware';
import { GlobalConfig } from '@models/GlobalConfig';
import { createAdminIfNeeded } from './utils/createAdmin';
// Новые импорты для улучшений безопасности
import { enhancedSecurityMiddleware, bodySizeLimit, validateHeaders, timingSafeResponse } from '@middleware/security.middleware';
import { sanitizeMiddleware } from '@utils/sanitizer';
import { withRetry, retryConditions } from '@utils/retry';
import { circuitBreakerManager } from '@utils/circuit-breaker';
import { cacheManager } from '@utils/cache.service';

const app: Express = express();

// Функция для ожидания подключения к MongoDB с retry
async function waitForMongoConnection(maxRetries = 60, retryInterval = 5000) {
  return withRetry(
    async () => {
      await mongoose.connection.asPromise();
      const state = mongoose.connection.readyState;
      enhancedLogger.info(`MongoDB соединение подтверждено, readyState: ${state}`);
      if (state === 1) return true; // 1 = connected
      throw new Error(`MongoDB readyState не 1, текущее значение: ${state}`);
    },
    {
      maxRetries,
      baseDelay: retryInterval,
      onRetry: (error, attempt) => {
        enhancedLogger.warn(`Попытка ${attempt} подключения к MongoDB не удалась`, { error: error.message });
      }
    }
  );
}

// Функция для проверки/переподключения к MongoDB
async function ensureMongoConnection(cfg: any) {
  if (mongoose.connection.readyState !== 1) {
    enhancedLogger.warn('MongoDB не подключена, пытаемся переподключиться');
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
    enhancedLogger.info('Запуск инициализации приложения');
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

    // Применяем расширенные настройки безопасности
    enhancedSecurityMiddleware(app);
    
    // Валидация заголовков
    app.use(validateHeaders);
    
    // Защита от timing атак
    app.use(timingSafeResponse);
    
    // Ограничение размера тела запроса
    app.use(bodySizeLimit('10mb'));
    
    // Базовые middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Санитизация входных данных
    app.use(sanitizeMiddleware);
    
    // Улучшенное логирование с контекстом
    app.use(loggerMiddleware);
    
    // Добавляем middleware для сбора метрик
    app.use(metricsMiddleware);
    
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
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'X-Request-ID']
    };
    
    app.use(cors(corsOptions));

    // Логирование с улучшенным форматом
    app.use(morgan('combined', { 
      stream: { 
        write: (message: string) => enhancedLogger.http(message.trim())
      },
      skip: (req) => req.path === '/health' || req.path === '/metrics' // Пропускаем health check и metrics
    }));

    // Подключение к MongoDB с Circuit Breaker
    mongoose.set('strictQuery', false);
    enhancedLogger.info('Подключение к MongoDB...', {
      uri: cfg.mongodbUri.replace(/:.*@/, ':<hidden>@')
    });

    // Event listeners для MongoDB
    mongoose.connection.on('error', err => {
      enhancedLogger.error('Ошибка соединения с MongoDB:', err);
      // Не выходим из процесса, пытаемся переподключиться
    });

    mongoose.connection.on('connected', () => {
      enhancedLogger.info('MongoDB успешно подключена');
    });

    mongoose.connection.on('disconnected', async () => {
      enhancedLogger.warn('MongoDB отключена, пытаемся переподключиться');
      try {
        await circuitBreakerManager.execute(
          'mongodb-reconnect',
          async () => {
            await mongoose.connect(cfg.mongodbUri, mongoOptions);
          },
          {
            failureThreshold: 5,
            resetTimeout: 30000,
            fallback: async () => {
              enhancedLogger.error('Не удалось переподключиться к MongoDB через Circuit Breaker');
            }
          }
        );
      } catch (err: any) {
        enhancedLogger.error('Ошибка переподключения MongoDB:', err);
      }
    });

    mongoose.connection.on('reconnected', () => {
      enhancedLogger.info('MongoDB успешно переподключена');
    });

    // Первоначальное подключение
    await mongoose.connect(cfg.mongodbUri, mongoOptions);
    await waitForMongoConnection();

    // Проверяем возможность выполнения операций
    if (mongoose.connection.db) {
      try {
        await mongoose.connection.db.command({ ping: 1 });
        enhancedLogger.info('MongoDB ping успешен');
      } catch (pingErr: any) {
        enhancedLogger.error('MongoDB ping не удался:', pingErr);
        throw pingErr;
      }
    } else {
      throw new Error('MongoDB db объект не определён');
    }

    // Инициализируем глобальную конфигурацию
    await GlobalConfig.findOne() || await GlobalConfig.create({});
    enhancedLogger.info('Глобальная конфигурация инициализирована');

    // Инициализируем i18n
    await i18nService.initialize();
    enhancedLogger.info('i18n инициализирован');

    // Настройка Passport
    await configurePassport(app);
    enhancedLogger.info('Passport настроен');

    // Health check route (до всех middleware)
    app.get('/health', (req, res) => {
      const health = {
        status: 'ok', 
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        version: process.env.npm_package_version || '1.0.0',
        circuitBreakers: Object.fromEntries(
          Array.from(circuitBreakerManager.getAllStats()).map(([name, stats]) => [
            name,
            stats.state
          ])
        ),
        cacheStats: cacheManager.getAllStats()
      };
      res.json(health);
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
    app.use('/metrics', metricsRoutes); // Добавляем роут для метрик
    enhancedLogger.info('Routes загружены');

    // Swagger Documentation (только в разработке)
    if (process.env.NODE_ENV !== 'production') {
      const { setupSwagger } = require('@utils/swagger');
      setupSwagger(app);
      enhancedLogger.info('Swagger документация настроена на /api-docs');
    }

    // Убеждаемся, что соединение стабильно перед инициализацией планов
    await ensureMongoConnection(cfg);
    
    // Даем время для стабилизации соединения
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Инициализируем планы подписок с retry
    try {
      await withRetry(
        async () => {
          await initPlans();
          enhancedLogger.info('Планы подписок инициализированы');
        },
        {
          maxRetries: 3,
          baseDelay: 2000
        }
      );
    } catch (planError: any) {
      enhancedLogger.error('Ошибка инициализации планов:', planError);
      // Не останавливаем приложение, планы могут быть инициализированы позже
    }

    // Создаем административного пользователя, если нужно
    try {
      await createAdminIfNeeded();
      enhancedLogger.info('Проверка и создание административного пользователя выполнена');
    } catch (adminError: any) {
      enhancedLogger.error('Ошибка при создании административного пользователя:', adminError);
      // Не останавливаем приложение, можно будет создать админа позже
    }

    // Запускаем задачи по очистке
    try {
      cleanupOldFiles.start();
      cleanupOldChats.start();
      enhancedLogger.info('Cron задачи очистки запущены');
    } catch (cronError: any) {
      enhancedLogger.error('Ошибка запуска cron задач:', cronError);
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
      enhancedLogger.info(`Получен сигнал ${signal}, начинаем graceful shutdown...`);
      
      try {
        // Останавливаем cron задачи
        if (cleanupOldFiles) cleanupOldFiles.stop();
        if (cleanupOldChats) cleanupOldChats.stop();
        
        // Закрываем все кэши
        cacheManager.closeAll();
        
        // Закрываем MongoDB соединение
        await mongoose.connection.close();
        enhancedLogger.info('MongoDB соединение закрыто');
        
        // Закрываем Sentry
        await Sentry.close(2000);
        enhancedLogger.info('Sentry closed');
        
        process.exit(0);
      } catch (err: any) {
        enhancedLogger.error('Ошибка при graceful shutdown:', err);
        process.exit(1);
      }
    };

    // Обработчики сигналов завершения
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Обработка необработанных исключений
    process.on('uncaughtException', (err) => {
      enhancedLogger.error('Uncaught Exception:', err);
      Sentry.captureException(err);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason: any, promise) => {
      enhancedLogger.error('Unhandled Rejection:', reason);
      Sentry.captureException(reason);
    });

    // Запуск сервера
    const server = app.listen(cfg.port, '0.0.0.0', () => {
      enhancedLogger.info(`🚀 Сервер запущен на порту ${cfg.port}`, {
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
    enhancedLogger.error('❌ Критическая ошибка инициализации приложения:', err);
    Sentry.captureException(err);
    process.exit(1);
  }
}

// Запуск приложения
initializeApp().catch((err) => {
  enhancedLogger.error('❌ Не удалось запустить приложение:', err);
  process.exit(1);
});