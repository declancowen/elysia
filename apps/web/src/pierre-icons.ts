import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
  type FileTreeIcons,
} from "@pierre/trees";
import { VIDEO_FILE_EXTENSIONS } from "@elysiatools/shared/video";

export interface PierreIconResolution {
  name: string;
  token?: string;
}

const PIERRE_ICON_SPRITE_ID = "t3code-pierre-file-icon-sprite";

// Phosphor regular glyphs; retain stored sprite IDs for compatibility.
const T3_FILE_ICON_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true">
<symbol id="t3-file-icon-video" viewBox="0 0 256 256"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,88h80v80H40Zm96-16V56h32V72Zm-16,0H88V56h32Zm0,112v16H88V184Zm16,0h32v16H136Zm0-16V88h80v80Zm80-96H184V56h32ZM72,56V72H40V56ZM40,184H72v16H40Zm176,16H184V184h32v16Z"></path></symbol>
<symbol id="t3-file-icon-agents" viewBox="0 0 256 256"><path d="M200,48H136V16a8,8,0,0,0-16,0V48H56A32,32,0,0,0,24,80V192a32,32,0,0,0,32,32H200a32,32,0,0,0,32-32V80A32,32,0,0,0,200,48Zm16,144a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V80A16,16,0,0,1,56,64H200a16,16,0,0,1,16,16Zm-52-56H92a28,28,0,0,0,0,56h72a28,28,0,0,0,0-56Zm-24,16v24H116V152ZM80,164a12,12,0,0,1,12-12h8v24H92A12,12,0,0,1,80,164Zm84,12h-8V152h8a12,12,0,0,1,0,24ZM72,108a12,12,0,1,1,12,12A12,12,0,0,1,72,108Zm88,0a12,12,0,1,1,12,12A12,12,0,0,1,160,108Z"></path></symbol>
<symbol id="t3-file-icon-pnpm" viewBox="0 0 256 256"><path d="M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.17a16,16,0,0,0-8.32,14v95.64a16,16,0,0,0,8.32,14l88,48.17a15.88,15.88,0,0,0,15.36,0l88-48.17a16,16,0,0,0,8.32-14V80.18A16,16,0,0,0,223.68,66.15ZM128,32l80.34,44-29.77,16.3-80.35-44ZM128,120,47.66,76l33.9-18.56,80.34,44ZM40,90l80,43.78v85.79L40,175.82Zm176,85.78h0l-80,43.79V133.82l32-17.51V152a8,8,0,0,0,16,0V107.55L216,90v85.77Z"></path></symbol>
<symbol id="t3-file-icon-file" viewBox="0 0 256 256"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"></path></symbol>
<symbol id="t3-file-icon-chevron" viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></symbol>
<symbol id="t3-file-icon-dot" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z"></path></symbol>
<symbol id="t3-file-icon-lock" viewBox="0 0 256 256"><path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"></path></symbol>
<symbol id="t3-file-icon-ellipsis" viewBox="0 0 256 256"><path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z"></path></symbol>
</svg>`;

export const T3_PIERRE_ICONS = {
  set: "complete",
  colored: true,
  spriteSheet: T3_FILE_ICON_SPRITE,
  remap: Object.fromEntries(
    ["file", "chevron", "dot", "lock", "ellipsis"].map((name) => [
      "file-tree-icon-" + name,
      { name: "t3-file-icon-" + name, width: 16, height: 16, viewBox: "0 0 256 256" },
    ]),
  ),
  byFileName: {
    "package.json": "file-tree-builtin-npm",
    "tsconfig.json": "file-tree-builtin-typescript",
    "agents.md": "t3-file-icon-agents",
    "pnpm-lock.yaml": "t3-file-icon-pnpm",
    "pnpm-workspace.yaml": "t3-file-icon-pnpm",
  },
  byFileExtension: Object.fromEntries(
    VIDEO_FILE_EXTENSIONS.map((extension) => [extension, "t3-file-icon-video"]),
  ),
} satisfies FileTreeIcons;

const completeIconResolver = createFileTreeIconResolver(T3_PIERRE_ICONS);

const LANGUAGE_EXTENSION_ALIASES: Record<string, string> = {
  bash: "sh",
  csharp: "cs",
  javascript: "js",
  jsx: "jsx",
  markdown: "md",
  mdx: "mdx",
  plaintext: "txt",
  python: "py",
  ruby: "rb",
  rust: "rs",
  shell: "sh",
  shellscript: "sh",
  swift: "swift",
  typescript: "ts",
  tsx: "tsx",
  yaml: "yml",
};

export function basenameOfPath(pathValue: string): string {
  const slashIndex = pathValue.lastIndexOf("/");
  return slashIndex === -1 ? pathValue : pathValue.slice(slashIndex + 1);
}

export function inferEntryKindFromPath(pathValue: string): "file" | "directory" {
  const base = basenameOfPath(pathValue);
  if (base.startsWith(".") && !base.slice(1).includes(".")) return "directory";
  return base.includes(".") ? "file" : "directory";
}

/** Languages whose files are recognised by name rather than by extension. */
const LANGUAGE_FILE_NAMES: Record<string, string> = {
  dockerfile: "Dockerfile",
};

export function syntheticFileNameForLanguageId(languageId: string): string {
  const normalized = languageId.toLowerCase();
  return (
    LANGUAGE_FILE_NAMES[normalized] ??
    `file.${LANGUAGE_EXTENSION_ALIASES[normalized] ?? normalized}`
  );
}

export function resolvePierreIconForEntry(
  pathValue: string,
  kind: "file" | "directory",
): PierreIconResolution | null {
  if (kind === "directory") return null;
  return completeIconResolver.resolveIcon("file-tree-icon-file", pathValue);
}

export function hasSpecificPierreIconForFileName(fileName: string): boolean {
  return resolvePierreIconForEntry(fileName, "file")?.token !== "default";
}

export function ensurePierreIconSprite(): void {
  if (typeof document === "undefined" || document.getElementById(PIERRE_ICON_SPRITE_ID)) return;
  const container = document.createElement("div");
  container.id = PIERRE_ICON_SPRITE_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.position = "absolute";
  container.style.width = "0";
  container.style.height = "0";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.innerHTML = `${getBuiltInSpriteSheet("complete")}${T3_FILE_ICON_SPRITE}`;
  document.body.prepend(container);
}
