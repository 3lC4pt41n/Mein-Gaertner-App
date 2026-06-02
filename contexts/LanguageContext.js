import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n from '../i18n';
import {
  applyLanguageDetailed,
  getCurrentLanguage,
  normalizeLanguage,
  subscribeLanguageChanges,
} from '../services/languageService';
import { getDirectionStatus, reloadAppForDirectionChange } from '../services/rtlService';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [localeState, setLocaleState] = useState(() => ({
    locale: normalizeLanguage(i18n.locale),
    version: 0,
    direction: getDirectionStatus(i18n.locale),
  }));
  const [loading, setLoading] = useState(false);

  useEffect(
    () =>
      subscribeLanguageChanges((locale, version, direction) => {
        setLocaleState({ locale, version, direction: direction || getDirectionStatus(locale) });
      }),
    []
  );

  useEffect(() => {
    applyLanguageDetailed(getCurrentLanguage(), { reloadOnRTLChange: true }).catch((error) => {
      if (__DEV__) {
        console.warn('[LanguageContext] Initiale Sprache konnte nicht geladen werden.', error);
      }
    });
  }, []);

  const setLanguage = useCallback(async (languageCode) => {
    setLoading(true);
    try {
      return await applyLanguageDetailed(languageCode);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      locale: localeState.locale,
      version: localeState.version,
      rtl: localeState.direction.rtl,
      rtlRestartRequired: localeState.direction.restartRequired,
      loading,
      setLanguage,
      reloadForDirectionChange: reloadAppForDirectionChange,
    }),
    [
      loading,
      localeState.direction.restartRequired,
      localeState.direction.rtl,
      localeState.locale,
      localeState.version,
      setLanguage,
    ]
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
