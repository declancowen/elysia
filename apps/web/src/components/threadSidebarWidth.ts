import { SINGLE_PROVIDER_UI } from "@t3tools/contracts";

export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
export const APP_NAVIGATION_RAIL_WIDTH = SINGLE_PROVIDER_UI ? 56 : 0;
// Reserve the title and three compact header controls at the narrowest desktop width.
export const THREAD_SIDEBAR_MIN_WIDTH = SINGLE_PROVIDER_UI ? 256 : 6 * 32 + 5 * 4 + 2 * 8;
export const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;

// The brand's measured width can raise the minimum so the product title never clips.
export function resolveThreadSidebarMinimumWidth(brandWidth: number): number {
  return Math.max(THREAD_SIDEBAR_MIN_WIDTH, Math.ceil(brandWidth));
}

export function resolveThreadSidebarMaximumWidth(
  viewportWidth: number,
  minimumWidth = THREAD_SIDEBAR_MIN_WIDTH,
): number {
  return Math.max(
    minimumWidth,
    Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH - APP_NAVIGATION_RAIL_WIDTH,
  );
}

export function clampThreadSidebarWidth(
  width: number,
  minimumWidth: number,
  maximumWidth: number,
): number {
  return Math.min(maximumWidth, Math.max(minimumWidth, width));
}

export function resolveInitialThreadSidebarWidth(
  storedWidth: number | null,
  viewportWidth: number,
): number {
  const preferredWidth =
    storedWidth === null
      ? THREAD_SIDEBAR_DEFAULT_WIDTH
      : Math.max(THREAD_SIDEBAR_MIN_WIDTH, storedWidth);
  return Math.min(preferredWidth, resolveThreadSidebarMaximumWidth(viewportWidth));
}
