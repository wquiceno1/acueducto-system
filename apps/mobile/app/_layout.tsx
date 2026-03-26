import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { initDatabase } from "../lib/database";

export default function RootLayout() {
  useEffect(() => {
    initDatabase();
  }, []);

  return (
    <SafeAreaProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
