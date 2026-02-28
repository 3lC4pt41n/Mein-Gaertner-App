// screens/MenuHomeScreen.js
import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { t } from '../i18n';

export default function MenuHomeScreen() {
  const navigation = useNavigation();

  useEffect(() => {
    // Automatisch Drawer öffnen
    navigation.openDrawer && navigation.openDrawer();
  }, [navigation]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 22 }}>{t('minor.menuOverview')}</Text>
      <Text>{t('minor.menuSubtitle')}</Text>
    </View>
  );
}
