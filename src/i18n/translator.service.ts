import { OpenAI } from 'openai';
import axios from 'axios';
import { getSecrets } from '@utils/getSecrets';
import logger from '@utils/logger';

export type SupportedLanguage = 
  | 'en' | 'ru' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' 
  | 'ar' | 'hi' | 'th' | 'vi' | 'tr' | 'pl' | 'nl' | 'sv' | 'da' | 'no';

interface TranslateRequest {
  text: string;
  targetLanguage: SupportedLanguage;
  sourceLanguage?: string;
  context?: string;
}

class AITranslatorService {
  private openai: OpenAI | null = null;
  private googleApiKey: string | null = null;
  
  async initialize() {
    try {
      const secrets = await getSecrets();
      if (!secrets) throw new Error('Secrets not loaded');
      
      this.openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY });
      this.googleApiKey = secrets.GOOGLE_TRANSLATE_API_KEY;
      
      logger.info('AI Translator Service initialized');
    } catch (err: any) {
      logger.error('Failed to initialize AI Translator:', err);
    }
  }

  async translate({ text, targetLanguage, sourceLanguage = 'en', context }: TranslateRequest): Promise<string> {
    // Если язык тот же - возвращаем как есть
    if (sourceLanguage === targetLanguage) return text;

    try {
      // Пробуем Google Translate API (быстрее и дешевле)
      if (this.googleApiKey) {
        const translation = await this.translateWithGoogle(text, targetLanguage, sourceLanguage);
        if (translation) return translation;
      }

      // Fallback на OpenAI
      if (this.openai) {
        const translation = await this.translateWithOpenAI(text, targetLanguage, sourceLanguage, context);
        if (translation) return translation;
      }

      logger.error('No translation service available');
      return text; // Возвращаем оригинал, если перевод не удался
    } catch (err: any) {
      logger.error('Translation failed:', err);
      return text;
    }
  }

  private async translateWithGoogle(text: string, target: string, source: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `https://translation.googleapis.com/language/translate/v2?key=${this.googleApiKey}`,
        {
          q: text,
          target,
          source,
          format: 'text'
        }
      );

      const translated = response.data?.data?.translations?.[0]?.translatedText;
      logger.info(`Google Translate: ${source} -> ${target}`);
      return translated || null;
    } catch (err: any) {
      logger.error('Google Translate error:', err);
      return null;
    }
  }

  private async translateWithOpenAI(text: string, target: string, source: string, context?: string): Promise<string | null> {
    try {
      const prompt = this.buildOpenAIPrompt(text, target, source, context);
      
      const response = await this.openai!.chat.completions.create({
        model: 'gpt-3.5-turbo', // Используем более дешевую модель для переводов
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      });

      const translated = response.choices[0]?.message?.content?.trim();
      logger.info(`OpenAI Translate: ${source} -> ${target}`);
      return translated || null;
    } catch (err: any) {
      logger.error('OpenAI Translate error:', err);
      return null;
    }
  }

  private buildOpenAIPrompt(text: string, target: string, source: string, context?: string): string {
    const languageNames: Record<string, string> = {
      en: 'English', ru: 'Russian', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
      ar: 'Arabic', hi: 'Hindi', th: 'Thai', vi: 'Vietnamese', tr: 'Turkish',
      pl: 'Polish', nl: 'Dutch', sv: 'Swedish', da: 'Danish', no: 'Norwegian'
    };
    
    let prompt = `Translate the following text from ${languageNames[source]} to ${languageNames[target]}:\n\n"${text}"\n\n`;
    
    if (context) {
      prompt += `Context: ${context}\n\n`;
    }
    
    prompt += `Important:
- Maintain the same tone and style
- Preserve any technical terms
- Keep the same formatting
- Provide ONLY the translation, no additional text
- For UI elements, keep them concise and user-friendly`;
    
    return prompt;
  }

  getSupportedLanguages(): SupportedLanguage[] {
    return [
      'en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh',
      'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no'
    ];
  }
}

export const aiTranslator = new AITranslatorService();