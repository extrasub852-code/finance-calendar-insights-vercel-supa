import type { CalendarEvent } from "./types";

const BUILT_IN_RANGES: Record<
  string,
  { mid: number; min: number; max: number }
> = {
  social: { mid: 45, min: 40, max: 50 },
  work: { mid: 25, min: 15, max: 40 },
  travel: { mid: 120, min: 80, max: 200 },
  health: { mid: 35, min: 20, max: 60 },
  other: { mid: 40, min: 25, max: 55 },
  rent: { mid: 1500, min: 800, max: 3500 },
  utilities: { mid: 180, min: 80, max: 400 },
  subscriptions: { mid: 60, min: 10, max: 200 },
};

const CUSTOM_DEFAULT = { mid: 50, min: 30, max: 80 };

function rangeForCategory(slug: string) {
  return BUILT_IN_RANGES[slug] ?? CUSTOM_DEFAULT;
}

export function getEstimatedCost(event: CalendarEvent): number {
  if (event.estimatedCostUsd != null) return event.estimatedCostUsd;
  return rangeForCategory(event.category).mid;
}

export function getSuggestedRange(event: CalendarEvent): { min: number; max: number } {
  if (event.estimatedCostUsd != null) {
    const v = event.estimatedCostUsd;
    return { min: Math.round(v * 0.9), max: Math.round(v * 1.1) };
  }
  const r = rangeForCategory(event.category);
  return { min: r.min, max: r.max };
}

export type TrackStatus = "on_track" | "caution" | "over";

export function getTrackStatus(
  balanceAfter: number,
  monthlyCategoryBudget: number,
  spentInCategory: number,
  eventCost: number,
): TrackStatus {
  if (monthlyCategoryBudget <= 0) {
    return balanceAfter >= 0 ? "on_track" : "over";
  }
  const projectedSpend = spentInCategory + eventCost;
  if (projectedSpend <= monthlyCategoryBudget && balanceAfter >= 0)
    return "on_track";
  if (projectedSpend <= monthlyCategoryBudget * 1.05) return "caution";
  return "over";
}
