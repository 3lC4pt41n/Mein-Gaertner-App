function lazyJson(importer, fallback) {
  return () => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return Promise.resolve(fallback());
    }
    return importer();
  };
}

export const loaders = {
  de: () => require('./locales/de.json'),
  en: lazyJson(
    () => import('./locales/en.json'),
    () => require('./locales/en.json')
  ),
  fr: lazyJson(
    () => import('./locales/fr.json'),
    () => require('./locales/fr.json')
  ),
  it: lazyJson(
    () => import('./locales/it.json'),
    () => require('./locales/it.json')
  ),
  es: lazyJson(
    () => import('./locales/es.json'),
    () => require('./locales/es.json')
  ),
  ru: lazyJson(
    () => import('./locales/ru.json'),
    () => require('./locales/ru.json')
  ),
  tr: lazyJson(
    () => import('./locales/tr.json'),
    () => require('./locales/tr.json')
  ),
  nl: lazyJson(
    () => import('./locales/nl.json'),
    () => require('./locales/nl.json')
  ),
  da: lazyJson(
    () => import('./locales/da.json'),
    () => require('./locales/da.json')
  ),
  pl: lazyJson(
    () => import('./locales/pl.json'),
    () => require('./locales/pl.json')
  ),
  uk: lazyJson(
    () => import('./locales/uk.json'),
    () => require('./locales/uk.json')
  ),
  'pt-BR': lazyJson(
    () => import('./locales/pt-BR.json'),
    () => require('./locales/pt-BR.json')
  ),
  'pt-PT': lazyJson(
    () => import('./locales/pt-PT.json'),
    () => require('./locales/pt-PT.json')
  ),
  hi: lazyJson(
    () => import('./locales/hi.json'),
    () => require('./locales/hi.json')
  ),
  bn: lazyJson(
    () => import('./locales/bn.json'),
    () => require('./locales/bn.json')
  ),
  ja: lazyJson(
    () => import('./locales/ja.json'),
    () => require('./locales/ja.json')
  ),
  ko: lazyJson(
    () => import('./locales/ko.json'),
    () => require('./locales/ko.json')
  ),
  'zh-Hans': lazyJson(
    () => import('./locales/zh-Hans.json'),
    () => require('./locales/zh-Hans.json')
  ),
  id: lazyJson(
    () => import('./locales/id.json'),
    () => require('./locales/id.json')
  ),
};
