import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n from '../i18n';
import {
  applyLanguage,
  getCurrentLanguage,
  normalizeLanguage,
  subscribeLanguageChanges,
} from '../services/languageService';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [localeState, setLocaleState] = useState(() => ({
    locale: normalizeLanguage(i18n.locale),
    version: 0,
  }));
  const [loading, setLoading] = useState(false);

  useEffect(
    () =>
      subscribeLanguageChanges((locale, version) => {
        setLocaleState({ locale, version });
      }),
    []
  );

  useEffect(() => {
    applyLanguage(getCurrentLanguage()).catch((error) => {
      if (__DEV__) {
        console.warn('[LanguageContext] Initiale Sprache konnte nicht geladen werden.', error);
      }
    });
  }, []);

  const setLanguage = useCallback(async (languageCode) => {
    setLoading(true);
    try {
      return await applyLanguage(languageCode);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      locale: localeState.locale,
      version: localeState.version,
      loading,
      setLanguage,
    }),
    [loading, localeState.locale, localeState.version, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
