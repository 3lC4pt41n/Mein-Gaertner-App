// Updated App.js – ersetzt "Heute"‑Stack durch neuen "Zuhause"‑Screen (HomeManager)
// -----------------------------------------------------------
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import HomeManager from "./screens/HomeManager";          // <‑‑ NEU
import PlantListScreen from "./screens/PlantListScreen";
import AddPlantScreen from "./screens/AddPlantScreen";
import AssistantScreen from "./screens/AssistantScreen";
import AuthScreen from "./screens/AuthScreen";
import ProfileCompleteScreen from "./screens/ProfileCompleteScreen";
import PlantDetailScreen from "./screens/PlantDetailScreen";
import TaskListScreen from "./screens/TaskListScreen";
import TaskDetailScreen from "./screens/TaskDetailScreen";
import { supabase } from "./supabase";
import "react-native-url-polyfill/auto";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ---------- Plant Stack (bleibt) ---------------------------
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

// ---------- Main App Component -----------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- Auth State -----------------------------------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

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

  // ---------- Navigation Container ------------------------
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "Zuhause") iconName = "home-outline"; // neu
            else if (route.name === "Meine Pflanzen") iconName = "leaf-outline";
            else if (route.name === "Pflanze hinzufügen") iconName = "add-circle-outline";
            else if (route.name === "Aufgaben") iconName = "clipboard-outline";
            else if (route.name === "Mein Gärtner") iconName = "chatbox-ellipses-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "#4CAF50",
          tabBarInactiveTintColor: "gray",
          headerShown: false,
        })}
      >
        {/* Heute‑Stack entfällt → HomeManager rein */}
        <Tab.Screen name="Zuhause" component={HomeManager} />
        <Tab.Screen name="Meine Pflanzen" component={PlantStack} />
        <Tab.Screen name="Pflanze hinzufügen" component={AddPlantScreen} />
        <Tab.Screen name="Aufgaben" component={TaskListScreen} />
        <Tab.Screen name="Mein Gärtner" component={AssistantScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
