// screens/AuthScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Text,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { colors, spacing, radius } from '../theme';
import { t } from '../i18n';

const APP_SCHEME = 'digitalergaertner';
const OAUTH_REDIRECT_PATH = 'auth/callback';
const PASSWORD_RESET_PATH = 'auth/reset-password';

function isNetworkError(err) {
  const msg = err?.message || '';
  return (
    msg.includes('Network request failed') ||
    msg.includes('fetch failed') ||
    err?.name === 'AuthRetryableFetchError'
  );
}

function normalizePath(path) {
  return String(path || '').replace(/^\/+/, '');
}

function buildRedirectUrl(path) {
  const normalized = normalizePath(path);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/${normalized}`;
  }
  return `${APP_SCHEME}://${normalized}`;
}

function parseAuthCallbackUrl(url) {
  if (!url || typeof url !== 'string') return { path: '', params: {} };

  try {
    const parsed = new URL(url);
    const queryParams = Object.fromEntries(parsed.searchParams.entries());
    const hashParams = Object.fromEntries(
      new URLSearchParams((parsed.hash || '').replace(/^#/, '')).entries()
    );

    // For custom schemes (e.g. digitalergaertner://auth/callback) URL splits host/path.
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const combinedPath = isHttp
      ? normalizePath(parsed.pathname)
      : [normalizePath(parsed.host), normalizePath(parsed.pathname)]
          .filter(Boolean)
          .join('/');

    return {
      path: combinedPath,
      params: {
        ...queryParams,
        ...hashParams,
      },
    };
  } catch {
    const [withoutHash, hashPart = ''] = url.split('#');
    const [basePart, queryPart = ''] = withoutHash.split('?');
    const queryParams = Object.fromEntries(new URLSearchParams(queryPart).entries());
    const hashParams = Object.fromEntries(new URLSearchParams(hashPart).entries());
    const pathPart = basePart.includes('://') ? basePart.split('://')[1] : basePart;

    return {
      path: normalizePath(pathPart),
      params: {
        ...queryParams,
        ...hashParams,
      },
    };
  }
}

function clearWebAuthParams() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, '', cleanUrl);
}

export default function AuthScreen({
  onPasswordRecoveryDetected,
  onPasswordResetComplete,
  forcePasswordReset = false,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(forcePasswordReset);
  const processedUrlsRef = useRef(new Set());
  const recoveryInitializedRef = useRef(!!forcePasswordReset);

  const oauthRedirectTo = useMemo(() => buildRedirectUrl(OAUTH_REDIRECT_PATH), []);
  const resetRedirectTo = useMemo(() => buildRedirectUrl(PASSWORD_RESET_PATH), []);

  useEffect(() => {
    if (forcePasswordReset) {
      recoveryInitializedRef.current = true;
      setRecoveryMode(true);
    }
  }, [forcePasswordReset]);

  const consumeAuthUrl = useCallback(
    async (url) => {
      if (!url || processedUrlsRef.current.has(url)) return;

      const { path, params } = parseAuthCallbackUrl(url);
      const hasCode = !!params?.code;
      const hasTokenHash = !!params?.token_hash && !!params?.type;
      const hasSessionTokens = !!params?.access_token && !!params?.refresh_token;
      const isRecovery = params?.type === 'recovery' || path === PASSWORD_RESET_PATH;
      const requiresSessionExchange = hasCode || hasTokenHash || hasSessionTokens;

      if (!requiresSessionExchange && !isRecovery) return;

      // Prevent repeated reset-form re-initialization when URL params were already cleaned.
      if (isRecovery && !requiresSessionExchange) {
        if (!recoveryInitializedRef.current) {
          recoveryInitializedRef.current = true;
          setRecoveryMode(true);
          onPasswordRecoveryDetected?.();
        }
        return;
      }

      processedUrlsRef.current.add(url);

      setAuthLoading(true);
      try {
        if (isRecovery) {
          recoveryInitializedRef.current = true;
          setRecoveryMode(true);
          onPasswordRecoveryDetected?.();
        }

        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
        } else if (hasTokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: params.type,
          });
          if (error) throw error;
        } else if (hasSessionTokens) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;
        }

        if (isRecovery) {
          Alert.alert(t('auth.resetPassword'), t('auth.resetPasswordMessage'));
        }
      } catch (err) {
        const msg = isNetworkError(err) ? t('common.networkError') : err?.message;
        Alert.alert(t('common.error'), msg || t('auth.authFailed'));
      } finally {
        clearWebAuthParams();
        setAuthLoading(false);
      }
    },
    [onPasswordRecoveryDetected]
  );

  useEffect(() => {
    let active = true;

    const loadInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (active && initialUrl) {
        await consumeAuthUrl(initialUrl);
      }
    };

    loadInitialUrl();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      consumeAuthUrl(window.location.href);
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      consumeAuthUrl(url);
    });

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, [consumeAuthUrl]);

  // Registrierung per Email
  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.emptyFields'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordMinLength'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        const msg = isNetworkError(error) ? t('common.networkError') : error.message;
        Alert.alert(t('common.error'), msg);
      } else {
        Alert.alert(t('auth.confirmSent'), t('auth.confirmSentMessage'));
        if (Platform.OS === "web") {
          alert(t('auth.confirmSentAlert'));
        }
      }
    } catch (err) {
      const msg = isNetworkError(err) ? t('common.networkError') : err.message;
      Alert.alert(t('common.error'), msg);
    } finally {
      setLoading(false);
    }
  };

  // Login per Email
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.emptyFields'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = isNetworkError(error) ? t('common.networkError') : error.message;
        Alert.alert(t('common.error'), msg);
      }
    } catch (err) {
      const msg = isNetworkError(err) ? t('common.networkError') : err.message;
      Alert.alert(t('common.error'), msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const isWeb = Platform.OS === 'web';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: oauthRedirectTo,
          skipBrowserRedirect: !isWeb,
        },
      });

      if (error) {
        const msg = isNetworkError(error) ? t('common.networkError') : error.message;
        Alert.alert(t('common.error'), msg);
        return;
      }

      if (!isWeb && data?.url) {
        await Linking.openURL(data.url);
      }
    } catch (err) {
      const msg = isNetworkError(err) ? t('common.networkError') : err?.message;
      Alert.alert(t('common.error'), msg || t('auth.googleLoginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert(t('common.error'), t('auth.forgotPasswordPrompt'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirectTo,
      });

      if (error) {
        const msg = isNetworkError(error) ? t('common.networkError') : error.message;
        Alert.alert(t('common.error'), msg);
        return;
      }

      Alert.alert(
        t('auth.emailSent'),
        t('auth.emailSentMessage')
      );
    } catch (err) {
      const msg = isNetworkError(err) ? t('common.networkError') : err?.message;
      Alert.alert(t('common.error'), msg || t('auth.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      Alert.alert(t('common.error'), t('auth.passwordFieldsRequired'));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordMinLength'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      Alert.alert(t('common.error'), t('auth.passwordsMismatch'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const msg = isNetworkError(error) ? t('common.networkError') : error.message;
        Alert.alert(t('common.error'), msg);
        return;
      }

      Alert.alert(t('common.success'), t('auth.passwordUpdated'));
      setNewPassword('');
      setConfirmNewPassword('');
      setRecoveryMode(false);
      onPasswordResetComplete?.();
    } catch (err) {
      const msg = isNetworkError(err) ? t('common.networkError') : err?.message;
      Alert.alert(t('common.error'), msg || t('auth.passwordUpdateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderRecoveryForm = () => (
    <>
      <Text style={styles.recoveryTitle}>
        {t('auth.newPasswordLabel')}
      </Text>
      <Text>{t('auth.newPassword')}</Text>
      <TextInput
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        style={styles.input}
        editable={!loading}
      />
      <Text>{t('auth.confirmPassword')}</Text>
      <TextInput
        secureTextEntry
        value={confirmNewPassword}
        onChangeText={setConfirmNewPassword}
        style={[styles.input, { marginBottom: spacing.lg }]}
        editable={!loading}
      />
      <Button title={t('auth.saveNewPassword')} onPress={handleUpdatePassword} color={colors.primary} disabled={loading} />
    </>
  );

  const renderAuthForm = () => (
    <>
      <Text>{t('auth.email')}</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        editable={!loading}
      />
      <Text>{t('auth.password')}</Text>
      <TextInput
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={[styles.input, { marginBottom: spacing.lg }]}
        editable={!loading}
      />

      <Button title={t('auth.login')} onPress={handleLogin} color={colors.primary} disabled={loading} />
      <View style={{ height: spacing.sm }} />
      <TouchableOpacity
        onPress={handleGoogleLogin}
        disabled={loading}
        activeOpacity={0.85}
        style={[styles.googleButton, loading && styles.googleButtonDisabled]}
      >
        <View style={styles.googleIconWrap}>
          <FontAwesome name="google" size={18} color="#DB4437" />
        </View>
        <Text style={styles.googleButtonText}>{t('auth.googleSignIn')}</Text>
      </TouchableOpacity>
      <View style={{ height: spacing.sm }} />
      <Button title={t('auth.signup')} onPress={handleSignup} disabled={loading} />
      <View style={{ height: spacing.sm }} />
      <Button title={t('auth.forgotPassword')} onPress={handleForgotPassword} disabled={loading} />
    </>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('auth.appTitle')}
      </Text>

      {recoveryMode ? renderRecoveryForm() : renderAuthForm()}

      {loading || authLoading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  recoveryTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  googleButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  googleButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
});
