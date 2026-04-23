/** Domain row shape used by recurrence / calendar expansion (replaces Prisma `Event`). */
export type StoredEvent = {
  id: string;
  userId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  category: string;
  estimatedCostUsd: number | null;
  recurrence: string | null;
  recurrenceEnd: Date | null;
  expenseKind: string | null;
  createdAt: Date;
};

export type AppUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  currentBalanceUsd: number;
  onboardingComplete: boolean;
};

export type UserCategoryRow = {
  id: string;
  userId: string;
  slug: string;
  name: string;
  colorIndex: number;
  isBuiltIn: boolean;
  createdAt: Date;
};
