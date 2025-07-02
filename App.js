import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import TodayScreen from "./screens/TodayScreen";
import PlantListScreen from "./screens/PlantListScreen";
import AddPlantScreen from "./screens/AddPlantScreen";
import CalendarScreen from "./screens/CalendarScreen";
import AssistantScreen from "./screens/AssistantScreen";
import AuthScreen from "./screens/AuthScreen";
import ProfileCompleteScreen from "./screens/ProfileCompleteScreen";
import { supabase } from './supabase';
import 'react-native-url-polyfill/auto';
import { createNativeStackNavigator } from "@react-navigation/native-stack";

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();

function HomeStackScreen({ user, profile, onProfileEditDone }) {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
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
      </HomeStack.Screen>
      <HomeStack.Screen
        name="ProfilBearbeiten"
        options={{ title: "Profil bearbeiten" }}
      >
        {props => (
          <ProfileCompleteScreen
            {...props}
            user={user}
            profile={profile}
            onDone={onProfileEditDone}
            showSkip // Falls du das Überspringen erlauben willst
          />
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth-Status überwachen
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });
    return () => { listener?.subscription.unsubscribe(); }
  }, []);

  // Profil laden
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

  if (loading) return null; // Alternativ ein Loader

  if (!user) return <AuthScreen />;

  // Prüfen, ob Profil vollständig
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
        showSkip // Optional: Überspringen ermöglichen
      />
    );
  }

  // Tabs wie gehabt, aber HomeStack für Heute
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "Heute") iconName = "sunny-outline";
            else if (route.name === "Meine Pflanzen") iconName = "leaf-outline";
            else if (route.name === "Pflanze hinzufügen") iconName = "add-circle-outline";
            else if (route.name === "Kalender") iconName = "calendar-outline";
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
        <Tab.Screen name="Meine Pflanzen" component={PlantListScreen} />
        <Tab.Screen name="Pflanze hinzufügen" component={AddPlantScreen} />
        <Tab.Screen name="Kalender" component={CalendarScreen} />
        <Tab.Screen name="Mein Gärtner" component={AssistantScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
