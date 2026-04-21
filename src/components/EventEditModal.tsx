import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import type { CalendarEvent, ExpenseKindTag, RecurrenceRule, UserCategoryDto } from "../types";

type Props = {
  open: boolean;
  event: CalendarEvent | null;
  categories: UserCategoryDto[];
  onClose: () => void;
  onSave: (payload: {
    id: string;
    title: string;
    dateStr: string;
    startTime: string;
    endTime: string;
    category: string;
    costOverride: string;
    recurrence: RecurrenceRule | "none";
    recurrenceEnd: string;
    expenseKind: ExpenseKindTag | "";
  }) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export function EventEditModal({
  open,
  event,
  categories,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [category, setCategory] = useState("social");
  const [costOverride, setCostOverride] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceRule | "none">("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [expenseKind, setExpenseKind] = useState<ExpenseKindTag | "">("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !event) return;
    setTitle(event.title);
    setDateStr(format(event.start, "yyyy-MM-dd"));
    setStartTime(format(event.start, "HH:mm"));
    setEndTime(format(event.end, "HH:mm"));
    setCategory(event.category);
    setCostOverride(
      event.estimatedCostUsd != null ? String(event.estimatedCostUsd) : "",
    );
    setRecurrence(event.recurrence ?? "none");
    setRecurrenceEnd(
      event.recurrenceEnd ? format(event.recurrenceEnd, "yyyy-MM-dd") : "",
    );
    setExpenseKind(event.expenseKind ?? "");
  }, [open, event]);

  if (!open || !event) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        id: event.id,
        title: title.trim(),
        dateStr,
        startTime,
        endTime,
        category,
        costOverride: costOverride.trim(),
        recurrence,
        recurrenceEnd: recurrenceEnd.trim(),
        expenseKind,
      });
      onClose();
    } catch {
      /* toast later */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete “${event.title}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(event.id);
      onClose();
    } catch {
      /* toast later */
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--app-overlay)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-event-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-2xl">
        <div className="border-b border-[var(--app-border)] px-5 py-4">
          <h2 id="edit-event-title" className="text-lg font-semibold text-[var(--app-text)]">
            Edit event
          </h2>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
            Double-click an event on the calendar to open this dialog.
            {event.recurrence ? (
              <span className="mt-1 block">
                Repeating event: date changes shift the whole series.
              </span>
            ) : null}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">Title</label>
            <input
              className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">Date</label>
            <input
              type="date"
              className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">Start</label>
              <input
                type="time"
                className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">End</label>
              <input
                type="time"
                className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">Category</label>
            <select
              className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">
              Expense tag (optional)
            </label>
            <select
              className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
              value={expenseKind}
              onChange={(e) =>
                setExpenseKind(e.target.value as ExpenseKindTag | "")
              }
            >
              <option value="">None</option>
              <option value="rent">Rent / housing</option>
              <option value="utilities">Utilities</option>
              <option value="subscription">Subscription</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">
              Repeat
            </label>
            <select
              className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as RecurrenceRule | "none")
              }
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          {recurrence !== "none" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">
                Repeat until (optional)
              </label>
              <input
                type="date"
                className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
                value={recurrenceEnd}
                onChange={(e) => setRecurrenceEnd(e.target.value)}
              />
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">
              Estimated cost (USD, optional)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
              value={costOverride}
              onChange={(e) => setCostOverride(e.target.value)}
              placeholder="Leave blank for category default"
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="rounded border border-red-900/80 bg-red-950/40 px-4 py-2 text-sm text-red-200 hover:bg-red-950/60 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-text)] hover:bg-[var(--app-panel-elevated)]"
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
          </div>
        </form>
      </div>
    </div>
  );
}
