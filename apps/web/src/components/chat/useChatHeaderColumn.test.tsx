// @vitest-environment jsdom
import { act, useRef, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { useChatHeaderColumn } from "./useChatHeaderColumn";

it("aligns a newly opened conversation when its column attaches after the topbar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const deliveries: Array<() => void> = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        deliveries.push(callback);
      }
      observe() {}
      disconnect() {}
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
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Conversation />));
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
    await act(async () => root.render(<Conversation inline={false} />));
    expect(header.style.width).toBe("");
    expect(header.textContent).toContain("Launch Team");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    bounds.mockRestore();
    vi.unstubAllGlobals();
  }
});
