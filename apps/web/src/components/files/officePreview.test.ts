// @vitest-environment jsdom
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import JSZip from "jszip";
import { expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vite-plus/test";
import { loadOfficePreview } from "./officePreview";

const fixture = (extension: string) => {
  const cwd = process.cwd().replaceAll("\\", "/");
  const root = cwd.endsWith("/apps/web") ? cwd : `${cwd}/apps/web`;
  return Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readFile(`${root}/src/components/files/fixtures/preview.${extension}`),
  ).pipe(Effect.provide(NodeFileSystem.layer));
};
beforeEach(() => {
  // jsdom replaces ArrayBuffer but retains Node's Uint8Array; keep file bytes in one realm.
  vi.stubGlobal("ArrayBuffer", new Uint8Array().buffer.constructor);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it.effect("renders a real Word document including its table", () =>
  fixture("docx").pipe(
    Effect.flatMap((bytes) =>
      Effect.promise(async () => {
        const model = await loadOfficePreview(bytes, "docx");
        const body = document.createElement("main");
        const styles = document.createElement("div");
        document.body.append(body, styles);
        const dispose = await model.render(body, styles, 0);
        expect(body.textContent).toContain("Local Word document content.");
        expect(body.querySelector("table")?.textContent).toContain("Value");
        dispose();
        expect(body.childNodes.length).toBe(0);
      }),
    ),
  ),
);

it.effect("renders a real PowerPoint slide and disposes its resize listener", () =>
  fixture("pptx").pipe(
    Effect.flatMap((bytes) =>
      Effect.promise(async () => {
        const disconnect = vi.fn();
        vi.stubGlobal(
          "ResizeObserver",
          class {
            observe() {}
            disconnect = disconnect;
          },
        );
        const model = await loadOfficePreview(bytes, "pptx");
        const body = document.createElement("main");
        document.body.append(body);
        const dispose = await model.render(body, document.createElement("div"), 0);
        expect(body.textContent).toContain("Elysia slide preview");
        dispose();
        expect(disconnect).toHaveBeenCalledOnce();
      }),
    ),
  ),
);

it.effect("opens an Excel workbook, preserves values and switches worksheets", () =>
  fixture("xlsx").pipe(
    Effect.flatMap((bytes) =>
      Effect.promise(async () => {
        const model = await loadOfficePreview(bytes, "xlsx");
        expect(model.sheetNames).toEqual(["Summary", "Details"]);
        const body = document.createElement("main");
        const styles = document.createElement("div");
        await model.render(body, styles, 0);
        expect(body.textContent).toContain("1234.5");
        await model.render(body, styles, 1);
        expect(body.textContent).toContain("Second worksheet");
        expect(body.textContent).not.toContain("Revenue");
      }),
    ),
  ),
);

it.effect("rejects invalid, encrypted and oversized expanded archives", () =>
  fixture("docx").pipe(
    Effect.flatMap((bytes) =>
      Effect.promise(async () => {
        await expect(loadOfficePreview(new Uint8Array([0, 1]), "docx")).rejects.toThrow("damaged");
        const view = new DataView(bytes.buffer);
        let end = bytes.length - 22;
        while (view.getUint32(end, true) !== 0x06054b50) end--;
        const central = view.getUint32(end + 16, true);
        view.setUint16(central + 8, 1, true);
        await expect(loadOfficePreview(bytes, "docx")).rejects.toThrow("Password-protected");
        view.setUint16(central + 8, 0, true);
        view.setUint32(central + 24, 101 * 1024 * 1024, true);
        await expect(loadOfficePreview(bytes, "docx")).rejects.toThrow("too large");
      }),
    ),
  ),
);

it.effect("rejects malformed presentation XML before invoking the slide renderer", () =>
  fixture("pptx").pipe(
    Effect.flatMap((bytes) =>
      Effect.promise(async () => {
        const zip = await JSZip.loadAsync(bytes);
        zip.file("ppt/slides/slide1.xml", '<broken attribute="unterminated');
        await expect(
          loadOfficePreview(await zip.generateAsync({ type: "uint8array" }), "pptx"),
        ).rejects.toThrow("damaged XML");
      }),
    ),
  ),
);

it("opens legacy Excel files and bounds worksheet rows and columns", async () => {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  const data = Array.from({ length: 600 }, (_, row) =>
    Array.from({ length: 60 }, (_, column) => `${row}:${column}`),
  );
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(data), "Legacy");
  const bytes = new Uint8Array(xlsx.write(workbook, { type: "array", bookType: "biff8" }));
  const model = await loadOfficePreview(bytes, "xls");
  const body = document.createElement("main");
  await model.render(body, document.createElement("div"), 0);
  expect(body.querySelectorAll("tr")).toHaveLength(500);
  expect(body.querySelectorAll("tr")[0]?.children).toHaveLength(50);
  expect(body.textContent).toContain("499:49");
  expect(body.textContent).not.toContain("599:59");
});
