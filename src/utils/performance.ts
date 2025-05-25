import { performance } from 'perf_hooks';
import { enhancedLogger } from '@utils/enhanced-logger';
import { recordExternalApiMetric, recordContentGenerationMetric, recordDbOperationMetric } from '@middleware/metrics.middleware';

/**
 * Интерфейс для результата измерения производительности
 */
export interface PerformanceResult<T> {
  result: T;
  duration: number;
  metadata?: Record<string, any>;
}

/**
 * Класс для профилирования производительности
 */
export class PerformanceProfiler {
  private marks = new Map<string, number>();
  private measures: Array<{ name: string; duration: number; metadata?: any }> = [];

  /**
   * Отмечает начало операции
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * Измеряет время между двумя отметками
   */
  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    if (!start) {
      throw new Error(`Start mark "${startMark}" not found`);
    }

    const end = endMark ? this.marks.get(endMark) : performance.now();
    if (!end) {
      throw new Error(`End mark "${endMark}" not found`);
    }

    const duration = end - start;
    this.measures.push({ name, duration });
    
    return duration;
  }

  /**
   * Получает все измерения
   */
  getMeasures(): Array<{ name: string; duration: number; metadata?: any }> {
    return this.measures;
  }

  /**
   * Очищает все отметки и измерения
   */
  clear(): void {
    this.marks.clear();
    this.measures = [];
  }

  /**
   * Логирует все измерения
   */
  logMeasures(context?: Record<string, any>): void {
    this.measures.forEach(measure => {
      enhancedLogger.performance(measure.name, measure.duration, {
        ...context,
        ...measure.metadata,
      });
    });
  }
}

/**
 * Декоратор для измерения производительности методов
 */
export function MeasurePerformance(name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const measureName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - start;
        
        enhancedLogger.performance(measureName, duration);
        
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        
        enhancedLogger.performance(measureName, duration, { error: true });
        
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Измеряет производительность асинхронной функции
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<PerformanceResult<T>> {
  const start = performance.now();
  
  try {
    const result = await fn();
    const duration = performance.now() - start;
    
    enhancedLogger.performance(name, duration, metadata);
    
    return { result, duration, metadata };
  } catch (error) {
    const duration = performance.now() - start;
    
    enhancedLogger.performance(name, duration, { ...metadata, error: true });
    
    throw error;
  }
}

/**
 * Измеряет производительность внешнего API вызова
 */
export async function measureExternalApi<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  
  try {
    const result = await fn();
    const duration = (performance.now() - start) / 1000; // в секундах
    
    recordExternalApiMetric(service, operation, duration, true);
    
    return result;
  } catch (error: any) {
    const duration = (performance.now() - start) / 1000; // в секундах
    
    recordExternalApiMetric(
      service, 
      operation, 
      duration, 
      false, 
      error.response?.status
    );
    
    throw error;
  }
}

/**
 * Измеряет производительность генерации контента
 */
export async function measureContentGeneration<T>(
  type: string,
  model: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  
  try {
    const result = await fn();
    const duration = (performance.now() - start) / 1000; // в секундах
    
    recordContentGenerationMetric(type, model, duration, true);
    
    return result;
  } catch (error) {
    const duration = (performance.now() - start) / 1000; // в секундах
    
    recordContentGenerationMetric(type, model, duration, false);
    
    throw error;
  }
}

/**
 * Измеряет производительность операции с базой данных
 */
export async function measureDbOperation<T>(
  operation: string,
  collection: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  
  try {
    const result = await fn();
    const duration = (performance.now() - start) / 1000; // в секундах
    
    recordDbOperationMetric(operation, collection, duration);
    
    return result;
  } catch (error) {
    const duration = (performance.now() - start) / 1000; // в секундах
    
    recordDbOperationMetric(operation, collection, duration);
    
    throw error;
  }
}

/**
 * Класс для batch измерений
 */
export class BatchProfiler {
  private profiler = new PerformanceProfiler();
  private batchName: string;
  private startTime: number;

  constructor(batchName: string) {
    this.batchName = batchName;
    this.startTime = performance.now();
    this.profiler.mark('batch_start');
  }

  /**
   * Измеряет операцию внутри batch
   */
  async measureOperation<T>(
    operationName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const markName = `op_${operationName}`;
    this.profiler.mark(`${markName}_start`);
    
    try {
      const result = await fn();
      this.profiler.mark(`${markName}_end`);
      this.profiler.measure(operationName, `${markName}_start`, `${markName}_end`);
      return result;
    } catch (error) {
      this.profiler.mark(`${markName}_error`);
      this.profiler.measure(`${operationName}_error`, `${markName}_start`, `${markName}_error`);
      throw error;
    }
  }

  /**
   * Завершает batch и возвращает результаты
   */
  finish(): { totalDuration: number; operations: Array<{ name: string; duration: number }> } {
    const totalDuration = performance.now() - this.startTime;
    const operations = this.profiler.getMeasures();
    
    enhancedLogger.performance(`batch_${this.batchName}`, totalDuration, {
      operationsCount: operations.length,
      operations: operations.map(op => ({ name: op.name, duration: Math.round(op.duration) })),
    });
    
    return { totalDuration, operations };
  }
}