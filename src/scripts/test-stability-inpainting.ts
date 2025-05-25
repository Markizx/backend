// src/scripts/test-stability-formdata.ts
import 'module-alias/register';
import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import { getSecrets } from '../utils/getSecrets';
import { enhancedLogger } from '../utils/enhanced-logger';
import fs from 'fs';
import path from 'path';

async function testStabilityFormData() {
  try {
    console.log('=== Тестирование Stability AI с FormData ===\n');
    
    // Получаем API ключ
    const secrets = await getSecrets();
    const apiKey = secrets?.STABILITY_API_KEY;
    
    if (!apiKey) {
      console.error('❌ API ключ не найден!');
      return;
    }
    
    console.log('✅ API ключ загружен\n');
    
    // Создаем тестовое изображение если его нет
    const testImagePath = path.join(process.cwd(), 'test-image.jpg');
    if (!fs.existsSync(testImagePath)) {
      console.log('Создаем тестовое изображение...');
      await sharp({
        create: {
          width: 512,
          height: 512,
          channels: 3,
          background: { r: 100, g: 100, b: 100 }
        }
      })
      .jpeg()
      .toFile(testImagePath);
    }
    
    const imageBuffer = fs.readFileSync(testImagePath);
    console.log('✅ Тестовое изображение загружено\n');
    
    // Тест 1: Простой Image-to-Image с FormData
    console.log('=== Тест 1: Image-to-Image с FormData ===');
    try {
      const form = new FormData();
      
      // Подготавливаем изображение
      const processedImage = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .png()
        .toBuffer();
      
      form.append('init_image', processedImage, {
        filename: 'image.png',
        contentType: 'image/png'
      });
      
      form.append('text_prompts[0][text]', 'Beautiful flowers in a garden, high quality, detailed');
      form.append('text_prompts[0][weight]', '1');
      form.append('cfg_scale', '7');
      form.append('image_strength', '0.5');
      form.append('samples', '1');
      form.append('steps', '30');
      
      const formHeaders = form.getHeaders();
      
      const response = await axios.post(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
        form,
        {
          headers: {
            ...formHeaders,
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 60000
        }
      );
      
      console.log('✅ Успешный ответ от Stability AI!');
      console.log('Статус:', response.status);
      console.log('Получено изображений:', response.data.artifacts?.length);
      
      if (response.data.artifacts?.[0]?.base64) {
        const outputPath = path.join(process.cwd(), 'test-output-image2image.png');
        const buffer = Buffer.from(response.data.artifacts[0].base64, 'base64');
        fs.writeFileSync(outputPath, buffer);
        console.log('✅ Изображение сохранено:', outputPath);
      }
    } catch (error: any) {
      console.error('❌ Ошибка Image-to-Image:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    }
    
    // Тест 2: Проверка параметров
    console.log('\n=== Тест 2: Проверка различных параметров ===');
    try {
      const strengths = [0.2, 0.5, 0.8];
      
      for (const strength of strengths) {
        console.log(`\nТестируем с image_strength = ${strength}`);
        
        const form = new FormData();
        
        const processedImage = await sharp(imageBuffer)
          .resize(512, 512)
          .png()
          .toBuffer();
        
        form.append('init_image', processedImage, {
          filename: 'image.png',
          contentType: 'image/png'
        });
        
        form.append('text_prompts[0][text]', 'Cyberpunk style transformation');
        form.append('text_prompts[0][weight]', '1');
        form.append('cfg_scale', '7');
        form.append('image_strength', strength.toString());
        form.append('samples', '1');
        form.append('steps', '20');
        
        const response = await axios.post(
          'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
          form,
          {
            headers: {
              ...form.getHeaders(),
              'Accept': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            timeout: 60000
          }
        );
        
        console.log(`✅ Успешно с strength=${strength}`);
      }
    } catch (error: any) {
      console.error('❌ Ошибка тестирования параметров:', error.response?.data);
    }
    
    console.log('\n=== Тестирование завершено ===');
    
  } catch (error: any) {
    console.error('Критическая ошибка:', error);
  } finally {
    process.exit(0);
  }
}

// Запускаем тест
testStabilityFormData();