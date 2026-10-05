import { expect, it } from "vite-plus/test";
import { applyWorkspaceBulkAction } from "./WorkspaceBulkActions";

it("continues after a failed mutation and only clears successfully changed selections", async () => {
  const attempts: string[] = [];
  const items = ["parent", "child", "other"].map((id) => ({ id, title: id }));
  const result = await applyWorkspaceBulkAction(items, async (item) => {
    attempts.push(item.id);
    if (item.id === "child") throw new Error("This item has newer edits");
  });
  expect(attempts).toEqual(["parent", "child", "other"]);
  expect([...result.completed]).toEqual(["parent", "other"]);
  expect(result.failures).toEqual(["child: This item has newer edits"]);
  expect(items.filter((item) => !result.completed.has(item.id)).map((item) => item.id)).toEqual([
    "child",
  ]);
});
