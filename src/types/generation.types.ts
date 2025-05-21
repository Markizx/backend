import mongoose from 'mongoose';

export interface BaseGenerationResult {
  s3Url: string;
}

// Результат генерации текста
export interface TextGenerationResult extends BaseGenerationResult {
  text: string;
}

// Результат генерации изображения
export interface ImageGenerationResult extends BaseGenerationResult {
  imageUrl: string;
  generator?: string;
  processor?: string;
  processingType?: string;
  originalProcessor?: string;
  method?: string;
  quality?: string;
  translatedPrompt?: string;
  message?: string;
}

// Результат генерации видео
export interface VideoGenerationResult extends BaseGenerationResult {
  videoUrl: string;
  duration: number;
  resolution: string;
  quality: string;
}

// Результат анализа изображения и генерации описания
export interface DescriptionResult extends BaseGenerationResult {
  description: string;
}

// Тип объединение всех возможных результатов
export type GenerationResult = 
  | TextGenerationResult 
  | ImageGenerationResult 
  | VideoGenerationResult 
  | DescriptionResult;

/**
 * Функции для проверки типов результатов
 */

// Проверка результата генерации текста
export function isTextGenerationResult(result: any): result is TextGenerationResult {
  return result && 'text' in result && 's3Url' in result;
}

// Проверка результата генерации изображения
export function isImageGenerationResult(result: any): result is ImageGenerationResult {
  return result && 'imageUrl' in result && 's3Url' in result;
}

// Проверка результата генерации видео
export function isVideoGenerationResult(result: any): result is VideoGenerationResult {
  return result && 'videoUrl' in result && 's3Url' in result && 'duration' in result;
}

// Проверка результата анализа изображения
export function isDescriptionResult(result: any): result is DescriptionResult {
  return result && 'description' in result && 's3Url' in result;
}

/**
 * Типы для метаданных файлов
 */

// Метаданные изображения
export interface ImageMetadata {
  prompt?: string;
  generator?: string;
  processor?: string;
  processingType?: string;
  originalProcessor?: string;
  method?: string;
  quality?: string;
}

// Метаданные видео
export interface VideoMetadata {
  prompt?: string;
  duration: number;
  resolution?: string;
  quality?: string;
}

// Метаданные текста
export interface TextMetadata {
  prompt?: string;
  mode?: string;
  length?: number;
}

// Функция для извлечения метаданных из результата генерации
export function extractMetadata(result: GenerationResult): any {
  if (isTextGenerationResult(result)) {
    return { type: 'text' };
  } else if (isImageGenerationResult(result)) {
    const metadata: ImageMetadata = { prompt: '' };
    
    if ('generator' in result && result.generator) {
      metadata.generator = result.generator;
    }
    
    if ('processor' in result && result.processor) {
      metadata.processor = result.processor;
    }
    
    if ('processingType' in result && result.processingType) {
      metadata.processingType = result.processingType;
    }
    
    if ('originalProcessor' in result && result.originalProcessor) {
      metadata.originalProcessor = result.originalProcessor;
    }
    
    if ('method' in result && result.method) {
      metadata.method = result.method;
    }
    
    if ('quality' in result && result.quality) {
      metadata.quality = result.quality;
    }
    
    return metadata;
  } else if (isVideoGenerationResult(result)) {
    const metadata: VideoMetadata = {
      duration: result.duration,
      resolution: result.resolution,
      quality: result.quality
    };
    
    return metadata;
  }
  
  return {};
}