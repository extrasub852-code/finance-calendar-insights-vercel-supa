import {
  addDays,
  addWeeks,
  differenceInMinutes,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent, UserCategoryDto } from "../types";
import { eventStyleForCategory } from "../categoryColors";

const HOUR_START = 6;
const HOUR_END = 22;
const PX_PER_HOUR = 48;
const TOTAL_HOURS = HOUR_END - HOUR_START;

type Props = {
  weekAnchor: Date;
  onWeekChange: (d: Date) => void;
  events: CalendarEvent[];
  categories: UserCategoryDto[];
  selectedId: string | null;
  onSelectEvent: (id: string) => void;
  /** Single-click empty slot clears event selection (week-only insights). */
  onClearSelection?: () => void;
  /** Fires on double-click on an empty time slot (create event). */
  onSlotDoubleClick?: (day: Date, hour: number) => void;
  /** Fires on double-click an event (edit / delete). */
  onEventDoubleClick?: (id: string) => void;
};

function eventTop(start: Date): number {
  const h = start.getHours() + start.getMinutes() / 60;
  const rel = Math.max(0, h - HOUR_START);
  return rel * PX_PER_HOUR;
}

function eventHeight(start: Date, end: Date): number {
  const mins = differenceInMinutes(end, start);
  return Math.max((mins / 60) * PX_PER_HOUR, 20);
}

export function WeekCalendar({
  weekAnchor,
  onWeekChange,
  events,
  categories,
  selectedId,
  onSelectEvent,
  onClearSelection,
  onSlotDoubleClick,
  onEventDoubleClick,
}: Props) {
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onWeekChange(addWeeks(weekAnchor, -1))}
            className="rounded px-2 py-1 text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-elevated)] hover:text-[var(--app-text)]"
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onWeekChange(addWeeks(weekAnchor, 1))}
            className="rounded px-2 py-1 text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-elevated)] hover:text-[var(--app-text)]"
            aria-label="Next week"
          >
            ›
          </button>
          <h1 className="ml-2 text-lg font-semibold text-[var(--app-text)]">
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </h1>
        </div>
        <span className="text-sm text-[var(--app-text-muted)]">Week view</span>
      </header>

      <div className="flex min-h-0 flex-1 overflow-auto">
        <div
          className="sticky left-0 z-10 w-14 shrink-0 border-r border-[var(--app-border)] bg-[var(--app-bg)] pt-10"
          aria-hidden
        >
          {hours.map((h) => (
            <div
              key={h}
              className="box-border border-b border-transparent text-right text-[11px] text-[var(--app-text-muted)]"
              style={{ height: PX_PER_HOUR }}
            >
              <span className="-mt-2 block pr-2">
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </span>
            </div>
          ))}
        </div>

        <div className="grid min-w-[700px] flex-1 grid-cols-7">
          <div className="col-span-7 grid grid-cols-7 border-b border-[var(--app-border)]">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className="border-l border-[var(--app-border)] py-2 text-center first:border-l-0"
              >
                <div className="text-[11px] uppercase text-[var(--app-text-muted)]">
                  {format(day, "EEE")}
                </div>
                <div
                  className={`text-lg font-medium ${
                    format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
                      ? "text-[var(--app-accent)]"
                      : "text-[var(--app-text)]"
                  }`}
                >
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div
              key={`grid-${day.toISOString()}`}
              className="relative border-l border-[var(--app-border)] first:border-l-0"
              style={{ minHeight: TOTAL_HOURS * PX_PER_HOUR }}
            >
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  title="Single-click to clear selection · Double-click to create"
                  className="box-border w-full border-b border-[var(--app-grid-line)] hover:bg-[var(--app-slot-hover)]"
                  style={{ height: PX_PER_HOUR }}
                  onClick={() => onClearSelection?.()}
                  onDoubleClick={() => onSlotDoubleClick?.(day, h)}
                />
              ))}
              {events
                .filter((e) => isSameDay(e.start, day))
                .map((e) => {
                  const top = eventTop(e.start);
                  const height = eventHeight(e.start, e.end);
                  const selected = e.id === selectedId;
                  const colors = eventStyleForCategory(e.category, categories);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectEvent(e.id);
                      }}
                      onDoubleClick={(ev) => {
                        ev.stopPropagation();
                        onEventDoubleClick?.(e.id);
                      }}
                      className={`absolute left-1 right-1 select-none overflow-hidden rounded px-1.5 py-1 text-left text-xs leading-tight text-white shadow-sm transition ${
                        selected ? `z-20 ${colors.selected}` : `z-10 ${colors.base}`
                      }`}
                      style={{ top, height }}
                      title={`${e.title} — double-click to edit`}
                    >
                      <span className="font-medium">
                        {e.recurrence ? "↻ " : ""}
                        {e.title}
                      </span>
                      <span className="block text-[10px] opacity-90">
                        {format(e.start, "h:mm a")} – {format(e.end, "h:mm a")}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
