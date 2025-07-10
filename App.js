import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import HeaderButtons from "./components/HeaderButtons";

import TodayScreen from "./screens/TodayScreen";
import PlantListScreen from "./screens/PlantListScreen";
import AddPlantScreen from "./screens/AddPlantScreen";
import CalendarScreen from "./screens/CalendarScreen";
import AssistantScreen from "./screens/AssistantScreen";
import AuthScreen from "./screens/AuthScreen";
import ProfileCompleteScreen from "./screens/ProfileCompleteScreen";
import PlantDetailScreen from "./screens/PlantDetailScreen";
import TaskListScreen from "./screens/TaskListScreen";
import TaskDetailScreen from "./screens/TaskDetailScreen";
import { supabase } from './supabase';
import 'react-native-url-polyfill/auto';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const PlantStack = createNativeStackNavigator();
const AddStack = createNativeStackNavigator();
const TaskStack = createNativeStackNavigator();
const AssistantStack = createNativeStackNavigator();


function HomeStackScreen({ user }) {
  return (
    <HomeStack.Navigator
      screenOptions={({ navigation }) => ({
        headerRight: () => <HeaderButtons navigation={navigation} />
      })}
    >
      <HomeStack.Screen name="Heute">
        {props => <TodayScreen {...props} user={user} />}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
}

function PlantStackScreen() {
  return (
    <PlantStack.Navigator
      screenOptions={({ navigation }) => ({
        headerRight: () => <HeaderButtons navigation={navigation} />
      })}
    >
      <PlantStack.Screen name="Meine Pflanzen" component={PlantListScreen} />
      <PlantStack.Screen name="PlantDetail" component={PlantDetailScreen} options={{ title: 'Details' }} />
      <PlantStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Aufgabe' }} />
    </PlantStack.Navigator>
  );
}

function AddPlantStackScreen() {
  return (
    <AddStack.Navigator
      screenOptions={({ navigation }) => ({
        headerRight: () => <HeaderButtons navigation={navigation} />
      })}
    >
      <AddStack.Screen name="Pflanze hinzufügen" component={AddPlantScreen} />
    </AddStack.Navigator>
  );
}

function TaskStackScreen() {
  return (
    <TaskStack.Navigator
      screenOptions={({ navigation }) => ({
        headerRight: () => <HeaderButtons navigation={navigation} />
      })}
    >
      <TaskStack.Screen name="Aufgaben" component={TaskListScreen} />
      <TaskStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Aufgabe' }} />
    </TaskStack.Navigator>
  );
}

function AssistantStackScreen() {
  return (
    <AssistantStack.Navigator
      screenOptions={({ navigation }) => ({
        headerRight: () => <HeaderButtons navigation={navigation} />
      })}
    >
      <AssistantStack.Screen name="Mein Gärtner" component={AssistantScreen} />
    </AssistantStack.Navigator>
  );
}

function MainTabs({ user }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Heute') iconName = 'sunny-outline';
          else if (route.name === 'Meine Pflanzen') iconName = 'leaf-outline';
          else if (route.name === 'Pflanze hinzufügen') iconName = 'add-circle-outline';
          else if (route.name === 'Aufgaben') iconName = 'clipboard-outline';
          else if (route.name === 'Mein Gärtner') iconName = 'chatbox-ellipses-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen name="Heute">
        {props => <HomeStackScreen {...props} user={user} />}
      </Tab.Screen>
      <Tab.Screen name="Meine Pflanzen" component={PlantStackScreen} />
      <Tab.Screen name="Pflanze hinzufügen" component={AddPlantStackScreen} />
      <Tab.Screen name="Aufgaben" component={TaskStackScreen} />
      <Tab.Screen name="Mein Gärtner" component={AssistantStackScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });
    return () => { listener?.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (user) {
      setLoading(true);
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
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

  const refreshProfile = () => {
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data));
  };

  if (loading) return null; // Oder ein Loader

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
        onDone={refreshProfile}
        showSkip
      />
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator>
        <RootStack.Screen name="MainTabs" options={{ headerShown: false }}>
          {props => <MainTabs {...props} user={user} />}
        </RootStack.Screen>
        <RootStack.Screen name="ProfilBearbeiten" options={{ title: 'Profil bearbeiten' }}>
          {props => (
            <ProfileCompleteScreen
              {...props}
              user={user}
              profile={profile}
              onDone={refreshProfile}
              showSkip
            />
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
