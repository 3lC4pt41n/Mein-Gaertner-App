import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../supabase";

export default function DrawerProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(data);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  if (!profile) return (
    <View style={styles.center}>
      <Text>Kein Profil gefunden.</Text>
    </View>
  );

  return (
    <View style={styles.center}>
      <Ionicons name="person" size={80} />
      <Text style={styles.title}>Profil</Text>
      <Text>Benutzername: <Text style={styles.value}>{profile.username || "–"}</Text></Text>
      <Text>Vorname: <Text style={styles.value}>{profile.first_name || "–"}</Text></Text>
      <Text>Nachname: <Text style={styles.value}>{profile.last_name || "–"}</Text></Text>
      <Text>Land: <Text style={styles.value}>{profile.country || "–"}</Text></Text>
      <Text>Sprache: <Text style={styles.value}>{profile.language || "–"}</Text></Text>
      {/* ... ggf. mehr Felder */}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontWeight: "bold", fontSize: 22, marginBottom: 10 },
  value: { fontWeight: "600" },
});
