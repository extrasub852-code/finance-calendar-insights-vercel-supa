import { endOfWeek, isWithinInterval, startOfWeek } from "date-fns";
import type { CalendarEvent } from "./types";
import { getEstimatedCost } from "./finance";

export function eventsInWeek(weekAnchor: Date, events: CalendarEvent[]): CalendarEvent[] {
  const start = startOfWeek(weekAnchor, { weekStartsOn: 0 });
  const end = endOfWeek(weekAnchor, { weekStartsOn: 0 });
  return events.filter((e) => isWithinInterval(e.start, { start, end }));
}

export function weekFinanceSummary(
  weekAnchor: Date,
  events: CalendarEvent[],
): {
  weekTotalEstimated: number;
  eventCount: number;
  byCategory: Record<string, number>;
} {
  const inWeek = eventsInWeek(weekAnchor, events);
  const byCategory: Record<string, number> = {};
  let weekTotalEstimated = 0;
  for (const e of inWeek) {
    const c = getEstimatedCost(e);
    weekTotalEstimated += c;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + c;
  }
  return {
    weekTotalEstimated,
    eventCount: inWeek.length,
    byCategory,
  };
}
