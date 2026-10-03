import { expect, it } from "vite-plus/test";

import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
} from "./threadSidebarWidth";

it("restores narrow saved sidebars wide enough for all six footer controls", () => {
  // Six 32px controls, five 4px gaps, and two 8px footer insets need 228px.
  for (const viewportWidth of [800, 1440]) {
    const restoredWidth = resolveInitialThreadSidebarWidth(208, viewportWidth);
    expect(restoredWidth).toBe(228);
    expect(restoredWidth).toBeGreaterThanOrEqual(6 * 32 + 5 * 4 + 2 * 8);
    expect(resolveThreadSidebarMaximumWidth(viewportWidth)).toBeGreaterThanOrEqual(restoredWidth);
  }
});
