import type { CalendarEvent, ExpenseKindTag, RecurrenceRule, UserCategoryDto } from "./types";

const API = "";

function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  currentBalanceUsd: number;
  onboardingComplete: boolean;
};

export async function fetchAuthMe(): Promise<AuthUser | null> {
  const r = await apiFetch(`${API}/api/auth/me`);
  if (r.status === 401) return null;
  if (!r.ok) throw new Error("auth_me_failed");
  const data = (await r.json()) as { user: AuthUser };
  return data.user;
}

export async function loginApi(email: string, password: string): Promise<AuthUser> {
  const r = await apiFetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "login_failed");
  }
  const data = (await r.json()) as { user: AuthUser };
  return data.user;
}

export async function registerApi(payload: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthUser> {
  const r = await apiFetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "register_failed");
  }
  const data = (await r.json()) as { user: AuthUser };
  return data.user;
}

export async function logoutApi(): Promise<void> {
  await apiFetch(`${API}/api/auth/logout`, { method: "POST" });
}

export type BootstrapResponse = {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    currentBalanceUsd: number;
    onboardingComplete: boolean;
  };
  yearMonth: string;
  categories: UserCategoryDto[];
  /** Merged defaults + month overrides for `yearMonth` */
  categoryBudgets: Record<string, number>;
  /** Global defaults only (from onboarding / Edit default goals) */
  defaultCategoryBudgets: Record<string, number>;
  spentByCategory: Record<string, number>;
  /** Event IDs that already have at least one tracked expense (Accept & Track). */
  trackedEventIds: string[];
  events: {
    id: string;
    title: string;
    start: string;
    end: string;
    category: string;
    estimatedCostUsd: number | null;
    seriesId: string;
    recurrence: string | null;
    recurrenceEnd: string | null;
    expenseKind: string | null;
  }[];
};

export async function fetchBootstrap(yearMonth?: string): Promise<BootstrapResponse> {
  const q = yearMonth ? `?yearMonth=${encodeURIComponent(yearMonth)}` : "";
  const r = await apiFetch(`${API}/api/bootstrap${q}`);
  if (r.status === 401) {
    throw new Error("session_expired");
  }
  if (!r.ok) {
    throw new Error(
      `bootstrap_failed: ${r.status} ${r.statusText}. Is the API running on port 3001?`,
    );
  }
  const data = (await r.json()) as BootstrapResponse;
  if (!Array.isArray(data.trackedEventIds)) {
    data.trackedEventIds = [];
  }
  return data;
}

export async function submitOnboarding(payload: {
  currentBalanceUsd: number;
  budgets: Record<string, number>;
}): Promise<void> {
  const r = await apiFetch(`${API}/api/onboarding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("onboarding_failed");
}

export async function updateGlobalBudgetsApi(budgets: Record<string, number>): Promise<void> {
  const r = await apiFetch(`${API}/api/budgets/global`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgets }),
  });
  if (!r.ok) throw new Error("update_global_budgets_failed");
}

export async function updateMonthBudgetsApi(
  yearMonth: string,
  budgets: Record<string, number>,
): Promise<void> {
  const r = await apiFetch(
    `${API}/api/budgets/month/${encodeURIComponent(yearMonth)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgets }),
    },
  );
  if (!r.ok) throw new Error("update_month_budgets_failed");
}

export async function createCategoryApi(name: string): Promise<UserCategoryDto> {
  const r = await apiFetch(`${API}/api/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error("create_category_failed");
  return r.json();
}

export async function deleteCategoryApi(slug: string): Promise<void> {
  const r = await apiFetch(`${API}/api/categories/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error("delete_category_failed");
}

export async function createEventApi(payload: {
  title: string;
  start: string;
  end: string;
  category: string;
  estimatedCostUsd?: number | null;
  recurrence?: string | null;
  recurrenceEnd?: string | null;
  expenseKind?: string | null;
}): Promise<{
  id: string;
  title: string;
  start: string;
  end: string;
  category: string;
  estimatedCostUsd: number | null;
  seriesId: string;
  recurrence: string | null;
  recurrenceEnd: string | null;
  expenseKind: string | null;
}> {
  const r = await apiFetch(`${API}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("create_event_failed");
  return r.json();
}

export async function patchEventApi(
  id: string,
  payload: {
    title?: string;
    start?: string;
    end?: string;
    category?: string;
    estimatedCostUsd?: number | null;
    recurrence?: string | null;
    recurrenceEnd?: string | null;
    expenseKind?: string | null;
  },
): Promise<{
  id: string;
  title: string;
  start: string;
  end: string;
  category: string;
  estimatedCostUsd: number | null;
  seriesId: string;
  recurrence: string | null;
  recurrenceEnd: string | null;
  expenseKind: string | null;
}> {
  const r = await apiFetch(`${API}/api/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("patch_event_failed");
  return r.json();
}

export async function deleteEventApi(id: string): Promise<void> {
  const r = await apiFetch(`${API}/api/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error("delete_event_failed");
}

export async function patchUserBalanceApi(
  currentBalanceUsd: number,
): Promise<{ currentBalanceUsd: number }> {
  const r = await apiFetch(`${API}/api/user`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentBalanceUsd }),
  });
  if (!r.ok) throw new Error("patch_user_failed");
  return r.json();
}

export async function untrackEventApi(eventId: string): Promise<{
  ok: boolean;
  refundedUsd: number;
  currentBalanceUsd: number;
}> {
  const r = await apiFetch(
    `${API}/api/expenses/for-event/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!r.ok) throw new Error("untrack_failed");
  return r.json();
}

export async function trackExpenseApi(payload: {
  eventId: string;
  amountUsd: number;
  category: string;
  /** Calendar month for returning spentByCategory totals */
  yearMonth?: string;
}): Promise<{
  currentBalanceUsd: number;
  spentByCategory: Record<string, number>;
}> {
  const r = await apiFetch(`${API}/api/expenses/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    try {
      const j = (await r.json()) as { error?: string };
      if (j?.error === "already_tracked") {
        throw new Error("already_tracked");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "already_tracked") throw e;
    }
    throw new Error("track_failed");
  }
  return r.json();
}

export function mapApiEventToCalendar(
  e: BootstrapResponse["events"][0],
): CalendarEvent {
  return {
    id: e.id,
    title: e.title,
    start: new Date(e.start),
    end: new Date(e.end),
    category: e.category || "other",
    estimatedCostUsd: e.estimatedCostUsd ?? undefined,
    seriesId: e.seriesId ?? e.id,
    recurrence: (e.recurrence as RecurrenceRule | null) ?? null,
    recurrenceEnd: e.recurrenceEnd ? new Date(e.recurrenceEnd) : undefined,
    expenseKind: (e.expenseKind as ExpenseKindTag | null) ?? null,
  };
}
