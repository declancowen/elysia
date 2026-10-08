import {
  OFFICE_PREVIEW_MAX_BYTES,
  type OfficePreviewFormat,
} from "@elysiatools/shared/filePreview";

/** Bound expanded Office archives before handing them to a renderer. */
function validateOfficePreview(bytes: Uint8Array, format: OfficePreviewFormat) {
  if (bytes.length > OFFICE_PREVIEW_MAX_BYTES)
    throw new Error("Office previews are limited to 25 MB. Open this file in another app.");
  if (format === "xls") {
    if (
      ![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
        (byte, index) => bytes[index] === byte,
      )
    )
      throw new Error("This is not a supported Excel file.");
    return;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.length
    )
      break;
  }
  if (end < 0 || end < bytes.length - 65557)
    throw new Error("This Office file is damaged or encrypted.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let expanded = 0;
  let slides = 0;
  if (count > 2000) throw new Error("This Office file is too complex to preview.");
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("This Office file is damaged.");
    if (view.getUint16(offset + 8, true) & 1)
      throw new Error("Password-protected Office files cannot be previewed.");
    expanded += view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const next =
      offset +
      46 +
      nameLength +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
    if (next > end) throw new Error("This Office file is damaged.");
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) slides++;
    offset = next;
  }
  if (expanded > 100 * 1024 * 1024 || slides > 100)
    throw new Error("This Office file is too large to preview. Open it in another app.");
}

/** Vendor parsing stays local to the file viewer and loads on demand. */
export async function loadOfficePreview(bytes: Uint8Array, format: OfficePreviewFormat) {
  validateOfficePreview(bytes, format);
  const buffer = new Uint8Array(bytes).buffer;
  if (format === "xlsx" || format === "xls") {
    const xlsx = await import("xlsx");
    const workbook = xlsx.read(buffer, { type: "array", sheetRows: 501, cellHTML: false });
    if (workbook.SheetNames.length === 0) throw new Error("This workbook has no worksheets.");
    return {
      sheetNames: workbook.SheetNames,
      render: async (body: HTMLElement, _styles: HTMLElement, sheetIndex: number) => {
        const sheet = workbook.Sheets[workbook.SheetNames[sheetIndex]!];
        if (!sheet) throw new Error("This worksheet is unavailable.");
        const range = xlsx.utils.decode_range(sheet["!ref"] ?? "A1");
        // ponytail: bounded read-only table; add virtualization if larger interactive sheets are needed.
        range.e.r = Math.min(range.e.r, range.s.r + 499);
        range.e.c = Math.min(range.e.c, range.s.c + 49);
        body.innerHTML = xlsx.utils.sheet_to_html(
          { ...sheet, "!ref": xlsx.utils.encode_range(range) },
          { header: "", footer: "" },
        );
        return () => body.replaceChildren();
      },
    };
  }
  if (format === "docx") {
    const docx = await import("docx-preview");
    return {
      sheetNames: [] as string[],
      render: async (body: HTMLElement, styles: HTMLElement) => {
        await docx.renderAsync(buffer, body, styles, {
          useBase64URL: true,
          ignoreFonts: true,
          ignoreWidth: true,
          renderAltChunks: false,
        });
        return () => {
          body.replaceChildren();
          styles.replaceChildren();
        };
      },
    };
  }
  const { pptxToHtml } = await import("@jvmr/pptx-to-html");
  const slides = await pptxToHtml(buffer, {
    domParserFactory: () => ({
      parseFromString: (xml) => {
        const document = new DOMParser().parseFromString(xml, "application/xml");
        if (document.getElementsByTagName("parsererror").length)
          throw new Error("This presentation contains damaged XML.");
        return document;
      },
    }),
  });
  if (!slides.length) throw new Error("This presentation has no slides.");
  return {
    sheetNames: [] as string[],
    render: async (body: HTMLElement) => {
      body.innerHTML = slides.join("\n");
      const width = Number.parseFloat((body.firstElementChild as HTMLElement).style.width);
      const fit = () => {
        body.style.zoom = String(
          Math.min(1, Math.max(240, body.ownerDocument.documentElement.clientWidth - 32) / width),
        );
      };
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(body.ownerDocument.documentElement);
      return () => {
        observer.disconnect();
        body.replaceChildren();
      };
    },
  };
}
