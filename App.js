// App.js – Hauptnavigation mit RevenueCat + Credit Store
// -----------------------------------------------------------
import React, { useEffect, useState } from "react";
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
import { supabase } from "./supabase";
import { initPurchases } from "./services/purchaseService";
import AsyncStorage from "@react-native-async-storage/async-storage";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ---------- Plant Stack ---------------------------
function PlantStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Meine Pflanzen" component={PlantListScreen} />
      <Stack.Screen
        name="PlantDetail"
        component={PlantDetailScreen}
        options={{ title: "Details" }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: "Aufgabe" }}
      />
    </Stack.Navigator>
  );
}

// ---------- Shop Stack (Store + Admin Dashboard) ---
function ShopStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="StoreMain"
        component={StoreScreen}
        options={{ title: "Shop" }}
      />
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: "Admin Dashboard" }}
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

  // --- Auth State -----------------------------------------
  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setUser(data?.user ?? null))
      .catch(() => setUser(null));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
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
  if (!user) return <AuthScreen />;

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
            else if (route.name === "Mein Gärtner") iconName = "chatbox-ellipses-outline";
            else if (route.name === "Shop") iconName = "flash-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "#4CAF50",
          tabBarInactiveTintColor: "gray",
          headerShown: false,
        })}
      >
        <Tab.Screen name="Zuhause" component={HomeManager} />
        <Tab.Screen
          name="MeinePflanzenTab"
          component={PlantStack}
          options={{ title: "Pflanzen" }}
        />
        <Tab.Screen name="Pflanze hinzufügen" component={AddPlantScreen} />
        <Tab.Screen name="Aufgaben" component={TaskListScreen} />
        <Tab.Screen name="Mein Gärtner" component={AssistantScreen} />
        <Tab.Screen name="Shop" component={ShopStack} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
