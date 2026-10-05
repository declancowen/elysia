import * as Schema from "effect/Schema";
import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const PageId = TrimmedNonEmptyString.check(Schema.isPattern(/^page-[0-9a-f-]{36}$/)).pipe(
  Schema.brand("PageId"),
);
export type PageId = typeof PageId.Type;
const title = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const content = Schema.String.check(Schema.isMaxLength(512_000)).annotate({
  description:
    "Rich-text HTML document content, including paragraphs, headings, marks, lists and code blocks.",
});
export const PageSummary = Schema.Struct({
  id: PageId,
  title,
  projectId: Schema.NullOr(ProjectId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type PageSummary = typeof PageSummary.Type;
export const Page = Schema.Struct({ ...PageSummary.fields, content });
export type Page = typeof Page.Type;
export const PageListInput = Schema.Struct({});
export const PageListResult = Schema.Struct({ pages: Schema.Array(PageSummary) });
export type PageListResult = typeof PageListResult.Type;
export const PageLookupInput = Schema.Struct({ id: PageId });
export type PageLookupInput = typeof PageLookupInput.Type;
export const PageSaveInput = Schema.Struct({
  id: Schema.optional(PageId),
  title: Schema.optional(title),
  content: Schema.optional(content),
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  expectedRevision: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
});
export type PageSaveInput = typeof PageSaveInput.Type;
export const PageMutationResult = Schema.Struct({ page: Page });
export type PageMutationResult = typeof PageMutationResult.Type;
export const PageDeleteResult = PageLookupInput;
export class PageError extends Schema.TaggedError<PageError>()("PageError", {
  code: Schema.Literals(["not_found", "conflict", "invalid_request", "storage_error"]),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
