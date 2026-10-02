// ponytail: keyword-only matches; extend these aliases when real project names need another glyph.
const ICON_MATCHES = [
  ["chef-hat", /\b(recipes?|cooking|cook|kitchen|food|meals?|restaurant)\b/],
  ["download", /\b(downloads?|downloads?er)\b/],
  ["book-open", /\b(docs?|documentation|books?|notes?|writing)\b/],
  ["database", /\b(database|db|data|analytics)\b/],
  ["globe", /\b(web|website|sites?|browser)\b/],
  ["image", /\b(images?|photos?|pictures?|design|art)\b/],
  ["music", /\b(music|audio|podcasts?)\b/],
  ["bot", /\b(agents?|ai|bots?)\b/],
  ["smartphone", /\b(mobile|ios|android|phone|app)\b/],
  ["server", /\b(server|backend|api)\b/],
  ["code-2", /\b(code|coding|dev|development|repo|repository)\b/],
] as const;

export type AutomaticProjectIconName = (typeof ICON_MATCHES)[number][0] | "folder";

const iconCache = new Map<string, { readonly name: AutomaticProjectIconName }>();
const CACHE_LIMIT = 256;

/** Matches local library glyphs once per normalized name; renamed projects resolve afresh. */
export function resolveAutomaticProjectIcon(projectName: string) {
  const normalized = projectName
    .normalize("NFKC")
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1 $2")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const cached = iconCache.get(normalized);
  if (cached) return cached;
  const name = ICON_MATCHES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "folder";
  const resolved = { name } as const;
  if (iconCache.size >= CACHE_LIMIT) iconCache.delete(iconCache.keys().next().value!);
  iconCache.set(normalized, resolved);
  return resolved;
}
