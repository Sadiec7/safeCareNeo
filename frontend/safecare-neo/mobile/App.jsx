import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, StyleSheet } from "react-native";
import { registerRootComponent } from 'expo';

import DashboardScreen from "./src/screens/DashboardScreen";
import CamaraScreen from "./src/screens/CamaraScreen";

const Tab = createBottomTabNavigator();

const TabIcon = ({ label, focused }) => (
  <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
    <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
      {label}
    </Text>
  </View>
);

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarShowLabel: false,
          }}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon label="Estado" focused={focused} />
              ),
            }}
          />
          <Tab.Screen
            name="Camara"
            component={CamaraScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon label="Cámara" focused={focused} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#fff",
    borderTopColor: "#E3EFF8",
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabIcon: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tabIconActive: {
    backgroundColor: "#D6EAF8",
  },
  tabLabel: {
    fontSize: 13,
    color: "#90A4B0",
    fontWeight: "500",
  },
  tabLabelActive: {
    color: "#2980B9",
  },
});
registerRootComponent(App);