import { describe, expect, it } from "vite-plus/test";

import type { ChatAttachment, ChatImageAttachment } from "~/types";

import { uploadedSources } from "./uploadedSources";

describe("uploadedSources", () => {
  it("lists user uploads once by identity, latest first, with current attachment metadata", () => {
    const original: ChatImageAttachment = {
      type: "image",
      id: "image-1",
      name: "diagram.png",
      mimeType: "image/png",
      sizeBytes: 32,
      previewUrl: "https://assets.test/old",
    };
    const refreshed = { ...original, previewUrl: "https://assets.test/current" };
    const file: ChatAttachment = {
      type: "file",
      id: "file-1",
      name: "diagram.png",
      mimeType: "application/octet-stream",
      sizeBytes: 64,
    };
    const folder: ChatAttachment = {
      type: "folder",
      id: "folder-1",
      name: "References",
      mimeType: "application/octet-stream",
      sizeBytes: 128,
    };

    expect(
      uploadedSources([
        { role: "user", attachments: [original] },
        { role: "assistant", attachments: [{ ...file, id: "generated-file" }] },
        { role: "user" },
        { role: "user", attachments: [refreshed, file, folder] },
      ]),
    ).toEqual([refreshed, file, folder]);
    expect(uploadedSources([])).toEqual([]);
  });
});
