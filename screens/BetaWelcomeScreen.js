import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const { width } = Dimensions.get('window');

export default function BetaWelcomeScreen({ onDone }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={48} color={colors.surface} />
        </View>
        <Text style={styles.title}>Willkommen beim Beta-Test!</Text>
        <Text style={styles.subtitle}>
          Schön, dass du dabei bist. Hier ist alles, was du wissen musst.
        </Text>
      </View>

      {/* Credits erklären */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="flash" size={24} color={colors.primaryLight} />
          <Text style={styles.cardTitle}>So funktionieren Credits</Text>
        </View>
        <Text style={styles.cardText}>
          Jede KI-Funktion in der App verbraucht Credits. Dein Guthaben siehst du jederzeit im Shop-Tab.
        </Text>
        <View style={styles.creditTable}>
          <CreditRow icon="camera" label="Pflanze scannen" credits="12" />
          <CreditRow icon="document-text" label="Details generieren" credits="15" />
          <CreditRow icon="heart" label="Healthcheck" credits="8" />
          <CreditRow icon="chatbox" label="Chat mit Ben" credits="3" />
        </View>
      </View>

      {/* Geschenk */}
      <View style={[styles.card, styles.giftCard]}>
        <View style={styles.cardHeader}>
          <Ionicons name="gift" size={24} color="#FF9800" />
          <Text style={styles.cardTitle}>100 Gratis-Credits</Text>
        </View>
        <Text style={styles.cardText}>
          Als Beta-Tester bekommst du 100 Credits geschenkt – das reicht für etwa 10 Pflanzen-Scans mit Healthcheck oder viele Chats mit Ben.
        </Text>
      </View>

      {/* Nachladen */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="cart" size={24} color="#2196F3" />
          <Text style={styles.cardTitle}>Credits nachladen</Text>
        </View>
        <Text style={styles.cardText}>
          Wenn deine Credits aufgebraucht sind, kannst du im Shop neue kaufen – als Einmalkauf oder günstiger im Monats-Abo.
        </Text>
      </View>

      {/* Feedback */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="chatbubbles" size={24} color="#9C27B0" />
          <Text style={styles.cardTitle}>Dein Feedback zählt!</Text>
        </View>
        <Text style={styles.cardText}>
          Als Beta-Tester hilfst du uns, die App besser zu machen. Sag uns, was dir gefällt und was fehlt – wir lesen alles!
        </Text>
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.ctaButton} onPress={onDone}>
        <Ionicons name="leaf" size={20} color={colors.surface} style={{ marginRight: spacing.sm }} />
        <Text style={styles.ctaText}>Los geht's!</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function CreditRow({ icon, label, credits }) {
  return (
    <View style={styles.creditRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
        <Text style={styles.creditLabel}>{label}</Text>
      </View>
      <View style={styles.creditBadge}>
        <Ionicons name="flash" size={12} color={colors.primaryLight} />
        <Text style={styles.creditValue}>{credits}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: colors.background, paddingBottom: spacing.xl,
  },
  hero: {
    backgroundColor: colors.primary, paddingTop: 60, paddingBottom: 30,
    alignItems: 'center', paddingHorizontal: 30,
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: {
    fontSize: 26, fontWeight: 'bold', color: colors.surface, textAlign: 'center', marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 22,
  },

  card: {
    backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginTop: spacing.lg,
    padding: 18, borderRadius: radius.lg,
    ...shadows.sm,
  },
  giftCard: { borderWidth: 2, borderColor: '#FF9800' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: spacing.sm,
  },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: colors.textPrimary },
  cardText: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },

  creditTable: { marginTop: spacing.md },
  creditRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight,
  },
  creditLabel: { fontSize: 14, color: colors.textSecondary },
  creditBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primarySurface, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 10,
  },
  creditValue: { fontSize: 14, fontWeight: 'bold', color: colors.primaryLight, marginLeft: 3 },

  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, marginHorizontal: spacing.lg, marginTop: spacing.xxl,
    paddingVertical: spacing.lg, borderRadius: radius.lg,
    shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  ctaText: { fontSize: 18, fontWeight: 'bold', color: colors.surface },
});
