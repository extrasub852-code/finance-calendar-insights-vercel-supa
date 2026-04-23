import { supabaseAuthClient, supabaseUserClient } from "./supabaseClients.js";
import type { AppUser, StoredEvent, UserCategoryRow } from "./models.js";

export function isUniqueViolation(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e) {
    return (e as { code: string }).code === "23505";
  }
  return false;
}

export async function dbHealthPing(): Promise<boolean> {
  try {
    const sb = supabaseAuthClient();
    const { error } = await sb.from("profiles").select("id").limit(1);
    if (!error) return true;
    return error.code === "42501" || /permission/i.test(error.message);
  } catch {
    return false;
  }
}

export async function ensureOwnProfile(
  accessToken: string,
  userId: string,
  displayName: string | null,
): Promise<void> {
  const sb = supabaseUserClient(accessToken);
  const { error } = await sb.from("profiles").upsert(
    {
      id: userId,
      display_name: displayName,
      current_balance_usd: 0,
      onboarding_complete: false,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function loadAppUser(
  accessToken: string,
  userId: string,
  email: string | null,
): Promise<AppUser | null> {
  const sb = supabaseUserClient(accessToken);
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, current_balance_usd, onboarding_complete")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    email,
    displayName: (data.display_name as string | null) ?? null,
    currentBalanceUsd: (data.current_balance_usd as number) ?? 0,
    onboardingComplete: (data.onboarding_complete as boolean) ?? false,
  };
}

function sb(accessToken: string) {
  return supabaseUserClient(accessToken);
}

export async function ensureDefaultCategory(
  accessToken: string,
  userId: string,
  row: { slug: string; name: string; colorIndex: number },
): Promise<void> {
  const { error } = await sb(accessToken).from("user_categories").upsert(
    {
      user_id: userId,
      slug: row.slug,
      name: row.name,
      color_index: row.colorIndex,
      is_builtin: true,
    },
    { onConflict: "user_id,slug" },
  );
  if (error) throw error;
}

export async function listCategoryBudgetDefaults(
  accessToken: string,
  userId: string,
): Promise<{ category: string; monthlyAmountUsd: number }[]> {
  const { data, error } = await sb(accessToken)
    .from("category_budgets")
    .select("category, monthly_amount_usd")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    category: r.category as string,
    monthlyAmountUsd: r.monthly_amount_usd as number,
  }));
}

export async function listMonthCategoryBudgets(
  accessToken: string,
  userId: string,
  yearMonth: string,
): Promise<{ categorySlug: string; monthlyAmountUsd: number }[]> {
  const { data, error } = await sb(accessToken)
    .from("month_category_budgets")
    .select("category_slug, monthly_amount_usd")
    .eq("user_id", userId)
    .eq("year_month", yearMonth);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    categorySlug: r.category_slug as string,
    monthlyAmountUsd: r.monthly_amount_usd as number,
  }));
}

export async function listUserCategories(
  accessToken: string,
  userId: string,
): Promise<UserCategoryRow[]> {
  const { data, error } = await sb(accessToken)
    .from("user_categories")
    .select("id, user_id, slug, name, color_index, is_builtin, created_at")
    .eq("user_id", userId)
    .order("is_builtin", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    slug: r.slug as string,
    name: r.name as string,
    colorIndex: r.color_index as number,
    isBuiltIn: r.is_builtin as boolean,
    createdAt: new Date(r.created_at as string),
  }));
}

export async function listEventsForUser(accessToken: string, userId: string): Promise<StoredEvent[]> {
  const { data, error } = await sb(accessToken)
    .from("events")
    .select(
      "id, user_id, title, start_at, end_at, category, estimated_cost_usd, recurrence, recurrence_end, expense_kind, created_at",
    )
    .eq("user_id", userId)
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    title: r.title as string,
    startAt: new Date(r.start_at as string),
    endAt: new Date(r.end_at as string),
    category: r.category as string,
    estimatedCostUsd: (r.estimated_cost_usd as number | null) ?? null,
    recurrence: (r.recurrence as string | null) ?? null,
    recurrenceEnd: r.recurrence_end ? new Date(r.recurrence_end as string) : null,
    expenseKind: (r.expense_kind as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
  }));
}

export async function listTrackedExpensesInRange(
  accessToken: string,
  userId: string,
  start: Date,
  end: Date,
): Promise<{ category: string; amountUsd: number }[]> {
  const { data, error } = await sb(accessToken)
    .from("tracked_expenses")
    .select("category, amount_usd")
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  if (error) throw error;
  return (data ?? []).map((r) => ({ category: r.category as string, amountUsd: r.amount_usd as number }));
}

export async function listTrackedExpenseEventKeys(
  accessToken: string,
  userId: string,
): Promise<{ eventId: string | null; occurrenceKey: string }[]> {
  const { data, error } = await sb(accessToken)
    .from("tracked_expenses")
    .select("event_id, occurrence_key")
    .eq("user_id", userId)
    .not("event_id", "is", null);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    eventId: (r.event_id as string | null) ?? null,
    occurrenceKey: (r.occurrence_key as string) ?? "",
  }));
}

export async function completeOnboarding(
  accessToken: string,
  userId: string,
  currentBalanceUsd: number,
  budgets: { slug: string; amount: number }[],
): Promise<void> {
  const client = sb(accessToken);
  const { error: uErr } = await client
    .from("profiles")
    .update({ current_balance_usd: currentBalanceUsd, onboarding_complete: true })
    .eq("id", userId);
  if (uErr) throw uErr;
  for (const b of budgets) {
    const { error } = await client.from("category_budgets").upsert(
      { user_id: userId, category: b.slug, monthly_amount_usd: b.amount },
      { onConflict: "user_id,category" },
    );
    if (error) throw error;
  }
}

export async function upsertCategoryBudgets(
  accessToken: string,
  userId: string,
  rows: { slug: string; amount: number }[],
): Promise<void> {
  const client = sb(accessToken);
  for (const r of rows) {
    const { error } = await client.from("category_budgets").upsert(
      { user_id: userId, category: r.slug, monthly_amount_usd: r.amount },
      { onConflict: "user_id,category" },
    );
    if (error) throw error;
  }
}

export async function replaceMonthCategoryBudgets(
  accessToken: string,
  userId: string,
  yearMonth: string,
  rows: { slug: string; amount: number }[],
): Promise<void> {
  const client = sb(accessToken);
  const { error: dErr } = await client
    .from("month_category_budgets")
    .delete()
    .eq("user_id", userId)
    .eq("year_month", yearMonth);
  if (dErr) throw dErr;
  if (rows.length === 0) return;
  const { error: iErr } = await client.from("month_category_budgets").insert(
    rows.map((r) => ({
      user_id: userId,
      year_month: yearMonth,
      category_slug: r.slug,
      monthly_amount_usd: r.amount,
    })),
  );
  if (iErr) throw iErr;
}

export async function countUserCategories(accessToken: string, userId: string): Promise<number> {
  const { count, error } = await sb(accessToken)
    .from("user_categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

export async function createUserCategoryWithBudget(
  accessToken: string,
  userId: string,
  slug: string,
  name: string,
  colorIndex: number,
): Promise<UserCategoryRow> {
  const client = sb(accessToken);
  const { data: cat, error: cErr } = await client
    .from("user_categories")
    .insert({ user_id: userId, slug, name, color_index: colorIndex, is_builtin: false })
    .select("id, user_id, slug, name, color_index, is_builtin, created_at")
    .single();
  if (cErr) throw cErr;
  const { error: bErr } = await client.from("category_budgets").upsert(
    { user_id: userId, category: slug, monthly_amount_usd: 0 },
    { onConflict: "user_id,category" },
  );
  if (bErr) throw bErr;
  return {
    id: cat.id as string,
    userId: cat.user_id as string,
    slug: cat.slug as string,
    name: cat.name as string,
    colorIndex: cat.color_index as number,
    isBuiltIn: cat.is_builtin as boolean,
    createdAt: new Date(cat.created_at as string),
  };
}

export async function findUserCategory(
  accessToken: string,
  userId: string,
  slug: string,
): Promise<UserCategoryRow | null> {
  const { data, error } = await sb(accessToken)
    .from("user_categories")
    .select("id, user_id, slug, name, color_index, is_builtin, created_at")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    userId: data.user_id as string,
    slug: data.slug as string,
    name: data.name as string,
    colorIndex: data.color_index as number,
    isBuiltIn: data.is_builtin as boolean,
    createdAt: new Date(data.created_at as string),
  };
}

export async function countEventsInCategory(
  accessToken: string,
  userId: string,
  categorySlug: string,
): Promise<number> {
  const { count, error } = await sb(accessToken)
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("category", categorySlug);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteCategoryCascade(
  accessToken: string,
  userId: string,
  categorySlug: string,
  categoryId: string,
): Promise<void> {
  const client = sb(accessToken);
  const { error: mErr } = await client
    .from("month_category_budgets")
    .delete()
    .eq("user_id", userId)
    .eq("category_slug", categorySlug);
  if (mErr) throw mErr;
  const { error: cErr } = await client
    .from("category_budgets")
    .delete()
    .eq("user_id", userId)
    .eq("category", categorySlug);
  if (cErr) throw cErr;
  const { error: uErr } = await client.from("user_categories").delete().eq("id", categoryId);
  if (uErr) throw uErr;
}

export async function insertEvent(
  accessToken: string,
  userId: string,
  payload: {
    title: string;
    startAt: Date;
    endAt: Date;
    category: string;
    estimatedCostUsd: number | null;
    recurrence: string | null;
    recurrenceEnd: Date | null;
    expenseKind: string | null;
  },
): Promise<StoredEvent> {
  const { data, error } = await sb(accessToken)
    .from("events")
    .insert({
      user_id: userId,
      title: payload.title,
      start_at: payload.startAt.toISOString(),
      end_at: payload.endAt.toISOString(),
      category: payload.category,
      estimated_cost_usd: payload.estimatedCostUsd,
      recurrence: payload.recurrence,
      recurrence_end: payload.recurrenceEnd?.toISOString() ?? null,
      expense_kind: payload.expenseKind,
    })
    .select(
      "id, user_id, title, start_at, end_at, category, estimated_cost_usd, recurrence, recurrence_end, expense_kind, created_at",
    )
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    userId: data.user_id as string,
    title: data.title as string,
    startAt: new Date(data.start_at as string),
    endAt: new Date(data.end_at as string),
    category: data.category as string,
    estimatedCostUsd: (data.estimated_cost_usd as number | null) ?? null,
    recurrence: (data.recurrence as string | null) ?? null,
    recurrenceEnd: data.recurrence_end ? new Date(data.recurrence_end as string) : null,
    expenseKind: (data.expense_kind as string | null) ?? null,
    createdAt: new Date(data.created_at as string),
  };
}

export async function findEventForUser(
  accessToken: string,
  userId: string,
  seriesId: string,
): Promise<StoredEvent | null> {
  const { data, error } = await sb(accessToken)
    .from("events")
    .select(
      "id, user_id, title, start_at, end_at, category, estimated_cost_usd, recurrence, recurrence_end, expense_kind, created_at",
    )
    .eq("user_id", userId)
    .eq("id", seriesId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    userId: data.user_id as string,
    title: data.title as string,
    startAt: new Date(data.start_at as string),
    endAt: new Date(data.end_at as string),
    category: data.category as string,
    estimatedCostUsd: (data.estimated_cost_usd as number | null) ?? null,
    recurrence: (data.recurrence as string | null) ?? null,
    recurrenceEnd: data.recurrence_end ? new Date(data.recurrence_end as string) : null,
    expenseKind: (data.expense_kind as string | null) ?? null,
    createdAt: new Date(data.created_at as string),
  };
}

export type UpdateEventPatch = {
  title?: string;
  startAt?: Date;
  endAt?: Date;
  category?: string;
  estimatedCostUsd?: number | null;
  recurrence?: string | null;
  recurrenceEnd?: Date | null;
  expenseKind?: string | null;
};

export async function updateEventRow(
  accessToken: string,
  seriesId: string,
  patch: UpdateEventPatch,
): Promise<StoredEvent> {
  const row: Record<string, unknown> = {};
  if (patch.title != null) row.title = patch.title;
  if (patch.startAt != null) row.start_at = patch.startAt.toISOString();
  if (patch.endAt != null) row.end_at = patch.endAt.toISOString();
  if (patch.category != null) row.category = patch.category;
  if (patch.estimatedCostUsd !== undefined) row.estimated_cost_usd = patch.estimatedCostUsd;
  if (patch.recurrence !== undefined) row.recurrence = patch.recurrence;
  if (patch.recurrenceEnd !== undefined) row.recurrence_end = patch.recurrenceEnd?.toISOString() ?? null;
  if (patch.expenseKind !== undefined) row.expense_kind = patch.expenseKind;
  const { data, error } = await sb(accessToken)
    .from("events")
    .update(row)
    .eq("id", seriesId)
    .select(
      "id, user_id, title, start_at, end_at, category, estimated_cost_usd, recurrence, recurrence_end, expense_kind, created_at",
    )
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    userId: data.user_id as string,
    title: data.title as string,
    startAt: new Date(data.start_at as string),
    endAt: new Date(data.end_at as string),
    category: data.category as string,
    estimatedCostUsd: (data.estimated_cost_usd as number | null) ?? null,
    recurrence: (data.recurrence as string | null) ?? null,
    recurrenceEnd: data.recurrence_end ? new Date(data.recurrence_end as string) : null,
    expenseKind: (data.expense_kind as string | null) ?? null,
    createdAt: new Date(data.created_at as string),
  };
}

export async function deleteEventById(accessToken: string, seriesId: string): Promise<void> {
  const { error } = await sb(accessToken).from("events").delete().eq("id", seriesId);
  if (error) throw error;
}

export async function setProfileBalance(
  accessToken: string,
  userId: string,
  balance: number,
): Promise<number> {
  const { data, error } = await sb(accessToken)
    .from("profiles")
    .update({ current_balance_usd: balance })
    .eq("id", userId)
    .select("current_balance_usd")
    .single();
  if (error) throw error;
  return data.current_balance_usd as number;
}

export async function adjustProfileBalance(
  accessToken: string,
  userId: string,
  delta: number,
): Promise<number> {
  const client = sb(accessToken);
  const { data: cur, error: gErr } = await client
    .from("profiles")
    .select("current_balance_usd")
    .eq("id", userId)
    .single();
  if (gErr) throw gErr;
  const next = (cur.current_balance_usd as number) + delta;
  const { data, error } = await client
    .from("profiles")
    .update({ current_balance_usd: next })
    .eq("id", userId)
    .select("current_balance_usd")
    .single();
  if (error) throw error;
  return data.current_balance_usd as number;
}

export async function listTrackedExpenseRows(
  accessToken: string,
  userId: string,
  seriesId: string,
  occurrenceKey: string,
): Promise<{ amountUsd: number }[]> {
  const { data, error } = await sb(accessToken)
    .from("tracked_expenses")
    .select("amount_usd")
    .eq("user_id", userId)
    .eq("event_id", seriesId)
    .eq("occurrence_key", occurrenceKey);
  if (error) throw error;
  return (data ?? []).map((r) => ({ amountUsd: r.amount_usd as number }));
}

export async function deleteTrackedRows(
  accessToken: string,
  userId: string,
  seriesId: string,
  occurrenceKey: string,
): Promise<void> {
  const { error } = await sb(accessToken)
    .from("tracked_expenses")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", seriesId)
    .eq("occurrence_key", occurrenceKey);
  if (error) throw error;
}

export async function findTrackedDuplicate(
  accessToken: string,
  userId: string,
  seriesId: string,
  occurrenceKey: string,
): Promise<boolean> {
  const { data, error } = await sb(accessToken)
    .from("tracked_expenses")
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", seriesId)
    .eq("occurrence_key", occurrenceKey)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function insertTrackedExpense(
  accessToken: string,
  params: {
    userId: string;
    eventId: string | null;
    occurrenceKey: string;
    amountUsd: number;
    category: string;
  },
): Promise<void> {
  const { error } = await sb(accessToken).from("tracked_expenses").insert({
    user_id: params.userId,
    event_id: params.eventId,
    occurrence_key: params.occurrenceKey,
    amount_usd: params.amountUsd,
    category: params.category,
  });
  if (error) throw error;
}
