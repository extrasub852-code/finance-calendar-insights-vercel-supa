import { format } from "date-fns";

type Props = {
  open: boolean;
  yearMonth: string;
  onEditBudgets: () => void;
  onDismiss: () => void;
};

export function MonthBudgetPromptModal({
  open,
  yearMonth,
  onEditBudgets,
  onDismiss,
}: Props) {
  if (!open) return null;

  const label = format(new Date(yearMonth + "-01"), "MMMM yyyy");

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-[var(--app-overlay)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="month-prompt-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-2xl">
        <h2 id="month-prompt-title" className="text-lg font-semibold text-[var(--app-text)]">
          Viewing {label}
        </h2>
        <p className="mt-3 text-sm text-[var(--app-text-secondary)]">
          Do you want to set or adjust your monthly budget goals specifically for this month?
          Monthly overrides can differ from your default budgets.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-[var(--app-border)] px-4 py-2.5 text-sm text-[var(--app-text)] hover:bg-[var(--app-panel-elevated)]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onEditBudgets}
            className="rounded bg-[var(--app-accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Edit budgets for {label}
          </button>
        </div>
      </div>
    </div>
  );
}
