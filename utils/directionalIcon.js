import { I18nManager } from 'react-native';

const RTL_ICON_MAP = {
  'chevron-forward': 'chevron-back',
  'chevron-back': 'chevron-forward',
  'arrow-forward': 'arrow-back',
  'arrow-back': 'arrow-forward',
  'arrow-forward-outline': 'arrow-back-outline',
  'arrow-back-outline': 'arrow-forward-outline',
};

export function directionalIconName(name) {
  if (!I18nManager.isRTL) return name;
  return RTL_ICON_MAP[name] || name;
}
