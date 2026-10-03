import { expect, it } from "vite-plus/test";

import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  APP_NAVIGATION_RAIL_WIDTH,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

it("restores a saved narrow sidebar after moving footer controls into the rail", () => {
  for (const viewportWidth of [800, 1440]) {
    const restoredWidth = resolveInitialThreadSidebarWidth(208, viewportWidth);
    expect(restoredWidth).toBe(208);
    expect(resolveThreadSidebarMaximumWidth(viewportWidth)).toBeGreaterThanOrEqual(restoredWidth);
  }
});

it("reserves the navigation rail and main panel when clamping a wide saved sidebar", () => {
  const viewportWidth = 1440;
  const maximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth);
  expect(resolveInitialThreadSidebarWidth(1000, viewportWidth)).toBe(maximumWidth);
  expect(viewportWidth - maximumWidth - APP_NAVIGATION_RAIL_WIDTH).toBe(
    THREAD_MAIN_CONTENT_MIN_WIDTH,
  );
  expect(resolveInitialThreadSidebarWidth(null, 600)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
});
