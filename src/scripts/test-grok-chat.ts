// src/scripts/test-grok-chat.ts
import 'module-alias/register';
import { GrokService } from '../services/ai/grok.service';
import { enhancedLogger } from '../utils/enhanced-logger';
import axios from 'axios';
import { getSecrets } from '../utils/getSecrets';

async function testGrokChat() {
  try {
    console.log('=== Тестирование Grok Chat API ===\n');
    
    // Получаем API ключ
    const secrets = await getSecrets();
    const apiKey = secrets?.GROK_API_KEY || secrets?.XAI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ API ключ не найден!');
      return;
    }
    
    console.log('✅ API ключ загружен\n');
    
    // Тест 1: Проверка доступных моделей
    console.log('=== Тест 1: Получение списка моделей ===');
    try {
      const modelsResponse = await axios.get('https://api.x.ai/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      console.log('Доступные модели:');
      modelsResponse.data.data.forEach((model: any) => {
        console.log(`- ${model.id}`);
      });
      console.log('');
    } catch (error: any) {
      console.error('❌ Ошибка получения моделей:', error.response?.data || error.message);
    }
    
    // Тест 2: Простой запрос к chat API
    console.log('=== Тест 2: Простой запрос к chat API ===');
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        },
        {
          role: 'user',
          content: 'Hello! Can you help me?'
        }
      ];
      
      console.log('Отправляем сообщения:', JSON.stringify(messages, null, 2));
      
      const response = await axios.post('https://api.x.ai/v1/chat/completions', {
        model: 'grok-3',
        messages: messages,
        max_tokens: 100,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('\n✅ Ответ получен:');
      console.log('Статус:', response.status);
      console.log('Модель:', response.data.model);
      console.log('Ответ:', response.data.choices[0].message.content);
      console.log('');
    } catch (error: any) {
      console.error('❌ Ошибка запроса к chat API:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    }
    
    // Тест 3: Использование GrokService
    console.log('=== Тест 3: Использование GrokService ===');
    try {
      const messages = [
        {
          role: 'user',
          content: 'Расскажи мне о квантовых компьютерах простыми словами'
        }
      ];
      
      console.log('Отправляем через GrokService...');
      const response = await GrokService.getChatResponse(messages);
      
      console.log('\n✅ Ответ через сервис получен:');
      console.log(response.substring(0, 200) + '...');
      console.log('');
    } catch (error: any) {
      console.error('❌ Ошибка GrokService:', error.message);
    }
    
    // Тест 4: Пустые сообщения (должна быть ошибка)
    console.log('=== Тест 4: Проверка обработки пустых сообщений ===');
    try {
      const emptyMessages: any[] = [];
      
      console.log('Отправляем пустой массив сообщений...');
      await GrokService.getChatResponse(emptyMessages);
      
      console.error('❌ Ошибка не была выброшена для пустых сообщений!');
    } catch (error: any) {
      console.log('✅ Правильно обработана ошибка пустых сообщений:', error.message);
    }
    
    console.log('\n=== Тестирование завершено ===');
    
  } catch (error: any) {
    console.error('Критическая ошибка:', error);
  } finally {
    process.exit(0);
  }
}

// Запускаем тест
testGrokChat();