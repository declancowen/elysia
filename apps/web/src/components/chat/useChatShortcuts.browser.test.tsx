import { useEffect } from "react";
import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import type { ChatComposerHandle } from "./ChatComposer";
import { useChatShortcuts, type ChatShortcutsInput } from "./useChatShortcuts";

const shortcutContext = {
  terminalFocus: false,
  terminalOpen: false,
  previewFocus: false,
  previewOpen: false,
  isWeb: true,
  isDesktop: false,
  modelPickerOpen: false,
};

const focusOnMount = (element: HTMLElement | null) => element?.focus();

// Stands in for the right panel's launcher, which needs the whole app around it. Like the
// real one it takes focus, advertises its letters in `data-surface-launcher-keys`, and
// claims one from its own window capture listener unless the key was already handled.
function Launcher(props: { keys: string; received: string[] }) {
  useEffect(() => {
    const claim = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!props.keys.toLowerCase().split("").includes(event.key.toLowerCase())) return;
      event.preventDefault();
      props.received.push(event.key);
    };
    window.addEventListener("keydown", claim, true);
    return () => window.removeEventListener("keydown", claim, true);
  }, [props.keys, props.received]);
  return (
    <div
      ref={focusOnMount}
      tabIndex={0}
      aria-label="Open a surface"
      data-surface-launcher-keys={props.keys}
    />
  );
}

// The chat's shortcut listener registers when the chat mounts, so a launcher that opens
// later registers after it. Tests mount the chat first and add the launcher by rerendering.
function Chat(props: {
  composerKeys: string[];
  launcher?: { keys: string; received: string[] };
  shortcuts?: Partial<ChatShortcutsInput>;
}) {
  useChatShortcuts({
    enabled: true,
    keybindings: [],
    scriptKeybindings: [],
    getShortcutContext: () => shortcutContext,
    threadFindActive: false,
    // Type-to-focus only calls insertTextAtEnd, so the stand-in composer implements just that.
    composerRef: {
      current: {
        insertTextAtEnd: (key: string) => {
          props.composerKeys.push(key);
          return true;
        },
      } as Partial<ChatComposerHandle> as ChatComposerHandle,
    },
    branchToolbarRef: { current: null },
    closeThreadFind: () => {},
    commands: {},
    fallback: () => undefined,
    ...props.shortcuts,
  });
  return props.launcher ? <Launcher {...props.launcher} /> : null;
}

// router: false because the chat shortcuts and the launcher stand-in never navigate.
const options = { router: false } as const;

it("leaves the launcher's letters to the launcher, in either case", async () => {
  const composerKeys: string[] = [];
  const received: string[] = [];
  await using screen = await render(<Chat composerKeys={composerKeys} />, options);
  await screen.rerender(<Chat composerKeys={composerKeys} launcher={{ keys: "BT", received }} />);

  await userEvent.keyboard("tT");

  expect(received).toEqual(["t", "T"]);
  expect(composerKeys).toEqual([]);
});

it("still types other letters into the composer while the launcher is open", async () => {
  const composerKeys: string[] = [];
  const received: string[] = [];
  await using screen = await render(<Chat composerKeys={composerKeys} />, options);
  await screen.rerender(<Chat composerKeys={composerKeys} launcher={{ keys: "BT", received }} />);

  await userEvent.keyboard("a");

  expect(composerKeys).toEqual(["a"]);
  expect(received).toEqual([]);
});

it("keeps embedded event boundaries for typing and Escape after a rerender", async () => {
  const composerKeys: string[] = [];
  const closed: string[] = [];
  const shortcuts = {
    acceptsEvent: () => false,
    threadFindActive: true,
    closeThreadFind: () => closed.push("find"),
  };
  await using screen = await render(
    <Chat composerKeys={composerKeys} shortcuts={shortcuts} />,
    options,
  );
  await userEvent.keyboard("a{Escape}");
  expect(composerKeys).toEqual([]);
  expect(closed).toEqual([]);

  await screen.rerender(
    <Chat composerKeys={composerKeys} shortcuts={{ ...shortcuts, acceptsEvent: () => true }} />,
  );
  await userEvent.keyboard("b{Escape}");
  expect(composerKeys).toEqual(["b"]);
  expect(closed).toEqual(["find"]);
});

it("leaves disabled code-workspace chords unclaimed and uses fresh command permissions", async () => {
  const received: string[] = [];
  const shortcuts: Partial<ChatShortcutsInput> = {
    acceptsCommand: () => false,
    keybindings: [
      {
        command: "terminal.toggle",
        shortcut: {
          key: "j",
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          modKey: false,
        },
      },
    ],
    commands: {
      "terminal.toggle": () => {
        received.push("terminal");
      },
    },
  };
  await using screen = await render(<Chat composerKeys={[]} shortcuts={shortcuts} />, options);
  await userEvent.keyboard("{Control>}j{/Control}");
  expect(received).toEqual([]);
  await screen.rerender(
    <Chat composerKeys={[]} shortcuts={{ ...shortcuts, acceptsCommand: () => true }} />,
  );
  await userEvent.keyboard("{Control>}j{/Control}");
  expect(received).toEqual(["terminal"]);
});
