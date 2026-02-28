import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, TextInput, Alert } from "react-native";
import { Modal, Portal, Provider as PaperProvider, Button, Card, IconButton } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../supabase";
import { t } from '../i18n';

export default function HomeManager() {
  const [locations, setLocations] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editing, setEditing] = useState(null); // { type: 'location'|'zone', locationId, zone }
  const [form, setForm] = useState({ name: "", address: "", type: "room" });
  const [loading, setLoading] = useState(false);

  useEffect(() => { reload(); }, []);

  // Helper: getUserId
  const getUserId = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      Alert.alert(t('common.notLoggedIn'), t('common.notLoggedInMessage'));
      throw new Error("Not authenticated");
    }
    return user.id;
  };

  // Lade Locations + Zonen (separate Queries für PostgREST-Kompatibilität)
  const reload = async () => {
    setLoading(true);
    try {
      const user_id = await getUserId();
      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id, name, address")
        .eq("user_id", user_id)
        .order("created_at");
      if (locErr) throw locErr;

      // Zonen separat laden und an Locations anhängen
      const locIds = (locs || []).map((l) => l.id);
      let zonesMap = {};
      if (locIds.length > 0) {
        const { data: allZones, error: zoneErr } = await supabase
          .from("zones")
          .select("id, name, type, location_id")
          .in("location_id", locIds);
        if (!zoneErr && allZones) {
          allZones.forEach((z) => {
            if (!zonesMap[z.location_id]) zonesMap[z.location_id] = [];
            zonesMap[z.location_id].push(z);
          });
        }
      }

      const merged = (locs || []).map((l) => ({
        ...l,
        zones: zonesMap[l.id] || [],
      }));
      setLocations(merged);
    } catch (err) {
      Alert.alert(t('home.loadError'), err.message);
    }
    setLoading(false);
  };

  // Modals
  const openLocationModal = (loc) => {
    setEditing({ type: "location", locationId: loc?.id });
    setForm({ name: loc?.name || "", address: loc?.address || "" });
    setDialogVisible(true);
  };

  const openZoneModal = (locationId, zone) => {
    setEditing({ type: "zone", locationId, zone });
    setForm({ name: zone?.name || "", type: zone?.type || "room" });
    setDialogVisible(true);
  };

  const closeModal = () => {
    setDialogVisible(false);
    setEditing(null);
    setForm({ name: "", address: "", type: "room" });
  };

  // CRUD – Locations
  const saveLocation = async () => {
    const user_id = await getUserId();
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('common.nameRequired'));
      return;
    }
    try {
      if (editing?.locationId) {
        // Update
        const { error } = await supabase
          .from("locations")
          .update({ name: form.name, address: form.address })
          .eq("id", editing.locationId)
          .eq("user_id", user_id);
        if (error) throw error;
      } else {
        // Insert (user_id setzen!)
        const { error } = await supabase
          .from("locations")
          .insert([{ name: form.name, address: form.address, user_id }]);
        if (error) throw error;
      }
      closeModal();
      reload();
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  // CRUD – Zones
  const saveZone = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('common.nameRequired'));
      return;
    }
    try {
      if (editing?.zone) {
        // Update
        const { error } = await supabase
          .from("zones")
          .update({ name: form.name, type: form.type })
          .eq("id", editing.zone.id)
          .eq("location_id", editing.locationId);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from("zones")
          .insert([{ location_id: editing.locationId, name: form.name, type: form.type }]);
        if (error) throw error;
      }
      closeModal();
      reload();
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  // Delete – Locations
  const deleteLocation = async (locationId) => {
    Alert.alert(
      t('home.deleteHomeTitle'),
      t('home.deleteHomeMessage'),
      [
        { text: t('common.cancel') },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            try {
              const user_id = await getUserId();
              const { error } = await supabase
                .from("locations")
                .delete()
                .eq("id", locationId)
                .eq("user_id", user_id);
              if (error) throw error;
              reload();
            } catch (err) {
              Alert.alert(t('common.error'), err.message);
            }
          },
        },
      ]
    );
  };

  // Delete – Zones
  const deleteZone = async (zoneId) => {
    Alert.alert(t('home.deleteZoneTitle'), t('home.deleteZoneMessage'), [
      { text: t('common.cancel') },
      {
        text: t('common.delete'),
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("zones").delete().eq("id", zoneId);
            if (error) throw error;
            reload();
          } catch (err) {
            Alert.alert(t('common.error'), err.message);
          }
        },
      },
    ]);
  };

  // Zonen-Row
  const ZoneRow = ({ item, locationId }) => (
    <View style={styles.zoneRow} key={item.id}>
      <Text style={styles.zoneText}>{item.name} <Text style={styles.zoneType}>({item.type})</Text></Text>
      <View style={{ flexDirection: "row" }}>
        <IconButton icon="pencil" size={18} onPress={() => openZoneModal(locationId, item)} />
        <IconButton icon="delete" size={18} onPress={() => deleteZone(item.id)} />
      </View>
    </View>
  );

  // Picker für Zone-Type
  const renderZoneTypeInput = () => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 4 }}>{t('common.type')}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {["room", "balcony", "garden", "greenhouse"].map((type) => (
          <Button
            key={type}
            mode={form.type === type ? "contained" : "outlined"}
            onPress={() => setForm({ ...form, type })}
            style={{ marginRight: 6, marginBottom: 6 }}
          >
            {type}
          </Button>
        ))}
      </View>
    </View>
  );

  return (
    <PaperProvider>
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        data={locations}
        refreshing={loading}
        onRefresh={reload}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={() => (
          <Button mode="contained" icon="home-plus" onPress={() => openLocationModal()}>
            {t('home.newHome')}
          </Button>
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
                  item.zones.map((z) =>
                    <ZoneRow key={z.id} item={z} locationId={item.id} />
                  )
                ) : (
                  <Text style={styles.emptyTxt}>{t('home.noZones')}</Text>
                )}
                <Button
                  mode="outlined"
                  icon="plus"
                  style={{ marginTop: 8 }}
                  onPress={() => openZoneModal(item.id)}
                >
                  {t('home.addZone')}
                </Button>
                <Button
                  icon="pencil"
                  mode="outlined"
                  onPress={() => openLocationModal(item)}
                  style={{ marginTop: 8 }}
                >
                  {t('home.editHome')}
                </Button>
                <Button
                  icon="delete"
                  mode="outlined"
                  onPress={() => deleteLocation(item.id)}
                  color="red"
                  style={{ marginTop: 8 }}
                >
                  {t('home.deleteHome')}
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
            {editing?.type === "location"
              ? editing.locationId
                ? t('home.editHome')
                : t('home.newHome')
              : editing?.zone
              ? t('home.editZone')
              : t('home.newZone')}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t('common.name')}
            value={form.name}
            onChangeText={(val) => setForm({ ...form, name: val })}
          />
          {editing?.type === "location" && (
            <TextInput
              style={styles.input}
              placeholder={t('home.addressPlaceholder')}
              value={form.address}
              onChangeText={(val) => setForm({ ...form, address: val })}
            />
          )}
          {editing?.type === "zone" && renderZoneTypeInput()}
          <Button
            mode="contained"
            onPress={editing?.type === "location" ? saveLocation : saveZone}
            style={{ marginTop: 12 }}
          >
            {t('common.save')}
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
