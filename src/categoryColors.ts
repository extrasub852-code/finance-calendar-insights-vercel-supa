import type { UserCategoryDto } from "./types";

/** 12 calendar event color styles (rotate by colorIndex % 12) */
const PALETTE: { base: string; selected: string }[] = [
  {
    base: "bg-amber-700/90 hover:bg-amber-600",
    selected:
      "bg-amber-600 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-slate-600/90 hover:bg-slate-500",
    selected:
      "bg-slate-500 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-teal-700/90 hover:bg-teal-600",
    selected:
      "bg-teal-600 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-rose-700/90 hover:bg-rose-600",
    selected:
      "bg-rose-600 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-violet-700/90 hover:bg-violet-600",
    selected:
      "bg-violet-600 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-cyan-700/90 hover:bg-cyan-600",
    selected:
      "bg-cyan-600 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-lime-800/90 hover:bg-lime-700",
    selected:
      "bg-lime-700 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-orange-700/90 hover:bg-orange-600",
    selected:
      "bg-orange-600 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-fuchsia-800/90 hover:bg-fuchsia-700",
    selected:
      "bg-fuchsia-700 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-emerald-800/90 hover:bg-emerald-700",
    selected:
      "bg-emerald-700 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-sky-800/90 hover:bg-sky-700",
    selected:
      "bg-sky-700 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
  {
    base: "bg-pink-800/90 hover:bg-pink-700",
    selected:
      "bg-pink-700 ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0a0a0a]",
  },
];

const DOT_PALETTE = [
  "bg-amber-600",
  "bg-slate-500",
  "bg-teal-600",
  "bg-rose-600",
  "bg-violet-600",
  "bg-cyan-600",
  "bg-lime-600",
  "bg-orange-600",
  "bg-fuchsia-600",
  "bg-emerald-600",
  "bg-sky-600",
  "bg-pink-600",
];

export function eventStyleForColorIndex(colorIndex: number): {
  base: string;
  selected: string;
} {
  return PALETTE[((colorIndex % 12) + 12) % 12]!;
}

export function dotClassForColorIndex(colorIndex: number): string {
  return DOT_PALETTE[((colorIndex % 12) + 12) % 12]!;
}

export function eventStyleForCategory(
  slug: string,
  categories: UserCategoryDto[] | undefined,
): { base: string; selected: string } {
  const c = (categories ?? []).find((x) => x.slug === slug);
  const idx = c?.colorIndex ?? 0;
  return eventStyleForColorIndex(idx);
}
