import nodemailer from 'nodemailer';
import * as Sentry from '@sentry/node';
import { getConfig } from '@config/config';
import { enhancedLogger } from '@utils/enhanced-logger';
import { withRetry } from '@utils/retry';

let transporter: nodemailer.Transporter;

async function initializeTransporter() {
  try {
    const config = await getConfig();
    const smtpConfig = {
      host: config.smtpHost || 'smtp.eu.mailgun.org',
      port: Number(config.smtpPort) || 587,
      secure: config.smtpPort === '465',
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    };

    // Проверка наличия учетных данных
    if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
      enhancedLogger.warn('SMTP учетные данные отсутствуют в конфигурации. Функциональность email будет недоступна.');
      return;
    }

    enhancedLogger.info('SMTP конфигурация:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.auth.user,
      secure: smtpConfig.secure,
    });

    transporter = nodemailer.createTransport(smtpConfig as nodemailer.TransportOptions);

    // Проверка подключения с retry
    await withRetry(
      async () => {
        await transporter.verify();
      },
      {
        maxRetries: 3,
        baseDelay: 2000,
        retryCondition: (error) => {
          // Повторяем при сетевых ошибках
          return error.code === 'ECONNREFUSED' || 
                 error.code === 'ETIMEDOUT' || 
                 error.code === 'ESOCKET';
        }
      }
    );
    
    enhancedLogger.info('SMTP транспортер успешно инициализирован', {
      host: smtpConfig.host,
      port: smtpConfig.port,
    });
  } catch (err: any) {
    enhancedLogger.error('Ошибка инициализации SMTP:', err);
    Sentry.captureException(err);
    // Изменим на логирование ошибки без завершения процесса
    enhancedLogger.warn('Email функциональность будет недоступна из-за ошибки конфигурации SMTP');
  }
}

initializeTransporter();

export const sendConfirmationEmail = async (email: string, token: string) => {
  try {
    if (!transporter) {
      enhancedLogger.error('Попытка отправить email, но SMTP транспортер не инициализирован');
      return;
    }

    const config = await getConfig();
    const fromAddress = config.mailFrom || '"Contentstar" <no-reply@contentstar.app>';
    const link = `${config.frontendUrl}/confirm/${token}`;

    enhancedLogger.info('Отправка письма подтверждения:', { email, from: fromAddress, link });

    // Отправка с retry
    await withRetry(
      async () => {
        await transporter.sendMail({
          from: fromAddress,
          to: email,
          subject: 'Подтверждение email',
          html: `
            <p>Здравствуйте!</p>
            <p>Вы зарегистрировались на Contentstar. Подтвердите ваш email:</p>
            <a href="${link}" target="_blank">${link}</a>
            <p>Если вы не регистрировались — проигнорируйте это письмо.</p>
          `,
        });
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        retryCondition: (error) => {
          // Повторяем при временных ошибках SMTP
          if (error.code === 'ETIMEDOUT' || 
              error.code === 'ECONNREFUSED' ||
              error.code === 'ESOCKET' ||
              error.responseCode >= 400 && error.responseCode < 500) {
            return true;
          }
          return false;
        },
        onRetry: (error, attempt) => {
          enhancedLogger.warn(`Повтор отправки email подтверждения, попытка ${attempt}`, {
            email,
            error: error.message,
            code: error.code
          });
        }
      }
    );

    enhancedLogger.info(`Письмо подтверждения отправлено на ${email}`);
  } catch (err: any) {
    enhancedLogger.error('Ошибка отправки письма подтверждения:', err, { email });
    Sentry.captureException(err);
    throw err;
  }
};

export const sendResetPasswordEmail = async (email: string, token: string) => {
  try {
    if (!transporter) {
      enhancedLogger.error('Попытка отправить email, но SMTP транспортер не инициализирован');
      return;
    }

    const config = await getConfig();
    const fromAddress = config.mailFrom || '"Contentstar" <no-reply@contentstar.app>';
    const link = `${config.frontendUrl}/reset-password/${token}`;

    enhancedLogger.info('Отправка письма сброса пароля:', { email, from: fromAddress, link });

    // Отправка с retry
    await withRetry(
      async () => {
        await transporter.sendMail({
          from: fromAddress,
          to: email,
          subject: 'Сброс пароля',
          html: `
            <p>Здравствуйте!</p>
            <p>Вы запросили сброс пароля для вашего аккаунта.</p>
            <p>Перейдите по ссылке, чтобы установить новый пароль:</p>
            <a href="${link}" target="_blank">${link}</a>
            <p>Срок действия ссылки — 1 час.</p>
            <p>Если вы не запрашивали — просто проигнорируйте это письмо.</p>
          `,
        });
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        retryCondition: (error) => {
          // Повторяем при временных ошибках SMTP
          if (error.code === 'ETIMEDOUT' || 
              error.code === 'ECONNREFUSED' ||
              error.code === 'ESOCKET' ||
              error.responseCode >= 400 && error.responseCode < 500) {
            return true;
          }
          return false;
        },
        onRetry: (error, attempt) => {
          enhancedLogger.warn(`Повтор отправки письма сброса пароля, попытка ${attempt}`, {
            email,
            error: error.message,
            code: error.code
          });
        }
      }
    );

    enhancedLogger.info(`Письмо сброса пароля отправлено на ${email}`);
  } catch (err: any) {
    enhancedLogger.error('Ошибка отправки письма сброса пароля:', err, { email });
    Sentry.captureException(err);
    throw err;
  }
};