import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, UserCategoryDto } from "../types";
import {
  getEstimatedCost,
  getSuggestedRange,
  getTrackStatus,
} from "../finance";
import { weekFinanceSummary } from "../weekFinance";
import { dotClassForColorIndex } from "../categoryColors";

type Tab = "overview" | "insights" | "budget" | "settings";

type Props = {
  budgetMonthLabel: string;
  categories: UserCategoryDto[];
  weekAnchor: Date;
  events: CalendarEvent[];
  categoryBudgets: Record<string, number>;
  /** Global defaults (for Budget tab reference). */
  defaultCategoryBudgets: Record<string, number>;
  spentByCategory: Record<string, number>;
  currentBalanceUsd: number;
  trackedEventIds: string[];
  event: CalendarEvent | null;
  onAcceptTrack: (eventId: string, amountUsd: number) => void | Promise<void>;
  onUntrack: (eventId: string) => void | Promise<void>;
  onSaveAccountBalance: (nextUsd: number) => void | Promise<void>;
  onEditCost: (eventId: string, amountUsd: number) => void;
  onIgnore: (eventId: string) => void;
  onOpenBudgetModal: () => void;
};

function nameFor(categories: UserCategoryDto[], slug: string) {
  return categories.find((x) => x.slug === slug)?.name ?? slug;
}

function statusBadge(status: ReturnType<typeof getTrackStatus>) {
  if (status === "on_track")
    return (
      <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
        On track
      </span>
    );
  if (status === "caution")
    return (
      <span className="rounded-full bg-amber-950 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
        Caution
      </span>
    );
  return (
    <span className="rounded-full bg-red-950 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400">
      Over budget
    </span>
  );
}

function weekStatus(
  weekTotal: number,
  totalMonthlyBudget: number,
  totalSpentMonth: number,
): ReturnType<typeof getTrackStatus> {
  if (totalMonthlyBudget <= 0) return "on_track";
  const projected = totalSpentMonth + weekTotal;
  if (projected <= totalMonthlyBudget) return "on_track";
  if (projected <= totalMonthlyBudget * 1.05) return "caution";
  return "over";
}

export function FinanceInsightsPanel({
  budgetMonthLabel,
  categories,
  weekAnchor,
  events,
  categoryBudgets,
  defaultCategoryBudgets,
  spentByCategory,
  currentBalanceUsd,
  trackedEventIds,
  event,
  onAcceptTrack,
  onUntrack,
  onSaveAccountBalance,
  onEditCost,
  onIgnore,
  onOpenBudgetModal,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [trackErr, setTrackErr] = useState<string | null>(null);
  const [untrackErr, setUntrackErr] = useState<string | null>(null);
  const [editingPostBalance, setEditingPostBalance] = useState(false);
  const [postBalanceDraft, setPostBalanceDraft] = useState("");
  const [settingsBalanceDraft, setSettingsBalanceDraft] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  const isTracked = Boolean(event && trackedEventIds.includes(event.id));

  useEffect(() => {
    setTrackErr(null);
    setUntrackErr(null);
    setEditingPostBalance(false);
  }, [event?.id]);

  useEffect(() => {
    setSettingsBalanceDraft(String(currentBalanceUsd));
  }, [currentBalanceUsd, tab]);

  const summary = useMemo(
    () => weekFinanceSummary(weekAnchor, events),
    [weekAnchor, events],
  );

  const totalMonthlyBudget = useMemo(() => {
    let s = 0;
    for (const k of Object.keys(categoryBudgets)) {
      s += categoryBudgets[k] ?? 0;
    }
    return s;
  }, [categoryBudgets]);

  const totalSpentMonth = useMemo(() => {
    let s = 0;
    for (const k of Object.keys(spentByCategory)) {
      s += spentByCategory[k] ?? 0;
    }
    return s;
  }, [spentByCategory]);

  const overallWeekStatus = weekStatus(
    summary.weekTotalEstimated,
    totalMonthlyBudget,
    totalSpentMonth,
  );

  const monthProgressPct =
    totalMonthlyBudget > 0
      ? Math.min(100, (totalSpentMonth / totalMonthlyBudget) * 100)
      : 0;

  const eventCost = event ? getEstimatedCost(event) : 0;
  const postBalance = event ? currentBalanceUsd - eventCost : currentBalanceUsd;
  const catBudget = event ? categoryBudgets[event.category] ?? 0 : 0;
  const catSpent = event ? spentByCategory[event.category] ?? 0 : 0;

  const eventStatus = event
    ? getTrackStatus(postBalance, catBudget, catSpent, eventCost)
    : null;

  const eventProgressPct =
    event && catBudget > 0
      ? Math.min(100, (catSpent / catBudget) * 100)
      : 0;

  const eventCatMeta = event
    ? categories.find((c) => c.slug === event.category)
    : undefined;

  const eventMessage =
    event && eventStatus === "on_track"
      ? "You're within budget. Safe to proceed. Recommended: Keep under $" +
        Math.round(eventCost) +
        " to stay on track."
      : event && eventStatus === "caution"
        ? "You're close to your category limit. Consider trimming discretionary spend."
        : event
          ? "This event may push you over your category budget."
          : "";

  const handleEditSubmit = () => {
    if (!event) return;
    const n = parseFloat(editValue);
    if (!Number.isFinite(n) || n < 0) return;
    onEditCost(event.id, n);
    setEditing(false);
    setEditValue("");
  };

  const handleAcceptTrack = async () => {
    if (!event) return;
    setTrackErr(null);
    try {
      await onAcceptTrack(event.id, eventCost);
    } catch (e) {
      const msg =
        e instanceof Error && e.message === "already_tracked"
          ? "This event is already tracked. Use “Remove tracking” if you need to undo."
          : "Could not record this expense.";
      setTrackErr(msg);
    }
  };

  const handleSavePostBalance = async () => {
    if (!event) return;
    const post = parseFloat(postBalanceDraft);
    if (!Number.isFinite(post)) return;
    const nextCurrent = post + eventCost;
    setSavingBalance(true);
    try {
      await onSaveAccountBalance(nextCurrent);
      setEditingPostBalance(false);
    } finally {
      setSavingBalance(false);
    }
  };

  const handleSaveSettingsBalance = async () => {
    const n = parseFloat(settingsBalanceDraft);
    if (!Number.isFinite(n)) return;
    setSavingBalance(true);
    try {
      await onSaveAccountBalance(n);
    } finally {
      setSavingBalance(false);
    }
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[var(--app-border)] bg-[var(--app-shell)]">
      <div className="border-b border-[var(--app-border)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--app-text)]">Finance Insights</h2>
          {statusBadge(overallWeekStatus)}
        </div>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
          Budgets and spend for {budgetMonthLabel} · Overview vs Insights
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "overview" && (
          <>
            <section className="mb-5 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                    This week at a glance
                  </h3>
                  <p className="mt-1 text-2xl font-semibold text-[var(--app-text)] tabular-nums">
                    ${summary.weekTotalEstimated.toFixed(2)}
                  </p>
                  <p className="text-sm text-[var(--app-text-secondary)]">
                    {summary.eventCount} event{summary.eventCount === 1 ? "" : "s"} · est. spend
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTab("insights")}
                className="mt-3 w-full rounded border border-[var(--app-border)] py-2 text-xs font-medium text-[var(--app-accent)] hover:bg-[var(--app-panel-elevated)]"
              >
                Open Insights for category breakdown →
              </button>
            </section>

            {event ? (
              <>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                  Selected event
                </h3>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="flex gap-3">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-[var(--app-text)] ${
                        eventCatMeta
                          ? dotClassForColorIndex(eventCatMeta.colorIndex)
                          : "bg-neutral-600"
                      }`}
                      aria-hidden
                    >
                      {event.title.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--app-text)]">{event.title}</p>
                      <p className="text-sm text-[var(--app-text-secondary)]">
                        {nameFor(categories, event.category)} ·{" "}
                        {format(event.start, "MMMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  {eventStatus ? statusBadge(eventStatus) : null}
                </div>

                <div className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-[var(--app-accent-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-accent)]">
                      Auto-estimated
                    </span>
                  </div>
                  <p className="text-xs text-[var(--app-text-muted)]">Estimated cost</p>
                  <p className="text-3xl font-semibold text-[var(--app-text)] tabular-nums">
                    ${eventCost.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                    Suggested: ${getSuggestedRange(event).min}–$
                    {getSuggestedRange(event).max}{" "}
                    <button type="button" className="text-[var(--app-accent)] hover:underline">
                      View details
                    </button>
                  </p>
                </div>

                <div className="mb-4 space-y-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[var(--app-text-muted)]">Post-event balance</span>
                    {editingPostBalance ? (
                      <div className="flex flex-1 items-center justify-end gap-2">
                        <input
                          type="number"
                          step={0.01}
                          className="w-28 rounded border border-[var(--app-border)] bg-[var(--app-input)] px-2 py-1 text-right text-sm text-[var(--app-text)] tabular-nums"
                          value={postBalanceDraft}
                          onChange={(e) => setPostBalanceDraft(e.target.value)}
                          aria-label="Post-event balance"
                        />
                        <button
                          type="button"
                          disabled={savingBalance}
                          onClick={handleSavePostBalance}
                          className="rounded bg-[var(--app-accent)] px-2 py-1 text-xs text-[var(--app-text)] disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPostBalance(false)}
                          className="rounded border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-text-secondary)]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--app-text)] tabular-nums">
                          ${postBalance.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPostBalanceDraft(postBalance.toFixed(2));
                            setEditingPostBalance(true);
                          }}
                          className="text-xs text-[var(--app-accent)] hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--app-text-muted)]">
                    Shown as current balance minus this event’s estimated cost. Editing sets your
                    stored balance to this amount plus the estimated cost above.
                  </p>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-[var(--app-text-muted)]">
                      <span>
                        ${catSpent.toFixed(0)} spent ({nameFor(categories, event.category)})
                      </span>
                      <span>Category budget: ${catBudget.toFixed(0)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
                      <div
                        className="h-full rounded-full bg-[var(--app-accent)]"
                        style={{ width: `${eventProgressPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-4 flex gap-2 rounded-lg border border-[var(--app-info-border)] bg-[var(--app-info-bg)] p-3 text-sm text-[var(--app-info-text)]">
                  <span className="text-[var(--app-accent)]" aria-hidden>
                    ✓
                  </span>
                  <p>{eventMessage}</p>
                </div>

                {editing ? (
                  <div className="mb-3 flex gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="flex-1 rounded border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm text-[var(--app-text)]"
                      placeholder="Amount (USD)"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleEditSubmit}
                      className="rounded bg-[var(--app-accent)] px-3 py-2 text-sm text-[var(--app-text)]"
                    >
                      Save
                    </button>
                  </div>
                ) : null}

                {isTracked ? (
                  <div className="mb-3 space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                      <span aria-hidden>✓</span>
                      <span>Tracked — spend is recorded and your balance was updated.</span>
                    </div>
                    {untrackErr ? (
                      <p className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                        {untrackErr}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={async () => {
                        setUntrackErr(null);
                        try {
                          await onUntrack(event.id);
                        } catch {
                          setUntrackErr("Could not remove tracking. Try again.");
                        }
                      }}
                      className="w-full rounded border border-amber-900/60 bg-amber-950/20 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-950/40"
                    >
                      Remove tracking (refund to balance)
                    </button>
                  </div>
                ) : (
                  <>
                    {trackErr ? (
                      <p className="mb-2 rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                        {trackErr}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleAcceptTrack()}
                      className="mb-3 w-full rounded bg-[var(--app-accent)] py-3 text-sm font-medium text-[var(--app-text)] transition hover:opacity-90"
                    >
                      Accept & Track →
                    </button>
                  </>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing((v) => !v);
                      setEditValue(String(eventCost));
                    }}
                    className="flex-1 rounded border border-[var(--app-border)] py-2.5 text-sm text-[var(--app-text)] hover:bg-[var(--app-panel-elevated)]"
                  >
                    Edit Cost
                  </button>
                  <button
                    type="button"
                    onClick={() => onIgnore(event.id)}
                    className="flex-1 rounded border border-[var(--app-border)] py-2.5 text-sm text-[var(--app-text)] hover:bg-[var(--app-panel-elevated)]"
                  >
                    Ignore
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--app-text-muted)]">
                Single-click an empty time slot to return to week-only view. Double-click the grid
                to create an event, or double-click an event to edit it. Calendar colors match
                categories — see the Insights tab for the key.
              </p>
            )}
          </>
        )}

        {tab === "insights" && (
          <>
            <section className="mb-6 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                This week — by category
              </h3>
              <p className="text-2xl font-semibold text-[var(--app-text)] tabular-nums">
                ${summary.weekTotalEstimated.toFixed(2)}
              </p>
              <p className="text-sm text-[var(--app-text-secondary)]">
                Estimated across {summary.eventCount} event
                {summary.eventCount === 1 ? "" : "s"}
              </p>
              <ul className="mt-3 space-y-2 border-t border-[var(--app-border)] pt-3">
                {Object.keys(summary.byCategory).map((catSlug) => {
                  const w = summary.byCategory[catSlug];
                  if (w <= 0) return null;
                  const cap = categoryBudgets[catSlug] ?? 0;
                  const spent = spentByCategory[catSlug] ?? 0;
                  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
                  const meta = categories.find((c) => c.slug === catSlug);
                  return (
                    <li key={catSlug} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${meta ? dotClassForColorIndex(meta.colorIndex) : "bg-neutral-500"}`}
                          aria-hidden
                        />
                        <div className="flex flex-1 justify-between gap-2 text-[var(--app-text-secondary)]">
                          <span>{nameFor(categories, catSlug)}</span>
                          <span className="text-[var(--app-text-secondary)]">
                            ${w.toFixed(0)} est. · ${spent.toFixed(0)} spent / ${cap.toFixed(0)}{" "}
                            cap
                          </span>
                        </div>
                      </div>
                      {cap > 0 ? (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--app-border)]">
                          <div
                            className="h-full rounded-full bg-[var(--app-accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="mb-6 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                Month to date (all categories)
              </h3>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--app-text-muted)]">Current balance</span>
                <span className="font-medium text-[var(--app-text)] tabular-nums">
                  ${currentBalanceUsd.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex justify-between text-xs text-[var(--app-text-muted)]">
                <span>${totalSpentMonth.toFixed(0)} spent</span>
                <span>Total monthly budgets: ${totalMonthlyBudget.toFixed(0)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
                <div
                  className="h-full rounded-full bg-[var(--app-accent)]"
                  style={{ width: `${monthProgressPct}%` }}
                />
              </div>
            </section>

            <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                Calendar color key
              </h3>
              <ul className="space-y-2 text-sm text-[var(--app-text-secondary)]">
                {categories.map((c) => (
                  <li key={c.slug} className="flex items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded ${dotClassForColorIndex(c.colorIndex)}`}
                      aria-hidden
                    />
                    <span>{c.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {tab === "budget" && (
          <div className="space-y-4 text-sm text-[var(--app-text-secondary)]">
            <p>
              Set monthly limits per category. Use <strong className="text-[var(--app-text)]">This month</strong>{" "}
              for overrides for {budgetMonthLabel}, or <strong className="text-[var(--app-text)]">Default (all months)</strong>{" "}
              for your baseline—both live in one editor.
            </p>
            <button
              type="button"
              onClick={onOpenBudgetModal}
              className="w-full rounded bg-[var(--app-accent)] py-3 text-sm font-medium text-[var(--app-text)] hover:opacity-90"
            >
              Edit budget goals
            </button>
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                This month ({budgetMonthLabel})
              </h3>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                {categories.map((c) => {
                  const cap = categoryBudgets[c.slug] ?? 0;
                  return (
                    <li
                      key={c.slug}
                      className="flex justify-between gap-2 border-b border-[var(--app-border)]/50 py-1.5 last:border-0"
                    >
                      <span className="text-[var(--app-text-secondary)]">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-[var(--app-text-secondary)]">
                        ${cap.toFixed(0)}/mo
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                Default goals (global)
              </h3>
              <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-[var(--app-text-muted)]">
                {categories.map((c) => {
                  const def = defaultCategoryBudgets[c.slug] ?? 0;
                  return (
                    <li key={c.slug} className="flex justify-between gap-2">
                      <span>{c.name}</span>
                      <span className="tabular-nums">${def.toFixed(0)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="text-xs text-[var(--app-text-muted)]">
              In the editor you can add new custom categories and set amounts. Built-in categories
              cannot be deleted.
            </p>
          </div>
        )}
        {tab === "settings" && (
          <div className="space-y-4 text-sm text-[var(--app-text-secondary)]">
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                Account balance
              </h3>
              <p className="mb-3 text-xs text-[var(--app-text-muted)]">
                Correct your stored balance if it was thrown off by duplicate tracking or manual
                adjustments. This value drives Insights and post-event projections.
              </p>
              <label className="mb-2 block text-xs text-[var(--app-text-muted)]" htmlFor="settings-balance">
                Current balance (USD)
              </label>
              <div className="flex gap-2">
                <input
                  id="settings-balance"
                  type="number"
                  step={0.01}
                  className="flex-1 rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)] tabular-nums"
                  value={settingsBalanceDraft}
                  onChange={(e) => setSettingsBalanceDraft(e.target.value)}
                />
                <button
                  type="button"
                  disabled={savingBalance}
                  onClick={() => void handleSaveSettingsBalance()}
                  className="rounded bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-[var(--app-text)] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="flex border-t border-[var(--app-border)] bg-[var(--app-bg)]">
        {(
          [
            ["overview", "Overview"],
            ["insights", "Insights"],
            ["budget", "Budget"],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-1 py-3 text-[10px] ${
              tab === id
                ? "text-[var(--app-accent)]"
                : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            <span className="text-lg opacity-80">
              {id === "overview" ? "◉" : id === "insights" ? "📊" : id === "budget" ? "◫" : "⚙"}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
