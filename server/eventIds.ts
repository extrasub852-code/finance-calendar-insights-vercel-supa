/** Calendar instance id: `<seriesCuid>#<occurrenceStart.getTime()>` */
export function parseCalendarEventId(routeId: string): {
  seriesId: string;
  instanceStartMs: number | null;
} {
  const i = routeId.indexOf("#");
  if (i <= 0) {
    return { seriesId: routeId, instanceStartMs: null };
  }
  const seriesId = routeId.slice(0, i);
  const rest = routeId.slice(i + 1);
  const ms = Number(rest);
  return {
    seriesId,
    instanceStartMs: Number.isFinite(ms) ? ms : null,
  };
}

export function composeCalendarEventId(
  seriesId: string,
  instanceStartMs: number,
): string {
  return `${seriesId}#${instanceStartMs}`;
}
