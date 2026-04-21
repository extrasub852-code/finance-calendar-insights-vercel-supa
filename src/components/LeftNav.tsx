import type { ReactNode } from "react";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  onNewEvent: () => void;
  profileLabel: string;
  profileDetail?: string;
  onLogout: () => void;
  children?: ReactNode;
};

const navItems = [
  { label: "Mail", icon: "✉" },
  { label: "Calendar", icon: "▦", active: true },
  { label: "People", icon: "👤" },
  { label: "Files", icon: "📁" },
];

export function LeftNav({
  onNewEvent,
  profileLabel,
  profileDetail,
  onLogout,
  children,
}: Props) {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-bg)]">
      <div className="p-4">
        <button
          type="button"
          onClick={onNewEvent}
          className="w-full rounded bg-[var(--app-accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          + New event
        </button>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`flex items-center gap-3 rounded px-3 py-2 text-left text-sm ${
              item.active
                ? "bg-[var(--app-accent-muted)] text-[var(--app-text)]"
                : "text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-elevated)] hover:text-[var(--app-text)]"
            }`}
          >
            <span className="w-5 text-center text-base opacity-90">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div className="border-t border-[var(--app-border)] p-3">
        <div className="rounded-lg bg-[var(--app-panel)] px-3 py-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="mb-2 w-full rounded border border-[var(--app-border)] px-2 py-1.5 text-left text-xs text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-elevated)]"
          >
            {theme === "dark" ? "☀ Light mode" : "🌙 Dark mode"}
          </button>
          <p className="truncate text-sm font-medium text-[var(--app-text)]">{profileLabel}</p>
          {profileDetail ? (
            <p className="truncate text-xs text-[var(--app-text-muted)]">{profileDetail}</p>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            className="mt-2 text-xs text-[var(--app-text-secondary)] underline-offset-2 hover:text-[var(--app-text)] hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
