import type { AgentProfile } from "@t3tools/contracts";
import { resolveAgentAvatar } from "@t3tools/shared/agentAvatar";
import { useEffect } from "react";
import { AppState } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { G, Path, Rect } from "react-native-svg";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const MOTION = { reduceMotion: ReduceMotion.System } as const;

function Eye({
  height,
  width,
  radius,
  blink,
}: {
  height: number;
  width: number;
  radius: number;
  blink: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => ({
    y: -(height * blink.value) / 2,
    height: height * blink.value,
  }));
  return <AnimatedRect x={-width / 2} width={width} rx={radius} animatedProps={animatedProps} />;
}

export function AgentAvatar({
  avatar,
  size = 20,
  working = false,
  active = false,
}: {
  readonly avatar: AgentProfile["avatar"];
  readonly size?: number;
  readonly working?: boolean;
  readonly active?: boolean;
}) {
  const character = resolveAgentAvatar(avatar);
  const blink = useSharedValue(1);
  const tilt = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value}deg` }] }));
  useEffect(() => {
    const stop = () => {
      cancelAnimation(blink);
      cancelAnimation(tilt);
      blink.set(1);
      tilt.set(0);
    };
    const start = () => {
      stop();
      if (reducedMotion) return;
      // Akeru's blink pose, held at rest for most of each cycle. Native delayed
      // work runs on the UI thread; no JavaScript animation clock or timers.
      blink.set(
        withRepeat(
          withDelay(
            5640,
            withSequence(
              ReduceMotion.System,
              withTiming(0.08, { duration: 60, ...MOTION }),
              withTiming(0.08, { duration: 50, ...MOTION }),
              withTiming(1.08, { duration: 80, ...MOTION }),
              withTiming(1, { duration: 130, ...MOTION }),
            ),
            ReduceMotion.System,
          ),
          -1,
          false,
          undefined,
          ReduceMotion.System,
        ),
      );
      tilt.set(
        withSequence(
          ReduceMotion.System,
          withTiming(working ? 5 : active ? -6 : -3, { duration: 120, ...MOTION }),
          withTiming(working ? -3 : 3, { duration: 120, ...MOTION }),
          withTiming(0, { duration: 180, ...MOTION }),
        ),
      );
    };
    if (AppState.currentState === "active" || AppState.currentState === null) start();
    const subscription = AppState.addEventListener("change", (state) =>
      state === "active" ? start() : stop(),
    );
    return () => {
      subscription.remove();
      stop();
    };
  }, [blink, tilt, reducedMotion, working, active]);
  return (
    <Animated.View style={[{ width: size, height: size }, bodyStyle]} accessibilityElementsHidden>
      <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
        <Path d={character.path} fill={character.color} />
        <G fill={character.eyeColor}>
          {character.eyes.map((eye) => (
            <G
              key={eye.side}
              transform={`translate(${eye.x} ${eye.y}) rotate(${eye.rotate}) scale(${eye.scale})`}
            >
              <Eye
                height={character.eyeHeight}
                width={character.eyeWidth}
                radius={character.eyeRadius}
                blink={blink}
              />
            </G>
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}
