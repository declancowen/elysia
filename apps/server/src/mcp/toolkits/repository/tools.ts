import { McpCapabilityUnavailableError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import * as RepositoryInitialization from "../../../project/RepositoryInitialization.ts";
import {
  RepositoryInitializationDeniedError,
  RepositoryInitializationFailedError,
} from "../../../project/RepositoryInitialization.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const InitializeGitTool = Tool.make("initialize_git", {
  description:
    "Initialize a Git repository in this chat's project workspace using Elysia's host Git action. Use this when asked to initialize Git, including when sandboxed git init cannot write Git configuration or hooks. The workspace is resolved from this chat; no path or flags are accepted. Available only in projects outside plan mode; projectless chats and persistent agents cannot initialize Git. Existing project repositories can be initialized again safely.",
  success: Schema.Struct({ cwd: Schema.String }),
  failure: Schema.Union([
    McpCapabilityUnavailableError,
    RepositoryInitializationDeniedError,
    RepositoryInitializationFailedError,
  ]),
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    RepositoryInitialization.RepositoryInitialization,
  ],
})
  .annotate(Tool.Title, "Initialize Git in this workspace")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const RepositoryToolkit = Toolkit.make(InitializeGitTool);
