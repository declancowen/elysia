import type { AgentProfile } from "@t3tools/contracts";

// Static body and face geometry adapted from Akeru Bot (MIT).
// See legal/licenses/MIT-Akeru.txt. Both clients draw the same local characters.
export const AGENT_AVATAR_SHAPES = [
  { value: "square", label: "Rounded square" },
  { value: "triangle", label: "Triangle" },
  { value: "squircle", label: "Bean" },
  { value: "circle", label: "Circle" },
  { value: "hex", label: "Hexagon" },
  { value: "cloud", label: "Cloud" },
  { value: "pill", label: "Oval" },
  { value: "drop", label: "Drop" },
  { value: "square-round-eyes", label: "Square with round eyes" },
  { value: "triangle-round-eyes", label: "Triangle with round eyes" },
  { value: "pill-round-eyes", label: "Oval with round eyes" },
  { value: "squircle-wide-eyes", label: "Bean with wide eyes" },
] as const;

export const AGENT_AVATAR_COLORS = [
  "#003CB2",
  "#28B4FF",
  "#AAE6FF",
  "#C9FCED",
  "#33D7C8",
  "#00786E",
  "#D8AFFF",
  "#9423FC",
  "#551491",
  "#FFB2C1",
  "#FF547C",
  "#BF1B4F",
  "#F5E669",
  "#EEAF00",
  "#B05223",
] as const;

type Preset = (typeof AGENT_AVATAR_SHAPES)[number]["value"];
type Shape = "square" | "triangle" | "squircle" | "circle" | "hex" | "cloud" | "pill" | "drop";
type Color = (typeof AGENT_AVATAR_COLORS)[number];
type Avatar = AgentProfile["avatar"];

const BODY: Record<Shape, string> = {
  circle: "M4 50A46 46 0 1 1 96 50A46 46 0 1 1 4 50Z",
  squircle:
    "M96.8 50C97.5 55.5 97.4 62 95.3 67.3C93.3 72.6 89.2 78.2 84.6 81.9C80 85.5 73.4 87.9 67.6 89.1C61.8 90.4 55.6 89.9 50 89.4C44.4 88.9 39.1 87.7 33.8 86C28.5 84.3 23 82.4 18.3 79.2C13.7 76 8.7 71.7 5.9 66.8C3.1 62 1.3 55.6 1.4 50C1.5 44.4 3.6 38.3 6.3 33.3C9 28.3 13.3 23.8 17.7 20.2C22 16.5 27.3 13.4 32.7 11.4C38.1 9.4 44.2 8.1 50 8.1C55.8 8.2 62 9.5 67.2 11.7C72.4 13.9 77.2 17.5 81.2 21.2C85.2 25 88.6 29.5 91.2 34.3C93.8 39.1 96.1 44.5 96.8 50Z",
  square: "M30 6H70C88 6 94 12 94 30V70C94 88 88 94 70 94H30C12 94 6 88 6 70V30C6 12 12 6 30 6Z",
  pill: "M34 19H66A31 31 0 0 1 66 81H34A31 31 0 0 1 34 19Z",
  triangle: "M35.6 28.3Q50 2 64.4 28.3L89.9 75.1Q98 90 81 90L19 90Q2 90 10.1 75.1Z",
  hex: "M42.2 5.5Q50 1 57.8 5.5L84.6 21Q92.4 25.5 92.4 34.5L92.4 65.5Q92.4 74.5 84.6 79L57.8 94.5Q50 99 42.2 94.5L15.4 79Q7.6 74.5 7.6 65.5L7.6 34.5Q7.6 25.5 15.4 21Z",
  cloud:
    "M31 80.7A20 20 0 1 1 16.7 43.4A22 22 0 0 1 53.4 22.3A19 19 0 0 1 82.3 43A20 20 0 0 1 69 80.7A24 24 0 0 1 31 80.7Z",
  drop: "M42.6 12.4Q50 3 57.4 12.4L78.2 38.7A36 36 0 1 1 21.8 38.7Z",
};

const FACE: Record<Shape, { x: number; y: number; scale: number }> = {
  circle: { x: 66, y: 40, scale: 1.1 },
  squircle: { x: 64, y: 42, scale: 1.1 },
  square: { x: 66, y: 40, scale: 1.1 },
  pill: { x: 64, y: 46, scale: 1 },
  triangle: { x: 50, y: 64, scale: 0.85 },
  hex: { x: 64, y: 42, scale: 1.1 },
  cloud: { x: 62, y: 50, scale: 1 },
  drop: { x: 57, y: 62, scale: 1 },
};

const LEGACY_COLORS = {
  blue: "#003CB2",
  violet: "#9423FC",
  green: "#00786E",
  orange: "#EEAF00",
  rose: "#BF1B4F",
  cyan: "#28B4FF",
} as const;
const WHITE_EYES = new Set<Color>([
  "#003CB2",
  "#00786E",
  "#9423FC",
  "#551491",
  "#BF1B4F",
  "#B05223",
]);

function bodyShape(preset: Preset): Shape {
  switch (preset) {
    case "square-round-eyes":
      return "square";
    case "triangle-round-eyes":
      return "triangle";
    case "pill-round-eyes":
      return "pill";
    case "squircle-wide-eyes":
      return "squircle";
    default:
      return preset;
  }
}

function bodyColor(color: Avatar["color"]): Color {
  switch (color) {
    case "blue":
    case "violet":
    case "green":
    case "orange":
    case "rose":
    case "cyan":
      return LEGACY_COLORS[color];
    default:
      return color;
  }
}

export function agentAvatarPreset(preset: Avatar["preset"]): Preset {
  switch (preset) {
    case "robot":
      return "square";
    case "sparkles":
      return "cloud";
    case "brain":
      return "squircle";
    case "briefcase":
      return "hex";
    case "code":
      return "triangle";
    case "planet":
      return "circle";
    default:
      return preset;
  }
}

export function agentAvatarEyeColor(color: Color) {
  return WHITE_EYES.has(color) ? "#FFFFFF" : "#000000";
}

export function resolveAgentAvatar(avatar: Avatar) {
  const preset = agentAvatarPreset(avatar.preset);
  const shape = bodyShape(preset);
  const color = bodyColor(avatar.color);
  const face = FACE[shape];
  const roundEyes = preset.endsWith("round-eyes");
  const wideEyes = preset.endsWith("wide-eyes");
  const eyeWidth = roundEyes ? 11 : wideEyes ? 14 : 8.4;
  const eyeHeight = roundEyes ? 11 : wideEyes ? 9 : 17.6;
  return {
    preset,
    shape,
    color,
    path: BODY[shape],
    eyeColor: agentAvatarEyeColor(color),
    eyeWidth,
    eyeHeight,
    eyeRadius: Math.min(eyeWidth, eyeHeight) / 2,
    eyes: [
      {
        side: "left",
        x: face.x - 13 * face.scale,
        y: face.y + face.scale,
        rotate: roundEyes || wideEyes ? 0 : -16,
        scale: face.scale,
      },
      {
        side: "right",
        x: face.x + 13 * face.scale,
        y: face.y - face.scale,
        rotate: roundEyes || wideEyes ? 0 : -20,
        scale: face.scale,
      },
    ],
  };
}
