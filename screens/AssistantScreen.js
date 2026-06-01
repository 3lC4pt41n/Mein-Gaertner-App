import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { safeLaunchCamera } from '../services/imagePickerHelper';
import { fetchMessages, saveMessage } from '../services/chatService';
import { uploadChatImage, getChatImageUrl } from '../services/uploadService';
import { chatWithBen } from '../services/aiService';
import { fetchCurrentUserLanguage } from '../services/languageService';
import {
  DEFAULT_GARDENER_PERSONA_KEY,
  GARDENER_PERSONAS,
  getGardenerPersona,
  getGardenerPersonaForSender,
  loadGardenerPersonaKey,
  saveGardenerPersonaKey,
} from '../services/gardenerPersonaService';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import CreditBar from '../components/CreditBar';

const USER_AVATAR = require('../assets/avatars/tim.png');
const CHAT_AVATAR_SIZE = spacing.xxxl;

export default function AssistantScreen({ context }) {
  const { userId: user_id } = useAuth();
  const navigation = useNavigation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('de');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [gardenerPersonaKey, setGardenerPersonaKey] = useState(DEFAULT_GARDENER_PERSONA_KEY);
  const flatListRef = useRef();
  const gardenerPersona = getGardenerPersona(gardenerPersonaKey);

  useEffect(() => {
    if (!user_id) return;
    (async () => {
      try {
        const userLanguage = await fetchCurrentUserLanguage();
        setLanguage(userLanguage);
      } catch (error) {
        if (__DEV__) {
          console.warn('[AssistantScreen] fetchCurrentUserLanguage failed:', error?.message);
        }
      }
    })();
  }, [user_id]);

  useEffect(() => {
    let mounted = true;
    loadGardenerPersonaKey(user_id).then((key) => {
      if (mounted) setGardenerPersonaKey(key);
    });
    return () => {
      mounted = false;
    };
  }, [user_id]);

  // Initial: letzte 30 Messages laden
  useEffect(() => {
    if (!user_id) return;
    let mounted = true;
    (async () => {
      try {
        const { messages: msgs, hasMore: more } = await fetchMessages(user_id);
        if (!mounted) return;
        setMessages(msgs);
        setHasMore(more);
      } catch (error) {
        if (__DEV__) {
          console.warn('[AssistantScreen] initial message load failed:', error?.message);
        }
        if (mounted) {
          Alert.alert(t('common.error'), error?.message || t('common.networkError'));
        }
      }
    })();

    return () => {
      mounted = false;
    };
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
    } catch (error) {
      if (__DEV__) {
        console.warn('[AssistantScreen] load older messages failed:', error?.message);
      }
      Alert.alert(t('common.error'), error?.message || t('common.networkError'));
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
          {
            text: t('common.buyCredits'),
            onPress: () => navigation.navigate('Mehr', { screen: 'ShopMain' }),
          },
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
      Alert.alert(t('common.error'), t('common.cameraRequired'));
      return;
    }
    const result = await safeLaunchCamera({
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
        await getGardenerAnswer('', displayUrl);
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
  const getGardenerAnswer = async (text = '', image_url = null) => {
    try {
      const data = await chatWithBen(text, image_url, language, context, {
        key: gardenerPersona.key,
        name: gardenerPersona.name,
      });
      const content = data?.content || t('assistant.noAnswer');

      const msg = { user_id, sender: gardenerPersona.name, content };
      await saveMessage(msg);
      setMessages((m) => [...m, { ...msg, created_at: new Date().toISOString() }]);
    } catch (e) {
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
      await getGardenerAnswer(input, null);
    } catch (error) {
      if (!handleCreditError(error)) {
        Alert.alert(t('common.error'), error?.message || t('common.networkError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePersonaSelect = async (personaKey) => {
    if (personaKey === gardenerPersona.key) return;
    setGardenerPersonaKey(personaKey);
    try {
      await saveGardenerPersonaKey(user_id, personaKey);
    } catch (error) {
      if (__DEV__) {
        console.warn('[AssistantScreen] save gardener persona failed:', error?.message);
      }
    }
  };

  const getAssistantPersona = (sender) => getGardenerPersonaForSender(sender, gardenerPersona.key);

  const getSenderLabel = (sender) => {
    if (sender === 'user') return t('assistant.you');
    return getAssistantPersona(sender).name;
  };

  // Avatar waehlen
  const getAvatar = (sender) => {
    if (sender === 'user') return USER_AVATAR;
    return getAssistantPersona(sender).avatar;
  };

  // Bubble
  const renderItem = ({ item }) => {
    const isUser = item.sender === 'user';
    const senderLabel = getSenderLabel(item.sender);

    return (
      <View
        style={{
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          backgroundColor: isUser ? colors.chatUserBubble : colors.chatBotBubble,
          margin: spacing.xs,
          padding: spacing.md,
          borderRadius: radius.lg,
          maxWidth: '80%',
          flexDirection: 'row',
          alignItems: 'flex-end',
        }}
      >
        <ChatAvatar source={getAvatar(item.sender)} label={senderLabel} />
        <View style={{ flex: 1, flexShrink: 1 }}>
          {item.image_url && (
            <ExpoImage
              source={{ uri: item.image_url }}
              style={{ width: 150, height: 150, borderRadius: 10, marginBottom: spacing.xs }}
              contentFit="cover"
              cachePolicy="disk"
              transition={200}
            />
          )}
          <Text style={{ flexWrap: 'wrap' }}>{item.content}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>{senderLabel}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Credit-Leiste — unified component */}
      <CreditBar style={{ marginHorizontal: spacing.md, marginTop: spacing.sm }} />

      <PersonaSelector selectedKey={gardenerPersona.key} onSelect={handlePersonaSelect} />

      <FlatList
        data={messages}
        ref={flatListRef}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, flexGrow: 1 }}
        ListHeaderComponent={
          hasMore ? (
            <TouchableOpacity
              onPress={loadOlderMessages}
              style={{ padding: spacing.md, alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={t('assistant.loadOlder')}
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
        ListEmptyComponent={
          !loading && (
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: spacing.xl,
              }}
            >
              <ExpoImage
                source={gardenerPersona.avatar}
                contentFit="cover"
                style={{ width: 80, height: 80, borderRadius: 40, marginBottom: spacing.lg }}
              />
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: 'bold',
                  color: colors.textPrimary,
                  marginBottom: spacing.sm,
                }}
              >
                {t(gardenerPersona.welcomeTitleKey)}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.textSecondary,
                  textAlign: 'center',
                  lineHeight: 20,
                  marginBottom: spacing.lg,
                }}
              >
                {t('assistant.welcomeHint')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: spacing.sm,
                }}
              >
                {[
                  { icon: 'leaf-outline', label: t('assistant.suggestionIdentify') },
                  { icon: 'pulse-outline', label: t('assistant.suggestionHealth') },
                  { icon: 'water-outline', label: t('assistant.suggestionCare') },
                ].map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setInput(s.label);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.primarySurface,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.pill,
                      gap: spacing.xs,
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name={s.icon} size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '500' }}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )
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
        <TouchableOpacity
          onPress={takeAndSendPhoto}
          accessibilityRole="button"
          accessibilityLabel={t('assistant.takePhoto')}
        >
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
          placeholder={t('assistant.placeholder', { name: gardenerPersona.name })}
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

function PersonaSelector({ selectedKey, onSelect }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
      }}
    >
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 12,
          fontWeight: '600',
          marginRight: spacing.xs,
        }}
      >
        {t('assistant.personaSelector')}
      </Text>
      {GARDENER_PERSONAS.map((persona) => {
        const active = persona.key === selectedKey;
        return (
          <TouchableOpacity
            key={persona.key}
            onPress={() => onSelect(persona.key)}
            accessibilityRole="button"
            accessibilityLabel={persona.name}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.primarySurface : colors.surface,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
            }}
          >
            <ExpoImage
              source={persona.avatar}
              contentFit="cover"
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.surface,
              }}
            />
            <Text
              style={{
                color: active ? colors.primary : colors.textSecondary,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              {persona.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ChatAvatar({ source, label }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [source]);

  if (failed) {
    return (
      <View
        accessibilityLabel={label}
        style={{
          width: CHAT_AVATAR_SIZE,
          height: CHAT_AVATAR_SIZE,
          borderRadius: CHAT_AVATAR_SIZE / 2,
          marginRight: spacing.sm,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
          {(label || '?').slice(0, 1)}
        </Text>
      </View>
    );
  }

  return (
    <ExpoImage
      accessibilityLabel={label}
      source={source}
      contentFit="cover"
      onError={() => setFailed(true)}
      style={{
        width: CHAT_AVATAR_SIZE,
        height: CHAT_AVATAR_SIZE,
        borderRadius: CHAT_AVATAR_SIZE / 2,
        marginRight: spacing.sm,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.primaryMuted,
      }}
    />
  );
}
