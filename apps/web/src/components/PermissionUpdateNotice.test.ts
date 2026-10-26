import { Atom, AtomRegistry } from "effect/reactivity";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, type AuthEnvironmentScope } from "@elysiatools/contracts";
import type { AnyRouter } from "@tanstack/react-router";

type Session = {
  _tag: "Success" | "Failure";
  waiting: boolean;
  value: { authenticated: boolean; permissions: AuthEnvironmentScope[] };
};
const state = vi.hoisted(() => ({
  enabled: true,
  registry: null as AtomRegistry.AtomRegistry | null,
  identities: null as Atom.Writable<
    ReadonlyArray<{ environmentId: EnvironmentId; label: string }>
  > | null,
  sessions: new Map<EnvironmentId, Atom.Writable<Session>>(),
  storage: new Map<string, boolean>(),
  add: vi.fn((_notice: unknown) => "notice"),
  close: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@elysiatools/contracts", async (original) => ({
  ...(await original<typeof import("@elysiatools/contracts")>()),
  get CONNECTIONS_ENABLED() {
    return state.enabled;
  },
}));
vi.mock("../rpc/atomRegistry", () => ({
  get appAtomRegistry() {
    return state.registry;
  },
}));
vi.mock("../state/presentation", () => ({
  environmentSummaries: {
    get identitiesAtom() {
      return state.identities;
    },
  },
}));
vi.mock("../state/session", () => ({
  environmentSession: { sessionStateAtom: (id: EnvironmentId) => state.sessions.get(id)! },
}));
vi.mock("../hooks/useLocalStorage", () => ({
  getLocalStorageItem: (key: string) => state.storage.get(key),
  setLocalStorageItem: (key: string, value: boolean) => state.storage.set(key, value),
}));
vi.mock("./ui/toast", () => ({ toastManager: { add: state.add, close: state.close } }));
import { startPermissionUpdateNotices } from "./PermissionUpdateNotice";

const id = EnvironmentId.make("work");
const router = { navigate: state.navigate } as unknown as AnyRouter;
const readSession = (): Session => ({
  _tag: "Success",
  waiting: false,
  value: { authenticated: true, permissions: ["orchestration:operate"] },
});
beforeEach(() => {
  state.enabled = true;
  state.registry = AtomRegistry.make();
  state.identities = Atom.make<ReadonlyArray<{ environmentId: EnvironmentId; label: string }>>([
    { environmentId: id, label: "Work laptop" },
  ]);
  state.sessions.set(id, Atom.make(readSession()));
  state.storage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  state.registry?.dispose();
  state.sessions.clear();
});

it("does not subscribe or direct Elysia users to disabled pairing settings", () => {
  state.enabled = false;
  const subscribe = vi.spyOn(state.registry!, "subscribe");
  const stop = startPermissionUpdateNotices(router);
  expect(subscribe).not.toHaveBeenCalled();
  expect(state.add).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
  stop();
});
it("reacts only to settled legacy sessions and stops observing when disposed", () => {
  const session = state.sessions.get(id)!;
  state.registry!.set(session, { ...readSession(), waiting: true });
  const stop = startPermissionUpdateNotices(router);
  expect(state.add).not.toHaveBeenCalled();
  state.registry!.set(session, readSession());
  expect(state.add).toHaveBeenCalledTimes(1);
  state.registry!.set(session, readSession());
  expect(state.add).toHaveBeenCalledTimes(1);
  stop();
  const other = EnvironmentId.make("other");
  state.sessions.set(other, Atom.make(readSession()));
  state.registry!.set(state.identities!, [{ environmentId: other, label: "Other laptop" }]);
  expect(state.add).toHaveBeenCalledTimes(1);
});
it.each(["elysia", "t3code"])("retains an existing %s dismissal on upgrade", (prefix) => {
  state.storage.set(`${prefix}:permission-update:v1:${id}`, true);
  const stop = startPermissionUpdateNotices(router);
  expect(state.add).not.toHaveBeenCalled();
  stop();
});
it("persists a dismissal immediately and opens the matching connection settings", () => {
  const stop = startPermissionUpdateNotices(router);
  const notice = state.add.mock.calls[0]![0] as {
    actionProps: { onClick: () => void };
    data: { secondaryActionProps: { onClick: () => void } };
  };
  notice.data.secondaryActionProps.onClick();
  expect(state.storage.get(`elysia:permission-update:v1:${id}`)).toBe(true);
  expect(state.close).toHaveBeenCalledWith("notice");
  notice.actionProps.onClick();
  expect(state.navigate).toHaveBeenCalledWith({ to: "/settings/connections" });
  stop();
});
it("does not warn for a granular grant", () => {
  state.registry!.set(state.sessions.get(id)!, {
    ...readSession(),
    value: { authenticated: true, permissions: ["filesystem:read"] },
  });
  const stop = startPermissionUpdateNotices(router);
  expect(state.add).not.toHaveBeenCalled();
  stop();
});
