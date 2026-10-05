const calendarDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const calendarTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** Elysia calendar dates use dd/mm/yyyy in the viewer's local time zone. */
export function formatCalendarDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : calendarDateFormatter.format(date);
}

export function formatCalendarDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const label = formatCalendarDate(date);
  return label ? `${label}, ${calendarTimeFormatter.format(date)}` : "";
}
