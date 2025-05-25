import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Создаем оригинальный winston logger
const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  winstonLogger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

// Создаем обертку, которая будет использовать enhanced logger когда он доступен
const logger = {
  error: (message: string, meta?: any) => {
    if (typeof meta === 'object' && meta !== null && !(meta instanceof Error)) {
      winstonLogger.error(message, meta);
    } else if (meta instanceof Error) {
      winstonLogger.error(message, { error: meta.message, stack: meta.stack });
    } else {
      winstonLogger.error(message);
    }
  },
  warn: (message: string, meta?: any) => winstonLogger.warn(message, meta),
  info: (message: string, meta?: any) => winstonLogger.info(message, meta),
  http: (message: string, meta?: any) => winstonLogger.http(message, meta),
  verbose: (message: string, meta?: any) => winstonLogger.verbose(message, meta),
  debug: (message: string, meta?: any) => winstonLogger.debug(message, meta),
  silly: (message: string, meta?: any) => winstonLogger.debug(message, meta),
};

export default logger;