import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import type { UserCategoryDto } from "../types";
import {
  createCategoryApi,
  deleteCategoryApi,
  updateGlobalBudgetsApi,
  updateMonthBudgetsApi,
} from "../api";

type Tab = "month" | "global";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Which month the “This month” tab edits (YYYY-MM) */
  yearMonth: string;
  /** First tab to show when the modal opens */
  initialTab?: Tab;
  categories: UserCategoryDto[];
  defaultBudgets: Record<string, number>;
  monthBudgets: Record<string, number>;
  onSaved: () => void;
};

function initAmounts(
  categories: UserCategoryDto[],
  budgets: Record<string, number>,
): Record<string, string> {
  const o: Record<string, string> = {};
  for (const c of categories ?? []) {
    const v = budgets[c.slug];
    o[c.slug] = v != null && Number.isFinite(v) ? String(v) : "0";
  }
  return o;
}

export function BudgetGoalsModal({
  open,
  onClose,
  yearMonth,
  initialTab = "month",
  categories,
  defaultBudgets,
  monthBudgets,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [globalAmounts, setGlobalAmounts] = useState<Record<string, string>>({});
  const [monthAmounts, setMonthAmounts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setGlobalAmounts(initAmounts(categories, defaultBudgets));
    setMonthAmounts(initAmounts(categories, monthBudgets));
    setNewName("");
    setError(null);
  }, [open, initialTab, categories, defaultBudgets, monthBudgets]);

  const monthLabel = yearMonth
    ? format(new Date(yearMonth + "-01"), "MMMM yyyy")
    : "";

  const activeAmounts = tab === "global" ? globalAmounts : monthAmounts;
  const setActiveAmounts = tab === "global" ? setGlobalAmounts : setMonthAmounts;

  const sumParsed = useMemo(() => {
    let s = 0;
    for (const c of categories) {
      const v = parseFloat(activeAmounts[c.slug] ?? "0");
      if (Number.isFinite(v) && v >= 0) s += v;
    }
    return s;
  }, [activeAmounts, categories]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const src = tab === "global" ? globalAmounts : monthAmounts;
      const budgets: Record<string, number> = {};
      for (const c of categories) {
        const v = parseFloat(src[c.slug] ?? "0");
        budgets[c.slug] = Number.isFinite(v) && v >= 0 ? v : 0;
      }
      if (tab === "global") {
        await updateGlobalBudgetsApi(budgets);
      } else {
        await updateMonthBudgetsApi(yearMonth, budgets);
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not save budgets. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    const n = newName.trim();
    if (!n) return;
    setSaving(true);
    setError(null);
    try {
      await createCategoryApi(n);
      setNewName("");
      onSaved();
    } catch {
      setError("Could not create category.");
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async (c: UserCategoryDto) => {
    if (c.isBuiltIn) return;
    if (!window.confirm(`Remove “${c.name}”? Only allowed if no events use it.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCategoryApi(c.slug);
      onSaved();
    } catch {
      setError("Could not remove category (it may still be used by events).");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--app-overlay)] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-2xl">
        <div className="border-b border-[var(--app-border)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--app-text)]">Budget goals</h2>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
            Defaults apply every month unless you set an override for a specific month.
          </p>
          <div className="mt-4 flex rounded-lg bg-[var(--app-input)] p-1 ring-1 ring-[var(--app-border)]">
            <button
              type="button"
              onClick={() => setTab("month")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                tab === "month"
                  ? "bg-[var(--app-accent-muted)] text-[var(--app-text)]"
                  : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
              }`}
            >
              This month ({monthLabel})
            </button>
            <button
              type="button"
              onClick={() => setTab("global")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                tab === "global"
                  ? "bg-[var(--app-accent-muted)] text-[var(--app-text)]"
                  : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
              }`}
            >
              Default (all months)
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--app-text-muted)]">
            {tab === "global"
              ? "Edits your baseline monthly amounts for every category."
              : `Overrides apply only to ${monthLabel}. They replace defaults for this month.`}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-4">
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.slug} className="flex items-center gap-2">
                <label className="w-36 shrink-0 truncate text-sm text-[var(--app-text-secondary)]">
                  {c.name}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="flex-1 rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
                  value={activeAmounts[c.slug] ?? "0"}
                  onChange={(e) =>
                    setActiveAmounts((prev) => ({ ...prev, [c.slug]: e.target.value }))
                  }
                />
                {!c.isBuiltIn ? (
                  <button
                    type="button"
                    onClick={() => removeCategory(c)}
                    className="shrink-0 text-xs text-red-500 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="w-12 shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text-muted)]">
            Total: ${sumParsed.toFixed(2)}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--app-border)] pt-4">
            <input
              type="text"
              className="min-w-[160px] flex-1 rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
              placeholder="New category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="button"
              onClick={addCategory}
              disabled={saving || !newName.trim()}
              className="rounded border border-[var(--app-accent)] px-3 py-2 text-sm text-[var(--app-accent)] hover:bg-[var(--app-accent-muted)] disabled:opacity-50"
            >
              Add category
            </button>
          </div>

          {error ? (
            <p className="text-sm text-red-500 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-elevated)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
