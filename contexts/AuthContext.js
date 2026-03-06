import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Sentry } from '../sentry.config';
import { initPurchases, logoutPurchases } from '../services/purchaseService';
import { normalizeLanguage } from '../services/languageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

const AuthContext = createContext(null);

function reportAuthError(context, error) {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error || 'Unknown error'));
  console.warn(`[AuthContext] ${context}:`, normalizedError.message);
  Sentry.captureException(normalizedError);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);

  const handlePasswordRecoveryDetected = useCallback(() => setPasswordRecoveryMode(true), []);
  const handlePasswordRecoveryComplete = useCallback(() => setPasswordRecoveryMode(false), []);

  // --- Auth State Listener ---
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUser(data?.user ?? null))
      .catch((error) => {
        reportAuthError('auth.getUser', error);
        setUser(null);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true);
      }
      setUser(session?.user ?? null);
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- Sentry User Context (anonymous ID for crash grouping) ---
  useEffect(() => {
    if (user?.id) {
      Sentry.setUser({ id: user.id });
    } else {
      Sentry.setUser(null);
    }
  }, [user?.id]);

  // --- RevenueCat Init (after login) ---
  useEffect(() => {
    if (user?.id) {
      initPurchases(user.id).catch((error) => reportAuthError('purchases.init', error));
    }
  }, [user?.id]);

  // --- Beta Welcome Check (once per user) ---
  useEffect(() => {
    if (user?.id) {
      AsyncStorage.getItem(`beta_welcome_shown_${user.id}`)
        .then((val) => {
          if (!val) setShowWelcome(true);
        })
        .catch((error) => reportAuthError('betaWelcome.read', error));
    }
  }, [user?.id]);

  // --- Profile Fetch ---
  useEffect(() => {
    if (user) {
      setLoading(true);
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setProfile(data);
          // Set i18n locale from profile language
          if (data?.language) {
            i18n.locale = normalizeLanguage(data.language);
          }
          setLoading(false);
        })
        .catch((error) => {
          reportAuthError('profiles.fetch', error);
          setProfile(null);
          setLoading(false);
        });
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [user]);

  // --- Refresh Profile (callable from screens after profile edits) ---
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (error) {
      reportAuthError('profiles.refresh', error);
      return;
    }
    if (data) {
      setProfile(data);
      if (data.language) {
        i18n.locale = normalizeLanguage(data.language);
      }
    }
  }, [user?.id]);

  // --- Dismiss Beta Welcome ---
  const dismissWelcome = useCallback(async () => {
    if (user?.id) {
      try {
        await AsyncStorage.setItem(`beta_welcome_shown_${user.id}`, 'true');
      } catch (error) {
        reportAuthError('betaWelcome.write', error);
      }
    }
    setShowWelcome(false);
  }, [user?.id]);

  // --- Sign Out ---
  const signOut = useCallback(async () => {
    // Reset RevenueCat identity before Supabase sign-out to prevent
    // entitlement leakage when a different user logs in next.
    await logoutPurchases();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  // --- Delete Account (DSGVO) ---
  const deleteAccount = useCallback(async () => {
    // 1. Logout RevenueCat before destroying the Supabase session
    await logoutPurchases();

    // 2. Call the delete-account edge function (uses service-role internally)
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error('No active session');

    const { data, error } = await supabase.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      method: 'POST',
    });

    if (error) throw new Error(error.message || 'Account deletion failed');
    if (!data?.success) throw new Error('Account deletion failed');

    // 3. Clear local state — user is gone server-side
    setUser(null);
    setProfile(null);
  }, []);

  // --- Update Profile (partial updates) ---
  const updateProfile = useCallback(
    async (updates) => {
      if (!user?.id) throw new Error('No user logged in');
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
    },
    [user?.id, refreshProfile]
  );

  const value = {
    user,
    profile,
    userId: user?.id ?? null,
    isAdmin: !!profile?.is_admin,
    loading,
    showWelcome,
    passwordRecoveryMode,
    handlePasswordRecoveryDetected,
    handlePasswordRecoveryComplete,
    refreshProfile,
    dismissWelcome,
    signOut,
    deleteAccount,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
