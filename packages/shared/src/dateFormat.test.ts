// @effect-diagnostics globalDate:off -- fixed local instant verifies the date formatting boundary.
import { expect, it } from "vite-plus/test";
import { formatCalendarDate, formatCalendarDateTime } from "./dateFormat.ts";
import { formatDayShort } from "./usageFormat.ts";

it("uses padded day/month/year for local dates and date-only buckets without shifting a calendar day", () => {
  const date = new Date(2026, 2, 4, 12, 30);
  expect(formatCalendarDate(date)).toBe("04/03/2026");
  expect(formatCalendarDate(date.toISOString())).toBe("04/03/2026");
  expect(formatCalendarDateTime(date)).toBe(
    `04/03/2026, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
  );
  expect(formatDayShort("2026-03-04")).toBe("04/03/2026");
  expect(formatCalendarDate("invalid")).toBe("");
  expect(formatCalendarDateTime("invalid")).toBe("");
});

it("formats the calendar day in an explicit zone across midnight", () => {
  const instant = "2026-03-04T00:30:00Z";
  expect(formatCalendarDate(instant, "UTC")).toBe("04/03/2026");
  expect(formatCalendarDate(instant, "America/Los_Angeles")).toBe("03/03/2026");
  expect(formatCalendarDate("invalid", "UTC")).toBe("");
});
