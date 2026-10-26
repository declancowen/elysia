import { act } from "../../../test/act";
import { SourceControlProviderKind } from "@elysiatools/contracts";
import { EnvironmentId, ProjectId, type PullRequestDetailView } from "@elysiatools/contracts";
import { type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/state/pullRequests", () => ({ pullRequestEnvironment: {} }));
vi.mock("~/browser/useOpenLink", () => ({ useOpenLink: () => vi.fn() }));
vi.mock("./PullRequestMarkdown", () => ({
  PullRequestMarkdown: ({ text }: { text: string }) => <p>{text}</p>,
}));
vi.mock("../ui/menu", () => ({
  Menu: "div",
  MenuCheckboxItem: "div",
  MenuGroup: "div",
  MenuGroupLabel: "div",
  MenuPopup: "div",
  MenuTrigger: "div",
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipPopup: () => null,
}));

import { PullRequestSummaryTab } from "./PullRequestSummaryTab";

const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/workspace",
  repository: "owner/repo",
  number: 1,
  title: "Test pull request",
  body: "Original description",
  url: "https://github.com/owner/repo/pull/1",
  author: { login: "author", name: null, avatarUrl: null },
  viewer: "author",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  headBranch: "feature",
  baseBranch: "main",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [{ name: "Unit tests", status: "success", description: null, url: null }],
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [],
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: true,
    search: true,
    actions: [],
    mergeMethods: [],
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
    reviewers: { request: false, listCandidates: false },
    edit: { changeRequest: true, comment: true },
  },
  viewerPermissions: {
    actions: [],
    comment: true,
    resolve: false,
    verdicts: [],
    requestReviewers: false,
  },
};

let renderer: ReactTestRenderer;
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    }),
  );
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

function render(value = detail) {
  return (
    <PullRequestSummaryTab
      scrollerRef={() => {}}
      environmentId={EnvironmentId.make("environment")}
      threadRef={null}
      reference={value}
      detail={value}
      activityPending={false}
      activityError={null}
      onRefresh={() => {}}
    />
  );
}

function heading(title: string) {
  const section = renderer.root
    .findAllByType("section")
    .find((section) => section.props["aria-label"] === title)!;
  return section
    .findAllByType("button")
    .find((button) => button.findAllByType("span").some((span) => span.children.includes(title)))!;
}

async function click(title: string) {
  await act(() =>
    heading(title).props.onClick({ nativeEvent: {}, preventDefault() {}, stopPropagation() {} }),
  );
}

it("toggles checks from their heading and resets sections for another pull request", async () => {
  await act(() => {
    renderer = create(render());
  });
  expect(
    renderer.root.findAllByType("span").some((span) => span.children.includes("Unit tests")),
  ).toBe(false);
  await click("Checks");
  expect(
    renderer.root.findAllByType("span").some((span) => span.children.includes("Unit tests")),
  ).toBe(true);
  await click("Checks");
  expect(heading("Checks").props["aria-expanded"]).toBe(false);
  await click("Checks");
  await click("Description");
  await act(() =>
    renderer.update(render({ ...detail, url: "https://github.com/owner/repo/pull/2", number: 2 })),
  );
  expect(heading("Checks").props["aria-expanded"]).toBe(false);
  expect(heading("Description").props["aria-expanded"]).toBe(true);
});

it("keeps an unsaved description when collapsed and reopened", async () => {
  await act(() => {
    renderer = create(render());
  });
  await act(() => renderer.root.findByProps({ "aria-label": "Edit description" }).props.onClick());
  await act(() =>
    renderer.root.findByType("textarea").props.onChange({
      target: { value: "Unsaved description" },
      currentTarget: { value: "Unsaved description" },
      nativeEvent: {},
    }),
  );
  await click("Description");
  expect(heading("Description").props["aria-expanded"]).toBe(false);
  await click("Description");
  expect(renderer.root.findByType("textarea").props.value).toBe("Unsaved description");
});

function texts() {
  return renderer.root
    .findAllByType("p")
    .map((p) => p.children.join(""))
    .filter((text) => text !== detail.body);
}

function filterItem(label: string) {
  return renderer.root.find(
    (node) => typeof node.props.onCheckedChange === "function" && node.children.includes(label),
  );
}

it("hides bot and resolved comments until the filter shows them, and remembers the choice", async () => {
  const comment = (index: number, login: string, body: string, isBot = false) => ({
    id: `comment-${index}`,
    kind: "issue-comment" as const,
    author: { login, name: null, avatarUrl: null, isBot },
    body,
    createdAt: `2026-09-01T00:00:${String(index).padStart(2, "0")}Z`,
    url: null,
    path: null,
    reviewState: null,
  });
  const resolved = {
    ...comment(13, "reviewer", "Resolved remark"),
    kind: "review-comment" as const,
  };
  const value: PullRequestDetailView = {
    ...detail,
    commentCount: 14,
    comments: [
      ...Array.from({ length: 12 }, (_, index) =>
        comment(index, "review-app", `Bot report ${index}`, true),
      ),
      comment(12, "human", "Human comment"),
      resolved,
    ],
    reviewThreads: [
      {
        id: "thread",
        path: "src/index.ts",
        line: 1,
        side: "right",
        isResolved: true,
        isOutdated: false,
        comments: [resolved],
      },
    ],
  };
  await act(() => {
    renderer = create(render(value));
  });
  expect(texts()).toEqual(["Human comment"]);
  expect(
    renderer.root.findByProps({ "aria-label": "Filter comments" }).children.join(""),
  ).toContain("13 hidden");

  await act(() => filterItem("Bot comments").props.onCheckedChange(true));
  // Bots now share the human comment's pages: the ten most recent, the oldest left behind.
  expect(texts().filter((text) => text.startsWith("Bot report"))).toHaveLength(9);
  expect(texts()).toContain("Human comment");
  expect(texts()).not.toContain("Bot report 0");

  await act(() => filterItem("Resolved or dismissed").props.onCheckedChange(true));
  expect(
    renderer.root.findAllByType("button").some((button) => button.children.includes("Resolved")),
  ).toBe(true);

  // Another pull request, or the same one opened again, keeps the reader's choice.
  await act(() => renderer.unmount());
  await act(() => {
    renderer = create(render({ ...value, url: `${value.url}0`, number: 10 }));
  });
  expect(filterItem("Bot comments").props.checked).toBe(true);
  expect(texts()).toContain("Bot report 11");
});
