import { describe, expect, it } from "vitest";
import { composeCalendarEventId, parseCalendarEventId } from "../server/eventIds.js";

describe("eventIds", () => {
  it("round-trips series id and occurrence ms in calendar event id", () => {
    const seriesId = "550e8400-e29b-41d4-a716-446655440000";
    const ms = 1_700_000_000_000;
    const composed = composeCalendarEventId(seriesId, ms);
    const parsed = parseCalendarEventId(composed);
    expect(parsed.seriesId).toBe(seriesId);
    expect(parsed.instanceStartMs).toBe(ms);
  });
});
