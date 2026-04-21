/** Slug from UserCategory (built-in: social, work, … or custom c_…) */
export type CategorySlug = string;

export interface UserCategoryDto {
  slug: CategorySlug;
  name: string;
  colorIndex: number;
  isBuiltIn: boolean;
}

export type RecurrenceRule = "daily" | "weekly" | "monthly" | "yearly";

export type ExpenseKindTag = "rent" | "utilities" | "subscription";

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  category: CategorySlug;
  estimatedCostUsd?: number;
  /** Stored series id (same as id for one-off events). */
  seriesId?: string;
  recurrence?: RecurrenceRule | null;
  recurrenceEnd?: Date;
  expenseKind?: ExpenseKindTag | null;
}

/** Built-in slugs used in onboarding ordering */
export const ONBOARDING_SLUGS = [
  "social",
  "work",
  "travel",
  "health",
  "other",
] as const;

export const ONBOARDING_LABELS: Record<(typeof ONBOARDING_SLUGS)[number], string> = {
  social: "Social",
  work: "Work",
  travel: "Travel",
  health: "Health",
  other: "Other",
};
