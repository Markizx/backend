import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import logger from '@utils/logger';

/**
 * Настройка и инициализация документации Swagger
 * @param app Экземпляр Express приложения
 */
export function setupSwagger(app: Express) {
  const options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'ContentStar API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'REST API для платформы ContentStar, предоставляющей генерацию контента с использованием AI',
        contact: {
          name: 'ContentStar Support',
          email: 'support@contentstar.app',
          url: 'https://contentstar.app'
        },
        license: {
          name: 'Proprietary',
          url: 'https://contentstar.app/license'
        }
      },
      servers: [
        {
          url: process.env.API_URL || 'https://api.contentstar.app',
          description: 'Production server'
        },
        {
          url: 'http://localhost:4000',
          description: 'Development server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [
        {
          bearerAuth: []
        }
      ],
      tags: [
        {
          name: 'Auth',
          description: 'Аутентификация и авторизация пользователей'
        },
        {
          name: 'User',
          description: 'Операции с пользователями'
        },
        {
          name: 'Generation',
          description: 'Генерация контента с использованием AI'
        },
        {
          name: 'Chat',
          description: 'Работа с чатами и сообщениями'
        },
        {
          name: 'Subscription',
          description: 'Управление подписками'
        },
        {
          name: 'Support',
          description: 'Поддержка пользователей'
        },
        {
          name: 'I18n',
          description: 'Интернационализация'
        },
        {
          name: 'Admin',
          description: 'Административные функции'
        }
      ]
    },
    // Указываем пути к файлам с JSDoc аннотациями
    apis: [
      // Swagger документация
      './src/docs/**/*.swagger.ts',
      // Роуты и контроллеры (для дополнительной документации)
      './src/routes/**/*.ts',
      './src/controllers/**/*.ts',
      // Модели данных (для схем)
      './src/models/**/*.ts',
      // Типы и константы (для определений)
      './src/types/**/*.ts',
      './src/constants/**/*.ts'
    ]
  };

  try {
    const swaggerSpec = swaggerJSDoc(options);
    
    // Регистрируем маршруты для документации
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'ContentStar API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
        persistAuthorization: true
      }
    }));

    // Эндпоинт для получения спецификации Swagger в формате JSON
    app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    logger.info('Swagger документация настроена и доступна по адресу /api-docs');
  } catch (error: any) {
    logger.error('Ошибка настройки Swagger:', {
      error: error.message,
      stack: error.stack
    });
  }
}