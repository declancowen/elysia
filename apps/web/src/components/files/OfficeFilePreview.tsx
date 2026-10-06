import { readFilePreviewBytes } from "@t3tools/client-runtime/file-preview";
import { OFFICE_PREVIEW_MAX_BYTES, type OfficePreviewFormat } from "@t3tools/shared/filePreview";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { FileSurfaceFailure, FileSurfaceLoading, FileSurfaceNotice } from "./fileSurfaceChrome";
import { loadOfficePreview } from "./officePreview";

// Only the parent runs the trusted renderer. Document scripts, forms, frames and
// network requests are blocked inside the same-origin, script-disabled frame.
const FRAME = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'"><style>body{margin:0;background:#e5e7eb;color:#111;font:14px system-ui}#content{padding:16px}table{border-collapse:collapse;background:white}td,th{border:1px solid #ddd;padding:6px 10px;white-space:pre-wrap;min-width:64px}.slide{margin-bottom:16px}.docx-wrapper{padding:0!important}</style></head><body><div id="styles"></div><main id="content"></main></body></html>`;

export default function OfficeFilePreview(props: {
  src: string;
  name: string;
  format: OfficePreviewFormat;
  refresh?: () => Promise<string | null>;
}) {
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [document, setDocument] = useState<Awaited<ReturnType<typeof loadOfficePreview>> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [sheet, setSheet] = useState(0);
  const [revision, setRevision] = useState(0);
  const { src, format, refresh } = props;
  useEffect(() => {
    const controller = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect -- Each external file invalidates its previous preview.
    setDocument(null);
    setError(null);
    setSheet(0);
    void (async () => {
      const url = revision && refresh ? await refresh() : src;
      if (!url) throw new Error("Reconnect to the environment and try again.");
      if (controller.signal.aborted) return;
      const response = await fetch(url, {
        signal: controller.signal,
        cache: revision ? "reload" : "default",
      });
      const bytes = await readFilePreviewBytes(
        response,
        controller.signal,
        OFFICE_PREVIEW_MAX_BYTES,
      );
      const result = await loadOfficePreview(bytes, format);
      if (!controller.signal.aborted) setDocument(result);
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Could not preview this Office file.");
    });
    return () => controller.abort();
  }, [src, format, refresh, revision]);
  useEffect(() => {
    const target = frameDocument;
    if (!document || !target) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    // oxlint-disable-next-line react/set-state-in-effect -- The renderer must finish before the loading state clears.
    setRendered(false);
    const body = target.getElementById("content");
    const styles = target.getElementById("styles");
    if (!body || !styles) return;
    void document
      .render(body, styles, sheet)
      .then((cleanup) => {
        if (cancelled) cleanup();
        else {
          dispose = cleanup;
          setRendered(true);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Could not render this Office file.");
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [document, frameDocument, sheet]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {document && document.sheetNames.length > 0 ? (
        <>
          <FileSurfaceNotice>
            Read-only preview of saved values. Up to 500 rows and 50 columns per sheet.
          </FileSurfaceNotice>
          <div
            className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-1"
            aria-label="Worksheets"
          >
            {document.sheetNames.map((name, index) => (
              <Button
                key={name}
                size="sm"
                variant={index === sheet ? "secondary" : "ghost"}
                aria-pressed={index === sheet}
                onClick={() => setSheet(index)}
              >
                {name}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <iframe
        key={`${props.src}:${revision}:${sheet}`}
        title={props.name}
        srcDoc={FRAME}
        sandbox="allow-same-origin"
        className="min-h-0 flex-1 border-0"
        onLoad={(event) => setFrameDocument(event.currentTarget.contentDocument)}
        hidden={error !== null}
      />
      {error ? (
        <FileSurfaceFailure message={error} onRetry={() => setRevision((value) => value + 1)} />
      ) : !document || !rendered ? (
        <div className="absolute inset-0 flex bg-background">
          <FileSurfaceLoading />
        </div>
      ) : null}
    </div>
  );
}
