import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { fetchMessages, saveMessage } from '../services/chatService';
import { uploadChatImage, getChatImageUrl } from '../services/uploadService';
import { chatWithBen } from '../services/aiService';
import { fetchBalance } from '../services/creditService';
import { fetchCurrentUserLanguage } from '../services/languageService';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

const GARDENER_NAME = 'Ben';

export default function AssistantScreen() {
  const { userId: user_id, user } = useAuth();
  const navigation = useNavigation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [language, setLanguage] = useState('de');
  const [userAvatarUrl, setUserAvatarUrl] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const flatListRef = useRef();

  useEffect(() => {
    if (!user_id) return;
    (async () => {
      try {
        const bal = await fetchBalance();
        setBalance(bal);
      } catch (_e) {
        /* Balance-Fehler ignorieren — UI zeigt null */
      }
      try {
        const userLanguage = await fetchCurrentUserLanguage();
        setLanguage(userLanguage);
      } catch (_e) {
        /* Fallback: Deutsch */
      }

      const avatarPath = user?.user_metadata?.gardener_avatar_path;
      if (avatarPath) {
        try {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('chat-images')
            .createSignedUrl(avatarPath, 60 * 60 * 24 * 7);

          if (!signedError && signedData?.signedUrl) {
            setUserAvatarUrl(signedData.signedUrl);
          }
        } catch (_e) {
          /* Avatar optional */
        }
      }
    })();
  }, [user_id]);

  // Initial: letzte 30 Messages laden
  useEffect(() => {
    if (!user_id) return;
    fetchMessages(user_id)
      .then(({ messages: msgs, hasMore: more }) => {
        setMessages(msgs);
        setHasMore(more);
      })
      .catch(console.error);
  }, [user_id]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Aeltere Nachrichten nachladen
  const loadOlderMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestTimestamp = messages[0]?.created_at;
      const { messages: older, hasMore: more } = await fetchMessages(user_id, {
        before: oldestTimestamp,
      });
      setMessages((prev) => [...older, ...prev]);
      setHasMore(more);
    } catch (e) {
      console.error('Load older messages error:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Credit- & Rate-Limit-Error Handler
  const handleCreditError = (e) => {
    if (e.code === 'INSUFFICIENT_CREDITS') {
      Alert.alert(
        t('common.insufficientCredits'),
        t('common.insufficientCreditsMessage', { balance: e.balance, required: e.required }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.buyCredits'), onPress: () => navigation.navigate('Mehr', { screen: 'ShopMain' }) },
        ]
      );
      return true;
    }
    if (e.code === 'RATE_LIMIT_EXCEEDED') {
      Alert.alert('Moment bitte', e.message || 'Zu viele Anfragen. Bitte warte etwas.', [
        { text: 'OK' },
      ]);
      return true;
    }
    return false;
  };

  // Foto aufnehmen & senden
  const takeAndSendPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert(t('common.cameraRequired'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: false,
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled) {
      setLoading(true);
      try {
        // Upload gibt jetzt Dateinamen zurueck (nicht Signed URL)
        const imagePath = await uploadChatImage(result.assets[0].uri, user_id);
        if (!imagePath) throw new Error(t('assistant.uploadFailed'));
        // Signed URL fuer Anzeige generieren
        const displayUrl = await getChatImageUrl(imagePath);
        const msg = {
          user_id,
          sender: 'user',
          content: t('assistant.imageMessage'),
          image_path: imagePath,
          image_url: displayUrl,
        };
        await saveMessage(msg);
        setMessages((m) => [...m, { ...msg, created_at: new Date().toISOString() }]);
        await getBenAnswer('', displayUrl);
      } catch (e) {
        if (!handleCreditError(e)) {
          Alert.alert(t('common.error'), e.message);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // GPT-Antwort über Edge Function (History wird server-seitig geladen)
  const getBenAnswer = async (text = '', image_url = null) => {
    try {
      const data = await chatWithBen(text, image_url, language);
      const content = data?.content || t('assistant.noAnswer');
      if (typeof data?.balance === 'number') setBalance(data.balance);

      const msg = { user_id, sender: GARDENER_NAME, content };
      await saveMessage(msg);
      setMessages((m) => [...m, { ...msg, created_at: new Date().toISOString() }]);
    } catch (e) {
      console.error('[Ben] Error:', e.message, e);
      if (!handleCreditError(e)) {
        Alert.alert(t('common.error'), e.message);
      }
    }
  };

  // Textnachricht senden
  const sendMessage = async () => {
    if (!input.trim() || !user_id) return;
    setLoading(true);
    try {
      const userMessage = { user_id, sender: 'user', content: input };
      await saveMessage(userMessage);
      setMessages((m) => [...m, { ...userMessage, created_at: new Date().toISOString() }]);
      setInput('');
      await getBenAnswer(input, null);
    } finally {
      setLoading(false);
    }
  };

  // Avatar wählen
  const getAvatar = (sender) => {
    if (sender === GARDENER_NAME) return require('../assets/avatars/ben.png');
    if (sender === 'user' && userAvatarUrl) return { uri: userAvatarUrl };
    if (sender === 'user') return require('../assets/avatars/tim.png');
    return null;
  };

  // Bubble
  const renderItem = ({ item }) => (
    <View
      style={{
        alignSelf: item.sender === 'user' ? 'flex-end' : 'flex-start',
        backgroundColor: item.sender === 'user' ? colors.chatUserBubble : colors.chatBotBubble,
        margin: spacing.xs,
        padding: spacing.md,
        borderRadius: radius.lg,
        maxWidth: '80%',
        flexDirection: 'row',
        alignItems: 'flex-end',
      }}
    >
      <Image
        source={getAvatar(item.sender)}
        style={{
          width: spacing.xxxl,
          height: spacing.xxxl,
          borderRadius: radius.lg,
          marginRight: spacing.sm,
        }}
      />
      <View>
        {item.image_url && (
          <Image
            source={{ uri: item.image_url }}
            style={{ width: 150, height: 150, borderRadius: 10, marginBottom: spacing.xs }}
            resizeMode="cover"
          />
        )}
        <Text>{item.content}</Text>
        <Text style={{ fontSize: 10, color: colors.textTertiary }}>
          {item.sender === 'user' ? t('assistant.you') : GARDENER_NAME}
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Credit-Leiste */}
      {balance !== null && (
        <View
          style={{
            backgroundColor: balance > 10 ? colors.primarySurface : colors.warningSurface,
            padding: spacing.sm,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('common.credits')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {balance <= 10 && (
            <TouchableOpacity onPress={() => navigation.navigate('Mehr', { screen: 'ShopMain' })}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                {t('common.buyCredits')}
              </Text>
            </TouchableOpacity>
          )}
          <Text
            style={{
              fontWeight: 'bold',
              color: balance > 10 ? colors.primary : colors.warning,
            }}
          >
            {balance}
          </Text>
          </View>
        </View>
      )}

      <FlatList
        data={messages}
        ref={flatListRef}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md }}
        ListHeaderComponent={
          hasMore ? (
            <TouchableOpacity
              onPress={loadOlderMessages}
              style={{ padding: spacing.md, alignItems: 'center' }}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primaryLight} />
              ) : (
                <Text style={{ color: colors.primary, fontSize: 13 }}>
                  {t('assistant.loadOlder')}
                </Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />
      {loading && (
        <ActivityIndicator
          size="large"
          color={colors.primaryLight}
          style={{ margin: spacing.md }}
        />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.sm }}>
        <TouchableOpacity onPress={takeAndSendPhoto}>
          <Ionicons
            name="camera"
            size={28}
            color={colors.primary}
            style={{ marginRight: spacing.md }}
          />
        </TouchableOpacity>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={t('assistant.placeholder')}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.pill,
            padding: spacing.sm,
            backgroundColor: colors.surface,
          }}
        />
        <DSButton
          onPress={sendMessage}
          disabled={loading || !input.trim()}
          size="sm"
          style={{ marginLeft: spacing.sm }}
        >
          {t('common.send')}
        </DSButton>
      </View>
    </KeyboardAvoidingView>
  );
}
