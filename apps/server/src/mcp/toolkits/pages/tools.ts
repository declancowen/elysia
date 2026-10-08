import {
  OrchestratorMcpFailure,
  Page,
  PageListResult,
  PageLookupInput,
  PageMutationResult,
  PageSaveInput,
  PageDeleteResult,
} from "@elysiatools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
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
    "List pages and folders in this environment, with titles, parent folders, project links and revisions. Read a page to get its content.",
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
    kind: PageSaveInput.fields.kind,
    parentFolderId: PageSaveInput.fields.parentFolderId,
  }),
  success: PageMutationResult,
  description:
    "Create a page or a folder (kind:folder). Set parentFolderId to place it in a folder; the highest linked ancestor determines its project. Content is rich-text HTML: paragraphs, headings, bold, italic, lists, links, blockquotes and code blocks. No team or collaboration settings. Omit projectId for No project.",
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
    "Update a page. Read it first and send expectedRevision; concurrent changes are rejected rather than overwritten. Omitted fields stay unchanged. Content is rich-text HTML; projectId:null removes a root project link. parentFolderId moves the item; moving or relinking a folder cascades its project to descendants. A linked ancestor prevents a conflicting project override.",
}).annotate(Tool.Destructive, true);
const remove = Tool.make("elysia_page_delete", {
  ...shared,
  parameters: PageLookupInput,
  success: PageDeleteResult,
  description:
    "Permanently delete a page or a folder and all of its descendant pages and folders from the app. Only do this when the user asks to delete it.",
}).annotate(Tool.Destructive, true);
export const PagesToolkit = Toolkit.make(list, read, create, update, remove);
