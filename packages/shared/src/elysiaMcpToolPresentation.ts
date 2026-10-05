export type ElysiaMcpToolLogo = "elysia";

export interface ElysiaMcpToolPresentation {
  readonly displayName: string;
  readonly logo: ElysiaMcpToolLogo;
}

export type ElysiaMcpToolSummaryAction =
  | "work-task-list"
  | "work-task-read"
  | "work-task-create"
  | "work-task-update"
  | "work-task-delete"
  | "page-list"
  | "page-read"
  | "page-create"
  | "page-update"
  | "page-delete"
  | "capabilities"
  | "delegate"
  | "task-status"
  | "task-cancel"
  | "schedule-run"
  | "schedule-create"
  | "schedule-list"
  | "schedule-update"
  | "schedule-delete"
  | "thread-create"
  | "thread-list"
  | "thread-read"
  | "thread-send"
  | "thread-wait"
  | "thread-interrupt"
  | "thread-configuration"
  | "thread-configure"
  | "thread-fork"
  | "thread-merge"
  | "thread-search"
  | "thread-transfers"
  | "thread-organize"
  | "thread-update"
  | "queue-list"
  | "queue-read"
  | "queue-edit"
  | "queue-cancel"
  | "queue-reorder"
  | "queue-steer"
  | "question-list"
  | "question-read"
  | "question-respond"
  | "worktree-handoff"
  | "worktree-list"
  | "worktree-status"
  | "project-list"
  | "project-read"
  | "project-create"
  | "project-update"
  | "project-delete"
  | "project-clone"
  | "environment-read"
  | "environment-update"
  | "attachment-prepare"
  | "attachment-discard"
  | "attachment-send"
  | "link-pr"
  | "unlink-pr"
  | "list-prs"
  | "browser"
  | "device";

export interface ElysiaMcpToolDefinition {
  readonly displayName: string;
  readonly labels: readonly [action: string, running: string, completed: string, detail: string];
  readonly icon: "elysia" | "browser" | "device" | "pull-request";
  readonly summaryAction: ElysiaMcpToolSummaryAction;
}

function tool(
  labels: ElysiaMcpToolDefinition["labels"],
  summaryAction: ElysiaMcpToolSummaryAction,
  icon: ElysiaMcpToolDefinition["icon"] = "elysia",
  displayName = `${labels[0]} ${labels[3]}`,
): ElysiaMcpToolDefinition {
  return { displayName, labels, icon, summaryAction };
}

const ELYSIA_MCP_SERVER_ALIASES = new Set(["elysia"]);

// Cards, activity rows, summaries, and provider identity recovery share this inventory.
const ELYSIA_MCP_TOOLS: Readonly<Record<string, ElysiaMcpToolDefinition>> = {
  elysia_task_list: tool(["List", "Listing", "Listed", "tasks"], "work-task-list"),
  elysia_task_read: tool(["Read", "Reading", "Read", "a task"], "work-task-read"),
  elysia_task_create: tool(["Create", "Creating", "Created", "a task"], "work-task-create"),
  elysia_task_delete: tool(["Delete", "Deleting", "Deleted", "a task"], "work-task-delete"),
  elysia_task_update: tool(["Update", "Updating", "Updated", "a task"], "work-task-update"),
  elysia_page_list: tool(["List", "Listing", "Listed", "pages"], "page-list"),
  elysia_page_read: tool(["Read", "Reading", "Read", "a page"], "page-read"),
  elysia_page_create: tool(["Create", "Creating", "Created", "a page"], "page-create"),
  elysia_page_delete: tool(["Delete", "Deleting", "Deleted", "a page"], "page-delete"),
  elysia_page_update: tool(["Update", "Updating", "Updated", "a page"], "page-update"),
  link_pull_request: tool(
    ["Link", "Linking", "Linked", "a pull request"],
    "link-pr",
    "pull-request",
  ),
  unlink_pull_request: tool(
    ["Unlink", "Unlinking", "Unlinked", "a pull request"],
    "unlink-pr",
    "pull-request",
  ),
  list_thread_pull_requests: tool(
    ["Check", "Checking", "Checked", "linked pull requests"],
    "list-prs",
    "pull-request",
  ),
  orchestrator_capabilities: tool(
    ["Get", "Getting", "Got", "orchestration capabilities"],
    "capabilities",
  ),
  delegate_task: tool(["Delegate", "Delegating", "Delegated", "a child task"], "delegate"),
  task_status: tool(["Get", "Getting", "Got", "delegated task status"], "task-status"),
  task_cancel: tool(
    ["Cancel", "Canceling", "Requested cancellation of", "delegated task"],
    "task-cancel",
  ),
  schedule_task: tool(
    ["Schedule", "Scheduling", "Scheduled", "a recurring task"],
    "schedule-create",
  ),
  list_scheduled_tasks: tool(["List", "Listing", "Listed", "scheduled tasks"], "schedule-list"),
  update_scheduled_task: tool(
    ["Update", "Updating", "Updated", "a scheduled task"],
    "schedule-update",
  ),
  delete_scheduled_task: tool(
    ["Delete", "Deleting", "Requested deletion of", "a scheduled task"],
    "schedule-delete",
  ),
  create_threads: tool(["Create", "Creating", "Created", "Elysia chats"], "thread-create"),
  elysia_thread_start: tool(["Start", "Starting", "Started", "an Elysia chat"], "thread-create"),
  elysia_thread_list: tool(["List", "Listing", "Listed", "Elysia chats"], "thread-list"),
  elysia_thread_read: tool(["Read", "Reading", "Read", "an Elysia chat"], "thread-read"),
  elysia_thread_send: tool(["Send", "Sending", "Sent", "to an Elysia chat"], "thread-send"),
  elysia_thread_wait: tool(["Wait", "Waiting", "Waited", "for an Elysia chat"], "thread-wait"),
  elysia_thread_interrupt: tool(
    ["Interrupt", "Interrupting", "Requested an interrupt of", "an Elysia chat"],
    "thread-interrupt",
  ),
  elysia_worktree_handoff: tool(
    ["Hand off", "Handing off", "Handed off", "thread to a git worktree"],
    "worktree-handoff",
  ),
  elysia_worktree_status: tool(
    ["Get", "Getting", "Got", "thread worktree status"],
    "worktree-status",
  ),
  preview_status: tool(["Get", "Getting", "Got", "preview browser status"], "browser", "browser"),
  preview_open: tool(
    ["Open", "Opening", "Opened", "a page in the preview browser"],
    "browser",
    "browser",
  ),
  preview_navigate: tool(
    ["Navigate", "Navigating", "Navigated", "the preview browser"],
    "browser",
    "browser",
  ),
  preview_snapshot: tool(
    ["Take a snapshot of", "Taking a snapshot of", "Took a snapshot of", "the preview page"],
    "browser",
    "browser",
    "Snapshot the preview page",
  ),
  preview_click: tool(
    ["Click", "Clicking", "Clicked", "in the preview browser"],
    "browser",
    "browser",
  ),
  preview_press: tool(
    ["Press", "Pressing", "Pressed", "a key in the preview browser"],
    "browser",
    "browser",
  ),
  preview_type: tool(["Type", "Typing", "Typed", "in the preview browser"], "browser", "browser"),
  preview_scroll: tool(
    ["Scroll", "Scrolling", "Scrolled", "the preview browser"],
    "browser",
    "browser",
  ),
  preview_resize: tool(
    ["Resize", "Resizing", "Resized", "the preview browser"],
    "browser",
    "browser",
  ),
  preview_evaluate: tool(
    ["Evaluate", "Evaluating", "Evaluated", "script in the preview browser"],
    "browser",
    "browser",
  ),
  preview_wait_for: tool(
    ["Wait", "Waiting", "Waited", "for the preview page"],
    "browser",
    "browser",
  ),
  preview_set_appearance: tool(
    ["Set", "Setting", "Set", "preview browser appearance"],
    "browser",
    "browser",
  ),
  preview_recording_start: tool(
    ["Start", "Starting", "Started", "recording the preview browser"],
    "browser",
    "browser",
  ),
  preview_recording_stop: tool(
    ["Stop", "Stopping", "Stopped", "recording the preview browser"],
    "browser",
    "browser",
  ),
  device_list: tool(["List", "Listing", "Listed", "simulators and emulators"], "device", "device"),
  device_open: tool(
    ["Open", "Opening", "Opened", "a device in the Device panel"],
    "device",
    "device",
  ),
  device_screenshot: tool(
    ["Take a screenshot of", "Taking a screenshot of", "Took a screenshot of", "the device"],
    "device",
    "device",
  ),
  device_close: tool(["Close", "Closing", "Closed", "a device"], "device", "device"),
  run_scheduled_task_now: tool(
    ["Run", "Running", "Requested a run of", "a scheduled task"],
    "schedule-run",
  ),
  elysia_queue_list: tool(["List", "Listing", "Listed", "queued messages"], "queue-list"),
  elysia_queue_read: tool(["Read", "Reading", "Read", "a queued message"], "queue-read"),
  elysia_queue_edit: tool(["Edit", "Editing", "Edited", "a queued message"], "queue-edit"),
  elysia_queue_cancel: tool(
    ["Cancel", "Canceling", "Requested cancellation of", "a queued run"],
    "queue-cancel",
  ),
  elysia_queue_reorder: tool(
    ["Reorder", "Reordering", "Reordered", "a queued run"],
    "queue-reorder",
  ),
  elysia_queue_promote_to_steer: tool(
    ["Steer with", "Steering with", "Requested steering with", "a queued message"],
    "queue-steer",
  ),
  elysia_pending_request_list: tool(
    ["List", "Listing", "Listed", "pending questions"],
    "question-list",
  ),
  elysia_pending_request_read: tool(
    ["Read", "Reading", "Read", "pending questions"],
    "question-read",
  ),
  elysia_pending_request_respond: tool(
    ["Answer", "Answering", "Answered", "pending questions"],
    "question-respond",
  ),
  elysia_thread_configuration: tool(
    ["Read", "Reading", "Read", "thread configuration"],
    "thread-configuration",
  ),
  elysia_thread_configure: tool(["Set", "Setting", "Set", "thread model"], "thread-configure"),
  elysia_thread_fork: tool(
    ["Fork", "Forking", "Requested a fork of", "this thread"],
    "thread-fork",
  ),
  elysia_thread_merge_back: tool(
    ["Merge", "Merging", "Requested a merge of", "thread context"],
    "thread-merge",
  ),
  elysia_thread_search: tool(
    ["Search", "Searching", "Searched", "thread content"],
    "thread-search",
  ),
  elysia_thread_transfers: tool(
    ["Read", "Reading", "Read", "thread transfers"],
    "thread-transfers",
  ),
  elysia_thread_organize: tool(
    ["Organize", "Organizing", "Organized", "a thread"],
    "thread-organize",
  ),
  elysia_thread_update: tool(
    ["Update", "Updating", "Updated", "Elysia chat metadata"],
    "thread-update",
  ),
  elysia_worktree_list: tool(["List", "Listing", "Listed", "workspace branches"], "worktree-list"),
  elysia_preview_list: tool(["List", "Listing", "Listed", "preview tabs"], "browser", "browser"),
  elysia_preview_close: tool(["Close", "Closing", "Closed", "a preview tab"], "browser", "browser"),
  elysia_environment_read: tool(
    ["Read", "Reading", "Read", "environment preferences"],
    "environment-read",
  ),
  elysia_environment_preferences_update: tool(
    ["Update", "Updating", "Updated", "environment preferences"],
    "environment-update",
  ),
  elysia_thread_launch: tool(
    ["Launch", "Launching", "Launched", "a project thread"],
    "thread-create",
  ),
  elysia_project_list: tool(["List", "Listing", "Listed", "projects"], "project-list"),
  elysia_project_read: tool(["Read", "Reading", "Read", "a project"], "project-read"),
  elysia_project_create: tool(
    ["Register", "Registering", "Registered", "a project"],
    "project-create",
  ),
  elysia_project_update: tool(["Update", "Updating", "Updated", "a project"], "project-update"),
  elysia_project_delete: tool(["Delete", "Deleting", "Deleted", "a project"], "project-delete"),
  elysia_project_clone: tool(["Clone", "Cloning", "Cloned", "a repository"], "project-clone"),
  elysia_attachment_prepare_upload: tool(
    ["Prepare", "Preparing", "Prepared", "an attachment upload"],
    "attachment-prepare",
  ),
  elysia_attachment_discard: tool(
    ["Discard", "Discarding", "Discarded", "a pending attachment"],
    "attachment-discard",
  ),
  elysia_thread_send_attachments: tool(
    ["Send", "Sending", "Sent", "attachments"],
    "attachment-send",
  ),
};

/**
 * The Elysia orchestration tool inventory, used to gate loose name matching on
 * both the server (ACP MCP identity recovery) and the client (logo branding).
 */
export const ELYSIA_MCP_TOOL_NAMES: ReadonlySet<string> = new Set(Object.keys(ELYSIA_MCP_TOOLS));

function normalizeElysiaMcpToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

/**
 * ACP agents disagree on how the injected Elysia server prefixes its tools:
 * `mcp__elysia__x` (Claude/Cursor), `elysia.x` (Codex), plus single
 * underscore, colon, slash, dash, and space separators seen from registry
 * agents. The prefix match is deliberately loose because the display-name
 * inventory is the real gate; unknown tools stay on the generic renderer.
 */
function resolveElysiaMcpToolName(value: string): string | null {
  const label = normalizeElysiaMcpToolLabel(value);
  if (Object.hasOwn(ELYSIA_MCP_TOOLS, label)) return label;
  const mcpMatch = /^mcp__(?<server>.+?)__(?<tool>.+)$/i.exec(label);
  if (mcpMatch?.groups) {
    const { server, tool } = mcpMatch.groups;
    return server !== undefined &&
      tool !== undefined &&
      ELYSIA_MCP_SERVER_ALIASES.has(server.toLowerCase())
      ? tool
      : null;
  }

  const namespaceMatch = /^(?<server>elysia)(?:[.:/]|\s*·\s*)(?<tool>.+)$/i.exec(label);
  if (namespaceMatch?.groups) {
    return namespaceMatch.groups.tool ?? null;
  }

  const prefixed = /^(?:mcp[-_]{1,2})?elysia(?:__|[-_.:/ ])(?<tool>.+)$/i.exec(label);
  const candidate = prefixed?.groups?.tool ?? label;
  return Object.hasOwn(ELYSIA_MCP_TOOLS, candidate) ? candidate : null;
}

export function resolveElysiaMcpToolDefinition(
  toolName: string | null | undefined,
): ElysiaMcpToolDefinition | null {
  const name = toolName == null ? null : resolveElysiaMcpToolName(toolName);
  return name !== null && Object.hasOwn(ELYSIA_MCP_TOOLS, name) ? ELYSIA_MCP_TOOLS[name]! : null;
}

export function resolveElysiaMcpToolPresentation(
  toolName: string | null | undefined,
): ElysiaMcpToolPresentation | null {
  const definition = resolveElysiaMcpToolDefinition(toolName);
  return definition === null ? null : { displayName: definition.displayName, logo: "elysia" };
}

export function resolveElysiaMcpToolSummaryAction(
  toolName: string | null | undefined,
): ElysiaMcpToolSummaryAction | null {
  return resolveElysiaMcpToolDefinition(toolName)?.summaryAction ?? null;
}
