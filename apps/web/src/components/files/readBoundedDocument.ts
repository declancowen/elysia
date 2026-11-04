import { readFilePreviewBytes } from "@elysiatools/client-runtime/file-preview";

export async function readBoundedDocument(
  src: string,
  signal: AbortSignal,
  limit: number,
  cache: RequestCache = "default",
) {
  const response = await fetch(src, { signal, cache });
  if (Number(response.headers.get("content-length")) > limit) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("This file is too large to preview.");
  }
  const bytes = await readFilePreviewBytes(response, signal, limit);
  if (bytes.byteLength > limit) throw new Error("This file is too large to preview.");
  return bytes.buffer;
}
