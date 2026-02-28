import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Switch, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../supabase";
import { getLanguageLabel } from "../services/languageService";
import { colors, spacing, radius } from '../theme';

export default function DrawerProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Leaderboard-Felder
  const [optIn, setOptIn] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(data);
        setOptIn(data?.leaderboard_opt_in ?? false);
        setDisplayName(data?.public_display_name ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const saveLeaderboardSettings = async (newOptIn, newDisplayName) => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        leaderboard_opt_in: newOptIn,
        public_display_name: newDisplayName || null,
        leaderboard_visibility: newOptIn ? 'global' : 'private',
      })
      .eq("id", profile.id);

    if (error) {
      Alert.alert("Fehler", "Einstellung konnte nicht gespeichert werden.");
    }
    setSaving(false);
  };

  const handleOptInToggle = (value) => {
    setOptIn(value);
    saveLeaderboardSettings(value, displayName);
  };

  const handleDisplayNameSave = () => {
    saveLeaderboardSettings(optIn, displayName);
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  if (!profile) return (
    <View style={styles.center}>
      <Text>Kein Profil gefunden.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Profil-Header */}
      <View style={styles.header}>
        <Ionicons name="person" size={60} color={colors.primaryLight} />
        <Text style={styles.title}>Profil</Text>
      </View>

      {/* Profil-Infos */}
      <View style={styles.section}>
        <ProfileRow label="Benutzername" value={profile.username} />
        <ProfileRow label="Vorname" value={profile.first_name} />
        <ProfileRow label="Nachname" value={profile.last_name} />
        <ProfileRow label="Land" value={profile.country} />
        <ProfileRow label="Sprache" value={getLanguageLabel(profile.language)} />
      </View>

      {/* Leaderboard-Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rangliste</Text>

        <View style={styles.optInRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Im Ranking anzeigen</Text>
            <Text style={styles.hint}>
              Dein Score wird anderen Nutzern angezeigt.
            </Text>
          </View>
          <Switch
            value={optIn}
            onValueChange={handleOptInToggle}
            trackColor={{ true: colors.primaryLight }}
            disabled={saving}
          />
        </View>

        {optIn && (
          <View style={styles.displayNameRow}>
            <Text style={styles.label}>Anzeigename (optional)</Text>
            <Text style={styles.hint}>
              Wird statt deinem Benutzernamen im Ranking angezeigt.
            </Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              onBlur={handleDisplayNameSave}
              placeholder={profile.username || "Anzeigename"}
              maxLength={30}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function ProfileRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "\u2013"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { alignItems: "center", paddingTop: 30, paddingBottom: 10 },
  title: { fontWeight: "bold", fontSize: 22, marginTop: spacing.sm },
  section: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sectionTitle: {
    fontWeight: "bold",
    fontSize: 16,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  optInRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  displayNameRow: {
    paddingTop: spacing.sm,
  },
  label: { fontSize: 14, color: colors.textSecondary },
  value: { fontSize: 14, fontWeight: "600" },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    marginTop: spacing.sm,
    fontSize: 14,
  },
});
