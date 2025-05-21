import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getConfig } from '@config/config';
import logger from '@utils/logger';

let s3: S3Client | null = null;
let awsS3Bucket: string;

async function initializeS3() {
  try {
    const config = await getConfig();
    logger.debug('Конфигурация для S3:', {
      awsRegion: config.awsRegion,
      awsS3Bucket: config.awsS3Bucket,
    });
    if (!config.awsRegion || !config.awsS3Bucket) {
      throw new Error('AWS_REGION или AWS_S3_BUCKET не заданы');
    }
    s3 = new S3Client({
      region: config.awsRegion,
      // Не передаём credentials, чтобы использовать IAM роль
    });
    awsS3Bucket = config.awsS3Bucket;
    logger.info('AWS S3 успешно инициализирован');
  } catch (err: any) {
    logger.error('Ошибка инициализации AWS S3:', { error: err.message });
    s3 = null;
    throw err;
  }
}

async function ensureS3Initialized() {
  if (!s3) {
    await initializeS3();
  }
  if (!s3) {
    throw new Error('S3 клиент не инициализирован');
  }
}

initializeS3().catch(() => {
  logger.warn('Инициализация S3 не удалась, операции S3 будут недоступны до перезапуска');
});

export class S3Service {
  static async uploadFile(file: Express.Multer.File): Promise<string> {
    await ensureS3Initialized();
    // Загружаем файлы в uploads/ директорию для публичного доступа
    const filename = `uploads/${Date.now()}-${randomUUID()}-${file.originalname}`;
    const command = new PutObjectCommand({
      Bucket: awsS3Bucket,
      Key: filename,
      Body: file.buffer,
      ContentType: file.mimetype,
      // Убрали ACL, так как bucket не поддерживает ACL
    });
    await s3!.send(command);
    const url = `https://${awsS3Bucket}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${filename}`;
    logger.info(`Файл загружен в S3: ${url}`);
    return url;
  }

  static async uploadBuffer(buffer: Buffer, originalName: string, mime: string): Promise<string> {
    await ensureS3Initialized();
    // Загружаем файлы в uploads/ директорию для публичного доступа
    const filename = `uploads/${Date.now()}-${randomUUID()}-${originalName}`;
    const command = new PutObjectCommand({
      Bucket: awsS3Bucket,
      Key: filename,
      Body: buffer,
      ContentType: mime,
      // Убрали ACL, так как bucket не поддерживает ACL
    });
    await s3!.send(command);
    const url = `https://${awsS3Bucket}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${filename}`;
    logger.info(`Буфер загружен в S3: ${url}`);
    return url;
  }

  static async deleteFile(filename: string) {
    await ensureS3Initialized();
    const command = new DeleteObjectCommand({
      Bucket: awsS3Bucket,
      Key: filename,
    });
    await s3!.send(command);
    logger.info(`Файл удалён из S3: ${filename}`);
  }
}