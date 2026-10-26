import type { ProviderInteractionMode } from "@elysiatools/contracts";

/**
 * Authored as self-contained sections so a provider that limits the size of
 * each instruction entry can deliver every one whole. Codex cuts the middle out
 * of any entry over 4,000 bytes, so start a new section before one gets close.
 */
export const ELYSIA_ORCHESTRATION_SECTIONS: ReadonlyArray<string> = [
  `## Elysia orchestration

Ordinary coding tasks need no Elysia tools.

- Subagents: use your native tool when the child uses your provider, a model it offers, and no settings beyond yours, and you wait in this turn (Claude \`Agent\` always with \`run_in_background:false\`; Codex \`spawn_agent\`, then wait). Use \`delegate_task\` for another provider's model, user-asked settings, a separate checkout (\`isolation:"worktree"\`), background work, or \`delegate_task\` by name. A native type running another provider's model counts too. Workflow only when asked.
- Before \`delegate_task\`, call \`orchestrator_capabilities\` once. Again only after an error or a user-named provider change. Settings go in \`target.options\`. Provider or model unavailable: say so. Never switch unasked, or fall back to native tools, Workflow, or CLIs. Never make a child's checkout in the shell or in \`task\`.
- Every new delegate review or re-check is a new \`delegate_task\` (brief, findings, objections), never a \`elysia_thread_send\`. Fix small review findings yourself; start no delegate for them. When told to proceed without a delegate, \`task_cancel\` it. Start no replacement.
- Follow a running delegate's \`next\`. Do not poll it (\`task_status\`, \`sleep\`, watchers, Monitor, ScheduleWakeup). Stop a delegate run you replace or no longer need with \`task_cancel\`, never \`elysia_thread_interrupt\` on a \`childThreadId\`.
- If you are a subagent or child, do the work yourself. Start no subagents unless your task says to.`,
  `- \`elysia_thread_launch\` and \`create_threads\` make new top-level threads, only when the user asks for a new thread. "Subagent", "delegate", and "parallel" never mean one. Worktree thread: set \`workspaceStrategy\`; shell worktrees do not bind it, and no checkout setup in its prompt. No \`workspaceStrategy\`: project root, not your worktree.
- Given a thread id, \`elysia_thread_read\` it before you answer about it.
- In your reply, a thread's first mention is its \`link\` verbatim. No \`link\`: \`[title](t3-thread://v1/<exact id>)\`. Never a plain title or bare id.
- A secret: call \`request_secret\` yourself. Pass its \`secretRef\` to a Elysia tool, or use \`delivery: "file"\` for a shell command. Never ask in chat or invent one. When asked only to schedule, \`schedule_task\` without running its prompt.
- Elysia tools may load late. Try the name once before you call it absent.`,
  `### Visuals and preview

- Asked to show a visual here: pass its HTML to \`html_preview\`, then \`html_render\`. If the visual is a file, pass that file's HTML. A screenshot on disk or a text description does not show it. Never start a server for it. Tools a web page exposes give data only. Never use them to show results. Asked for an image to post, send, or use elsewhere: a \`.png\` file and its path, never \`html_render\`.
- Never use \`preview_*\` to verify or show your own edit, even a frontend edit or an open tab. Do not repeat preview calls from an earlier turn. Use them only when the current request asks for browser work or names a page or tab. Public pages: web fetch or search unless browser work was asked; then preview tools only, no web fetch. Close a tab you opened before you reply, unless the user asked for it or uses it.`,
];

export const ELYSIA_ORCHESTRATION_INSTRUCTIONS = `

${ELYSIA_ORCHESTRATION_SECTIONS.join("\n\n")}
`;

export const ELYSIA_BROWSER_TOOL_INSTRUCTIONS = `

## Elysia browser

When browser work was asked, \`preview_*\` is the browser you share with the user: \`preview_status\` first, then \`preview_open\` if no tab can be automated. Prefer snapshot locators over coordinates. Switch browsers only if the tools are absent or \`preview_open\` says unsupported, the user asks, or two preview calls fail on one step. Then quote the error and switch.
`;

// ACP only: some ACP agents accept the injected MCP server but never expose
// its tools, so they need the terminal transport other harnesses never use.
const ELYSIA_ACP_MCP_FALLBACK_INSTRUCTIONS = `ACP fallback: if the Elysia tools are absent and \`ELYSIA_ACP_MCP_NODE\` is present, call them through the terminal: \`ELECTRON_RUN_AS_NODE=1 "$ELYSIA_ACP_MCP_NODE" \${ELYSIA_ACP_MCP_ENTRYPOINT:+"$ELYSIA_ACP_MCP_ENTRYPOINT"} acp-mcp-call orchestrator_capabilities '{}'\` (\`ELYSIA_ACP_MCP_ENTRYPOINT\` is unset for a standalone executable). Delegate with \`acp-mcp-call delegate_task '{"task":"...","target":{"providerInstanceId":"...","model":"..."},"mode":"async","clientRequestId":"..."}'\`.`;

const ELYSIA_ACP_DEFAULT_MODE_INSTRUCTIONS = `## Elysia interaction mode: Default

Prefer making reasonable assumptions and carrying out the user's request. Ask a concise question only when a missing user decision would materially change the result. Treat this mode as active until Elysia supplies a different interaction-mode instruction.`;

const ELYSIA_ACP_PLAN_MODE_INSTRUCTIONS = `## Elysia interaction mode: Plan

Investigate with read-only actions and do not edit files or otherwise execute the implementation. Resolve discoverable facts before asking questions. When the requirements are decision complete, return a concrete implementation plan and do not start implementing it. Treat this mode as active until Elysia supplies a different interaction-mode instruction.`;

export interface ElysiaAcpInstructionState {
  readonly interactionMode: ProviderInteractionMode;
  readonly hasElysiaMcp: boolean;
}

/**
 * ACP has no system/developer prompt field, so send Elysia-owned context in the
 * first user prompt and whenever the available tools or interaction mode change.
 */
export function elysiaAcpPromptWithInstructions(input: {
  readonly prompt: string;
  readonly state: ElysiaAcpInstructionState;
  readonly previousState?: ElysiaAcpInstructionState;
}): string {
  // Native slash commands must remain at the start of the prompt.
  if (input.prompt.trimStart().startsWith("/")) return input.prompt;
  if (
    input.previousState?.interactionMode === input.state.interactionMode &&
    input.previousState.hasElysiaMcp === input.state.hasElysiaMcp
  ) {
    return input.prompt;
  }
  const instructions = [
    input.state.interactionMode === "plan"
      ? ELYSIA_ACP_PLAN_MODE_INSTRUCTIONS
      : ELYSIA_ACP_DEFAULT_MODE_INSTRUCTIONS,
    ...(input.state.hasElysiaMcp
      ? [
          ELYSIA_BROWSER_TOOL_INSTRUCTIONS.trim(),
          ELYSIA_ORCHESTRATION_INSTRUCTIONS.trim(),
          ELYSIA_ACP_MCP_FALLBACK_INSTRUCTIONS,
        ]
      : []),
  ];
  return `<elysia_instructions>\n${instructions.join("\n\n")}\n</elysia_instructions>\n\n<user_request>\n${input.prompt}\n</user_request>`;
}

function prependElysiaOrchestrationInstructions(prompt: string): string {
  return `<elysia_orchestration_instructions>${ELYSIA_ORCHESTRATION_INSTRUCTIONS.trim()}</elysia_orchestration_instructions>\n\n<user_request>\n${prompt}\n</user_request>`;
}

export function elysiaOrchestrationPromptForFirstRun(input: {
  readonly prompt: string;
  readonly runOrdinal: number;
  readonly hasElysiaMcp: boolean;
}): string {
  return input.runOrdinal === 1 && input.hasElysiaMcp
    ? prependElysiaOrchestrationInstructions(input.prompt)
    : input.prompt;
}

export function elysiaOrchestrationSystemPrompt(hasElysiaMcp: boolean): string | undefined {
  return hasElysiaMcp ? ELYSIA_ORCHESTRATION_INSTRUCTIONS : undefined;
}
