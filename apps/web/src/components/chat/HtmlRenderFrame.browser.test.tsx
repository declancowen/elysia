import { EnvironmentId } from "@elysiatools/contracts";
import {
  htmlRenderTheme,
  HTML_RENDER_DEFAULT_FONTS,
  injectHtmlRenderBootstrap,
} from "@elysiatools/shared/htmlRender";
import { ELYSIA_DARK_THEME_COLORS } from "@elysiatools/shared/themePalettes";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";

const asset = vi.hoisted(() => ({ url: "about:blank" }));
vi.mock(import("~/assets/longLivedAssetUrls"), () => ({
  useLongLivedAssetUrl: () => ({
    _tag: "Success",
    url: asset.url,
    expiresAt: Date.now() + 60 * 60_000,
  }),
}));
vi.mock(import("~/hooks/useHtmlRenderTheme"), async (original) => ({
  ...(await original()),
  useHtmlRenderTheme: () =>
    htmlRenderTheme(ELYSIA_DARK_THEME_COLORS, "dark", HTML_RENDER_DEFAULT_FONTS),
}));

vi.mock(import("~/assets/assetUrls"), async (original) => ({
  ...(await original()),
  useAssetUrlRefresh: () => async () => asset.url,
}));

import { HtmlRenderFrame } from "./HtmlRenderFrame";

describe("HtmlRenderFrame", () => {
  it("reports leaving full screen when it unmounts while expanded", async () => {
    asset.url = "about:blank";
    const onFullscreenChange = vi.fn();
    await using screen = await render(
      <HtmlRenderFrame
        environmentId={EnvironmentId.make("environment")}
        htmlRender={{ attachmentId: "attachment", title: "Report", height: 200 }}
        threadRef={undefined}
        onFullscreenChange={onFullscreenChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open full screen" }));
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);

    await screen.unmount();
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });
  it("grows past the agent's height to fit the page the client lays out", async () => {
    const url = URL.createObjectURL(
      new Blob([injectHtmlRenderBootstrap('<div style="height:2345px"></div>')], {
        type: "text/html",
      }),
    );
    using _url = {
      [Symbol.dispose]() {
        URL.revokeObjectURL(url);
      },
    };
    asset.url = url;
    await using screen = await render(
      <HtmlRenderFrame
        environmentId={EnvironmentId.make("environment-1")}
        htmlRender={{ attachmentId: "html", title: "Tall page", height: 400 }}
        threadRef={undefined}
      />,
    );
    const box = screen.container.firstElementChild as HTMLElement;
    await expect.poll(() => box.style.height).toBe("2345px");
    expect(box.querySelector("iframe")?.clientHeight).toBe(2345);
  });
});
