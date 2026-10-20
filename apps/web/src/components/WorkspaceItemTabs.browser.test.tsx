import { act, type CSSProperties } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { WorkspaceSurfaceHeader } from "./WorkspaceSurfaceHeader";
import { WorkspaceTab, WorkspaceTabStrip } from "./workspace/WorkspaceTabStrip";

// Isolate navigation/state; the real shared strip and its overflow layout remain mounted.
vi.mock("../conversationTabsStore", () => ({ useConversationTabsStore: { getState: () => ({}) } }));
vi.mock("./chat/ConversationTabs", () => ({ ConversationTabs: () => <FixtureTabs /> }));

import { WorkspaceItemTabs } from "./WorkspaceItemTabs";

const tabs = [{ id: "pages", title: "Pages" }];
function FixtureTabs() {
  return (
    <WorkspaceTabStrip
      tabs={tabs}
      activeId="pages"
      label="Conversations"
      onSelect={() => undefined}
      onClose={() => undefined}
      renderTab={(tab, controls) => <WorkspaceTab {...controls} title={tab.title} icon={null} />}
    />
  );
}

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  await page.viewport(704, 900);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it.each([40, 52])(
  "keeps inline tabs at the %ipx topbar height without consuming the surface",
  async (height) => {
    await act(async () =>
      root.render(
        <main
          style={
            {
              display: "flex",
              flexDirection: "column",
              height: 774,
              width: "100%",
              "--workspace-topbar-height": `${height}px`,
            } as CSSProperties
          }
        >
          <WorkspaceItemTabs target={null} />
          <WorkspaceSurfaceHeader title="Pages" />
          <section aria-label="Page content" style={{ flex: 1, minHeight: 0 }} />
        </main>,
      ),
    );
    const frame = container.querySelector("main")!;
    const strip = frame.querySelector<HTMLElement>("[data-workspace-tab-strip]")!;
    const title = frame.querySelector("h1")!.closest("header")!;
    const content = frame.querySelector<HTMLElement>('section[aria-label="Page content"]')!;
    const bounds = frame.getBoundingClientRect();
    expect(strip.getBoundingClientRect().height).toBe(height);
    expect(title.getBoundingClientRect().top - bounds.top).toBe(height);
    expect(content.getBoundingClientRect().height).toBe(
      774 - height - title.getBoundingClientRect().height,
    );
    expect(content.getBoundingClientRect().bottom).toBe(bounds.bottom);
  },
);

it("still shares a bounded horizontal header with other actions", async () => {
  await act(async () =>
    root.render(
      <div style={{ width: 500, "--workspace-topbar-height": "40px" } as CSSProperties}>
        <WorkspacePageHeader>
          <FixtureTabs />
          <button type="button">Options</button>
        </WorkspacePageHeader>
      </div>,
    ),
  );
  const header = container.querySelector("header")!.getBoundingClientRect();
  const strip = container
    .querySelector<HTMLElement>("[data-workspace-tab-strip]")!
    .getBoundingClientRect();
  const action = Array.from(container.querySelectorAll("button"))
    .find((button) => button.textContent === "Options")!
    .getBoundingClientRect();
  expect(header.height).toBe(40);
  expect(strip.height).toBe(40);
  expect(strip.width).toBeGreaterThan(0);
  expect(strip.right).toBeLessThanOrEqual(action.left);
  expect(action.right).toBeLessThanOrEqual(header.right);
});
