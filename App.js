// App.js – Hauptnavigation mit RevenueCat + Credit Store
// -----------------------------------------------------------
import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeManager from './screens/HomeManager';
import PlantListScreen from './screens/PlantListScreen';
import AddPlantScreen from './screens/AddPlantScreen';
import AssistantScreen from './screens/AssistantScreen';
import AuthScreen from './screens/AuthScreen';
import ProfileCompleteScreen from './screens/ProfileCompleteScreen';
import PlantDetailScreen from './screens/PlantDetailScreen';
import TaskListScreen from './screens/TaskListScreen';
import TaskDetailScreen from './screens/TaskDetailScreen';
import StoreScreen from './screens/StoreScreen';
import AdminDashboardScreen from './screens/AdminDashboardScreen';
import BetaWelcomeScreen from './screens/BetaWelcomeScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import CalendarScreen from './screens/CalendarScreen';
import PlantDexScreen from './screens/PlantDexScreen';
import DexDetailScreen from './screens/DexDetailScreen';
import MoreScreen from './screens/MoreScreen';
import SettingsScreen from './screens/SettingsScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoadingScreen from './components/AppLoadingScreen';
import OfflineBanner from './components/OfflineBanner';
import { Ionicons } from '@expo/vector-icons';
import { t } from './i18n';
import { colors } from './theme';
import { supabase } from './supabase';
import {
  registerForPushNotifications,
  addNotificationResponseListener,
} from './services/notificationService';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ---------- Plant Stack (Plants + Dex) ---------------------------
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
      <Stack.Screen
        name="PlantDex"
        component={PlantDexScreen}
        options={{ title: t('nav.dex') }}
      />
      <Stack.Screen
        name="DexDetail"
        component={DexDetailScreen}
        options={{ title: t('nav.dexDetail') }}
      />
    </Stack.Navigator>
  );
}

// ---------- Task Stack (Tasks + Detail + Calendar) --------
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
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ title: t('nav.calendar') }}
      />
    </Stack.Navigator>
  );
}

// ---------- More Stack (Assistant, Shop, Leaderboard, etc.) ---
function MoreStack({ isAdmin }) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MoreMain"
        component={MoreScreen}
        options={{ title: t('nav.more') }}
      />
      <Stack.Screen
        name="AssistantMain"
        component={AssistantScreen}
        options={{ title: t('nav.assistant') }}
      />
      <Stack.Screen
        name="ShopMain"
        options={{ title: t('nav.shop') }}
      >
        {(props) => <StoreScreen {...props} isAdmin={isAdmin} />}
      </Stack.Screen>
      <Stack.Screen
        name="LeaderboardMain"
        component={LeaderboardScreen}
        options={{ title: t('nav.leaderboard') }}
      />
      <Stack.Screen
        name="CalendarMain"
        component={CalendarScreen}
        options={{ title: t('nav.calendar') }}
      />
      <Stack.Screen
        name="FeedbackMain"
        component={FeedbackScreen}
        options={{ title: t('feedback.title') }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('settings.title') }}
      />
      {isAdmin && (
        <Stack.Screen
          name="AdminMain"
          component={AdminDashboardScreen}
          options={{ title: t('nav.adminTitle') }}
        />
      )}
    </Stack.Navigator>
  );
}

// ---------- Home Stack (Home + Settings) -------------
function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeMain"
        component={HomeManager}
        options={({ navigation }) => ({
          title: t('nav.home'),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ marginRight: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
            >
              <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('settings.title') }}
      />
    </Stack.Navigator>
  );
}

// ---------- Custom Add-Plant Tab Button ----------------------
function AddPlantTabButton({ children, onPress }) {
  return (
    <TouchableOpacity
      style={tabButtonStyles.container}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={t('nav.addPlant')}
    >
      <View style={tabButtonStyles.button}>
        {children}
      </View>
    </TouchableOpacity>
  );
}

const tabButtonStyles = StyleSheet.create({
  container: {
    top: -12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
});

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

  // --- Push Notification Registration (after login, respects preference) ---
  useEffect(() => {
    if (!user?.id || !profile?.notifications_enabled) return;
    registerForPushNotifications(user.id, supabase).catch(console.warn);
  }, [user?.id, profile?.notifications_enabled]);

  // --- Handle notification tap → navigate to Tasks tab ---
  useEffect(() => {
    const subscription = addNotificationResponseListener(() => {
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
    !profile?.profile_setup_skipped &&
    (!profile?.username ||
    !profile?.first_name ||
    !profile?.last_name ||
    !profile?.country ||
    !profile?.language);

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

  // ---------- Navigation Container (5 Tabs) ------------------
  return (
    <NavigationContainer ref={navigationRef}>
      <OfflineBanner />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === 'Zuhause') iconName = 'home-outline';
            else if (route.name === 'MeinePflanzenTab') iconName = 'leaf-outline';
            else if (route.name === 'Pflanze hinzufügen') iconName = 'add';
            else if (route.name === 'Aufgaben') iconName = 'clipboard-outline';
            else if (route.name === 'Mehr') iconName = 'ellipsis-horizontal';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
        })}
      >
        <Tab.Screen
          name="Zuhause"
          options={{ title: t('nav.home'), tabBarLabel: t('nav.home') }}
        >
          {() => <HomeStack />}
        </Tab.Screen>
        <Tab.Screen
          name="MeinePflanzenTab"
          options={{ title: t('nav.plants'), tabBarLabel: t('nav.plants') }}
        >
          {() => <PlantStack />}
        </Tab.Screen>
        <Tab.Screen
          name="Pflanze hinzufügen"
          component={AddPlantScreen}
          options={{
            title: t('nav.addPlant'),
            tabBarLabel: () => null,
            tabBarIcon: ({ size }) => (
              <Ionicons name="add" size={size + 4} color="#FFFFFF" />
            ),
            tabBarButton: (props) => <AddPlantTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Aufgaben"
          options={{ title: t('nav.tasks'), tabBarLabel: t('nav.tasks') }}
        >
          {() => <TaskStack />}
        </Tab.Screen>
        <Tab.Screen
          name="Mehr"
          options={{ title: t('nav.more'), tabBarLabel: t('nav.more') }}
        >
          {() => <MoreStack isAdmin={isAdmin} />}
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
