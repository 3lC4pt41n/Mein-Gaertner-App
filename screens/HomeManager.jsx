// HomeManager.jsx – React Native friendly (no shadcn/ui)
// -------------------------------------------------------------------
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, TextInput, Alert } from "react-native";
import { Modal, Portal, Provider as PaperProvider, Button, Card, IconButton } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../supabase";

/**
 * NOTE: react-native-paper gives us ready‑made Card & Button components, so
 * we drop the web‑only shadcn/ui imports that caused the Metro bundler error.
 */

export default function HomeManager() {
  const [homes, setHomes] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editing, setEditing] = useState(null); // { type: 'home'|'zone', homeId, zone }
  const [form, setForm] = useState({ name: "", address: "", type: "room" });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("homes")
        .select("id, name, address, zones:id(zones(id, name, type))")
        .order("created_at");
      if (error) console.error(error);
      else setHomes(data || []);
    })();
  }, []);

  const openHomeModal = (home) => {
    setEditing({ type: "home", homeId: home?.id });
    setForm({ name: home?.name || "", address: home?.address || "" });
    setDialogVisible(true);
  };

  const openZoneModal = (homeId, zone) => {
    setEditing({ type: "zone", homeId, zone });
    setForm({ name: zone?.name || "", type: zone?.type || "room" });
    setDialogVisible(true);
  };

  const closeModal = () => {
    setDialogVisible(false);
    setEditing(null);
    setForm({ name: "", address: "", type: "room" });
  };

  const saveHome = async () => {
    if (!form.name.trim()) return;
    if (editing?.homeId) {
      await supabase.from("homes").update({ name: form.name, address: form.address }).eq("id", editing.homeId);
    } else {
      await supabase.from("homes").insert({ name: form.name, address: form.address });
    }
    closeModal();
    reload();
  };

  const saveZone = async () => {
    if (!form.name.trim()) return;
    if (editing?.zone) {
      await supabase.from("zones").update({ name: form.name, type: form.type }).eq("id", editing.zone.id);
    } else {
      await supabase.from("zones").insert({ home_id: editing.homeId, name: form.name, type: form.type });
    }
    closeModal();
    reload();
  };

  const deleteZone = async (zoneId) => {
    Alert.alert("Zone löschen?", "Alle zugehörigen Pflanzen verlieren ihren Standort.", [
      { text: "Abbrechen" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          await supabase.from("zones").delete().eq("id", zoneId);
          reload();
        },
      },
    ]);
  };

  const reload = async () => {
    const { data } = await supabase
      .from("homes")
      .select("id, name, address, zones:id(zones(id, name, type))")
      .order("created_at");
    setHomes(data || []);
  };

  const renderZone = ({ item, homeId }) => (
    <View style={styles.zoneRow}>
      <Text style={styles.zoneText}>{item.name} <Text style={styles.zoneType}>({item.type})</Text></Text>
      <View style={{ flexDirection: "row" }}>
        <IconButton icon="pencil" size={18} onPress={() => openZoneModal(homeId, item)} />
        <IconButton icon="delete" size={18} onPress={() => deleteZone(item.id)} />
      </View>
    </View>
  );

  return (
    <PaperProvider>
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        data={homes}
        keyExtractor={(h) => h.id}
        ListHeaderComponent={() => (
          <Button mode="contained" icon="home-plus" onPress={() => openHomeModal()}>Neues Zuhause</Button>
        )}
        renderItem={({ item }) => (
          <Card style={{ marginTop: 16 }}>
            <TouchableOpacity onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}>
              <Card.Title
                title={item.name}
                subtitle={item.address || undefined}
                left={(props) => <Ionicons name="home" size={24} {...props} />}
                right={(props) => (
                  <Ionicons
                    name={expandedId === item.id ? "chevron-up" : "chevron-down"}
                    size={24}
                    {...props}
                  />
                )}
              />
            </TouchableOpacity>
            {expandedId === item.id && (
              <Card.Content>
                {item.zones?.length ? (
                  item.zones.map((z) => renderZone({ item: z, homeId: item.id }))
                ) : (
                  <Text style={styles.emptyTxt}>Keine Zonen angelegt.</Text>
                )}
                <Button
                  mode="outlined"
                  icon="plus"
                  style={{ marginTop: 8 }}
                  onPress={() => openZoneModal(item.id)}
                >
                  Zone hinzufügen
                </Button>
              </Card.Content>
            )}
          </Card>
        )}
      />

      {/* Modal */}
      <Portal>
        <Modal visible={dialogVisible} onDismiss={closeModal} contentContainerStyle={styles.modalBox}>
          <Text style={styles.modalTitle}>
            {editing?.type === "home"
              ? editing.homeId
                ? "Zuhause bearbeiten"
                : "Neues Zuhause"
              : editing?.zone
              ? "Zone bearbeiten"
              : "Neue Zone"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={form.name}
            onChangeText={(t) => setForm({ ...form, name: t })}
          />
          {editing?.type === "home" && (
            <TextInput
              style={styles.input}
              placeholder="Adresse (optional)"
              value={form.address}
              onChangeText={(t) => setForm({ ...form, address: t })}
            />
          )}
          {editing?.type === "zone" && (
            <TextInput
              style={styles.input}
              placeholder="Typ (room, balcony, garden, greenhouse)"
              value={form.type}
              onChangeText={(t) => setForm({ ...form, type: t })}
            />
          )}
          <Button mode="contained" onPress={editing?.type === "home" ? saveHome : saveZone}>
            Speichern
          </Button>
        </Modal>
      </Portal>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  zoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  zoneText: { fontSize: 14 },
  zoneType: { color: "gray", fontSize: 12 },
  emptyTxt: { color: "gray", fontStyle: "italic" },
  modalBox: {
    backgroundColor: "white",
    margin: 20,
    padding: 20,
    borderRadius: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
});
