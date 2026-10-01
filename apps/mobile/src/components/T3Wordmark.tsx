import type { ColorValue } from "react-native";
import { Image } from "expo-image";

export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  return (
    <Image
      source={require("../../assets/elysia.png")}
      accessibilityLabel="Elysia"
      style={{ height: props.height, width: props.height }}
    />
  );
}
