import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";

type Props = {
  visibleMonth: Date;
  onMonthChange: (d: Date) => void;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
};

export function MiniCalendar({
  visibleMonth,
  onMonthChange,
  selectedDate,
  onSelectDate,
}: Props) {
  const start = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });
  const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="border-t border-[var(--app-border)] p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <button
          type="button"
          className="rounded px-1 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
          onClick={() => onMonthChange(addMonths(visibleMonth, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="font-medium text-[var(--app-text)]">
          {format(visibleMonth, "MMMM yyyy")}
        </span>
        <button
          type="button"
          className="rounded px-1 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
          onClick={() => onMonthChange(addMonths(visibleMonth, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-[var(--app-text-muted)]">
        {weekDays.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {days.map((day) => {
          const inMonth = isSameMonth(day, visibleMonth);
          const sel =
            format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              className={`aspect-square rounded p-0.5 ${
                !inMonth ? "text-[var(--app-text-muted)]" : "text-[var(--app-text-secondary)]"
              } ${sel ? "bg-[var(--app-accent)] font-semibold text-white" : ""} ${
                today && !sel ? "ring-1 ring-[var(--app-accent)]/60" : ""
              } hover:bg-[var(--app-cal-day-hover)]`}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
