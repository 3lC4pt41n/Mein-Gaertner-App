import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

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
const Stack = createNativeStackNavigator();

function PlantStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Meine Pflanzen" component={PlantListScreen} />
      <Stack.Screen name="PlantDetail" component={PlantDetailScreen} options={{ title: 'Details' }} />
	  <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: "Aufgabe" }} />
    </Stack.Navigator>
  );
}

function HomeStackScreen({ user, profile, onProfileEditDone }) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Heute"
        options={({ navigation }) => ({
          headerRight: () => (
            <Ionicons
              name="person-circle-outline"
              size={28}
              color="#4CAF50"
              style={{ marginRight: 16 }}
              onPress={() => navigation.navigate("ProfilBearbeiten")}
            />
          ),
          title: "Heute",
        })}
      >
        {props => <TodayScreen {...props} user={user} />}
      </Stack.Screen>
      <Stack.Screen
        name="ProfilBearbeiten"
        options={{ title: "Profil bearbeiten" }}
      >
        {props => (
          <ProfileCompleteScreen
            {...props}
            user={user}
            profile={profile}
            onDone={onProfileEditDone}
            showSkip
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
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
    return () => { listener?.subscription.unsubscribe(); }
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

  if (loading) return null; // Oder ein Loader

  if (!user) return <AuthScreen />;

  // Profil vollständig?
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
        onDone={() => {
          supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
            .then(({ data }) => setProfile(data));
        }}
        showSkip
      />
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "Heute") iconName = "sunny-outline";
            else if (route.name === "Meine Pflanzen") iconName = "leaf-outline";
            else if (route.name === "Pflanze hinzufügen") iconName = "add-circle-outline";
            else if (route.name === "Aufgaben") iconName = "clipboard-outline";
            else if (route.name === "Mein Gärtner") iconName = "chatbox-ellipses-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "#4CAF50",
          tabBarInactiveTintColor: "gray",
        })}
      >
        <Tab.Screen name="Heute">
          {props => (
            <HomeStackScreen
              {...props}
              user={user}
              profile={profile}
              onProfileEditDone={() => {
                supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', user.id)
                  .single()
                  .then(({ data }) => setProfile(data));
              }}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Meine Pflanzen" component={PlantStack} />
        <Tab.Screen name="Pflanze hinzufügen" component={AddPlantScreen} />
        <Tab.Screen name="Aufgaben" component={TaskListScreen} />
        <Tab.Screen name="Mein Gärtner" component={AssistantScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
