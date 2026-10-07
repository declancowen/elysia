// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { SidebarHoverPreviewProvider, useSidebarHoverPreview } from "./SidebarHoverPreview";

const state = vi.hoisted(() => ({ pinned: false, finePointer: true, href: "/one" }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { href: string }) => unknown }) => select(state),
}));
vi.mock("~/hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => (query.startsWith("(hover:") ? state.finePointer : false),
}));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (settings: { panelAnimationDurationMs: number }) => unknown) =>
    select({ panelAnimationDurationMs: 180 }),
}));
vi.mock("../ui/sidebar", () => ({
  useSidebar: () => ({ open: state.pinned }),
  Sidebar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./SidebarHoverContents", () => ({ default: () => <p>Preview items</p> }));

let root: Root;
let host: HTMLDivElement;
function Harness() {
  const hover = useSidebarHoverPreview()!;
  return (
    <>
      <button onPointerEnter={() => hover.enter("agents")} onPointerLeave={hover.leave}>
        Agents
      </button>
      <button onPointerEnter={() => hover.enter("pages")} onPointerLeave={hover.leave}>
        Pages
      </button>
    </>
  );
}
async function render(sidebarAvailable = true) {
  await act(async () =>
    root.render(
      <SidebarHoverPreviewProvider sidebarAvailable={sidebarAvailable}>
        <Harness />
      </SidebarHoverPreviewProvider>,
    ),
  );
}
async function pointer(element: Element, type: "pointerover" | "pointerout") {
  await act(() => element.dispatchEvent(new MouseEvent(type, { bubbles: true })));
}
async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTime(ms));
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.pinned = false;
  state.finePointer = true;
  state.href = "/one";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("avoids pass-by flashes, allows crossing the rail gap, and retains closing content only for its transition", async () => {
  await render();
  const button = host.querySelector("button")!;
  await pointer(button, "pointerover");
  await advance(90);
  await pointer(button, "pointerout");
  await advance(300);
  expect(host.querySelector('[role="navigation"]')).toBeNull();
  await pointer(button, "pointerover");
  await advance(180);
  const panel = host.querySelector('[role="navigation"]')!;
  expect(panel).not.toBeNull();
  expect(state.href).toBe("/one");
  expect(state.pinned).toBe(false);
  await pointer(button, "pointerout");
  await advance(90);
  await pointer(panel, "pointerover");
  await advance(300);
  expect(host.querySelector('[role="navigation"]')).not.toBeNull();
  await pointer(host.querySelector('[role="navigation"]')!, "pointerout");
  await advance(150);
  expect(host.querySelector('[role="navigation"]')?.hasAttribute("inert")).toBe(true);
  await advance(180);
  expect(host.querySelector('[role="navigation"]')).toBeNull();
});

it("suppresses all pinned previews, ignores touch, and clears immediately on navigation", async () => {
  state.pinned = true;
  await render();
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(180);
  expect(host.querySelector('[role="navigation"]')).toBeNull();
  state.pinned = false;
  state.finePointer = false;
  await render();
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(180);
  expect(host.querySelector('[role="navigation"]')).toBeNull();
  state.finePointer = true;
  await render();
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(180);
  expect(host.querySelector('[role="navigation"]')).not.toBeNull();
  state.href = "/two";
  await render();
  expect(host.querySelector('[role="navigation"]')).toBeNull();
});

it("cancels a pending preview and removes an open preview immediately when the sidebar opens", async () => {
  await render();
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(90);
  state.pinned = true;
  await render();
  await advance(300);
  expect(host.querySelector('[role="navigation"]')).toBeNull();
  state.pinned = false;
  await render();
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(180);
  expect(host.querySelector('[role="navigation"]')).not.toBeNull();
  state.pinned = true;
  await render();
  expect(host.querySelector('[role="navigation"]')).toBeNull();
  state.pinned = false;
  await render();
  expect(host.querySelector('[role="navigation"]')).toBeNull();
});

it("allows previews when the pinned sidebar is unavailable on the current surface", async () => {
  state.pinned = true;
  await render(false);
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(180);
  expect(host.querySelector('[role="navigation"]')).not.toBeNull();
});

it("shares and persists the resized width across hover sections", async () => {
  await render();
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(180);
  const handle = host.querySelector<HTMLElement>('[role="separator"]')!;
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = () => false;
  const dragEvent = (type: string, x: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    return event;
  };
  await act(() => handle.dispatchEvent(dragEvent("pointerdown", 320)));
  await act(() => handle.dispatchEvent(dragEvent("pointerup", 400)));
  expect(host.querySelector<HTMLElement>('[role="navigation"]')!.style.width).toBe("400px");
  expect(JSON.parse(localStorage.getItem("elysia.sidebar.hoverWidth")!)).toBe(400);
  await pointer(host.querySelectorAll("button")[1]!, "pointerover");
  await advance(180);
  expect(host.querySelector('[aria-label="pages sidebar preview"]')).not.toBeNull();
  expect(host.querySelector<HTMLElement>('[role="navigation"]')!.style.width).toBe("400px");
  await act(() =>
    host
      .querySelector('[role="separator"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })),
  );
  expect(JSON.parse(localStorage.getItem("elysia.sidebar.hoverWidth")!)).toBe(416);
});

it("keeps a create dialog usable outside the hover panel and closes only after leaving it", async () => {
  await render();
  await pointer(host.querySelector("button")!, "pointerover");
  await advance(180);
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  const input = document.createElement("input");
  dialog.append(input);
  document.body.append(dialog);
  input.focus();
  try {
    await pointer(host.querySelector('[role="navigation"]')!, "pointerout");
    await act(() => input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    await act(() =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    await advance(400);
    expect(host.querySelector('[role="navigation"]')?.hasAttribute("inert")).toBe(false);
  } finally {
    dialog.remove();
  }
  await act(() => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
  await advance(180);
  expect(host.querySelector('[role="navigation"]')).toBeNull();
});
