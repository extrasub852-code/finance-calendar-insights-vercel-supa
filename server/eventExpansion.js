import { composeCalendarEventId } from "./eventIds.js";
import { expandEventOccurrences, normalizeRecurrence } from "./recurrence.js";
/** One month before `yearMonth` through one month after, for calendar + budget month navigation. */
export function expansionWindowForYearMonth(yearMonth) {
    const [y, m] = yearMonth.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) {
        const now = new Date();
        const yy = now.getFullYear();
        const mm = now.getMonth() + 1;
        return expansionWindowForYearMonth(`${yy}-${String(mm).padStart(2, "0")}`);
    }
    const windowStart = new Date(y, m - 2, 1, 0, 0, 0, 0);
    const windowEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { windowStart, windowEnd };
}
export function expandStoredEventsForWindow(rows, windowStart, windowEnd) {
    const out = [];
    for (const e of rows) {
        const occ = expandEventOccurrences(e, windowStart, windowEnd);
        const recurring = normalizeRecurrence(e.recurrence) != null;
        for (const o of occ) {
            const id = recurring
                ? composeCalendarEventId(e.id, o.start.getTime())
                : e.id;
            out.push({
                id,
                title: e.title,
                start: o.start.toISOString(),
                end: o.end.toISOString(),
                category: e.category,
                estimatedCostUsd: e.estimatedCostUsd,
                seriesId: e.id,
                recurrence: e.recurrence,
                recurrenceEnd: e.recurrenceEnd?.toISOString() ?? null,
                expenseKind: e.expenseKind ?? null,
            });
        }
    }
    out.sort((a, b) => a.start.localeCompare(b.start));
    return out;
}
