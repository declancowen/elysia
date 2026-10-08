import { EnvironmentId, ProjectId } from "@elysiatools/contracts";
import { scopeProjectRef } from "@elysiatools/client-runtime/environment";
import { afterEach, expect, it } from "vite-plus/test";
import {
  closeAgentDialog,
  consumeAgentEditorIntent,
  openAgentDialog,
  useAgentDialogStore,
} from "./agentDialogStore";

afterEach(closeAgentDialog);

it("keeps the original screen when switching between editor targets, and clears it when closed", () => {
  openAgentDialog();
  const create = useAgentDialogStore.getState().target!;
  expect(consumeAgentEditorIntent(create, "/settings/general?section=appearance", false)).toBe(
    true,
  );
  expect(useAgentDialogStore.getState().target).toBeNull();
  openAgentDialog(scopeProjectRef(EnvironmentId.make("local"), ProjectId.make("agent")));
  const edit = useAgentDialogStore.getState().target!;
  expect(consumeAgentEditorIntent(edit, "/agents", true)).toBe(true);
  expect(useAgentDialogStore.getState().returnHref).toBe("/settings/general?section=appearance");
  closeAgentDialog();
  expect(useAgentDialogStore.getState().returnHref).toBeNull();
});

it("does not consume a superseding edit intent or change its environment", () => {
  openAgentDialog();
  const stale = useAgentDialogStore.getState().target!;
  const ref = scopeProjectRef(EnvironmentId.make("other-environment"), ProjectId.make("same-id"));
  openAgentDialog(ref);
  expect(consumeAgentEditorIntent(stale, "/local/chat", false)).toBe(false);
  expect(useAgentDialogStore.getState().target).toEqual({ projectRef: ref });
  expect(useAgentDialogStore.getState().returnHref).toBeNull();
});

it("captures the requested agent identity before navigation", () => {
  const ref = { ...scopeProjectRef(EnvironmentId.make("local"), ProjectId.make("agent")) };
  openAgentDialog(ref);
  ref.environmentId = EnvironmentId.make("other");
  expect(useAgentDialogStore.getState().target?.projectRef?.environmentId).toBe("local");
});
