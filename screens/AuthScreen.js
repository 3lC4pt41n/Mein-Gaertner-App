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

const NETWORK_ERROR_MSG =
  "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut.";
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
          Alert.alert("Passwort zurücksetzen", "Bitte gib jetzt dein neues Passwort ein.");
        }
      } catch (err) {
        const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err?.message;
        Alert.alert("Fehler", msg || "Authentifizierung fehlgeschlagen.");
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
      Alert.alert("Fehler", "E-Mail und Passwort dürfen nicht leer sein.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Fehler", "Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        const msg = isNetworkError(error) ? NETWORK_ERROR_MSG : error.message;
        Alert.alert("Fehler", msg);
      } else {
        Alert.alert("Bestätigungslink verschickt", "Bitte prüfe deine Email und bestätige sie.");
        if (Platform.OS === "web") {
          alert("Bestätigungslink verschickt!");
        }
      }
    } catch (err) {
      const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err.message;
      Alert.alert("Fehler", msg);
    } finally {
      setLoading(false);
    }
  };

  // Login per Email
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Fehler", "E-Mail und Passwort dürfen nicht leer sein.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = isNetworkError(error) ? NETWORK_ERROR_MSG : error.message;
        Alert.alert("Fehler", msg);
      }
    } catch (err) {
      const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err.message;
      Alert.alert("Fehler", msg);
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
        const msg = isNetworkError(error) ? NETWORK_ERROR_MSG : error.message;
        Alert.alert("Fehler", msg);
        return;
      }

      if (!isWeb && data?.url) {
        await Linking.openURL(data.url);
      }
    } catch (err) {
      const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err?.message;
      Alert.alert("Fehler", msg || "Google Login fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert("Fehler", "Bitte gib zuerst deine E-Mail-Adresse ein.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirectTo,
      });

      if (error) {
        const msg = isNetworkError(error) ? NETWORK_ERROR_MSG : error.message;
        Alert.alert("Fehler", msg);
        return;
      }

      Alert.alert(
        "E-Mail versendet",
        "Wir haben dir einen Link zum Zurücksetzen des Passworts geschickt."
      );
    } catch (err) {
      const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err?.message;
      Alert.alert("Fehler", msg || "Passwort-Reset fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      Alert.alert("Fehler", "Bitte fülle beide Passwort-Felder aus.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Fehler", "Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      Alert.alert("Fehler", "Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const msg = isNetworkError(error) ? NETWORK_ERROR_MSG : error.message;
        Alert.alert("Fehler", msg);
        return;
      }

      Alert.alert("Erfolg", "Dein Passwort wurde erfolgreich aktualisiert.");
      setNewPassword('');
      setConfirmNewPassword('');
      setRecoveryMode(false);
      onPasswordResetComplete?.();
    } catch (err) {
      const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err?.message;
      Alert.alert("Fehler", msg || "Passwort konnte nicht aktualisiert werden.");
    } finally {
      setLoading(false);
    }
  };

  const renderRecoveryForm = () => (
    <>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, textAlign: 'center' }}>
        Neues Passwort setzen
      </Text>
      <Text>Neues Passwort</Text>
      <TextInput
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, marginBottom: 12, padding: 10 }}
        editable={!loading}
      />
      <Text>Passwort wiederholen</Text>
      <TextInput
        secureTextEntry
        value={confirmNewPassword}
        onChangeText={setConfirmNewPassword}
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, marginBottom: 16, padding: 10 }}
        editable={!loading}
      />
      <Button title="Neues Passwort speichern" onPress={handleUpdatePassword} color="#4CAF50" disabled={loading} />
    </>
  );

  const renderAuthForm = () => (
    <>
      <Text>Email</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, marginBottom: 12, padding: 10 }}
        editable={!loading}
      />
      <Text>Passwort</Text>
      <TextInput
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, marginBottom: 16, padding: 10 }}
        editable={!loading}
      />

      <Button title="Einloggen" onPress={handleLogin} color="#4CAF50" disabled={loading} />
      <View style={{ height: 10 }} />
      <TouchableOpacity
        onPress={handleGoogleLogin}
        disabled={loading}
        activeOpacity={0.85}
        style={[styles.googleButton, loading && styles.googleButtonDisabled]}
      >
        <View style={styles.googleIconWrap}>
          <FontAwesome name="google" size={18} color="#DB4437" />
        </View>
        <Text style={styles.googleButtonText}>Sign in with Google</Text>
      </TouchableOpacity>
      <View style={{ height: 10 }} />
      <Button title="Registrieren" onPress={handleSignup} disabled={loading} />
      <View style={{ height: 10 }} />
      <Button title="Passwort vergessen" onPress={handleForgotPassword} disabled={loading} />
    </>
  );

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' }}>
        Digitaler Gärtner
      </Text>

      {recoveryMode ? renderRecoveryForm() : renderAuthForm()}

      {loading || authLoading ? <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  googleButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  googleButtonText: {
    color: '#3C4043',
    fontSize: 14,
    fontWeight: '600',
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
});
