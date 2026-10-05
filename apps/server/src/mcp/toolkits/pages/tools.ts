import {
  OrchestratorMcpFailure,
  Page,
  PageListResult,
  PageLookupInput,
  PageMutationResult,
  PageSaveInput,
  PageDeleteResult,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";
import * as PageService from "../../../pages/PageService.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagement.ThreadManagementService,
    PageService.PageService,
  ],
};
const list = Tool.make("elysia_page_list", {
  ...shared,
  success: PageListResult,
  description:
    "List the user's pages in this environment, with titles, optional project links and revisions. Read a page to get its content.",
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const read = Tool.make("elysia_page_read", {
  ...shared,
  parameters: PageLookupInput,
  success: PageMutationResult,
  description:
    "Read a page's rich-text HTML content and revision. Use this revision when updating to protect newer edits.",
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const create = Tool.make("elysia_page_create", {
  ...shared,
  parameters: Schema.Struct({
    title: Page.fields.title,
    content: PageSaveInput.fields.content,
    projectId: PageSaveInput.fields.projectId,
  }),
  success: PageMutationResult,
  description:
    "Create a personal page. Content is rich-text HTML: paragraphs, headings, bold, italic, lists, links, blockquotes and code blocks. No team or collaboration settings. Omit projectId for No project.",
}).annotate(Tool.Destructive, true);
const update = Tool.make("elysia_page_update", {
  ...shared,
  parameters: Schema.Struct({
    ...PageSaveInput.fields,
    id: PageLookupInput.fields.id,
    expectedRevision: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  success: PageMutationResult,
  description:
    "Update a page. Read it first and send expectedRevision; concurrent changes are rejected rather than overwritten. Omitted fields stay unchanged. Content is rich-text HTML; projectId:null removes the project link.",
}).annotate(Tool.Destructive, true);
const remove = Tool.make("elysia_page_delete", {
  ...shared,
  parameters: PageLookupInput,
  success: PageDeleteResult,
  description:
    "Permanently delete a page from the app. Only do this when the user asks to delete it.",
}).annotate(Tool.Destructive, true);
export const PagesToolkit = Toolkit.make(list, read, create, update, remove);
