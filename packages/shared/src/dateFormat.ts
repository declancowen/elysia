// @effect-diagnostics globalDate:off -- Intl calendar labels use the viewer's local zone and accept native Date values.
const calendarDateOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
} as const;
const calendarDateFormatter = new Intl.DateTimeFormat("en-GB", calendarDateOptions);
const calendarTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** Elysia calendar dates use dd/mm/yyyy; an explicit zone keeps scheduled dates in that zone. */
export function formatCalendarDate(value: string | Date, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatter =
    timeZone === undefined
      ? calendarDateFormatter
      : new Intl.DateTimeFormat("en-GB", { ...calendarDateOptions, timeZone });
  return formatter.format(date);
}

export function formatCalendarDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const label = formatCalendarDate(date);
  return label ? `${label}, ${calendarTimeFormatter.format(date)}` : "";
}
