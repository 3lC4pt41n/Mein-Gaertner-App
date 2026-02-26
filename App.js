// App.js – Hauptnavigation mit RevenueCat + Credit Store
// -----------------------------------------------------------
import React, { useCallback, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import HomeManager from "./screens/HomeManager";
import PlantListScreen from "./screens/PlantListScreen";
import AddPlantScreen from "./screens/AddPlantScreen";
import AssistantScreen from "./screens/AssistantScreen";
import AuthScreen from "./screens/AuthScreen";
import ProfileCompleteScreen from "./screens/ProfileCompleteScreen";
import PlantDetailScreen from "./screens/PlantDetailScreen";
import TaskListScreen from "./screens/TaskListScreen";
import TaskDetailScreen from "./screens/TaskDetailScreen";
import StoreScreen from "./screens/StoreScreen";
import AdminDashboardScreen from "./screens/AdminDashboardScreen";
import BetaWelcomeScreen from "./screens/BetaWelcomeScreen";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import { supabase } from "./supabase";
import { initPurchases } from "./services/purchaseService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUiText, normalizeLanguage } from "./services/languageService";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ---------- Plant Stack ---------------------------
function PlantStack({ menuLabels }) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Meine Pflanzen"
        component={PlantListScreen}
        options={{ title: menuLabels.plantStackTitle }}
      />
      <Stack.Screen
        name="PlantDetail"
        component={PlantDetailScreen}
        options={{ title: menuLabels.plantDetailsTitle }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: menuLabels.taskTitle }}
      />
    </Stack.Navigator>
  );
}

// ---------- Shop Stack (Store + Admin Dashboard) ---
function ShopStack({ menuLabels }) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="StoreMain"
        component={StoreScreen}
        options={{ title: menuLabels.shop }}
      />
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: menuLabels.adminTitle }}
      />
    </Stack.Navigator>
  );
}

// ---------- Main App Component -----------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const handlePasswordRecoveryDetected = useCallback(
    () => setPasswordRecoveryMode(true),
    []
  );
  const handlePasswordRecoveryComplete = useCallback(
    () => setPasswordRecoveryMode(false),
    []
  );

  // --- Auth State -----------------------------------------
  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setUser(data?.user ?? null))
      .catch(() => setUser(null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryMode(true);
      }
      setUser(session?.user ?? null);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- RevenueCat Init (nach Login) -----------------------
  useEffect(() => {
    if (user?.id) {
      initPurchases(user.id).catch(console.warn);
    }
  }, [user?.id]);

  // --- Beta Welcome Check (einmalig pro User) -------------
  useEffect(() => {
    if (user?.id) {
      AsyncStorage.getItem(`beta_welcome_shown_${user.id}`).then(val => {
        if (!val) setShowWelcome(true);
      });
    }
  }, [user?.id]);

  // --- Profil Fetch ---------------------------------------
  useEffect(() => {
    if (user) {
      setLoading(true);
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          setProfile(data);
          setLoading(false);
        })
        .catch(() => {
          setProfile(null);
          setLoading(false);
        });
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [user]);

  if (loading) return null; // TODO: Fancy Loader
  if (passwordRecoveryMode) {
    return (
      <AuthScreen
        forcePasswordReset
        onPasswordRecoveryDetected={handlePasswordRecoveryDetected}
        onPasswordResetComplete={handlePasswordRecoveryComplete}
      />
    );
  }
  if (!user) {
    return (
      <AuthScreen onPasswordRecoveryDetected={handlePasswordRecoveryDetected} />
    );
  }

  const languageCode = normalizeLanguage(profile?.language);
  const menuLabels = getUiText(languageCode).menu;

  const profileIncomplete =
    !profile?.username ||
    !profile?.first_name ||
    !profile?.last_name ||
    !profile?.country ||
    !profile?.language;

  if (profileIncomplete) {
    return (
      <ProfileCompleteScreen
        user={user}
        profile={profile}
        onDone={() =>
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single()
            .then(({ data }) => setProfile(data))
        }
        showSkip
      />
    );
  }

  // --- Beta Welcome Screen (einmalig) ---------------------
  if (showWelcome) {
    return (
      <BetaWelcomeScreen
        onDone={async () => {
          await AsyncStorage.setItem(`beta_welcome_shown_${user.id}`, "true");
          setShowWelcome(false);
        }}
      />
    );
  }

  // ---------- Navigation Container ------------------------
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "Zuhause") iconName = "home-outline";
            else if (route.name === "MeinePflanzenTab") iconName = "leaf-outline";
            else if (route.name === "Pflanze hinzufügen") iconName = "add-circle-outline";
            else if (route.name === "Aufgaben") iconName = "clipboard-outline";
            else if (route.name === "Rangliste") iconName = "trophy-outline";
            else if (route.name === "Mein Gärtner") iconName = "chatbox-ellipses-outline";
            else if (route.name === "Shop") iconName = "flash-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "#4CAF50",
          tabBarInactiveTintColor: "gray",
          headerShown: false,
        })}
      >
        <Tab.Screen
          name="Zuhause"
          component={HomeManager}
          options={{ title: menuLabels.home, tabBarLabel: menuLabels.home }}
        />
        <Tab.Screen
          name="MeinePflanzenTab"
          options={{ title: menuLabels.plants, tabBarLabel: menuLabels.plants }}
        >
          {() => <PlantStack menuLabels={menuLabels} />}
        </Tab.Screen>
        <Tab.Screen
          name="Pflanze hinzufügen"
          component={AddPlantScreen}
          options={{ title: menuLabels.addPlant, tabBarLabel: menuLabels.addPlant }}
        />
        <Tab.Screen
          name="Aufgaben"
          component={TaskListScreen}
          options={{ title: menuLabels.tasks, tabBarLabel: menuLabels.tasks }}
        />
        <Tab.Screen
          name="Rangliste"
          component={LeaderboardScreen}
          options={{ title: menuLabels.leaderboard || 'Rangliste', tabBarLabel: menuLabels.leaderboard || 'Rangliste' }}
        />
        <Tab.Screen
          name="Mein Gärtner"
          component={AssistantScreen}
          options={{ title: menuLabels.assistant, tabBarLabel: menuLabels.assistant }}
        />
        <Tab.Screen
          name="Shop"
          options={{ title: menuLabels.shop, tabBarLabel: menuLabels.shop }}
        >
          {() => <ShopStack menuLabels={menuLabels} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
