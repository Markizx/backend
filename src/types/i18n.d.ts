declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
  }
}

export interface TranslationKey {
  key: string;
  namespace?: string;
}

export interface TranslationOptions {
  context?: string;
  interpolation?: Record<string, any>;
}