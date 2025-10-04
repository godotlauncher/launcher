import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh_CN.json';
import en from './locales/en.json';
i18n
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'], // 先看 localStorage，再系统语言
      caches: ['localStorage'],             // 存储到 localStorage
    },
    resources: {
      zh: { translation: zhCN },
      en: { translation: en }
    },
    lng: 'en', // 默认语言
    interpolation: { escapeValue: false }
  });

export default i18n;
