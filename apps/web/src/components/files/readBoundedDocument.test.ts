import { afterEach, expect, it, vi } from "vite-plus/test";
import { readBoundedDocument } from "./readBoundedDocument";

afterEach(() => vi.unstubAllGlobals());

it("preserves exact document bytes at the preview limit", async () => {
  const bytes = new Uint8Array([0, 255, 128, 1]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes)),
  );
  const result = await readBoundedDocument("document", new AbortController().signal, bytes.length);
  expect(result).toBeInstanceOf(ArrayBuffer);
  expect(new Uint8Array(result)).toEqual(bytes);
});

it("cancels an unbounded response and rejects the document rather than parsing a truncated prefix", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(4));
    },
    cancel() {
      cancelled = true;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body)),
  );
  await expect(readBoundedDocument("document", new AbortController().signal, 4)).rejects.toThrow(
    "too large",
  );
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThanOrEqual(3);
});

it("rejects an oversized declared body without consuming it", async () => {
  const cancel = vi.fn();
  const getReader = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      headers: new Headers({ "content-length": "5" }),
      body: { cancel: async () => cancel(), getReader },
    })),
  );
  await expect(readBoundedDocument("document", new AbortController().signal, 4)).rejects.toThrow(
    "too large",
  );
  expect(getReader).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
});

it("cancels a pending document read when its preview closes", async () => {
  let cancelled = false;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const body = new ReadableStream<Uint8Array>(
    {
      pull() {
        markStarted();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body)),
  );
  const controller = new AbortController();
  const pending = readBoundedDocument("document", controller.signal, 4);
  await started;
  controller.abort();
  await expect(pending).rejects.toThrow("cancelled");
  expect(cancelled).toBe(true);
});
