vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../../../test/render";
import { act } from "../../../test/act";
// @vitest-environment jsdom
import { useRef, type RefObject } from "react";

import { expect, it, vi } from "vite-plus/test";
import { useChatHeaderColumn } from "./useChatHeaderColumn";

it("aligns a newly opened conversation when its column attaches after the topbar", async () => {
  const deliveries: Array<() => void> = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private targets = new Set<Element>();
      constructor(callback: ResizeObserverCallback) {
        deliveries.push(() =>
          callback(
            [...this.targets].map(
              (target) =>
                ({ target, contentRect: target.getBoundingClientRect() }) as ResizeObserverEntry,
            ),
            this as unknown as ResizeObserver,
          ),
        );
      }
      observe(target: Element) {
        this.targets.add(target);
      }
      unobserve(target: Element) {
        this.targets.delete(target);
      }
      disconnect() {
        this.targets.clear();
      }
    },
  );
  let columnRight = 884;
  const bounds = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-header")
        ? new DOMRect(312, 0, 1116, 52)
        : new DOMRect(312, 60, columnRight - 312, 598);
    });
  function Header({
    boundary,
    inline,
  }: {
    boundary: RefObject<HTMLElement | null>;
    inline: boolean;
  }) {
    const { headerRef, mainColumnWidth, mainColumnHidden } = useChatHeaderColumn(inline, boundary);
    return (
      <div ref={headerRef} data-header>
        <div data-main-header style={{ width: mainColumnWidth ?? undefined }}>
          {!mainColumnHidden && <span>Launch Team</span>}
          <button>Workspace</button>
        </div>
      </div>
    );
  }
  function Conversation({ inline = true }: { inline?: boolean }) {
    const boundary = useRef<HTMLDivElement>(null);
    return (
      <>
        <Header boundary={boundary} inline={inline} />
        <div data-chat-workspace-panels>
          <div ref={boundary} data-column />
        </div>
      </>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  await using root = await renderUi(null, { container: host, router: false });
  try {
    await act(async () => root.rerender(<Conversation />));
    const header = host.querySelector<HTMLElement>("[data-main-header]")!;
    expect(header.style.width).toBe("");
    // The real observer delivers after React has attached the later sibling.
    await act(async () => deliveries.forEach((deliver) => deliver()));
    expect(header.style.width).toBe("572px");
    expect(header.textContent).toContain("Launch Team");
    columnRight = 700;
    await act(async () => deliveries.forEach((deliver) => deliver()));
    expect(header.style.width).toBe("388px");
    host.querySelector("[data-column]")!.setAttribute("data-chat-column-maximized-away", "true");
    await act(async () => deliveries.forEach((deliver) => deliver()));
    expect(header.textContent).not.toContain("Launch Team");
    expect(header.textContent).toContain("Workspace");
    await act(async () => root.rerender(<Conversation inline={false} />));
    expect(header.style.width).toBe("");
    expect(header.textContent).toContain("Launch Team");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    bounds.mockRestore();
    vi.unstubAllGlobals();
  }
});
