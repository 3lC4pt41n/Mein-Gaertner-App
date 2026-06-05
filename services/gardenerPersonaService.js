import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_GARDENER_PERSONA_KEY = 'ben';

export const GARDENER_PERSONAS = [
  {
    key: 'ben',
    name: 'Ben',
    displayNameKey: 'assistant.ben',
    avatar: require('../assets/avatars/ben-chat.png'),
    welcomeTitleKey: 'assistant.welcomeTitleBen',
  },
  {
    key: 'rose',
    name: 'Rose',
    displayNameKey: 'assistant.rose',
    avatar: require('../assets/avatars/rose-chat.png'),
    welcomeTitleKey: 'assistant.welcomeTitleRose',
  },
];

const STORAGE_PREFIX = 'florascout:garden-chat-persona';

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${userId || 'anonymous'}`;
}

export function getGardenerPersona(key) {
  return GARDENER_PERSONAS.find((persona) => persona.key === key) || GARDENER_PERSONAS[0];
}

export function getGardenerPersonaForSender(sender, fallbackKey = DEFAULT_GARDENER_PERSONA_KEY) {
  if (sender === 'Rose') return getGardenerPersona('rose');
  if (sender === 'Ben') return getGardenerPersona('ben');
  return getGardenerPersona(fallbackKey);
}

export function getGardenerPersonaDisplayName(persona, translate) {
  if (!persona) return '';
  if (typeof translate === 'function' && persona.displayNameKey) {
    const translated = translate(persona.displayNameKey);
    if (translated && translated !== persona.displayNameKey) return translated;
  }
  return persona.name;
}

export async function loadGardenerPersonaKey(userId) {
  try {
    const key = await AsyncStorage.getItem(storageKey(userId));
    return getGardenerPersona(key).key;
  } catch {
    return DEFAULT_GARDENER_PERSONA_KEY;
  }
}

export async function saveGardenerPersonaKey(userId, key) {
  const persona = getGardenerPersona(key);
  await AsyncStorage.setItem(storageKey(userId), persona.key);
  return persona.key;
}
