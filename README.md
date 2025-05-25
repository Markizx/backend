# ContentStar Backend

Backend API для платформы ContentStar, предоставляющий аутентификацию, управление подписками, **высококачественную генерацию контента с несколькими опциями**, AI чат на основе Grok, тикеты поддержки, **полнофункциональную мультиязычную поддержку с динамическими переводами**, **расширенную аналитику**, административные функции, **улучшенную безопасность** и **повышенную надежность системы**.

![ContentStar Logo](https://contentstar.app/logo.png)

## Последние обновления (v2.6.0)

### Фаза 1: Критические улучшения безопасности и надежности ✅

#### Новые возможности безопасности
- ✅ **Улучшенная проверка JWT токенов**:
  - Проверка издателя (issuer) и алгоритмов
  - Ограничение срока действия токена (maxAge)
  - Толерантность к расхождению времени (clockTolerance)
  - Проверка полноты payload
- ✅ **Механизм черного списка токенов**:
  - Полноценный сервис TokenBlacklistService с кэшированием
  - Автоматическое добавление токенов при logout
  - Поддержка batch операций
  - Автоматическая очистка истекших токенов
- ✅ **Расширенные настройки безопасности**:
  - Улучшенная конфигурация Helmet с детальными CSP правилами
  - Дополнительные заголовки безопасности
  - Защита от timing атак
  - Валидация заголовков запросов
- ✅ **Санитизация входных данных**:
  - Полноценный класс Sanitizer для различных типов данных
  - Защита от SQL и NoSQL инъекций
  - Автоматическая санитизация через middleware
  - Безопасная обработка email, URL, имен файлов

#### Новые возможности надежности
- ✅ **Механизм повторных попыток (Retry)**:
  - Функция withRetry с экспоненциальной задержкой
  - Специфичные условия для разных сервисов (OpenAI, Stripe, S3, Stability, Runway, Grok)
  - Декоратор @Retry для методов
  - RetryManager для управления состоянием попыток
- ✅ **Circuit Breaker Pattern**:
  - Полноценная реализация с тремя состояниями: CLOSED, OPEN, HALF_OPEN
  - Автоматическое восстановление после сбоев
  - Поддержка fallback функций
  - Глобальный CircuitBreakerManager для всех сервисов
- ✅ **Улучшенное структурированное логирование**:
  - EnhancedLogger с контекстом запросов
  - Категоризация ошибок (NETWORK, DATABASE, AUTH, etc.)
  - Автоматическая отправка критических ошибок в Sentry
  - Метрики производительности и статистика ошибок
  - Логирование с уникальными request ID

### Предыдущие обновления (v2.5.1)

#### Новые возможности
- ✅ **Унифицированные ответы API**: стандартизированная структура ответов для всех эндпоинтов
- ✅ **Улучшенная обработка ошибок**: единый формат ошибок с контекстной информацией
- ✅ **Интеграция с Stability AI SD3.5** для фотореалистичной генерации изображений
- ✅ **Три режима генерации изображений** (Art, Real, Pro) с разными моделями
- ✅ **Профессиональная обработка изображений** через Stability AI v2beta
- ✅ **Генерация видео с выбором длительности** (5 или 10 секунд)
- ✅ **Автоматический перевод промтов** с любого языка на английский
- ✅ **Полная система аналитики** с автотрекингом различных событий
- ✅ **CRUD планов подписок** через админку
- ✅ **Полная документация Swagger** для всех API-эндпоинтов
- ✅ **Типизированные интерфейсы** для всех компонентов системы

#### Архитектурные улучшения
- ✅ **Стандартизация ответов API** с использованием класса ApiResponse
- ✅ **Объектно-ориентированные контроллеры** с четким разделением ответственности
- ✅ **Специализированные сервисы** для разных типов генерации контента
- ✅ **Изолированные сервисы-обертки для внешних API** (OpenAI, Stability, Runway, Grok)
- ✅ **Улучшенное кеширование секретов** с автообновлением
- ✅ **Глобальный переключатель аутентификации** для демо-режима
- ✅ **Усиленная безопасность JWT** с явным указанием алгоритмов
- ✅ **Унифицированная обработка асинхронных ошибок** через asyncHandler
- ✅ **Транзакции MongoDB** для атомарных операций
- ✅ **Строгая типизация** для повышения надежности системы
- ✅ **Типизированные интерфейсы** в новом файле `/types/generation.types.ts`
- ✅ **Сервисная архитектура** для улучшения поддерживаемости кода
- ✅ **Согласованное использование TypeScript path aliases** во всем проекте
- ✅ **Документация Swagger** для всех API-эндпоинтов проекта

## Унифицированные ответы API

В версии 2.5 мы стандартизировали все ответы API с использованием класса `ApiResponse`. Теперь все эндпоинты возвращают данные в едином формате:

**Успешные ответы**:
```json
{
  "success": true,
  "data": {...},
  "message": "Операция выполнена успешно"
}
```

**Ответы с ошибками**:
```json
{
  "success": false,
  "error": "Сообщение об ошибке",
  "details": {...},
  "status": 400
}
```

Класс `ApiResponse` предоставляет методы:
- `success()` - создает структуру успешного ответа
- `error()` - создает структуру ответа с ошибкой
- `send()` - отправляет успешный ответ клиенту с указанным статусом
- `sendError()` - отправляет ответ с ошибкой и автоматически логирует её

Преимущества такого подхода:
- Единообразие всех ответов API
- Упрощенная обработка ответов на стороне клиента
- Стандартизированная обработка ошибок
- Поддержка метаданных для пагинации
- Автоматическое логирование ошибок
- Поддержка i18n для сообщений об ошибках

## Документация Swagger

Swagger API документация доступна по адресу `/api-docs` и содержит полное описание всех API-эндпоинтов системы:

- **Auth** - API для аутентификации пользователей
- **User** - API для работы с профилем пользователя
- **Generation** - API для генерации контента с использованием AI
- **Chat** - API для работы с чатами и сообщениями
- **Subscription** - API для работы с подписками пользователей
- **Support** - API для работы с тикетами поддержки
- **I18n** - API для интернационализации и локализации
- **Admin** - API для административных функций

Преимущества полной Swagger-документации:
- Автоматическая генерация клиентских библиотек
- Интерактивный интерфейс для тестирования API
- Полное описание входных и выходных параметров
- Документация схем данных и моделей
- Автоматическая генерация TypeScript типов
- Единый источник правды для API-контрактов

## Архитектура проекта

Проект построен с использованием многослойной архитектуры с усиленной безопасностью и надежностью:

### Слои приложения

1. **Маршруты** (`/routes`) - определяют API эндпоинты и HTTP методы
2. **Контроллеры** (`/controllers`) - объекты с методами для обработки запросов и управления потоком данных
3. **Сервисы** (`/services`) - содержат бизнес-логику с встроенными retry и circuit breaker:
   - `image.service.ts` - генерация и обработка изображений
   - `video.service.ts` - генерация видео
   - `text.service.ts` - генерация текста и описаний изображений
   - `chat.service.ts` - работа с чатами и Grok AI
   - `translation.service.ts` - перевод текста промптов
   - `aws.service.ts` - хранение файлов в AWS S3 с retry
   - `mailService.ts` - отправка электронных писем с retry
4. **Обертки для внешних API** (`/services/ai`) - изолированное взаимодействие с API AI-сервисов с Circuit Breaker:
   - `openai.service.ts` - OpenAI API с retry и circuit breaker
   - `stability.service.ts` - Stability AI API с retry
   - `runway.service.ts` - Runway ML API с retry и circuit breaker
   - `grok.service.ts` - Grok AI API с retry и circuit breaker
5. **Модели** (`/models`) - определяют структуру данных и взаимодействие с базой данных
6. **Middleware** (`/middleware`) - перехватывают и обрабатывают запросы:
   - `auth.middleware.ts` - улучшенная JWT аутентификация
   - `security.middleware.ts` - расширенные настройки безопасности
   - `error.middleware.ts` - унифицированная обработка ошибок
7. **Утилиты** (`/utils`) - вспомогательные функции и инструменты:
   - `enhanced-logger.ts` - структурированное логирование с контекстом
   - `retry.ts` - механизм повторных попыток
   - `circuit-breaker.ts` - защита от каскадных сбоев
   - `sanitizer.ts` - санитизация входных данных
   - `token-blacklist.ts` - управление черным списком токенов
8. **Конфигурация** (`/config`) - настройки приложения
9. **i18n** (`/i18n`) - интернационализация и локализация
10. **Константы** (`/constants`) - перечисления и константы
11. **Типы** (`/types`) - определения типов и интерфейсов
12. **Документация** (`/docs`) - Swagger API документация

### Шаблоны проектирования

- **Стандартизация ответов API** - класс ApiResponse для единообразной обработки ответов
- **Инверсия зависимостей** - бизнес-логика изолирована в сервисах
- **Адаптер** - сервисы-обертки для внешних API изолируют детали реализации
- **Контроллеры в виде объектов** - группировка связанных обработчиков в единый объект
- **Единая обработка ошибок** - через asyncHandler и глобальный middleware
- **Репозитории** - модели Mongoose для доступа к данным
- **Специализированные сервисы** - отдельные сервисы для разных типов генерации контента
- **Типизированные интерфейсы** - строгая типизация для повышения надежности кода
- **Path aliases** - последовательное использование alias для упрощения импортов

### Диаграмма архитектуры с улучшениями безопасности

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   Клиенты     │────▶│    Routes     │────▶│  Controllers  │
└───────────────┘     └───────────────┘     └───────┬───────┘
                                                     │
                      ┌───────────────┐              │
                      │  Security     │◀─────────────┤
                      │  Middleware   │              │
                      └───────┬───────┘              │
                              │                      │
                      ┌───────────────┐              │
                      │ Auth + Token  │◀─────────────┤
                      │  Blacklist    │              │
                      └───────┬───────┘              │
                              │                      │
                      ┌───────────────┐              │
                      │    Models     │◀─────────────┤
                      └───────┬───────┘              │
                              │                      ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   Database    │◀────│  Middleware   │     │   Services    │
└───────────────┘     └───────────────┘     └───────┬───────┘
                                                     │
                                            ┌────────┴────────┐
                                            │  Retry + CB     │
                                            └────────┬────────┘
                                                     │
                                            ┌────────┴────────┐
                                            │  API Services   │
                                            └────────┬────────┘
                                                     │
                                            ┌────────┴────────┐
                                            │ External APIs   │
                                            └─────────────────┘
```

## Контроллеры (объектная модель)

Контроллеры реализованы в объектно-ориентированном стиле, что улучшает организацию кода:

```typescript
// Пример из generate.controller.ts
export const GenerateController = {
  // Обработчик генерации контента
  handleGenerate: asyncHandler(async (req, res) => {
    // Реализация
    return ApiResponse.send(res, result);
  }),
  
  // Получение истории файлов пользователя
  getUserFiles: asyncHandler(async (req, res) => {
    // Реализация
    return ApiResponse.send(res, files);
  })
};
```

## Стандартизация ответов API

Все ответы API теперь проходят через класс `ApiResponse`:

```typescript
// Успешный ответ
ApiResponse.send(res, data, message, status);

// Ответ с ошибкой
ApiResponse.sendError(res, message, details, status);
```

Преимущества такого подхода:
- Объединение связанных обработчиков в единый объект
- Улучшенная тестируемость (легче создавать моки)
- Явное указание на принадлежность обработчика к определенному домену
- Единообразная структура кода во всех контроллерах
- Автоматическое логирование ошибок

## Безопасность и надежность

### Механизмы безопасности

1. **JWT Аутентификация**:
   ```typescript
   // Улучшенная проверка токенов
   jwt.verify(token, JWT_SECRET, {
     algorithms: ['HS256'],
     issuer: 'contentstar.app',
     maxAge: '7d',
     clockTolerance: 30
   });
   ```

2. **Черный список токенов**:
   ```typescript
   // Автоматическое добавление при logout
   await blacklistService.addToBlacklist(token, 'logout');
   ```

3. **Санитизация входных данных**:
   ```typescript
   // Автоматическая санитизация через middleware
   Sanitizer.sanitizeEmail(email);
   Sanitizer.sanitizeString(input, { maxLength: 1000 });
   ```

### Механизмы надежности

1. **Retry с экспоненциальной задержкой**:
   ```typescript
   await withRetry(
     () => externalApiCall(),
     {
       maxRetries: 3,
       baseDelay: 1000,
       retryCondition: retryConditions.openai
     }
   );
   ```

2. **Circuit Breaker**:
   ```typescript
   await circuitBreakerManager.execute(
     'openai-api',
     () => apiCall(),
     {
       failureThreshold: 5,
       resetTimeout: 60000,
       fallback: () => fallbackResponse()
     }
   );
   ```

3. **Структурированное логирование**:
   ```typescript
   enhancedLogger.error('Ошибка API', error, {
     userId: user.id,
     requestId: req.id,
     service: 'openai'
   });
   ```

## Стек технологий

- **Runtime**: Node.js v20.19.1
- **Framework**: Express.js с улучшенной безопасностью (Helmet)
- **Database**: MongoDB (Mongoose) с транзакциями
- **Authentication**: JWT с blacklist, Passport (Google OAuth, Apple Sign In)
- **Security**: 
  - Helmet с расширенной конфигурацией CSP
  - Санитизация входных данных
  - Защита от SQL/NoSQL инъекций
  - Rate limiting
- **Reliability**:
  - Retry механизм для всех внешних вызовов
  - Circuit Breaker pattern
  - Структурированное логирование
- **Payments**: Stripe
- **Content Generation**: 
  - **OpenAI** (GPT-4o, DALL·E 3, Vision)
  - **Stability AI** (SD3.5 Large) для фотореалистичных изображений
  - **Grok AI** (x.ai) для чата и генерации изображений высшего качества
  - **Runway ML** для генерации видео
- **Internationalization**: i18next с AI переводами (Google Translate API + OpenAI fallback)
- **Storage**: AWS S3 с retry механизмом
- **Email**: Nodemailer с retry для SMTP
- **Secrets**: AWS Secrets Manager с улучшенным кешированием
- **Logging**: Winston с EnhancedLogger для структурированного логирования
- **Monitoring**: Sentry с автоматической категоризацией ошибок
- **Analytics**: Автоматический трекинг и детальная аналитика
- **Documentation**: Swagger
- **Process Manager**: PM2
- **Proxy**: Nginx

## Генерация контента высокого качества

### Генерация изображений с тремя опциями

Система поддерживает три режима генерации изображений:

| Режим | Модель | Описание | Особенности |
|-------|--------|----------|-------------|
| **Art** | Dall-E 3 | Художественные изображения в различных стилях | Высокое качество, креативность |
| **Real** | Stability AI SD3.5 Large | Фотореалистичные изображения с естественным освещением | Естественные текстуры, реалистичность |
| **Pro** | Grok 2 Image Gen | Изображения наивысшего качества | Сложные композиции, детализация |

### Продвинутая обработка изображений

Реализована интеграция с Stability AI для профессиональной обработки изображений:

- **Inpainting** - изменение центральной части изображения с использованием специальной маски
- **Outpainting** - расширение границ изображения на заданное количество пикселей
- **Modify** - модификация всего изображения с сохранением общей композиции

Все методы обработки имеют резервное решение через OpenAI в случае ошибки Stability AI.

### Генерация видео

Поддерживается генерация высококачественных видео с выбором длительности:

- Генерация из текстового промта через промежуточное изображение
- Генерация из существующего изображения напрямую
- Выбор продолжительности: 5 или 10 секунд
- Использует Runway ML Gen3a Turbo API

### Полная мультиязычная поддержка промтов

Система обеспечивает полную мультиязычную поддержку для всех типов генерации контента:

- ✅ **Автоматический перевод промтов** для Stability AI (режим Real) с любого из 20+ поддерживаемых языков на английский с помощью OpenAI
- ✅ **Автоперевод промтов** для обработки изображений с Stability AI
- ✅ **Нативная поддержка языков** в Grok и DALL-E — пользователи могут писать на своем родном языке

## Архитектура сервисов AI

Система использует архитектуру адаптера для взаимодействия с различными API генерации контента:

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  image.service   │  │  video.service   │  │   text.service   │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│                      AI Service Layer                        │
├──────────────┬───────────────┬───────────────┬──────────────┤
│ openai.service│ stability.service│ runway.service │ grok.service │
└──────────────┴───────────────┴───────────────┴──────────────┘
         │                │                │               │
         ▼                ▼                ▼               ▼
┌──────────────┐  ┌───────────────┐  ┌───────────────┐ ┌──────────────┐
│   OpenAI API  │  │ Stability AI API │  │  Runway ML API  │ │   Grok AI API  │
└──────────────┘  └───────────────┘  └───────────────┘ └──────────────┘
```

### Преимущества использования сервисов-оберток для API:

1. **Изоляция деталей реализации** - основные сервисы не зависят от деталей API
2. **Легкость замены провайдеров** - можно заменить одного провайдера на другого без изменения основных сервисов
3. **Единая обработка ошибок** - каждый сервис имеет свою специфичную логику обработки ошибок
4. **Переиспользование кода** - общие функции (получение ключей, логирование и т.д.) не дублируются
5. **Упрощение тестирования** - можно легко создать моки для AI сервисов
6. **Лучшая документация** - четкое разделение между внутренними и внешними API

## API для генерации контента

```bash
# Получение доступных опций генерации
GET /api/generate/options

# Генерация изображения в режиме Art
POST /api/generate
Content-Type: multipart/form-data
{
  "mode": "image",
  "imageModel": "art",
  "prompt": "Художественный пейзаж с горами и озером на закате"
}

# Генерация фотореалистичного изображения в режиме Real (используя Stability AI SD3.5)
POST /api/generate
Content-Type: multipart/form-data
{
  "mode": "image",
  "imageModel": "real",
  "prompt": "Фотореалистичный городской пейзаж с небоскребами и оживленной улицей"
}

# Генерация изображения в режиме Pro
POST /api/generate
Content-Type: multipart/form-data
{
  "mode": "image",
  "imageModel": "pro",
  "prompt": "Детализированный портрет с профессиональным освещением и текстурами"
}

# Обработка изображения (Inpainting)
POST /api/generate
Content-Type: multipart/form-data
{
  "mode": "image",
  "processingType": "inpainting",
  "prompt": "Добавить букет цветов в центр изображения",
  "file": [двоичные данные изображения]
}

# Обработка изображения (Outpainting)
POST /api/generate
Content-Type: multipart/form-data
{
  "mode": "image",
  "processingType": "outpainting",
  "prompt": "Расширить изображение, добавив горы на горизонте",
  "file": [двоичные данные изображения]
}

# Генерация видео (5 секунд)
POST /api/generate
Content-Type: multipart/form-data
{
  "mode": "video",
  "duration": "5",
  "prompt": "Плавное движение камеры над морским побережьем"
}

# Генерация видео (10 секунд)
POST /api/generate
Content-Type: multipart/form-data
{
  "mode": "video",
  "duration": "10",
  "prompt": "Плавное движение камеры над горным пейзажем с водопадами",
  "file": [двоичные данные изображения] (опционально)
}
```

## AI Чат функциональность

- **Создание чатов**: Пользователи могут создавать новые чаты
- **История сообщений**: Последние 10 сообщений отправляются как контекст
- **Лимиты**: Ограничения по количеству сообщений в день и общему количеству чатов
- **Автоочистка**: Чаты старше 30 дней автоматически удаляются
- **Интеграция с Grok AI**: Использует API x.ai для получения ответов
- **Атомарные операции**: Транзакции MongoDB для обеспечения целостности данных

### API для чатов

```bash
# Создание нового чата
POST /api/chat
Content-Type: application/json
Authorization: Bearer TOKEN
{
  "title": "Новый чат о технологиях"
}

# Получение списка чатов пользователя
GET /api/chat
Authorization: Bearer TOKEN

# Получение истории чата
GET /api/chat/64e3a7b1c2e9e3a2d1b3c4d5
Authorization: Bearer TOKEN

# Отправка сообщения в чат
POST /api/chat/64e3a7b1c2e9e3a2d1b3c4d5/message
Content-Type: application/json
Authorization: Bearer TOKEN
{
  "message": "Расскажи мне о квантовых компьютерах"
}
```

## Мультиязычность (Internationalization)

Система полностью поддерживает **динамические переводы** без предварительной подготовки:

### Поддерживаемые языки (20+)
- **Европейские**: английский, русский, испанский, французский, немецкий, итальянский, португальский, голландский, шведский, датский, норвежский, турецкий, польский
- **Азиатские**: японский, корейский, китайский, тайский, вьетнамский, хинди
- **Другие**: арабский

### Ключевые возможности
- ✅ **Автоопределение языка** из Accept-Language заголовка
- ✅ **Пользовательские предпочтения** - каждый пользователь может выбрать свой язык
- ✅ **AI переводы на лету** - Google Translate + OpenAI fallback
- ✅ **Двухуровневое кэширование** - память + MongoDB для производительности

### API для работы с языками

```bash
# Получение поддерживаемых языков
GET /api/i18n/languages
Authorization: Bearer TOKEN

# Перевод отдельного ключа
GET /api/i18n/translate/errors.unauthorized?lang=ru
Authorization: Bearer TOKEN

# Смена языка пользователя
PUT /api/user/language
Content-Type: application/json
Authorization: Bearer TOKEN
{
  "language": "ru"
}

# Батч-переводы (до 100 ключей)
POST /api/i18n/batch-translate
Content-Type: application/json
Authorization: Bearer TOKEN
{
  "keys": ["errors.unauthorized", "success.login", "limits.text_limit_exceeded"],
  "language": "ru"
}
```

## Административная панель API

Система предоставляет полный набор API для административных задач:

### API для управления пользователями

```bash
# Получение списка пользователей
GET /api/admin/users?search=test&page=1&limit=20
Authorization: Bearer ADMIN_TOKEN

# Блокировка/разблокировка пользователя
POST /api/admin/users/64e3a7b1c2e9e3a2d1b3c4d5/block
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "block": true
}

# Изменение роли пользователя
POST /api/admin/users/64e3a7b1c2e9e3a2d1b3c4d5/role
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "role": "admin"
}

# Управление подпиской пользователя
POST /api/admin/users/64e3a7b1c2e9e3a2d1b3c4d5/subscription
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "isSubscribed": true,
  "plan": "pro",
  "trial": false
}
```

### API для глобальных настроек системы

```bash
# Получение глобальной конфигурации
GET /api/admin/config
Authorization: Bearer ADMIN_TOKEN

# Включение/отключение системы подписок
POST /api/admin/subscription/toggle
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "enabled": true
}

# Включение/отключение аутентификации
POST /api/admin/authentication/toggle
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "enabled": true
}

# Включение/отключение режима обслуживания
POST /api/admin/maintenance
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "enabled": false
}
```

### API для управления планами подписок

```bash
# Получение планов подписок
GET /api/admin/subscription-plans
Authorization: Bearer ADMIN_TOKEN

# Создание плана подписки
POST /api/admin/subscription-plans
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "name": "basic",
  "price": 10,
  "textLimit": 50,
  "imageLimit": 30,
  "videoLimit": 5,
  "chatLimit": 50,
  "maxChats": 10,
  "trialDays": 3,
  "stripePriceId": "price_basic"
}

# Обновление плана подписки
PUT /api/admin/subscription-plans/basic
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN
{
  "price": 9.99,
  "textLimit": 60
}
```

## Структура проекта

```
backend
│   .env
│   .gitignore
│   check-project.sh
│   package.json
│   README.md
│   tsconfig.json
│   update-config.sh
│
└───src
    │   app.ts
    │   init-plans.ts
    │
    ├───config
    │       config.ts
    │       passport.ts
    │
    ├───constants
    │       enums.ts
    │
    ├───controllers
    │       auth.controller.ts
    │       chat.controller.ts
    │       generate.controller.ts
    │       subscription.controller.ts
    │       support.controller.ts
    │
    ├───docs
    │       admin.swagger.ts
    │       auth.swagger.ts
    │       chat.swagger.ts
    │       generate.swagger.ts
    │       i18n.swagger.ts
    │       subscription.swagger.ts
    │       support.swagger.ts
    │       user.swagger.ts
    │
    ├───i18n
    │   │   cache.service.ts
    │   │   index.ts
    │   │   translator.service.ts
    │   │
    │   └───locales
    │       └───en
    │               common.json
    │
    ├───middleware
    │       analytics.middleware.ts
    │       auth.middleware.ts
    │       error.middleware.ts
    │       i18n.middleware.ts
    │       maintenance.middleware.ts
    │       objectId.middleware.ts
    │       rate.limiter.ts
    │       role.middleware.ts
    │       security.middleware.ts        # НОВЫЙ
    │
    ├───models
    │       Analytics.ts
    │       Chat.ts
    │       GeneratedFile.ts
    │       GlobalConfig.ts
    │       Message.ts
    │       SubscriptionPlan.ts
    │       SupportTicket.ts
    │       Translation.ts
    │       User.ts
    │
    ├───routes
    │       admin.routes.ts
    │       auth.routes.ts
    │       chat.routes.ts
    │       generate.routes.ts
    │       i18n.routes.ts
    │       subscription.routes.ts
    │       support.routes.ts
    │       user.routes.ts
    │
    ├───services
    │   │   aws.service.ts
    │   │   chat.service.ts
    │   │   image.service.ts
    │   │   mailService.ts
    │   │   text.service.ts
    │   │   translation.service.ts
    │   │   video.service.ts
    │   │
    │   └───ai
    │           grok.service.ts
    │           index.ts
    │           openai.service.ts
    │           runway.service.ts
    │           stability.service.ts
    │
    ├───types
    │       generation.types.ts
    │       i18n.d.ts
    │       passport-apple.d.ts
    │
    └───utils
            asyncHandler.ts
            circuit-breaker.ts     # НОВЫЙ
            cleanup.service.ts
            createAdmin.ts
            enhanced-logger.ts     # НОВЫЙ
            getSecrets.ts
            logger.ts
            response.ts
            retry.ts              # НОВЫЙ
            sanitizer.ts          # НОВЫЙ
            swagger.ts
            token-blacklist.ts    # НОВЫЙ
```

## Аналитика и мониторинг

Система автоматически отслеживает все ключевые метрики:

### Автоматический трекинг событий
- 📝 **Регистрации и входы** пользователей
- 💰 **Подписки** (оформление, продление, отмена)
- 🎨 **Генерация контента** (текст, изображения, видео)
- 💬 **Чат активность** (создание чатов, сообщения)
- 🎫 **Тикеты поддержки**
- 🚨 **Ошибки системы**

### API аналитики для администраторов

```bash
# Общая статистика
GET /api/admin/analytics/overview?period=30d
Authorization: Bearer ADMIN_TOKEN

# Статистика доходов
GET /api/admin/analytics/revenue?groupBy=day&startDate=2024-01-01
Authorization: Bearer ADMIN_TOKEN

# Пользовательская аналитика
GET /api/admin/analytics/users?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer ADMIN_TOKEN

# Статистика генерации
GET /api/admin/analytics/generation
Authorization: Bearer ADMIN_TOKEN

# Мониторинг ошибок
GET /api/admin/analytics/errors?limit=100
Authorization: Bearer ADMIN_TOKEN
```

### Health Check и мониторинг

```bash
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2025-05-25T10:00:00.000Z",
  "mongodb": "connected",
  "version": "2.6.0",
  "circuitBreakers": {
    "openai-api": "CLOSED",
    "grok-chat": "CLOSED",
    "s3-upload": "CLOSED"
  }
}
```

## Обработка ошибок и надежность

### Категории ошибок (v2.6.0)

- **NETWORK** - сетевые ошибки (ECONNREFUSED, ETIMEDOUT)
- **DATABASE** - ошибки базы данных (MongoError, ValidationError)
- **AUTHENTICATION** - ошибки аутентификации
- **AUTHORIZATION** - ошибки авторизации
- **VALIDATION** - ошибки валидации данных
- **EXTERNAL_SERVICE** - ошибки внешних сервисов
- **SYSTEM** - системные ошибки

### Унифицированная обработка

- ✅ **Унифицированная обработка ошибок** через asyncHandler для всех асинхронных операций
- ✅ **Резервные механизмы** при сбоях внешних API (OpenAI как запасной вариант для Stability AI)
- ✅ **Транзакции MongoDB** для обеспечения целостности данных при операциях с несколькими документами
- ✅ **Детальное логирование** всех операций для облегчения отладки
- ✅ **Автоматическая категоризация и отправка критических ошибок в Sentry**

### Пример использования asyncHandler

```typescript
// Безопасная обработка асинхронных ошибок
export const GenerateController = {
  handleGenerate: asyncHandler(async (req, res) => {
    // Код контроллера
    // Любые ошибки будут автоматически перехвачены и переданы в middleware обработки ошибок
  })
};
```

### Пример использования транзакций MongoDB

```typescript
// Атомарное обновление нескольких документов
const session = await mongoose.startSession();
try {
  session.startTransaction();
  
  await Message.create([{ chat: id, content, role: 'user' }], { session });
  await User.updateOne({ _id: userId }, { $inc: { chatUsed: 1 } }, { session });
  
  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction();
  throw err;
} finally {
  session.endSession();
}
```

## Планы подписки

Каждый план включает лимиты на генерацию контента и использование чата:

| Возможности | Basic | Plus | Pro |
|-------------|-------|------|-----|
| **Цена** | $10/месяц | $30/месяц | $70/месяц |
| **Тексты** | 50/месяц | 100/месяц | 200/месяц |
| **Изображения** | 30/месяц | 50/месяц | 100/месяц |
| **Видео** | 5/месяц | 30/месяц | 100/месяц |
| **Сообщения в чате** | 50/день | 150/день | 300/день |
| **Макс. чатов** | 10 | 25 | 50 |
| **Пробный период** | 3 дня | 3 дня | 3 дня |

Управление планами осуществляется через административный интерфейс с возможностью изменения лимитов и цен.

## Установка и запуск

### Требования

- Node.js v20.x
- MongoDB (локальная или Atlas)
- AWS аккаунт (S3, Secrets Manager)
- Stripe аккаунт
- API ключи для сервисов генерации контента:
  - OpenAI
  - Stability AI
  - RunwayML
  - Grok AI (x.ai)
- Google Translate API ключ (опционально)
- SMTP сервер (для Nodemailer)
- Google OAuth credentials

### Установка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd contentstar-backend
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте .env файл на основе .env.example:
```bash
cp .env.example .env
```

4. Обновите .env своими креденшалами:
```env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=<your-bucket>
SECRETS_MANAGER_SECRET_NAME=contentstar-secrets
PORT=4000
```

5. Соберите проект:
```bash
npm run build
```

6. Запустите приложение с PM2:
```bash
pm2 start dist/app.js --name contentstar-backend
```

### Конфигурация PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'contentstar-backend',
    script: './dist/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

### Деплой изменений

```bash
# Копирование новых файлов на сервер
scp -i path/to/keyfile local/file ubuntu@server:/remote/path

# Пример:
scp -i C:\Users\PC\Desktop\contentstar.pem C:\Users\PC\contentstar\backend\src\docs\admin.swagger.ts ubuntu@13.237.156.187:/home/ubuntu/contentstar-backend/src/docs/admin.swagger.ts
scp -i C:\Users\PC\Desktop\contentstar.pem C:\Users\PC\contentstar\backend\src\docs\user.swagger.ts ubuntu@13.237.156.187:/home/ubuntu/contentstar-backend/src/docs/user.swagger.ts
scp -i C:\Users\PC\Desktop\contentstar.pem C:\Users\PC\contentstar\backend\README.md ubuntu@13.237.156.187:/home/ubuntu/contentstar-backend/README.md

# Пересборка и перезапуск сервера
ssh -i C:\Users\PC\Desktop\contentstar.pem ubuntu@13.237.156.187 "cd /home/ubuntu/contentstar-backend && npm run build && pm2 restart contentstar-backend"
```

## Разработка

### Запуск в режиме разработки

```bash
npm run dev
```

### Структура логов

```
logs/
├── error-YYYY-MM-DD.log     # Ошибки
├── combined-YYYY-MM-DD.log  # Все логи
├── critical.log             # Критические ошибки
└── pm2-*.log               # PM2 логи
```

### Тестирование retry логики

```typescript
// Симуляция сбоев для тестирования
process.env.SIMULATE_FAILURES = 'true';
```

## Миграция с версии 2.5.x

1. **Обновите зависимости** - package.json уже содержит все необходимые пакеты
2. **Обновите файлы** - замените обновленные файлы из Фазы 1
3. **Пересоберите проект** - `npm run build`
4. **Перезапустите** - `pm2 restart contentstar-backend`

Все изменения обратно совместимы, дополнительная миграция данных не требуется.

## Поддержка

При возникновении проблем:
1. Проверьте логи в папке `logs/`
2. Проверьте состояние circuit breakers через `/health`
3. Используйте Sentry для отслеживания критических ошибок
4. Обратитесь в поддержку: support@contentstar.app

## Лицензия

[MIT](LICENSE)

---

© 2025 ContentStar. Все права защищены.