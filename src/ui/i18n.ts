import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh_CN.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zhCN }
    },
    lng: 'zh', // 默认语言
    fallbackLng: 'zh',
    interpolation: { escapeValue: false }
  });

export default i18n;
