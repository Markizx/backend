import { getSecrets } from '@utils/getSecrets';
import logger from '@utils/logger';

export interface Config {
  port: number;
  mongodbUri: string;
  frontendUrl: string;
  apiUrl: string;
  awsRegion: string;
  awsS3Bucket: string;
  JWT_SECRET: string;
  SENTRY_DSN: string;
  smtpUser: string;
  smtpPass: string;
  mailFrom: string;
  [key: string]: string | number;
}

let cachedConfig: Config | null = null;

export async function getConfig(): Promise<Config> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const secrets = await getSecrets();
    if (!secrets) {
      throw new Error('Не удалось загрузить секреты');
    }

    cachedConfig = {
      port: parseInt(process.env.PORT || '4000', 10),
      mongodbUri: secrets.MONGODB_URI,
      frontendUrl: secrets.NEXTAUTH_URL || 'https://contentstar.app',
      apiUrl: process.env.API_URL || 'https://api.contentstar.app',
      awsRegion: secrets.AWS_REGION || 'ap-southeast-2',
      awsS3Bucket: secrets.AWS_S3_BUCKET || 'contentstar-files',
      JWT_SECRET: secrets.JWT_SECRET,
      SENTRY_DSN: secrets.SENTRY_DSN,
      smtpUser: secrets.SMTP_USER,
      smtpPass: secrets.SMTP_PASS,
      mailFrom: secrets.MAIL_FROM,
      ...secrets,
    };

    logger.info('Конфигурация успешно загружена', {
      keys: Object.keys(cachedConfig),
      port: cachedConfig.port,
      awsRegion: cachedConfig.awsRegion,
      awsS3Bucket: cachedConfig.awsS3Bucket,
    });

    return cachedConfig;
  } catch (err: any) {
    logger.error('Ошибка загрузки конфигурации:', { error: err.message, stack: err.stack });
    throw err;
  }
}