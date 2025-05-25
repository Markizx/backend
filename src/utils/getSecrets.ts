import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { enhancedLogger } from '@utils/enhanced-logger';
import { secretsCache } from '@utils/cache.service';
import { measureExternalApi } from '@utils/performance';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

interface CachedSecrets {
  data: Record<string, string>;
  timestamp: number;
  version?: string;
}

const CACHE_TTL = 5 * 60; // 5 минут в секундах
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
      enhancedLogger.info(`Загрузка секретов из Secrets Manager (попытка ${attempt}/${retries})`, { 
        secretName, 
        region: process.env.AWS_REGION 
      });
      
      const secrets = await measureExternalApi(
        'aws-secrets-manager',
        'get-secret-value',
        async () => {
          const command = new GetSecretValueCommand({ SecretId: secretName });
          const response = await client.send(command);

          if (!response.SecretString) {
            throw new Error('SecretString отсутствует в ответе Secrets Manager');
          }

          return JSON.parse(response.SecretString);
        }
      );
      
      // Валидация критических ключей
      const requiredKeys = ['JWT_SECRET', 'MONGODB_URI', 'OPENAI_API_KEY'];
      const missingKeys = requiredKeys.filter(key => !secrets[key]);
      
      if (missingKeys.length > 0) {
        enhancedLogger.warn('Отсутствуют критические секреты:', { missingKeys });
      }
      
      enhancedLogger.info('Секреты успешно загружены', {
        keys: Object.keys(secrets),
        awsAccessKeyPresent: !!secrets.AWS_ACCESS_KEY_ID,
        awsSecretKeyPresent: !!secrets.AWS_SECRET_ACCESS_KEY,
        requiredKeysPresent: requiredKeys.filter(key => secrets[key])
      });

      return secrets;
    } catch (err: any) {
      enhancedLogger.error(`Ошибка получения секретов (попытка ${attempt}/${retries}):`, err);
      
      if (attempt < retries) {
        const delayMs = RETRY_DELAY * attempt;
        enhancedLogger.info(`Повтор через ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }
  
  return null;
}

export const getSecrets = async (forceRefresh = false): Promise<Record<string, string> | null> => {
  const cacheKey = 'main-secrets';
  
  if (!forceRefresh) {
    const cachedSecrets = secretsCache.get(cacheKey);
    if (cachedSecrets) {
      enhancedLogger.debug('Возвращены кешированные секреты из универсального кэша');
      return cachedSecrets;
    }
  }
  
  try {
    const secrets = await secretsCache.getOrFetch(
      cacheKey,
      async () => {
        const fetchedSecrets = await fetchSecretsWithRetry();
        if (!fetchedSecrets) {
          throw new Error('Не удалось загрузить секреты после всех попыток');
        }
        return fetchedSecrets;
      },
      CACHE_TTL
    );
    
    // Запускаем автоматическое обновление кеша
    if (!refreshInterval) {
      startPeriodicRefresh();
    }
    
    return secrets;
  } catch (err: any) {
    enhancedLogger.error('Критическая ошибка загрузки секретов:', err);
    
    // В случае критической ошибки пытаемся получить из кэша даже устаревшие
    const staleSecrets = secretsCache.get(cacheKey);
    if (staleSecrets) {
      enhancedLogger.warn('Возвращаются устаревшие секреты из-за ошибки загрузки');
      return staleSecrets;
    }
    
    return null;
  }
};

// Периодическое обновление секретов в фоне
function startPeriodicRefresh() {
  refreshInterval = setInterval(async () => {
    try {
      enhancedLogger.info('Автоматическое обновление секретов...');
      await getSecrets(true);
    } catch (err: any) {
      enhancedLogger.error('Ошибка автоматического обновления секретов:', err);
    }
  }, CACHE_TTL * 1000);
  
  enhancedLogger.info('Запущено автоматическое обновление секретов', { 
    interval: CACHE_TTL
  });
}

// Функция для ручной очистки кеша
export const clearSecretsCache = (): void => {
  secretsCache.del('main-secrets');
  enhancedLogger.info('Кеш секретов очищен');
};

// Функция для получения статистики кеша
export const getSecretsStats = () => {
  const stats = secretsCache.getStats();
  return {
    ...stats,
    autoRefreshActive: !!refreshInterval
  };
};

// Graceful shutdown
process.on('SIGTERM', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    enhancedLogger.info('Автоматическое обновление секретов остановлено');
  }
});

process.on('SIGINT', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    enhancedLogger.info('Автоматическое обновление секретов остановлено');
  }
});