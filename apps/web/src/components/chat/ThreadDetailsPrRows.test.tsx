import { act } from "../../../test/act";
import { EnvironmentId, ThreadId, type ThreadPullRequestLink } from "@elysiatools/contracts";

import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

const watchCommand = vi.hoisted(() => vi.fn());

vi.mock("./ThreadDetailsPrRow", () => ({
  ThreadDetailsPrRow: ({
    number,
    onStopWatching,
  }: {
    number: number;
    onStopWatching?: () => void;
  }) => (
    <span
      data-row={String(number)}
      data-watched={onStopWatching ? "" : undefined}
      onClick={onStopWatching}
    />
  ),
}));
vi.mock("~/state/entities", () => ({ useProjects: () => [] }));
vi.mock("~/state/threads", () => ({ threadEnvironment: {} }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => watchCommand }));
vi.mock("~/lib/openPullRequestLink", () => ({
  parseChangeRequestUrl: () => null,
  findProjectOnChangeRequestHost: () => undefined,
}));

import { ThreadDetailsPrRows } from "./ThreadDetailsPrRows";

function link(
  number: number,
  headBranch: string,
  baseBranch: string,
  updatedAt: string,
): ThreadPullRequestLink {
  return {
    host: "github.com",
    repository: "pingdotgg/t3code",
    number,
    url: `https://github.com/pingdotgg/t3code/pull/${number}`,
    source: "manual",
    linkedAt: updatedAt,
    snapshot: {
      state: "open",
      title: `Change ${number}`,
      headBranch,
      baseBranch,
      isDraft: false,
      updatedAt,
      syncedAt: updatedAt,
    },
    stack: null,
  };
}

const bottom = link(1, "layer-one", "main", "2026-01-01T00:00:10.000Z");
const top = link(2, "layer-two", "layer-one", "2026-01-01T00:00:20.000Z");
const other = link(3, "unrelated", "main", "2026-01-01T00:00:05.000Z");

let renderer: ReactTestRenderer;
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

async function render(links: ReadonlyArray<ThreadPullRequestLink>, current: ThreadPullRequestLink) {
  await act(() => {
    renderer = create(
      <ThreadDetailsPrRows
        threadRef={{
          environmentId: EnvironmentId.make("environment"),
          threadId: ThreadId.make("thread"),
        }}
        links={links}
        currentLink={current}
        onOpenLink={vi.fn()}
        environmentId={EnvironmentId.make("environment")}
        pr={null}
        number={current.number}
        reference={current}
        status={null}
        project={null}
        label={`#${current.number}`}
        openAriaLabel="Open pull request"
        onOpen={vi.fn()}
      />,
    );
  });
}

const rows = () => renderer.root.findAllByType("span").map((node) => node.props["data-row"]);
const toggleLabel = () =>
  renderer.root
    .findAllByType("button")
    .at(-1)
    ?.children.filter((child) => typeof child === "string")
    .join("");

async function toggle() {
  await act(() => {
    (renderer.root.findAllByType("button").at(-1)!.props as { onClick: () => void }).onClick();
  });
}

it("shows only the current pull request until the rest are asked for", async () => {
  await render([other, bottom, top], top);
  expect(rows()).toEqual(["2"]);
  expect(toggleLabel()).toBe("Show 2 more");

  await toggle();
  expect(rows()).toEqual(["2", "1", "3"]);
  expect(toggleLabel()).toBe("Show less");

  await toggle();
  expect(rows()).toEqual(["2"]);
  expect(toggleLabel()).toBe("Show 2 more");
});

it("keeps the single row untouched when the thread links one pull request", async () => {
  await render([bottom], bottom);
  expect(rows()).toEqual(["1"]);
  expect(toggleLabel()).toBeUndefined();
});

it("lets only watched pull requests stop their watch", async () => {
  const watched: ThreadPullRequestLink = {
    ...bottom,
    watch: {
      startedAt: "2026-01-01T00:00:30.000Z",
      headSha: null,
      failedChecks: [],
      passed: false,
      passedChecks: [],
      remarksThrough: "2026-01-01T00:00:30.000Z",
      remarkIds: [],
      conflicting: false,
      wakes: 0,
    },
  };
  await render([other, watched, top], top);
  await toggle();
  const spans = renderer.root.findAllByType("span");
  expect(
    spans
      .filter((node) => node.props["data-watched"] !== undefined)
      .map((node) => node.props["data-row"]),
  ).toEqual(["1"]);

  await act(() => spans.find((node) => node.props["data-row"] === "1")!.props.onClick());
  expect(watchCommand).toHaveBeenCalledWith({
    environmentId: EnvironmentId.make("environment"),
    input: {
      threadId: ThreadId.make("thread"),
      host: "github.com",
      repository: "pingdotgg/t3code",
      number: 1,
      watching: false,
    },
  });
});
