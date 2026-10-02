// @vitest-environment jsdom
import type { EnvironmentId } from "@t3tools/contracts";
import { PROJECT_FAVICON_FALLBACK_MARKER } from "@t3tools/shared/projectFavicon";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  faviconUrl: `https://environment.test/api/assets/token/project-favicon-missing`,
  lastTarget: null as unknown,
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => testState.faviconUrl }));
vi.mock("../state/assets", () => ({
  projectFaviconUrlAtom: (input: unknown) => {
    testState.lastTarget = input;
  },
}));
vi.mock("../projectIcons", async () => {
  const { createElement } = await import("react");
  return {
    DynamicIcon: (props: { name: string; className: string }) =>
      createElement("svg", { "data-icon": props.name, className: props.className }),
  };
});

import { ProjectFavicon, type ProjectFaviconProject } from "./ProjectFavicon";

function makeProject(overrides: Partial<ProjectFaviconProject> = {}): ProjectFaviconProject {
  return {
    environmentId: "environment-test" as EnvironmentId,
    workspaceRoot: "/workspace/recipe-room",
    title: "Recipe Room",
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
const render = async (project = makeProject(), className = "size-4") => {
  await act(async () => {
    root.render(<ProjectFavicon project={project} className={className} />);
  });
};
const dispatchImageEvent = async (selector: string, event: "load" | "error") => {
  const image = container.querySelector(selector);
  expect(image).not.toBeNull();
  await act(async () => {
    image!.dispatchEvent(new Event(event));
  });
};

describe("ProjectFavicon", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    testState.faviconUrl = `https://environment.test/api/assets/token/${PROJECT_FAVICON_FALLBACK_MARKER}`;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders a matching outline in the project text colour and existing badge footprint", async () => {
    await render();
    const icon = container.querySelector('svg[data-icon="chef-hat"]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("fill")).toBe("none");
    expect(icon?.querySelector("path")?.getAttribute("stroke")).toBe("currentColor");
    expect(icon?.parentElement?.className).toContain("size-4");
    expect(icon?.parentElement?.className).toContain("text-inherit");
    expect(icon?.parentElement?.style.backgroundColor).toBe("");
    expect(container.textContent).toBe("");
    expect(container.querySelector("svg text")).toBeNull();

    await render(makeProject(), "size-3.5");
    expect(container.querySelector("svg")?.parentElement?.className).toContain("size-3.5");
    expect(container.querySelector("svg")?.parentElement?.className).not.toContain("size-4");
  });

  it("updates the automatic glyph when a project is renamed and uses a folder for an unknown name", async () => {
    await render();
    await render(makeProject({ title: "Downloads" }));
    expect(container.querySelector('svg[data-icon="download"]')).not.toBeNull();
    expect(container.querySelector('svg[data-icon="chef-hat"]')).toBeNull();
    await render(makeProject({ title: "Quiet Lantern" }));
    expect(container.querySelector('svg[data-icon="folder"]')).not.toBeNull();
  });

  it("preserves an explicitly saved monogram ahead of a real favicon", async () => {
    testState.faviconUrl = "data:image/svg+xml,<svg/>";
    await render(makeProject({ projectIcon: { kind: "monogram", text: "RR", color: "rose" } }));
    expect(container.querySelector("svg text")?.textContent).toBe("RR");
    expect(container.querySelector("svg")?.classList.contains("text-rose-600")).toBe(true);
    expect(container.querySelector("img")).toBeNull();
  });

  it("preserves a saved Lucide icon and colour ahead of a real favicon", async () => {
    testState.faviconUrl = "data:image/svg+xml,<svg/>";
    await render(
      makeProject({ projectIcon: { kind: "lucide", name: "alarm-clock", color: "violet" } }),
    );
    const icon = container.querySelector('svg[data-icon="alarm-clock"]');
    expect(icon).not.toBeNull();
    expect(icon?.classList.contains("text-violet-600")).toBe(true);
    expect(container.querySelector("img")).toBeNull();
  });

  it("preserves a saved emoji ahead of a real favicon", async () => {
    testState.faviconUrl = "data:image/svg+xml,<svg/>";
    await render(makeProject({ projectIcon: { kind: "emoji", emoji: "🦄" } }));
    expect(container.textContent).toBe("🦄");
    expect(container.querySelector("img")).toBeNull();
  });

  it("replaces the outline after a real favicon loads and restores it if the image fails", async () => {
    testState.faviconUrl = "https://environment.test/api/assets/token-a/favicon.svg";
    await render();
    expect(container.querySelector('svg[data-icon="chef-hat"]')).not.toBeNull();
    await dispatchImageEvent("img.hidden", "load");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("img:not(.hidden)")?.getAttribute("src")).toBe(
      testState.faviconUrl,
    );
    await dispatchImageEvent("img:not(.hidden)", "error");
    expect(container.querySelector('svg[data-icon="chef-hat"]')).not.toBeNull();
  });

  it("keeps an older loaded favicon while a refreshed URL loads or fails", async () => {
    testState.faviconUrl = "https://environment.test/api/assets/token-a/favicon.svg";
    await render();
    await dispatchImageEvent("img.hidden", "load");
    const loadedUrl = testState.faviconUrl;
    testState.faviconUrl = "https://environment.test/api/assets/token-b/favicon.svg";
    await render();
    expect(container.querySelector("img:not(.hidden)")?.getAttribute("src")).toBe(loadedUrl);
    await dispatchImageEvent("img.hidden", "error");
    expect(container.querySelector("img:not(.hidden)")?.getAttribute("src")).toBe(loadedUrl);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("requests the saved favicon path and immediately displays a cached inline image", async () => {
    testState.faviconUrl = "data:image/svg+xml,<svg/>";
    await render(makeProject({ faviconPath: "brand/icon.svg" }));
    expect(testState.lastTarget).toEqual({
      environmentId: "environment-test",
      cwd: "/workspace/recipe-room",
      faviconPath: "brand/icon.svg",
    });
    expect(container.querySelector("img:not(.hidden)")?.getAttribute("src")).toBe(
      testState.faviconUrl,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
