// App.js – Hauptnavigation mit RevenueCat + Credit Store
// -----------------------------------------------------------
import './sentry.config'; // ← Sentry MUSS als erstes geladen werden
import { Sentry } from './sentry.config';
import React, { useEffect, useRef, useState } from 'react';
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
import OnboardingScreen from './screens/OnboardingScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import CalendarScreen from './screens/CalendarScreen';
import PlantDexScreen from './screens/PlantDexScreen';
import DexDetailScreen from './screens/DexDetailScreen';
import MoreScreen from './screens/MoreScreen';
import HeatmapScreen from './screens/HeatmapScreen';
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
import { getCurrentLocation, getWeather } from './services/weatherService';
import { buildContext } from './utils/contextUtils';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ---------- Plant Stack (Plants + Dex) ---------------------------
function PlantStack({ context }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Meine Pflanzen" options={{ title: t('nav.plantStackTitle') }}>
        {(props) => <PlantListScreen {...props} context={context} />}
      </Stack.Screen>
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
      <Stack.Screen name="PlantDex" component={PlantDexScreen} options={{ title: t('nav.dex') }} />
      <Stack.Screen
        name="DexDetail"
        component={DexDetailScreen}
        options={{ title: t('nav.dexDetail') }}
      />
    </Stack.Navigator>
  );
}

// ---------- Add Plant Stack (for consistent header) --------
function AddPlantStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="AddPlantMain"
        component={AddPlantScreen}
        options={{ title: t('nav.addPlant') }}
      />
    </Stack.Navigator>
  );
}

// ---------- Assistant Stack (Chat tab) --------
function AssistantTabStack({ context }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AssistantMain" options={{ title: t('nav.assistant') }}>
        {(props) => <AssistantScreen {...props} context={context} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

// ---------- More Stack (Tasks, Shop, Leaderboard, etc.) ---
function MoreStack({ isAdmin }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MoreMain" component={MoreScreen} options={{ title: t('nav.more') }} />
      <Stack.Screen
        name="TasksMain"
        component={TaskListScreen}
        options={{ title: t('nav.tasks') }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: t('nav.taskTitle') }}
      />
      <Stack.Screen name="ShopMain" options={{ title: t('nav.shop') }}>
        {(props) => <StoreScreen {...props} isAdmin={isAdmin} />}
      </Stack.Screen>
      <Stack.Screen
        name="LeaderboardMain"
        component={LeaderboardScreen}
        options={{ title: t('nav.leaderboard') }}
      />
      <Stack.Screen
        name="HeatmapMain"
        component={HeatmapScreen}
        options={{ title: t('heatmap.title') }}
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
function HomeStack({ context }) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeMain"
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
      >
        {(props) => <HomeManager {...props} context={context} />}
      </Stack.Screen>
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
      <View style={tabButtonStyles.button}>{children}</View>
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
  const [context, setContext] = useState(() => buildContext({ location: null, weather: null }));

  useEffect(() => {
    if (!user?.id) {
      setContext(buildContext({ location: null, weather: null }));
      return undefined;
    }

    let mounted = true;

    async function refreshContext() {
      try {
        const location = await getCurrentLocation();
        const weather =
          location?.latitude && location?.longitude
            ? await getWeather(location.latitude, location.longitude)
            : null;
        if (mounted) setContext(buildContext({ location, weather }));
      } catch (error) {
        if (__DEV__) {
          console.warn('[App] Kontext konnte nicht geladen werden:', error?.message);
        }
        if (mounted) setContext(buildContext({ location: null, weather: null }));
      }
    }

    refreshContext();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // --- Push Notification Registration (after login, respects preference) ---
  useEffect(() => {
    if (!user?.id || !profile?.notifications_enabled) return;
    registerForPushNotifications(user.id, supabase).catch(console.warn);
  }, [user?.id, profile?.notifications_enabled]);

  // --- Handle notification tap → navigate to TaskDetail via Mehr tab ---
  useEffect(() => {
    const subscription = addNotificationResponseListener(({ taskId }) => {
      if (navigationRef.current && taskId) {
        // Deep-link: navigate directly to TaskDetail with the task ID
        navigationRef.current.navigate('Mehr', {
          screen: 'TaskDetail',
          params: { task: { id: taskId, user_id: user?.id } },
        });
      } else if (navigationRef.current) {
        // Fallback: open task list if no taskId available
        navigationRef.current.navigate('Mehr', { screen: 'TasksMain' });
      }
    });
    return () => subscription.remove();
  }, [user?.id]);

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
    return <AuthScreen onPasswordRecoveryDetected={handlePasswordRecoveryDetected} />;
  }

  const profileIncomplete = !profile?.username || !profile?.language;

  if (profileIncomplete) {
    return <ProfileCompleteScreen user={user} profile={profile} onDone={refreshProfile} />;
  }

  if (showWelcome) {
    return <OnboardingScreen onDone={dismissWelcome} />;
  }

  // ---------- Navigation Container (5 Tabs) ------------------
  return (
    <NavigationContainer ref={navigationRef}>
      <OfflineBanner />
      <Tab.Navigator
        initialRouteName="MeinePflanzenTab"
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === 'Zuhause') iconName = 'home-outline';
            else if (route.name === 'MeinePflanzenTab') iconName = 'leaf-outline';
            else if (route.name === 'Pflanze hinzufügen') iconName = 'add';
            else if (route.name === 'MeinGärtnerTab') iconName = 'chatbubble-ellipses-outline';
            else if (route.name === 'Mehr') iconName = 'ellipsis-horizontal';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
        })}
      >
        <Tab.Screen name="Zuhause" options={{ title: t('nav.home'), tabBarLabel: t('nav.home') }}>
          {() => <HomeStack context={context} />}
        </Tab.Screen>
        <Tab.Screen
          name="MeinePflanzenTab"
          options={{ title: t('nav.plants'), tabBarLabel: t('nav.plants') }}
        >
          {() => <PlantStack context={context} />}
        </Tab.Screen>
        <Tab.Screen
          name="Pflanze hinzufügen"
          options={{
            title: t('nav.addPlant'),
            tabBarLabel: () => null,
            tabBarIcon: ({ size }) => <Ionicons name="add" size={size + 4} color="#FFFFFF" />,
            tabBarButton: (props) => <AddPlantTabButton {...props} />,
          }}
        >
          {() => <AddPlantStack />}
        </Tab.Screen>
        <Tab.Screen
          name="MeinGärtnerTab"
          options={{ title: t('nav.assistant'), tabBarLabel: t('nav.assistant') }}
        >
          {() => <AssistantTabStack context={context} />}
        </Tab.Screen>
        <Tab.Screen name="Mehr" options={{ title: t('nav.more'), tabBarLabel: t('nav.more') }}>
          {() => <MoreStack isAdmin={isAdmin} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ---------- Root App Component ----------------------------
function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AuthProvider>
  );
}

export default Sentry.wrap(App);
