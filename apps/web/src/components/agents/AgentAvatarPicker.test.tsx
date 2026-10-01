// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  AGENT_AVATAR_COLORS,
  AgentAvatar,
  agentAvatarGlyphColor,
  type AgentAvatarValue,
} from "./AgentAvatar";
import { AgentAvatarPicker } from "./AgentAvatarPicker";

let root: Root;
let host: HTMLDivElement;
function Editor({ initial }: { initial: AgentAvatarValue }) {
  const [avatar, setAvatar] = useState(initial);
  return (
    <>
      <div data-preview>
        <AgentAvatar avatar={avatar} />
      </div>
      <AgentAvatarPicker avatar={avatar} onChange={setAvatar} />
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("offers the 15 supplied swatches and applies icon/color changes to the avatar", async () => {
  await act(async () => root.render(<Editor initial={{ preset: "robot", color: "#28B4FF" }} />));
  const swatches = [...host.querySelectorAll<HTMLButtonElement>('[aria-label^="Color "]')];
  expect(swatches.map((button) => button.getAttribute("aria-label")!.slice(6))).toEqual([
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
  ]);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Brain"]')!.click());
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Color #C9FCED"]')!.click(),
  );
  expect(host.querySelector('[aria-label="Brain"]')!.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector('[aria-label="Color #C9FCED"]')!.getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(host.querySelector<HTMLElement>("[data-preview] > span")!.style.backgroundColor).toBe(
    "rgb(201, 252, 237)",
  );
  expect(host.querySelector<SVGElement>("[data-preview] svg")!.style.color).toBe("rgb(0, 0, 0)");
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Color #003CB2"]')!.click(),
  );
  expect(host.querySelector<SVGElement>("[data-preview] svg")!.style.color).toBe(
    "rgb(255, 255, 255)",
  );
});

it("keeps a legacy named avatar unchanged until a supplied color is selected", async () => {
  await act(async () => root.render(<Editor initial={{ preset: "brain", color: "violet" }} />));
  const preview = host.querySelector<HTMLElement>("[data-preview] > span")!;
  expect(preview.className).toContain("text-violet-600");
  expect(preview.style.backgroundColor).toBe("");
  expect(host.querySelector('[aria-label="Avatar color"] [aria-pressed="true"]')).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Planet"]')!.click());
  expect(preview.className).toContain("text-violet-600");
});

it("maintains accessible glyph contrast across every supplied background", () => {
  function luminance(hex: string) {
    const channels = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  }
  for (const color of AGENT_AVATAR_COLORS) {
    const background = luminance(color);
    const foreground = luminance(agentAvatarGlyphColor(color));
    expect(
      (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05),
      color,
    ).toBeGreaterThanOrEqual(4.5);
  }
});
