import { Stack } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Workspace } from "../components/workspace";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <Workspace>
          <Stack screenOptions={{ headerShown: false }} />
        </Workspace>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
