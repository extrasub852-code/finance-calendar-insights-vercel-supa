import { addDays, addMonths, addWeeks, addYears, differenceInMilliseconds, } from "date-fns";
export const RECURRENCE_RULES = ["daily", "weekly", "monthly", "yearly"];
export function normalizeRecurrence(v) {
    if (v == null || v === "" || v === "none")
        return null;
    return RECURRENCE_RULES.includes(v)
        ? v
        : null;
}
function advanceStart(start, rule) {
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
function overlapsWindow(start, end, windowStart, windowEnd) {
    return start <= windowEnd && end >= windowStart;
}
/** Expand a stored event into occurrences overlapping [windowStart, windowEnd]. */
export function expandEventOccurrences(event, windowStart, windowEnd, maxIterations = 2000) {
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
    const out = [];
    let curStart = new Date(event.startAt);
    let iter = 0;
    while (iter < maxIterations) {
        const curEnd = new Date(curStart.getTime() + durationMs);
        if (seriesCap && curStart > seriesCap)
            break;
        if (curStart > windowEnd)
            break;
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
