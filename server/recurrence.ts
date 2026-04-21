import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInMilliseconds,
} from "date-fns";
import type { Event } from "@prisma/client";

export const RECURRENCE_RULES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export function normalizeRecurrence(
  v: string | null | undefined,
): RecurrenceRule | null {
  if (v == null || v === "" || v === "none") return null;
  return (RECURRENCE_RULES as readonly string[]).includes(v)
    ? (v as RecurrenceRule)
    : null;
}

function advanceStart(start: Date, rule: RecurrenceRule): Date {
  switch (rule) {
    case "daily":
      return addDays(start, 1);
    case "weekly":
      return addWeeks(start, 1);
    case "monthly":
      return addMonths(start, 1);
    case "yearly":
      return addYears(start, 1);
    default:
      return addDays(start, 1);
  }
}

function overlapsWindow(
  start: Date,
  end: Date,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  return start <= windowEnd && end >= windowStart;
}

export type ExpandedOccurrence = {
  start: Date;
  end: Date;
  instanceKey: string;
};

/** Expand a stored event into occurrences overlapping [windowStart, windowEnd]. */
export function expandEventOccurrences(
  event: Pick<
    Event,
    "startAt" | "endAt" | "recurrence" | "recurrenceEnd"
  >,
  windowStart: Date,
  windowEnd: Date,
  maxIterations = 2000,
): ExpandedOccurrence[] {
  const rule = normalizeRecurrence(event.recurrence);
  const durationMs = differenceInMilliseconds(event.endAt, event.startAt);
  if (!rule || durationMs < 0) {
    if (overlapsWindow(event.startAt, event.endAt, windowStart, windowEnd)) {
      return [
        {
          start: event.startAt,
          end: event.endAt,
          instanceKey: String(event.startAt.getTime()),
        },
      ];
    }
    return [];
  }

  const seriesCap = event.recurrenceEnd;
  const out: ExpandedOccurrence[] = [];
  let curStart = new Date(event.startAt);
  let iter = 0;

  while (iter < maxIterations) {
    const curEnd = new Date(curStart.getTime() + durationMs);
    if (seriesCap && curStart > seriesCap) break;
    if (curStart > windowEnd) break;

    if (overlapsWindow(curStart, curEnd, windowStart, windowEnd)) {
      out.push({
        start: new Date(curStart),
        end: curEnd,
        instanceKey: String(curStart.getTime()),
      });
    }

    curStart = advanceStart(curStart, rule);
    iter += 1;
  }

  return out;
}
