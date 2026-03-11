// screens/AuthScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
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
import { colors, spacing, radius } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import i18n, { t } from '../i18n';

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
  return String(path || '').replace(/^\/*/, '');
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
      : [normalizePath(parsed.host), normalizePath(parsed.pathname)].filter(Boolean).join('/');

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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { language: i18n.locale } },
      });
      if (error) {
        const msg = isNetworkError(error) ? t('common.networkError') : error.message;
        Alert.alert(t('common.error'), msg);
      } else {
        Alert.alert(t('auth.confirmSent'), t('auth.confirmSentMessage'));
        if (Platform.OS === 'web') {
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

      Alert.alert(t('auth.emailSent'), t('auth.emailSentMessage'));
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
      <Text style={styles.recoveryTitle}>{t('auth.newPasswordLabel')}</Text>
      <Text style={styles.label}>{t('auth.newPassword')}</Text>
      <TextInput
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        style={styles.input}
        placeholderTextColor={colors.textTertiary}
        editable={!loading}
      />
      <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
      <TextInput
        secureTextEntry
        value={confirmNewPassword}
        onChangeText={setConfirmNewPassword}
        style={[styles.input, { marginBottom: spacing.lg }]}
        placeholderTextColor={colors.textTertiary}
        editable={!loading}
      />
      <DSButton onPress={handleUpdatePassword} disabled={loading} fullWidth>
        {t('auth.saveNewPassword')}
      </DSButton>
    </>
  );

  const renderAuthForm = () => (
    <>
      <Text style={styles.label}>{t('auth.email')}</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholderTextColor={colors.textTertiary}
        editable={!loading}
      />
      <Text style={styles.label}>{t('auth.password')}</Text>
      <TextInput
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={[styles.input, { marginBottom: spacing.lg }]}
        placeholderTextColor={colors.textTertiary}
        editable={!loading}
      />

      <DSButton onPress={handleLogin} disabled={loading} fullWidth>
        {t('auth.login')}
      </DSButton>
      <View style={{ height: spacing.sm }} />
      <TouchableOpacity
        onPress={handleGoogleLogin}
        disabled={loading}
        activeOpacity={0.85}
        style={[styles.googleButton, loading && styles.googleButtonDisabled]}
      >
        <View style={styles.googleIconWrap}>
          <FontAwesome name="google" size={18} color={colors.google} />
        </View>
        <Text style={styles.googleButtonText}>{t('auth.googleSignIn')}</Text>
      </TouchableOpacity>
      <View style={{ height: spacing.sm }} />
      <DSButton variant="secondary" onPress={handleSignup} disabled={loading} fullWidth>
        {t('auth.signup')}
      </DSButton>
      <View style={{ height: spacing.sm }} />
      <DSButton variant="ghost" onPress={handleForgotPassword} disabled={loading} fullWidth>
        {t('auth.forgotPassword')}
      </DSButton>
    </>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.appTitle')}</Text>

      {recoveryMode ? renderRecoveryForm() : renderAuthForm()}

      {loading || authLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : null}

      {/* Legal footer — required for store compliance */}
      <View style={styles.legalFooter}>
        <TouchableOpacity
          onPress={async () => {
            const url = 'https://3lc4pt41n.github.io/Mein-Gaertner-App/privacy-policy.html';
            try {
              const supported = await Linking.canOpenURL(url);
              if (supported) {
                await Linking.openURL(url);
              } else {
                Alert.alert(
                  t('common.error'),
                  t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.',
                );
              }
            } catch {
              Alert.alert(
                t('common.error'),
                t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.',
              );
            }
          }}
        >
          <Text style={styles.legalLink}>{t('settings.privacyPolicy')}</Text>
        </TouchableOpacity>
        <Text style={styles.legalSeparator}>·</Text>
        <TouchableOpacity
          onPress={async () => {
            const url = 'https://3lc4pt41n.github.io/Mein-Gaertner-App/terms.html';
            try {
              const supported = await Linking.canOpenURL(url);
              if (supported) {
                await Linking.openURL(url);
              } else {
                Alert.alert(
                  t('common.error'),
                  t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.',
                );
              }
            } catch {
              Alert.alert(
                t('common.error'),
                t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.',
              );
            }
          }}
        >
          <Text style={styles.legalLink}>{t('settings.termsOfService')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: spacing.xxl,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  recoveryTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  googleButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  legalFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.md,
  },
  legalLink: {
    fontSize: 13,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 13,
    color: colors.textTertiary,
    marginHorizontal: spacing.sm,
  },
});
