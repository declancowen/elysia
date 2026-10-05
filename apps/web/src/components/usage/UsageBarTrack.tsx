/** Shared usage track; the marker shows the calendar pace independently of the fill. */
export function UsageBarTrack({
  color,
  fillPercent,
  markerPercent,
}: {
  readonly color: string;
  readonly fillPercent: number;
  readonly markerPercent: number | null;
}) {
  return (
    <>
      <div className="absolute inset-x-0 inset-y-1.5 rounded-full bg-muted" />
      {fillPercent > 0 ? (
        <div
          className="absolute inset-y-1.5 left-0 rounded-full"
          style={{ width: `${fillPercent}%`, backgroundColor: color }}
        />
      ) : null}
      {markerPercent !== null ? (
        <span
          aria-hidden
          className="absolute inset-y-0.5 w-px -translate-x-1/2 bg-foreground/60"
          style={{ left: `${markerPercent}%` }}
        />
      ) : null}
    </>
  );
}
