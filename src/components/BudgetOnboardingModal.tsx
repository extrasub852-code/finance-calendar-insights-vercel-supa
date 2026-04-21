import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ONBOARDING_LABELS, ONBOARDING_SLUGS } from "../types";

type Props = {
  open: boolean;
  onComplete: (payload: {
    currentBalanceUsd: number;
    budgets: Record<string, number>;
  }) => void | Promise<void>;
};

const DEFAULTS: Record<string, number> = {
  social: 400,
  work: 200,
  travel: 300,
  health: 150,
  other: 200,
};

const DEFAULT_TOTAL = ONBOARDING_SLUGS.reduce((s, c) => s + DEFAULTS[c], 0);

/** Scale category defaults so they sum to `monthlyTotal`. */
function scaleDefaultsToMonthly(monthlyTotal: number): Record<string, string> {
  if (!Number.isFinite(monthlyTotal) || monthlyTotal <= 0) {
    const o: Record<string, string> = {};
    for (const c of ONBOARDING_SLUGS) o[c] = String(DEFAULTS[c]);
    return o;
  }
  const scale = monthlyTotal / DEFAULT_TOTAL;
  const o: Record<string, string> = {};
  for (const c of ONBOARDING_SLUGS) {
    o[c] = (DEFAULTS[c] * scale).toFixed(2);
  }
  return o;
}

export function BudgetOnboardingModal({ open, onComplete }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [annualSalary, setAnnualSalary] = useState("72000");
  const [totalTarget, setTotalTarget] = useState(String(DEFAULT_TOTAL));
  const [budgets, setBudgets] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const c of ONBOARDING_SLUGS) o[c] = String(DEFAULTS[c]);
    return o;
  });

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAnnualSalary("72000");
    setTotalTarget(String(DEFAULT_TOTAL));
    setBudgets(() => {
      const o: Record<string, string> = {};
      for (const c of ONBOARDING_SLUGS) o[c] = String(DEFAULTS[c]);
      return o;
    });
  }, [open]);

  const monthlyFromAnnual = useMemo(() => {
    const y = parseFloat(annualSalary);
    if (!Number.isFinite(y) || y <= 0) return NaN;
    return y / 12;
  }, [annualSalary]);

  const parsed = useMemo(() => {
    const target = parseFloat(totalTarget);
    const parts: Record<string, number> = {};
    let sum = 0;
    for (const c of ONBOARDING_SLUGS) {
      const v = parseFloat(budgets[c] ?? "0");
      const n = Number.isFinite(v) && v >= 0 ? v : 0;
      parts[c] = n;
      sum += n;
    }
    return {
      target: Number.isFinite(target) ? target : NaN,
      parts,
      sum,
    };
  }, [totalTarget, budgets]);

  const splitError = useMemo(() => {
    if (!Number.isFinite(parsed.target) || parsed.target <= 0) {
      return "Enter a positive total monthly budget to split across categories.";
    }
    const diff = Math.abs(parsed.sum - parsed.target);
    if (diff > 0.02) {
      const sign = parsed.sum > parsed.target ? "over" : "under";
      return `Category amounts must add up to your total monthly budget ($${parsed.target.toFixed(2)}). They currently add to $${parsed.sum.toFixed(2)} — $${sign} by $${Math.abs(parsed.sum - parsed.target).toFixed(2)}.`;
    }
    return null;
  }, [parsed]);

  const goToStep2 = () => setStep(2);
  const goToStep3 = () => {
    if (!Number.isFinite(monthlyFromAnnual) || monthlyFromAnnual <= 0) return;
    const m = monthlyFromAnnual;
    setTotalTarget(m.toFixed(2));
    setBudgets(scaleDefaultsToMonthly(m));
    setStep(3);
  };

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (splitError) return;
    if (!Number.isFinite(parsed.target) || parsed.target <= 0) return;
    await onComplete({
      currentBalanceUsd: parsed.target,
      budgets: parsed.parts,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--app-overlay)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-2xl">
        <div className="border-b border-[var(--app-border)] px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
            Step {step} of 3
          </p>
          <h2 id="onboarding-title" className="mt-1 text-xl font-semibold text-[var(--app-text)]">
            {step === 1 && "Welcome"}
            {step === 2 && "Your income"}
            {step === 3 && "Monthly budgets"}
          </h2>
        </div>

        {step === 1 && (
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm leading-relaxed text-[var(--app-text-secondary)]">
              <strong className="text-[var(--app-text)]">Finance Calendar Insights</strong> combines
              a week calendar with spending and budget context so you can plan events, bills, and
              subscriptions without losing sight of money.
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-[var(--app-text-secondary)]">
              <li>
                <span className="text-[var(--app-text)]">Calendar:</span> add events (including
                recurring rent, utilities, subscriptions) and see them on the week view.
              </li>
              <li>
                <span className="text-[var(--app-text)]">Insights panel:</span> select an event for
                estimates vs your category budgets, and track real spend against your balance.
              </li>
              <li>
                <span className="text-[var(--app-text)]">Budgets:</span> set monthly limits by
                category; the overview shows how the week fits your month.
              </li>
            </ul>
            <p className="text-xs text-[var(--app-text-muted)]">
              Next, you&apos;ll enter your annual salary—we&apos;ll derive a monthly amount to seed
              your budgets. You can adjust everything later in settings.
            </p>
            <button
              type="button"
              onClick={goToStep2}
              className="w-full rounded bg-[var(--app-accent)] py-3 text-sm font-medium text-white hover:opacity-90"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 px-6 py-5">
            <p className="text-sm text-[var(--app-text-secondary)]">
              Enter your <strong className="text-[var(--app-text)]">annual salary</strong> (before
              tax is fine for a rough plan). We divide by 12 to suggest{" "}
              <strong className="text-[var(--app-text)]">monthly budget limits</strong> on the next
              step. Your stored account balance will start at that same monthly total so insights
              stay consistent.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">
                Annual salary (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
                value={annualSalary}
                onChange={(e) => setAnnualSalary(e.target.value)}
                required
              />
              <p className="mt-2 rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text-secondary)]">
                <span className="text-[var(--app-text-muted)]">≈ Monthly (salary ÷ 12): </span>
                <span className="font-semibold tabular-nums text-[var(--app-text)]">
                  {Number.isFinite(monthlyFromAnnual)
                    ? `$${monthlyFromAnnual.toFixed(2)}`
                    : "—"}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded border border-[var(--app-border)] py-3 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-panel-elevated)]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!Number.isFinite(monthlyFromAnnual) || monthlyFromAnnual <= 0}
                onClick={goToStep3}
                className="flex-1 rounded bg-[var(--app-accent)] py-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={submit} className="space-y-5 px-6 py-5">
            <p className="text-sm text-[var(--app-text-secondary)]">
              Split your <strong className="text-[var(--app-text)]">total monthly budget</strong>{" "}
              across categories. Amounts must add up exactly (within one cent). Your{" "}
              <strong className="text-[var(--app-text)]">account balance</strong> starts at this
              total so the overview matches your plan—you can edit it anytime in Settings.
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-secondary)]">
                Total monthly budget to split (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-full rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
                value={totalTarget}
                onChange={(e) => setTotalTarget(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                Pre-filled from annual salary ÷ 12. Adjust if you want a different monthly cap.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
                Split by category
              </p>
              {ONBOARDING_SLUGS.map((cat) => (
                <div key={cat} className="flex items-center gap-3">
                  <label className="w-24 shrink-0 text-sm text-[var(--app-text-secondary)]">
                    {ONBOARDING_LABELS[cat]}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="flex-1 rounded border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)]"
                    value={budgets[cat]}
                    onChange={(e) =>
                      setBudgets((prev) => ({ ...prev, [cat]: e.target.value }))
                    }
                    required
                  />
                </div>
              ))}
              <div
                className={`rounded border px-3 py-2 text-sm ${
                  splitError && parsed.target > 0
                    ? "border-red-800 bg-red-950/40 text-red-200"
                    : "border-[var(--app-border)] bg-[var(--app-input)] text-[var(--app-text-secondary)]"
                }`}
                role="status"
              >
                <span className="text-[var(--app-text-muted)]">Sum of categories: </span>
                <span className="font-medium tabular-nums">${parsed.sum.toFixed(2)}</span>
                <span className="text-[var(--app-text-muted)]"> / target </span>
                <span className="font-medium tabular-nums">
                  ${Number.isFinite(parsed.target) ? parsed.target.toFixed(2) : "—"}
                </span>
              </div>
            </div>

            {splitError && (
              <div
                className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-100"
                role="alert"
              >
                {splitError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 rounded border border-[var(--app-border)] py-3 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-panel-elevated)]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!!splitError}
                className="flex-1 rounded bg-[var(--app-accent)] py-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save and continue
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
