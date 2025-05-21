import nodemailer from 'nodemailer';
import * as Sentry from '@sentry/node';
import { getConfig } from '@config/config';
import logger from '@utils/logger';

let transporter: nodemailer.Transporter;

async function initializeTransporter() {
  try {
    const config = await getConfig();
    const smtpConfig = {
      host: config.smtpHost || 'smtp.eu.mailgun.org',
      port: Number(config.smtpPort) || 587,
      secure: config.smtpPort === '465',
      auth: {
        user: config.smtpUser || 'postmaster@contentstar.app',
        pass: config.smtpPass || 'cb140f8e2dfbae06a217c3119ff9d469-a908eefc-15dbd582',
      },
    };

    logger.info('SMTP конфигурация:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.auth.user,
      secure: smtpConfig.secure,
    });

    transporter = nodemailer.createTransport(smtpConfig as nodemailer.TransportOptions);

    // Проверка подключения
    await transporter.verify();
    logger.info('SMTP транспортер успешно инициализирован', {
      host: smtpConfig.host,
      port: smtpConfig.port,
    });
  } catch (err: any) {
    logger.error('Ошибка инициализации SMTP:', { error: err.message, stack: err.stack });
    Sentry.captureException(err);
    process.exit(1);
  }
}

initializeTransporter();

export const sendConfirmationEmail = async (email: string, token: string) => {
  try {
    const config = await getConfig();
    const fromAddress = config.mailFrom || '"Contentstar" <postmaster@contentstar.app>';
    const link = `${config.frontendUrl}/confirm/${token}`;

    logger.info('Отправка письма подтверждения:', { email, from: fromAddress, link });

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

    logger.info(`Письмо подтверждения отправлено на ${email}`);
  } catch (err: any) {
    logger.error('Ошибка отправки письма подтверждения:', { email, error: err.message, stack: err.stack });
    Sentry.captureException(err);
    throw err;
  }
};

export const sendResetPasswordEmail = async (email: string, token: string) => {
  try {
    const config = await getConfig();
    const fromAddress = config.mailFrom || '"Contentstar" <postmaster@contentstar.app>';
    const link = `${config.frontendUrl}/reset-password/${token}`;

    logger.info('Отправка письма сброса пароля:', { email, from: fromAddress, link });

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

    logger.info(`Письмо сброса пароля отправлено на ${email}`);
  } catch (err: any) {
    logger.error('Ошибка отправки письма сброса пароля:', { email, error: err.message, stack: err.stack });
    Sentry.captureException(err);
    throw err;
  }
};