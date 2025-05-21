import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import logger from '@utils/logger';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

interface CachedSecrets {
  data: Record<string, string>;
  timestamp: number;
  version?: string;
}

let cachedSecrets: CachedSecrets | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 минут
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

// Периодическое обновление кеша
let refreshInterval: NodeJS.Timeout | null = null;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSecretsWithRetry(retries = MAX_RETRIES): Promise<Record<string, string> | null> {
  const secretName = process.env.SECRETS_MANAGER_SECRET_NAME || 'contentstar-secrets';
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`Загрузка секретов из Secrets Manager (попытка ${attempt}/${retries})`, { 
        secretName, 
        region: process.env.AWS_REGION 
      });
      
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await client.send(command);

      if (!response.SecretString) {
        throw new Error('SecretString отсутствует в ответе Secrets Manager');
      }

      const secrets = JSON.parse(response.SecretString);
      
      // Валидация критических ключей
      const requiredKeys = ['JWT_SECRET', 'MONGODB_URI', 'OPENAI_API_KEY'];
      const missingKeys = requiredKeys.filter(key => !secrets[key]);
      
      if (missingKeys.length > 0) {
        logger.warn('Отсутствуют критические секреты:', { missingKeys });
      }
      
      logger.info('Секреты успешно загружены', {
        keys: Object.keys(secrets),
        version: response.VersionId,
        awsAccessKeyPresent: !!secrets.AWS_ACCESS_KEY_ID,
        awsSecretKeyPresent: !!secrets.AWS_SECRET_ACCESS_KEY,
        requiredKeysPresent: requiredKeys.filter(key => secrets[key])
      });

      return secrets;
    } catch (err: any) {
      logger.error(`Ошибка получения секретов (попытка ${attempt}/${retries}):`, { 
        error: err.message, 
        code: err.code,
        stack: err.stack 
      });
      
      if (attempt < retries) {
        const delayMs = RETRY_DELAY * attempt;
        logger.info(`Повтор через ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }
  
  return null;
}

export const getSecrets = async (forceRefresh = false): Promise<Record<string, string> | null> => {
  const now = Date.now();
  
  // Проверяем свежесть кеша
  if (!forceRefresh && cachedSecrets && (now - cachedSecrets.timestamp) < CACHE_TTL) {
    logger.debug('Возвращены кешированные секреты', { 
      age: now - cachedSecrets.timestamp,
      keys: Object.keys(cachedSecrets.data) 
    });
    return cachedSecrets.data;
  }
  
  try {
    const secrets = await fetchSecretsWithRetry();
    
    if (!secrets) {
      logger.error('Не удалось загрузить секреты после всех попыток');
      // Возвращаем старый кеш, если есть
      if (cachedSecrets) {
        logger.warn('Используются устаревшие секреты из кеша');
        return cachedSecrets.data;
      }
      return null;
    }
    
    // Обновляем кеш
    cachedSecrets = {
      data: secrets,
      timestamp: now
    };
    
    // Запускаем автоматическое обновление кеша
    if (!refreshInterval) {
      startPeriodicRefresh();
    }
    
    return secrets;
  } catch (err: any) {
    logger.error('Критическая ошибка загрузки секретов:', { 
      error: err.message, 
      stack: err.stack 
    });
    
    // В случае критической ошибки возвращаем старый кеш
    if (cachedSecrets) {
      logger.warn('Возвращаются устаревшие секреты из-за ошибки загрузки');
      return cachedSecrets.data;
    }
    
    return null;
  }
};

// Периодическое обновление секретов в фоне
function startPeriodicRefresh() {
  refreshInterval = setInterval(async () => {
    try {
      logger.info('Автоматическое обновление секретов...');
      await getSecrets(true);
    } catch (err: any) {
      logger.error('Ошибка автоматического обновления секретов:', { 
        error: err.message 
      });
    }
  }, CACHE_TTL);
  
  logger.info('Запущено автоматическое обновление секретов', { 
    interval: CACHE_TTL / 1000 
  });
}

// Функция для ручной очистки кеша
export const clearSecretsCache = (): void => {
  cachedSecrets = null;
  logger.info('Кеш секретов очищен');
};

// Функция для получения статистики кеша
export const getSecretsStats = () => {
  return {
    cached: !!cachedSecrets,
    age: cachedSecrets ? Date.now() - cachedSecrets.timestamp : null,
    keys: cachedSecrets ? Object.keys(cachedSecrets.data) : [],
    autoRefreshActive: !!refreshInterval
  };
};

// Graceful shutdown
process.on('SIGTERM', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    logger.info('Автоматическое обновление секретов остановлено');
  }
});

process.on('SIGINT', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    logger.info('Автоматическое обновление секретов остановлено');
  }
});