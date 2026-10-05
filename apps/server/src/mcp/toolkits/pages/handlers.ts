import { OrchestratorMcpFailure, type PageError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Pages from "../../../pages/PageService.ts";
import { readCaller, readMutationCaller, unavailable } from "../../threadAccess.ts";
import { PagesToolkit } from "./tools.ts";
const failure = (error: PageError) =>
  error.code === "storage_error"
    ? unavailable()
    : new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });
const access = Effect.gen(function* () {
  yield* readCaller();
  return yield* Pages.PageService;
});
const mutation = Effect.gen(function* () {
  const { caller } = yield* readMutationCaller();
  if (caller.runtimeMode !== "full-access" || caller.interactionMode !== "default")
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Page changes require a full-access/default calling thread.",
    });
  return yield* Pages.PageService;
});
export const PagesToolkitHandlersLive = PagesToolkit.toLayer({
  t3_page_list: () =>
    access.pipe(
      Effect.flatMap((pages) => pages.list()),
      Effect.mapError((error) => (error._tag === "PageError" ? failure(error) : error)),
    ),
  t3_page_read: (input) =>
    access.pipe(
      Effect.flatMap((pages) => pages.get(input)),
      Effect.mapError((error) => (error._tag === "PageError" ? failure(error) : error)),
    ),
  t3_page_create: (input) =>
    mutation.pipe(
      Effect.flatMap((pages) => pages.save(input)),
      Effect.mapError((error) => (error._tag === "PageError" ? failure(error) : error)),
    ),
  t3_page_update: (input) =>
    mutation.pipe(
      Effect.flatMap((pages) => pages.save(input)),
      Effect.mapError((error) => (error._tag === "PageError" ? failure(error) : error)),
    ),
  t3_page_delete: (input) =>
    mutation.pipe(
      Effect.flatMap((pages) => pages.delete(input)),
      Effect.mapError((error) => (error._tag === "PageError" ? failure(error) : error)),
    ),
});
