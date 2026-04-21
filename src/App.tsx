import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, startOfWeek } from "date-fns";
import { LeftNav } from "./components/LeftNav";
import { MiniCalendar } from "./components/MiniCalendar";
import { WeekCalendar } from "./components/WeekCalendar";
import { FinanceInsightsPanel } from "./components/FinanceInsightsPanel";
import { EventModal } from "./components/EventModal";
import { EventEditModal } from "./components/EventEditModal";
import { BudgetOnboardingModal } from "./components/BudgetOnboardingModal";
import { BudgetGoalsModal } from "./components/BudgetGoalsModal";
import { MonthBudgetPromptModal } from "./components/MonthBudgetPromptModal";
import { AuthScreen } from "./components/AuthScreen";
import type {
  CalendarEvent,
  ExpenseKindTag,
  RecurrenceRule,
  UserCategoryDto,
} from "./types";
import {
  createEventApi,
  deleteEventApi,
  fetchAuthMe,
  fetchBootstrap,
  logoutApi,
  mapApiEventToCalendar,
  patchEventApi,
  patchUserBalanceApi,
  submitOnboarding,
  trackExpenseApi,
  untrackEventApi,
  type AuthUser,
} from "./api";

function parseLocalDateTime(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi ?? 0, 0, 0);
}

function recurrenceEndToIso(dateStr: string): string | undefined {
  const t = dateStr.trim();
  if (!t) return undefined;
  const [y, mo, d] = t.split("-").map(Number);
  if (!y || !mo || !d) return undefined;
  return new Date(y, mo - 1, d, 23, 59, 59, 999).toISOString();
}

export default function App() {
  const [authPhase, setAuthPhase] = useState<"checking" | "guest" | "signedIn">("checking");
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<UserCategoryDto[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [defaultCategoryBudgets, setDefaultCategoryBudgets] = useState<
    Record<string, number>
  >({});
  const [spentByCategory, setSpentByCategory] = useState<Record<string, number>>({});
  const [trackedEventIds, setTrackedEventIds] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editModalEventId, setEditModalEventId] = useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 }),
  );
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaults, setModalDefaults] = useState<{
    day: Date;
    hour: number;
  }>({ day: new Date(), hour: 9 });

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [currentBalanceUsd, setCurrentBalanceUsd] = useState(0);

  const [monthPromptOpen, setMonthPromptOpen] = useState(false);
  const [monthPromptYm, setMonthPromptYm] = useState<string | null>(null);
  const prevBudgetMonthKey = useRef<string | null>(null);

  const budgetMonthKey = format(visibleMonth, "yyyy-MM");
  const budgetMonthLabel = format(visibleMonth, "MMMM yyyy");

  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetModalCtx, setBudgetModalCtx] = useState<{
    yearMonth: string;
    initialTab: "month" | "global";
  }>({ yearMonth: "", initialTab: "month" });

  const openBudgetModal = useCallback(
    (opts?: { yearMonth?: string; initialTab?: "month" | "global" }) => {
      setBudgetModalCtx({
        yearMonth: opts?.yearMonth ?? budgetMonthKey,
        initialTab: opts?.initialTab ?? "month",
      });
      setBudgetModalOpen(true);
    },
    [budgetMonthKey],
  );

  const refresh = useCallback(async () => {
    const data = await fetchBootstrap(budgetMonthKey);
    const user = data.user;
    setSessionUser((prev) =>
      prev
        ? {
            ...prev,
            currentBalanceUsd: user?.currentBalanceUsd ?? prev.currentBalanceUsd,
            onboardingComplete: user?.onboardingComplete ?? prev.onboardingComplete,
            email: user?.email ?? prev.email,
            displayName: user?.displayName ?? prev.displayName,
          }
        : prev,
    );
    setCurrentBalanceUsd(user?.currentBalanceUsd ?? 0);
    const done = user?.onboardingComplete ?? false;
    setOnboardingComplete(done);
    setShowOnboarding(!done);
    setCategories(Array.isArray(data.categories) ? data.categories : []);
    setCategoryBudgets(
      data.categoryBudgets && typeof data.categoryBudgets === "object"
        ? data.categoryBudgets
        : {},
    );
    setDefaultCategoryBudgets(
      data.defaultCategoryBudgets && typeof data.defaultCategoryBudgets === "object"
        ? data.defaultCategoryBudgets
        : {},
    );
    setSpentByCategory(
      data.spentByCategory && typeof data.spentByCategory === "object"
        ? data.spentByCategory
        : {},
    );
    setEvents(
      Array.isArray(data.events) ? data.events.map(mapApiEventToCalendar) : [],
    );
    setTrackedEventIds(
      Array.isArray(data.trackedEventIds) ? data.trackedEventIds : [],
    );
  }, [budgetMonthKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchAuthMe();
        if (cancelled) return;
        if (me) {
          setSessionUser(me);
          setAuthPhase("signedIn");
        } else {
          setAuthPhase("guest");
        }
      } catch {
        if (!cancelled) setAuthPhase("guest");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const initialLoad = useRef(true);
  useEffect(() => {
    if (authPhase !== "signedIn") return;
    let cancelled = false;
    (async () => {
      try {
        if (initialLoad.current) setLoading(true);
        setLoadError(null);
        await refresh();
      } catch (err) {
        if (!cancelled) {
          if (err instanceof Error && err.message === "session_expired") {
            setSessionUser(null);
            setAuthPhase("guest");
            setLoadError(null);
          } else {
            setLoadError(
              err instanceof Error
                ? err.message
                : "Could not reach the API. Is the server running?",
            );
          }
        }
      } finally {
        if (!cancelled && initialLoad.current) {
          setLoading(false);
          initialLoad.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authPhase, refresh]);

  const handleAuthenticated = useCallback((user: AuthUser) => {
    setSessionUser(user);
    setAuthPhase("signedIn");
    initialLoad.current = true;
    setLoading(true);
    setLoadError(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutApi();
    setSessionUser(null);
    setAuthPhase("guest");
    setEvents([]);
    setCategories([]);
    setCategoryBudgets({});
    setDefaultCategoryBudgets({});
    setSpentByCategory({});
    setTrackedEventIds([]);
    setOnboardingComplete(false);
    setShowOnboarding(false);
    setCurrentBalanceUsd(0);
    initialLoad.current = true;
    prevBudgetMonthKey.current = null;
  }, []);

  useEffect(() => {
    if (prevBudgetMonthKey.current === null) {
      prevBudgetMonthKey.current = budgetMonthKey;
      return;
    }
    if (prevBudgetMonthKey.current === budgetMonthKey) return;
    prevBudgetMonthKey.current = budgetMonthKey;
    const uid = sessionUser?.id ?? "";
    if (!uid) return;
    if (sessionStorage.getItem(`skipMonthBudgetPrompt_${uid}_${budgetMonthKey}`)) return;
    setMonthPromptYm(budgetMonthKey);
    setMonthPromptOpen(true);
  }, [budgetMonthKey, sessionUser?.id]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  const editModalEvent = useMemo(
    () => events.find((e) => e.id === editModalEventId) ?? null,
    [events, editModalEventId],
  );

  const openNewEvent = useCallback((day?: Date, hour?: number) => {
    const d = day ?? selectedDate;
    setModalDefaults({ day: d, hour: hour ?? 9 });
    setModalOpen(true);
  }, [selectedDate]);

  const handleOnboarding = useCallback(
    async (payload: {
      currentBalanceUsd: number;
      budgets: Record<string, number>;
    }) => {
      await submitOnboarding(payload);
      setShowOnboarding(false);
      await refresh();
    },
    [refresh],
  );

  const handleCreate = useCallback(
    async (payload: {
      title: string;
      dateStr: string;
      startTime: string;
      endTime: string;
      category: string;
      costOverride: string;
      recurrence: RecurrenceRule | "none";
      recurrenceEnd: string;
      expenseKind: ExpenseKindTag | "";
    }) => {
      const start = parseLocalDateTime(payload.dateStr, payload.startTime);
      const end = parseLocalDateTime(payload.dateStr, payload.endTime);
      if (end <= start) {
        end.setTime(start.getTime() + 60 * 60 * 1000);
      }
      const cost = payload.costOverride
        ? parseFloat(payload.costOverride)
        : NaN;
      const body: Parameters<typeof createEventApi>[0] = {
        title: payload.title,
        start: start.toISOString(),
        end: end.toISOString(),
        category: payload.category,
      };
      if (Number.isFinite(cost)) body.estimatedCostUsd = cost;
      if (payload.recurrence !== "none") {
        body.recurrence = payload.recurrence;
        const reIso = recurrenceEndToIso(payload.recurrenceEnd);
        if (reIso) body.recurrenceEnd = reIso;
      }
      if (payload.expenseKind) body.expenseKind = payload.expenseKind;
      const created = await createEventApi(body);
      await refresh();
      const recurring = Boolean(created.recurrence);
      const sel = recurring
        ? `${created.id}#${new Date(created.start).getTime()}`
        : created.id;
      setSelectedId(sel);
      setWeekAnchor(startOfWeek(start, { weekStartsOn: 0 }));
    },
    [refresh],
  );

  const handleEditEventSave = useCallback(
    async (payload: {
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
    }) => {
      const start = parseLocalDateTime(payload.dateStr, payload.startTime);
      const end = parseLocalDateTime(payload.dateStr, payload.endTime);
      if (end <= start) {
        end.setTime(start.getTime() + 60 * 60 * 1000);
      }
      const cost = payload.costOverride
        ? parseFloat(payload.costOverride)
        : NaN;
      const body: Parameters<typeof patchEventApi>[1] = {
        title: payload.title,
        start: start.toISOString(),
        end: end.toISOString(),
        category: payload.category,
        estimatedCostUsd: Number.isFinite(cost) ? cost : null,
        recurrence: payload.recurrence === "none" ? null : payload.recurrence,
        recurrenceEnd:
          payload.recurrenceEnd.trim() === ""
            ? null
            : (recurrenceEndToIso(payload.recurrenceEnd) ?? null),
        expenseKind: payload.expenseKind || null,
      };
      await patchEventApi(payload.id, body);
      await refresh();
      setWeekAnchor(startOfWeek(start, { weekStartsOn: 0 }));
    },
    [refresh],
  );

  const handleEditEventDelete = useCallback(
    async (id: string) => {
      await deleteEventApi(id);
      await refresh();
      setSelectedId(null);
      setEditModalEventId(null);
    },
    [refresh],
  );

  const dismissMonthPrompt = () => {
    if (monthPromptYm && sessionUser?.id) {
      sessionStorage.setItem(
        `skipMonthBudgetPrompt_${sessionUser.id}_${monthPromptYm}`,
        "1",
      );
    }
    setMonthPromptOpen(false);
    setMonthPromptYm(null);
  };

  const openMonthBudgetEditor = () => {
    if (monthPromptYm && sessionUser?.id) {
      sessionStorage.setItem(
        `skipMonthBudgetPrompt_${sessionUser.id}_${monthPromptYm}`,
        "1",
      );
    }
    setMonthPromptOpen(false);
    if (monthPromptYm) {
      openBudgetModal({ yearMonth: monthPromptYm, initialTab: "month" });
    }
    setMonthPromptYm(null);
  };

  if (authPhase === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--app-bg)] text-[var(--app-text-muted)]">
        Loading…
      </div>
    );
  }

  if (authPhase === "guest") {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--app-bg)] text-[var(--app-text-muted)]">
        Loading…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[var(--app-bg)] px-6 text-center">
        <p className="text-[var(--app-text)]">{loadError}</p>
        <p className="max-w-md text-sm text-[var(--app-text-muted)]">
          Run <code className="rounded bg-[var(--app-code-bg)] px-1.5 py-0.5">npm run dev</code> so
          the API and Vite start together (API on port 3001).
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--app-bg)]">
      <BudgetOnboardingModal
        open={showOnboarding}
        onComplete={handleOnboarding}
      />

      <MonthBudgetPromptModal
        open={monthPromptOpen && monthPromptYm != null}
        yearMonth={monthPromptYm ?? budgetMonthKey}
        onDismiss={dismissMonthPrompt}
        onEditBudgets={openMonthBudgetEditor}
      />

      <BudgetGoalsModal
        open={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        yearMonth={budgetModalCtx.yearMonth}
        initialTab={budgetModalCtx.initialTab}
        categories={categories}
        defaultBudgets={defaultCategoryBudgets}
        monthBudgets={categoryBudgets}
        onSaved={refresh}
      />

      <LeftNav
        onNewEvent={() => openNewEvent()}
        profileLabel={sessionUser?.displayName?.trim() || sessionUser?.email || "Account"}
        profileDetail={
          sessionUser?.displayName?.trim() ? sessionUser?.email ?? undefined : undefined
        }
        onLogout={handleLogout}
      >
        <MiniCalendar
          visibleMonth={visibleMonth}
          onMonthChange={setVisibleMonth}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setWeekAnchor(startOfWeek(d, { weekStartsOn: 0 }));
          }}
        />
      </LeftNav>

      <WeekCalendar
        weekAnchor={weekAnchor}
        onWeekChange={setWeekAnchor}
        events={events}
        categories={categories}
        selectedId={selectedId}
        onSelectEvent={setSelectedId}
        onClearSelection={() => setSelectedId(null)}
        onSlotDoubleClick={(day, hour) => openNewEvent(day, hour)}
        onEventDoubleClick={(id) => setEditModalEventId(id)}
      />

      <FinanceInsightsPanel
        budgetMonthLabel={budgetMonthLabel}
        categories={categories}
        weekAnchor={weekAnchor}
        events={events}
        categoryBudgets={categoryBudgets}
        defaultCategoryBudgets={defaultCategoryBudgets}
        spentByCategory={spentByCategory}
        currentBalanceUsd={currentBalanceUsd}
        trackedEventIds={trackedEventIds}
        event={onboardingComplete ? selectedEvent : null}
        onAcceptTrack={async (_id, amountUsd) => {
          if (!selectedEvent) return;
          const out = await trackExpenseApi({
            eventId: selectedEvent.id,
            amountUsd,
            category: selectedEvent.category,
            yearMonth: budgetMonthKey,
          });
          setCurrentBalanceUsd(out.currentBalanceUsd);
          setSpentByCategory(out.spentByCategory);
          await refresh();
        }}
        onUntrack={async (eventId) => {
          const out = await untrackEventApi(eventId);
          setCurrentBalanceUsd(out.currentBalanceUsd);
          await refresh();
        }}
        onSaveAccountBalance={async (nextUsd) => {
          const out = await patchUserBalanceApi(nextUsd);
          setCurrentBalanceUsd(out.currentBalanceUsd);
          await refresh();
        }}
        onEditCost={async (id, amountUsd) => {
          await patchEventApi(id, { estimatedCostUsd: amountUsd });
          await refresh();
        }}
        onIgnore={() => setSelectedId(null)}
        onOpenBudgetModal={() => openBudgetModal()}
      />

      <EventModal
        key={`${modalDefaults.day.toISOString()}-${modalDefaults.hour}-${categories.length}`}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultDay={modalDefaults.day}
        defaultHour={modalDefaults.hour}
        categories={categories}
        onCreate={handleCreate}
      />

      <EventEditModal
        key={editModalEvent?.id ?? "closed"}
        open={editModalEvent != null}
        event={editModalEvent}
        categories={categories}
        onClose={() => setEditModalEventId(null)}
        onSave={handleEditEventSave}
        onDelete={handleEditEventDelete}
      />
    </div>
  );
}
