import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function BetaWelcomeScreen({ onDone }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={48} color="#fff" />
        </View>
        <Text style={styles.title}>Willkommen beim Beta-Test!</Text>
        <Text style={styles.subtitle}>
          Schön, dass du dabei bist. Hier ist alles, was du wissen musst.
        </Text>
      </View>

      {/* Credits erklären */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="flash" size={24} color="#4CAF50" />
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
        <Ionicons name="leaf" size={20} color="#fff" style={{ marginRight: 8 }} />
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
        <Ionicons name={icon} size={18} color="#666" style={{ marginRight: 8 }} />
        <Text style={styles.creditLabel}>{label}</Text>
      </View>
      <View style={styles.creditBadge}>
        <Ionicons name="flash" size={12} color="#4CAF50" />
        <Text style={styles.creditValue}>{credits}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: '#f5f5f5', paddingBottom: 20,
  },
  hero: {
    backgroundColor: '#4CAF50', paddingTop: 60, paddingBottom: 30,
    alignItems: 'center', paddingHorizontal: 30,
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: {
    fontSize: 26, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 22,
  },

  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    padding: 18, borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  giftCard: { borderWidth: 2, borderColor: '#FF9800' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#222' },
  cardText: { fontSize: 14, color: '#555', lineHeight: 21 },

  creditTable: { marginTop: 12 },
  creditRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee',
  },
  creditLabel: { fontSize: 14, color: '#444' },
  creditBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  creditValue: { fontSize: 14, fontWeight: 'bold', color: '#4CAF50', marginLeft: 3 },

  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4CAF50', marginHorizontal: 16, marginTop: 24,
    paddingVertical: 16, borderRadius: 14,
    shadowColor: '#4CAF50', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  ctaText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
});
