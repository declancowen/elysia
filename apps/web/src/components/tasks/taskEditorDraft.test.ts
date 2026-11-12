import { WorkTaskSaveInput } from "@elysiatools/contracts";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import { reconcileTaskSave } from "./taskEditorDraft";

const decodeSaveInput = Schema.decodeSync(WorkTaskSaveInput);

it("adopts the normalized title without overwriting edits made while saving", () => {
  const submitted = { title: "  Follow up  ", description: "First draft" };
  const receipt = {
    title: decodeSaveInput(submitted).title!,
    description: submitted.description,
  };
  expect(reconcileTaskSave(submitted, submitted, receipt)).toEqual(receipt);
  expect(
    reconcileTaskSave({ ...submitted, description: "Second draft" }, submitted, receipt),
  ).toEqual({ title: "Follow up", description: "Second draft" });
  expect(reconcileTaskSave({ ...submitted, title: "Next title" }, submitted, receipt).title).toBe(
    "Next title",
  );
});
