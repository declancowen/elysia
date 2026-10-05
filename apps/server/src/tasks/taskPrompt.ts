import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { ComposerContextId, type WorkTask } from "@t3tools/contracts";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";

function descriptionText(description: string): string {
  // API callers can supply plain text as well as the editor's HTML.
  if (!/^\s*<(p|h[1-6]|div|ul|ol|blockquote|pre|hr)\b/i.test(description))
    return description.trim();
  const text = (node: DefaultTreeAdapterTypes.ChildNode): string => {
    if ("value" in node) return node.value;
    if (!("tagName" in node) || ["script", "style"].includes(node.tagName)) return "";
    const body = node.childNodes.map(text).join("");
    if (node.tagName === "br") return "\n";
    if (node.tagName === "hr") return "\n\n---\n\n";
    if (node.tagName === "a") {
      const href = node.attrs.find((attr) => attr.name === "href")?.value;
      return href && href !== body ? `${body} (${href})` : body;
    }
    if (node.tagName === "li") {
      const checked = node.attrs.find((attr) => attr.name === "data-checked")?.value;
      const marker = checked === undefined ? "-" : checked === "true" ? "- [x]" : "- [ ]";
      return `${marker} ${body.trim()}\n`;
    }
    return /^(p|h[1-6]|div|ul|ol|blockquote|pre)$/.test(node.tagName) ? `\n\n${body}\n\n` : body;
  };
  return parseFragment(description)
    .childNodes.map(text)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function taskPrompt(task: Pick<WorkTask, "id" | "title" | "description">): string {
  return [
    `Work on ${formatComposerContextReference({
      kind: "task",
      contextId: ComposerContextId.make(task.id),
      label: task.title,
    })}`,
    descriptionText(task.description),
    "Read this task in Elysia and update its progress. Mark it done only when the work is complete.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
