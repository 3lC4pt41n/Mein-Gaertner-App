// App.js – Hauptnavigation mit RevenueCat + Credit Store
// -----------------------------------------------------------
import React, { useEffect, useRef } from "react";
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
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLoadingScreen from "./components/AppLoadingScreen";
import OfflineBanner from "./components/OfflineBanner";
import { t } from "./i18n";
import { colors } from "./theme";
import { supabase } from "./supabase";
import {
  registerForPushNotifications,
  addNotificationResponseListener,
} from "./services/notificationService";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ---------- Plant Stack ---------------------------
function PlantStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Meine Pflanzen"
        component={PlantListScreen}
        options={{ title: t('nav.plantStackTitle') }}
      />
      <Stack.Screen
        name="PlantDetail"
        component={PlantDetailScreen}
        options={{ title: t('nav.plantDetailsTitle') }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: t('nav.taskTitle') }}
      />
    </Stack.Navigator>
  );
}

// ---------- Task Stack (Aufgaben + Detail) --------
function TaskStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="TaskList"
        component={TaskListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: t('nav.taskTitle') }}
      />
    </Stack.Navigator>
  );
}

// ---------- Shop Stack (Store + Admin Dashboard) ---
function ShopStack({ isAdmin }) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="StoreMain"
        options={{ title: t('nav.shop') }}
      >
        {(props) => <StoreScreen {...props} isAdmin={isAdmin} />}
      </Stack.Screen>
      {isAdmin && (
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ title: t('nav.adminTitle') }}
        />
      )}
    </Stack.Navigator>
  );
}

// ---------- App Content (uses AuthContext) ---------
function AppContent() {
  const {
    user,
    profile,
    isAdmin,
    loading,
    showWelcome,
    passwordRecoveryMode,
    handlePasswordRecoveryDetected,
    handlePasswordRecoveryComplete,
    refreshProfile,
    dismissWelcome,
  } = useAuth();
  const navigationRef = useRef(null);

  // --- Push Notification Registration (after login) ---
  useEffect(() => {
    if (!user?.id) return;
    registerForPushNotifications(user.id, supabase).catch(console.warn);
  }, [user?.id]);

  // --- Handle notification tap → navigate to Tasks tab ---
  useEffect(() => {
    const subscription = addNotificationResponseListener(() => {
      // Navigate to the Tasks tab when a task reminder is tapped
      if (navigationRef.current) {
        navigationRef.current.navigate('Aufgaben');
      }
    });
    return () => subscription.remove();
  }, []);

  if (loading) return <AppLoadingScreen />;

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
        onDone={refreshProfile}
        showSkip
      />
    );
  }

  if (showWelcome) {
    return <BetaWelcomeScreen onDone={dismissWelcome} />;
  }

  // ---------- Navigation Container ------------------------
  return (
    <NavigationContainer ref={navigationRef}>
      <OfflineBanner />
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
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: "gray",
          headerShown: false,
        })}
      >
        <Tab.Screen
          name="Zuhause"
          component={HomeManager}
          options={{ title: t('nav.home'), tabBarLabel: t('nav.home') }}
        />
        <Tab.Screen
          name="MeinePflanzenTab"
          options={{ title: t('nav.plants'), tabBarLabel: t('nav.plants') }}
        >
          {() => <PlantStack />}
        </Tab.Screen>
        <Tab.Screen
          name="Pflanze hinzufügen"
          component={AddPlantScreen}
          options={{ title: t('nav.addPlant'), tabBarLabel: t('nav.addPlant') }}
        />
        <Tab.Screen
          name="Aufgaben"
          options={{ title: t('nav.tasks'), tabBarLabel: t('nav.tasks') }}
        >
          {() => <TaskStack />}
        </Tab.Screen>
        <Tab.Screen
          name="Rangliste"
          component={LeaderboardScreen}
          options={{ title: t('nav.leaderboard'), tabBarLabel: t('nav.leaderboard') }}
        />
        <Tab.Screen
          name="Mein Gärtner"
          component={AssistantScreen}
          options={{ title: t('nav.assistant'), tabBarLabel: t('nav.assistant') }}
        />
        <Tab.Screen
          name="Shop"
          options={{ title: t('nav.shop'), tabBarLabel: t('nav.shop') }}
        >
          {() => <ShopStack isAdmin={isAdmin} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ---------- Root App Component ----------------------------
export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AuthProvider>
  );
}
