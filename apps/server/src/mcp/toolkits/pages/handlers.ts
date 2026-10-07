import { OrchestratorMcpFailure, type PageError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Pages from "../../../pages/PageService.ts";
import { readCaller, unavailable } from "../../threadAccess.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { PagesToolkit } from "./tools.ts";
const failure = (error: PageError) =>
  error.code === "storage_error"
    ? unavailable()
    : new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });
const access = Effect.gen(function* () {
  yield* readCaller();
  return yield* Pages.PageService;
});

export const layer = McpToolAccess.toLayer(PagesToolkit, {
  elysia_page_list: McpToolAccess.reads(() =>
    access.pipe(
      Effect.flatMap((pages) => pages.list()),
      Effect.mapError((error) => (error._tag === "PageError" ? failure(error) : error)),
    ),
  ),
  elysia_page_read: McpToolAccess.reads((input) =>
    access.pipe(
      Effect.flatMap((pages) => pages.get(input)),
      Effect.mapError((error) => (error._tag === "PageError" ? failure(error) : error)),
    ),
  ),
  elysia_page_create: McpToolAccess.writesEnvironment((input) =>
    Pages.PageService.pipe(
      Effect.flatMap((pages) => pages.save(input).pipe(Effect.mapError(failure))),
    ),
  ),
  elysia_page_update: McpToolAccess.writesEnvironment((input) =>
    Pages.PageService.pipe(
      Effect.flatMap((pages) => pages.save(input).pipe(Effect.mapError(failure))),
    ),
  ),
  elysia_page_delete: McpToolAccess.writesEnvironment((input) =>
    Pages.PageService.pipe(
      Effect.flatMap((pages) => pages.delete(input).pipe(Effect.mapError(failure))),
    ),
  ),
});
