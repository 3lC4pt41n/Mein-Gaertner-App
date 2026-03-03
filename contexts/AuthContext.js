import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { initPurchases } from '../services/purchaseService';
import { normalizeLanguage } from '../services/languageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);

  const handlePasswordRecoveryDetected = useCallback(
    () => setPasswordRecoveryMode(true),
    []
  );
  const handlePasswordRecoveryComplete = useCallback(
    () => setPasswordRecoveryMode(false),
    []
  );

  // --- Auth State Listener ---
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUser(data?.user ?? null))
      .catch(() => setUser(null));

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true);
      }
      setUser(session?.user ?? null);
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- RevenueCat Init (after login) ---
  useEffect(() => {
    if (user?.id) {
      initPurchases(user.id).catch(console.warn);
    }
  }, [user?.id]);

  // --- Beta Welcome Check (once per user) ---
  useEffect(() => {
    if (user?.id) {
      AsyncStorage.getItem(`beta_welcome_shown_${user.id}`).then((val) => {
        if (!val) setShowWelcome(true);
      });
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
        .catch(() => {
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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
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
      await AsyncStorage.setItem(`beta_welcome_shown_${user.id}`, 'true');
    }
    setShowWelcome(false);
  }, [user?.id]);

  // --- Sign Out ---
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  // --- Update Profile (partial updates) ---
  const updateProfile = useCallback(async (updates) => {
    if (!user?.id) throw new Error('No user logged in');
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
    if (error) throw error;
    await refreshProfile();
  }, [user?.id, refreshProfile]);

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
