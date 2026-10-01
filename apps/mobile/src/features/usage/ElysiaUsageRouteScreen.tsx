import { View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { ScreenScrollView } from "../../components/ScreenScrollView";
import { SettingsScreen } from "../settings/components/SettingsScreen";

export function ElysiaUsageRouteScreen() {
  return (
    <SettingsScreen title="Compression savings">
      <ScreenScrollView contentContainerClassName="gap-4 p-5">
        <Text className="text-lg font-t3-bold">Your Elysia savings</Text>
        <Text className="text-sm text-foreground-muted">
          View your savings any time — type /elysia-compression stats inside Claude Code.
        </Text>
        <View className="gap-2 rounded-xl bg-card p-4">
          <Text className="font-t3-bold">Compression dashboard</Text>
          <Text selectable className="text-sm">
            localhost:8787/dashboard
          </Text>
          <Text className="text-sm text-foreground-muted">
            Open this address in a browser on the computer running Elysia. Its Savings page shows
            the active dashboard address if the port differs.
          </Text>
        </View>
      </ScreenScrollView>
    </SettingsScreen>
  );
}
