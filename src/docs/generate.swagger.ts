/**
 * @swagger
 * tags:
 *   name: Generation
 *   description: API для генерации контента с помощью AI
 * 
 * components:
 *   schemas:
 *     BaseGenerationResult:
 *       type: object
 *       properties:
 *         s3Url:
 *           type: string
 *           description: URL файла в S3
 *     
 *     TextGenerationResult:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseGenerationResult'
 *         - type: object
 *           properties:
 *             text:
 *               type: string
 *               description: Сгенерированный текст
 *     
 *     ImageGenerationResult:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseGenerationResult'
 *         - type: object
 *           properties:
 *             imageUrl:
 *               type: string
 *               description: URL сгенерированного изображения
 *             generator:
 *               type: string
 *               description: Используемый генератор изображений (dall-e-3, stability-sd3.5-large, grok-2-image)
 *             processor:
 *               type: string
 *               description: Процессор для обработки изображений (stability-ai, openai-edit, dalle-recreation)
 *             processingType:
 *               type: string
 *               enum: [inpainting, outpainting, modify]
 *               description: Тип обработки изображения
 *             originalProcessor:
 *               type: string
 *               description: Оригинальный процессор (если был изменен из-за ошибки)
 *             method:
 *               type: string
 *               description: Метод генерации или обработки
 *             quality:
 *               type: string
 *               description: Качество изображения (hd, ultra-hd)
 *             translatedPrompt:
 *               type: string
 *               description: Переведенный промт (если применимо)
 *             message:
 *               type: string
 *               description: Дополнительная информация о процессе генерации
 *     
 *     VideoGenerationResult:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseGenerationResult'
 *         - type: object
 *           properties:
 *             videoUrl:
 *               type: string
 *               description: URL сгенерированного видео
 *             duration:
 *               type: integer
 *               description: Длительность в секундах
 *             resolution:
 *               type: string
 *               description: Разрешение видео
 *             quality:
 *               type: string
 *               description: Качество видео
 *     
 *     DescriptionResult:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseGenerationResult'
 *         - type: object
 *           properties:
 *             description:
 *               type: string
 *               description: Описание изображения
 *     
 *     GenerationResult:
 *       oneOf:
 *         - $ref: '#/components/schemas/TextGenerationResult'
 *         - $ref: '#/components/schemas/ImageGenerationResult'
 *         - $ref: '#/components/schemas/VideoGenerationResult'
 *         - $ref: '#/components/schemas/DescriptionResult'
 *     
 *     GeneratedFile:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID файла
 *         user:
 *           type: string
 *           description: ID пользователя
 *         s3Url:
 *           type: string
 *           description: URL файла в S3
 *         type:
 *           type: string
 *           enum: [text, image, video, description]
 *           description: Тип файла
 *         metadata:
 *           type: object
 *           properties:
 *             generator:
 *               type: string
 *               description: Используемый генератор
 *             processor:
 *               type: string
 *               description: Использованный процессор
 *             processingType:
 *               type: string
 *               enum: [inpainting, outpainting, modify]
 *               description: Тип обработки изображения
 *             prompt:
 *               type: string
 *               description: Исходный промт пользователя
 *             duration:
 *               type: number
 *               description: Длительность видео в секундах
 *             quality:
 *               type: string
 *               description: Качество генерации
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата создания
 *     
 *     GenerationOptions:
 *       type: object
 *       properties:
 *         imageModels:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 enum: [art, real, pro]
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               maxDimension:
 *                 type: integer
 *               quality:
 *                 type: string
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *         processingTypes:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 enum: [inpainting, outpainting, modify]
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *         videoOptions:
 *           type: object
 *           properties:
 *             durations:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     enum: ['5', '10']
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *             maxResolution:
 *               type: string
 *             quality:
 *               type: string
 */

/**
 * @swagger
 * /api/generate:
 *   post:
 *     summary: Генерирует контент различного типа
 *     description: |
 *       Данный эндпоинт поддерживает генерацию текста, изображений и видео
 *       с использованием различных AI моделей. Поддерживается обработка изображений
 *       и генерация видео из изображений.
 *     tags: [Generation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [text, image, video, image-to-text]
 *                 description: |
 *                   Режим генерации контента:
 *                   * text - генерация текста
 *                   * image - генерация изображения
 *                   * video - генерация видео
 *                   * image-to-text - генерация описания изображения
 *                 default: text
 *               prompt:
 *                 type: string
 *                 description: Текстовый запрос для генерации
 *               style:
 *                 type: string
 *                 description: Стиль (используется с mode=image)
 *               imageModel:
 *                 type: string
 *                 enum: [art, real, pro]
 *                 description: |
 *                   Модель генерации изображений:
 *                   * art - DALL-E 3 для художественных изображений
 *                   * real - Stability AI SD3.5 для фотореалистичных изображений
 *                   * pro - Grok 2 Image Gen для наивысшего качества
 *                 default: art
 *               processingType:
 *                 type: string
 *                 enum: [inpainting, outpainting, modify]
 *                 description: |
 *                   Тип обработки изображения:
 *                   * inpainting - изменение центральной части изображения
 *                   * outpainting - расширение границ изображения
 *                   * modify - модификация всего изображения
 *               duration:
 *                 type: string
 *                 enum: ['5', '10']
 *                 description: Длительность видео в секундах
 *                 default: '10'
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Файл изображения (для режимов image-to-text, обработки изображений или генерации видео из изображения)
 *     responses:
 *       200:
 *         description: Успешная генерация контента
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/GenerationResult'
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                 status:
 *                   type: integer
 *       401:
 *         description: Неавторизован
 *       403:
 *         description: Нет доступа или превышены лимиты
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/generate/files:
 *   get:
 *     summary: Получение истории сгенерированных файлов
 *     description: Возвращает список сгенерированных файлов за последние 7 дней
 *     tags: [Generation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список файлов
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GeneratedFile'
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 * 
 * /api/generate/options:
 *   get:
 *     summary: Получение доступных опций генерации
 *     description: Возвращает список доступных моделей и опций для генерации контента
 *     tags: [Generation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Опции генерации
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/GenerationOptions'
 *       401:
 *         description: Неавторизован
 *       500:
 *         description: Внутренняя ошибка сервера
 */