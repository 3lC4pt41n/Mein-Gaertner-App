// Design Tokens - Single Source of Truth
// primaryLight (#4CAF50) ist NUR fuer dekorative Zwecke (Icons, Spinner).
// NIEMALS als Text auf weissem Hintergrund verwenden (2.8:1 Kontrast = WCAG-fail).
// Fuer Text/Buttons/aktive States immer primary (#2E7D32, 5.13:1 = WCAG AA).

export const colors = {
  primary: '#2E7D32',
  primaryLight: '#4CAF50',
  primarySurface: '#E8F5E9',
  primaryMuted: '#C8E6C9',

  success: '#388E3C',
  warning: '#FF9800',
  warningSurface: '#FFF3E0',
  danger: '#E53935',
  dangerSurface: '#FFEBEE',
  info: '#2196F3',
  infoSurface: '#E3F2FD',

  textPrimary: '#222222',
  textSecondary: '#555555',
  textTertiary: '#888888',
  textDisabled: '#BBBBBB',

  background: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceSecondary: '#FAFAFA',
  border: '#E0E0E0',
  borderLight: '#EEEEEE',
  divider: '#F0F0F0',
  overlay: 'rgba(0,0,0,0.25)',

  // Spezialfarben
  google: '#DB4437',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  healthGood: '#8BC34A',
  completedSurface: '#B2DFDB',

  chatUserBubble: '#DCF8C6',
  chatBotBubble: '#F1F0F0',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const typography = {
  xs: { fontSize: 12 },
  sm: { fontSize: 14 },
  md: { fontSize: 16 },
  lg: { fontSize: 18 },
  xl: { fontSize: 22 },
  xxl: { fontSize: 26 },

  heading: { fontSize: 22, fontWeight: 'bold', color: '#222222' },
  subheading: { fontSize: 18, fontWeight: '600', color: '#222222' },
  body: { fontSize: 14, color: '#555555' },
  bodyBold: { fontSize: 14, fontWeight: '600', color: '#222222' },
  caption: { fontSize: 12, color: '#888888' },
  label: { fontSize: 14, fontWeight: '600', color: '#555555' },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
};
