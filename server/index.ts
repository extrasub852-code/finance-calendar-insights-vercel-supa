import { randomBytes } from "crypto";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import cookieSession from "cookie-session";
import cors from "cors";
import express from "express";
import { Prisma } from "@prisma/client";
import {
  hashPassword,
  normalizeEmail,
  requireAuth,
  verifyPassword,
} from "./auth.js";
import { prisma } from "./db.js";
import { expandStoredEventsForWindow, expansionWindowForYearMonth } from "./eventExpansion.js";
import { composeCalendarEventId, parseCalendarEventId } from "./eventIds.js";
import { normalizeRecurrence } from "./recurrence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1);

/** Plain route for Railway / load balancer probes (no cookies, no DB). */
app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

function envPort(name: string): number | undefined {
  const v = process.env[name];
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Railway sets PORT; local dev often uses API_PORT or 3001. */
const PORT = envPort("PORT") ?? envPort("API_PORT") ?? 3001;
const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-only-change-me-in-production";

/** Express 5 types params as string | string[] */
function routeParam(v: string | string[] | undefined): string {
  if (v == null) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

export const BUILT_IN = [
  { slug: "social", name: "Social", colorIndex: 0 },
  { slug: "work", name: "Work", colorIndex: 1 },
  { slug: "travel", name: "Travel", colorIndex: 2 },
  { slug: "health", name: "Health", colorIndex: 3 },
  { slug: "other", name: "Other", colorIndex: 4 },
  { slug: "rent", name: "Rent / housing", colorIndex: 5 },
  { slug: "utilities", name: "Utilities", colorIndex: 6 },
  { slug: "subscriptions", name: "Subscriptions", colorIndex: 7 },
] as const;

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(
  cookieSession({
    name: "fci_session",
    keys: [SESSION_SECRET],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  }),
);
app.use(express.json());

function monthBounds(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function monthBoundsFromYearMonth(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthBounds();
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

async function ensureDefaultCategories(userId: string) {
  for (const b of BUILT_IN) {
    await prisma.userCategory.upsert({
      where: {
        userId_slug: { userId, slug: b.slug },
      },
      create: {
        userId,
        slug: b.slug,
        name: b.name,
        colorIndex: b.colorIndex,
        isBuiltIn: true,
      },
      update: {},
    });
  }
}

async function getMergedBudgets(userId: string, yearMonth: string) {
  const defaults = await prisma.categoryBudget.findMany({ where: { userId } });
  const map: Record<string, number> = {};
  for (const b of defaults) map[b.category] = b.monthlyAmountUsd;
  const monthRows = await prisma.monthCategoryBudget.findMany({
    where: { userId, yearMonth },
  });
  for (const r of monthRows) {
    map[r.categorySlug] = r.monthlyAmountUsd;
  }
  return map;
}

async function getCategoriesForUser(userId: string) {
  await ensureDefaultCategories(userId);
  return prisma.userCategory.findMany({
    where: { userId },
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    if (
      !email ||
      !password ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "weak_password" });
      return;
    }
    const norm = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email: norm } });
    if (existing) {
      res.status(400).json({ error: "email_taken" });
      return;
    }
    const user = await prisma.user.create({
      data: {
        email: norm,
        passwordHash: await hashPassword(password),
        displayName:
          typeof displayName === "string" && displayName.trim()
            ? displayName.trim().slice(0, 80)
            : null,
        currentBalanceUsd: 0,
        onboardingComplete: false,
      },
    });
    await ensureDefaultCategories(user.id);
    if (req.session) req.session.userId = user.id;
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        onboardingComplete: user.onboardingComplete,
        currentBalanceUsd: user.currentBalanceUsd,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "register_failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (
      !email ||
      !password ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const norm = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: norm } });
    if (!user?.passwordHash) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    if (req.session) req.session.userId = user.id;
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        onboardingComplete: user.onboardingComplete,
        currentBalanceUsd: user.currentBalanceUsd,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "login_failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const uid = req.session?.userId;
    if (!uid || typeof uid !== "string") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) {
      req.session = null;
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        onboardingComplete: user.onboardingComplete,
        currentBalanceUsd: user.currentBalanceUsd,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "me_failed" });
  }
});

app.get("/api/bootstrap", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    await ensureDefaultCategories(user.id);

    const ym =
      typeof req.query.yearMonth === "string" && /^\d{4}-\d{2}$/.test(req.query.yearMonth)
        ? req.query.yearMonth
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    const categories = await getCategoriesForUser(user.id);
    const budgetMap = await getMergedBudgets(user.id, ym);

    const defaultRows = await prisma.categoryBudget.findMany({
      where: { userId: user.id },
    });
    const defaultCategoryBudgets: Record<string, number> = {};
    for (const b of defaultRows) {
      defaultCategoryBudgets[b.category] = b.monthlyAmountUsd;
    }

    const eventRows = await prisma.event.findMany({
      where: { userId: user.id },
      orderBy: { startAt: "asc" },
    });
    const { windowStart, windowEnd } = expansionWindowForYearMonth(ym);
    const events = expandStoredEventsForWindow(eventRows, windowStart, windowEnd);

    const { start, end } = monthBoundsFromYearMonth(ym);
    const expenses = await prisma.trackedExpense.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: start, lte: end },
      },
    });
    const spentByCategory: Record<string, number> = {};
    for (const e of expenses) {
      spentByCategory[e.category] =
        (spentByCategory[e.category] ?? 0) + e.amountUsd;
    }

    const trackedExpenseRows = await prisma.trackedExpense.findMany({
      where: { userId: user.id, eventId: { not: null } },
      select: { eventId: true, occurrenceKey: true },
    });
    const trackedEventIds = [
      ...new Set(
        trackedExpenseRows
          .map((r) => {
            const eid = r.eventId;
            if (!eid) return "";
            if (r.occurrenceKey && r.occurrenceKey.length > 0) {
              const ms = Number(r.occurrenceKey);
              if (Number.isFinite(ms)) {
                return composeCalendarEventId(eid, ms);
              }
            }
            return eid;
          })
          .filter((id) => id.length > 0),
      ),
    ];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        currentBalanceUsd: user.currentBalanceUsd,
        onboardingComplete: user.onboardingComplete,
      },
      yearMonth: ym,
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        colorIndex: c.colorIndex,
        isBuiltIn: c.isBuiltIn,
      })),
      categoryBudgets: budgetMap,
      defaultCategoryBudgets,
      spentByCategory,
      trackedEventIds,
      events,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "bootstrap_failed" });
  }
});

app.put("/api/onboarding", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    await ensureDefaultCategories(user.id);

    const { currentBalanceUsd, budgets } = req.body as {
      currentBalanceUsd?: number;
      budgets?: Record<string, number>;
    };
    if (typeof currentBalanceUsd !== "number" || !Number.isFinite(currentBalanceUsd)) {
      res.status(400).json({ error: "invalid_balance" });
      return;
    }
    if (!budgets || typeof budgets !== "object") {
      res.status(400).json({ error: "invalid_budgets" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          currentBalanceUsd,
          onboardingComplete: true,
        },
      });
      for (const b of BUILT_IN) {
        const v = budgets[b.slug];
        const amount =
          typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
        await tx.categoryBudget.upsert({
          where: {
            userId_category: { userId: user.id, category: b.slug },
          },
          create: {
            userId: user.id,
            category: b.slug,
            monthlyAmountUsd: amount,
          },
          update: { monthlyAmountUsd: amount },
        });
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "onboarding_failed" });
  }
});

app.put("/api/budgets/global", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    await ensureDefaultCategories(user.id);

    const { budgets } = req.body as { budgets?: Record<string, number> };
    if (!budgets || typeof budgets !== "object") {
      res.status(400).json({ error: "invalid_budgets" });
      return;
    }

    const validCats = await prisma.userCategory.findMany({
      where: { userId: user.id },
      select: { slug: true },
    });
    const allowed = new Set(validCats.map((c) => c.slug));

    const ops = Object.entries(budgets)
      .filter(([slug]) => allowed.has(slug))
      .map(([slug, v]) => {
        const amount = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
        return prisma.categoryBudget.upsert({
          where: {
            userId_category: { userId: user.id, category: slug },
          },
          create: {
            userId: user.id,
            category: slug,
            monthlyAmountUsd: amount,
          },
          update: { monthlyAmountUsd: amount },
        });
      });
    await prisma.$transaction(ops);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update_budgets_failed" });
  }
});

app.put("/api/budgets/month/:yearMonth", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const yearMonth = routeParam(req.params.yearMonth);
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      res.status(400).json({ error: "invalid_month" });
      return;
    }

    const { budgets } = req.body as { budgets?: Record<string, number> };
    if (!budgets || typeof budgets !== "object") {
      res.status(400).json({ error: "invalid_budgets" });
      return;
    }

    const validCats = await prisma.userCategory.findMany({
      where: { userId: user.id },
      select: { slug: true },
    });
    const allowed = new Set(validCats.map((c) => c.slug));

    await prisma.$transaction(async (tx) => {
      await tx.monthCategoryBudget.deleteMany({
        where: { userId: user.id, yearMonth },
      });
      for (const [slug, v] of Object.entries(budgets)) {
        if (!allowed.has(slug)) continue;
        const amount = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
        await tx.monthCategoryBudget.create({
          data: {
            userId: user.id,
            yearMonth,
            categorySlug: slug,
            monthlyAmountUsd: amount,
          },
        });
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update_month_budgets_failed" });
  }
});

app.post("/api/categories", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { name } = req.body as { name?: string };
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "invalid_name" });
      return;
    }
    const slug = `c_${randomBytes(8).toString("hex")}`;
    const existing = await prisma.userCategory.count({ where: { userId: user.id } });
    const colorIndex = existing % 12;

    const cat = await prisma.$transaction(async (tx) => {
      const c = await tx.userCategory.create({
        data: {
          userId: user.id,
          slug,
          name: name.trim().slice(0, 80),
          colorIndex,
          isBuiltIn: false,
        },
      });
      await tx.categoryBudget.upsert({
        where: {
          userId_category: { userId: user.id, category: slug },
        },
        create: {
          userId: user.id,
          category: slug,
          monthlyAmountUsd: 0,
        },
        update: {},
      });
      return c;
    });

    res.status(201).json({
      slug: cat.slug,
      name: cat.name,
      colorIndex: cat.colorIndex,
      isBuiltIn: cat.isBuiltIn,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create_category_failed" });
  }
});

app.delete("/api/categories/:slug", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const slug = routeParam(req.params.slug);
    const cat = await prisma.userCategory.findFirst({
      where: { userId: user.id, slug },
    });
    if (!cat) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (cat.isBuiltIn) {
      res.status(400).json({ error: "cannot_delete_builtin" });
      return;
    }
    const evCount = await prisma.event.count({
      where: { userId: user.id, category: slug },
    });
    if (evCount > 0) {
      res.status(400).json({ error: "category_in_use" });
      return;
    }
    await prisma.$transaction([
      prisma.monthCategoryBudget.deleteMany({
        where: { userId: user.id, categorySlug: slug },
      }),
      prisma.categoryBudget.deleteMany({
        where: { userId: user.id, category: slug },
      }),
      prisma.userCategory.delete({ where: { id: cat.id } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "delete_category_failed" });
  }
});

app.post("/api/events", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const {
      title,
      start,
      end,
      category,
      estimatedCostUsd,
      recurrence,
      recurrenceEnd,
      expenseKind,
    } = req.body as {
      title?: string;
      start?: string;
      end?: string;
      category?: string;
      estimatedCostUsd?: number | null;
      recurrence?: string | null;
      recurrenceEnd?: string | null;
      expenseKind?: string | null;
    };
    if (!title || !start || !end || !category) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const okCat = await prisma.userCategory.findFirst({
      where: { userId: user.id, slug: category },
    });
    if (!okCat) {
      res.status(400).json({ error: "invalid_category" });
      return;
    }
    const startAt = new Date(start);
    const endAt = new Date(end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      res.status(400).json({ error: "invalid_dates" });
      return;
    }
    const rule = normalizeRecurrence(recurrence);
    let recurrenceEndAt: Date | null = null;
    if (typeof recurrenceEnd === "string" && recurrenceEnd.trim()) {
      const d = new Date(recurrenceEnd);
      recurrenceEndAt = Number.isNaN(d.getTime()) ? null : d;
    }
    const allowedKinds = new Set(["rent", "utilities", "subscription"]);
    const kind =
      typeof expenseKind === "string" && allowedKinds.has(expenseKind)
        ? expenseKind
        : null;

    const ev = await prisma.event.create({
      data: {
        userId: user.id,
        title,
        startAt,
        endAt,
        category,
        estimatedCostUsd:
          estimatedCostUsd != null && Number.isFinite(estimatedCostUsd)
            ? estimatedCostUsd
            : null,
        recurrence: rule,
        recurrenceEnd: recurrenceEndAt,
        expenseKind: kind,
      },
    });
    res.status(201).json({
      id: ev.id,
      title: ev.title,
      start: ev.startAt.toISOString(),
      end: ev.endAt.toISOString(),
      category: ev.category,
      estimatedCostUsd: ev.estimatedCostUsd,
      seriesId: ev.id,
      recurrence: ev.recurrence,
      recurrenceEnd: ev.recurrenceEnd?.toISOString() ?? null,
      expenseKind: ev.expenseKind,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create_event_failed" });
  }
});

app.patch("/api/events/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const routeId = routeParam(req.params.id);
    const { seriesId, instanceStartMs } = parseCalendarEventId(routeId);
    const {
      title,
      start,
      end,
      category,
      estimatedCostUsd,
      recurrence,
      recurrenceEnd,
      expenseKind,
    } = req.body as {
      title?: string;
      start?: string;
      end?: string;
      category?: string;
      estimatedCostUsd?: number | null;
      recurrence?: string | null;
      recurrenceEnd?: string | null;
      expenseKind?: string | null;
    };
    const existing = await prisma.event.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (category != null) {
      const okCat = await prisma.userCategory.findFirst({
        where: { userId: user.id, slug: category },
      });
      if (!okCat) {
        res.status(400).json({ error: "invalid_category" });
        return;
      }
    }

    const hasRecurrence = normalizeRecurrence(existing.recurrence) != null;
    let nextStartAt = existing.startAt;
    let nextEndAt = existing.endAt;
    if (start != null && end != null) {
      const newStart = new Date(start);
      const newEnd = new Date(end);
      if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
        res.status(400).json({ error: "invalid_dates" });
        return;
      }
      if (hasRecurrence && instanceStartMs != null) {
        const deltaMs = newStart.getTime() - instanceStartMs;
        nextStartAt = new Date(existing.startAt.getTime() + deltaMs);
        nextEndAt = new Date(
          nextStartAt.getTime() + (newEnd.getTime() - newStart.getTime()),
        );
      } else {
        nextStartAt = newStart;
        nextEndAt = newEnd;
      }
    }

    let nextRecurrence = existing.recurrence;
    if (recurrence !== undefined) {
      nextRecurrence = normalizeRecurrence(recurrence);
    }
    let nextRecurrenceEnd = existing.recurrenceEnd;
    if (recurrenceEnd !== undefined) {
      if (recurrenceEnd == null || recurrenceEnd === "") {
        nextRecurrenceEnd = null;
      } else {
        const d = new Date(recurrenceEnd);
        nextRecurrenceEnd = Number.isNaN(d.getTime()) ? null : d;
      }
    }
    const allowedKinds = new Set(["rent", "utilities", "subscription"]);
    let nextExpenseKind = existing.expenseKind;
    if (expenseKind !== undefined) {
      nextExpenseKind =
        expenseKind != null &&
        typeof expenseKind === "string" &&
        allowedKinds.has(expenseKind)
          ? expenseKind
          : null;
    }

    const ev = await prisma.event.update({
      where: { id: seriesId },
      data: {
        ...(title != null ? { title } : {}),
        ...(start != null && end != null
          ? { startAt: nextStartAt, endAt: nextEndAt }
          : {}),
        ...(category != null ? { category } : {}),
        ...(estimatedCostUsd !== undefined
          ? {
              estimatedCostUsd:
                estimatedCostUsd != null && Number.isFinite(estimatedCostUsd)
                  ? estimatedCostUsd
                  : null,
            }
          : {}),
        recurrence: nextRecurrence,
        recurrenceEnd: nextRecurrenceEnd,
        expenseKind: nextExpenseKind,
      },
    });
    res.json({
      id: ev.id,
      title: ev.title,
      start: ev.startAt.toISOString(),
      end: ev.endAt.toISOString(),
      category: ev.category,
      estimatedCostUsd: ev.estimatedCostUsd,
      seriesId: ev.id,
      recurrence: ev.recurrence,
      recurrenceEnd: ev.recurrenceEnd?.toISOString() ?? null,
      expenseKind: ev.expenseKind,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update_event_failed" });
  }
});

app.delete("/api/events/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const routeId = routeParam(req.params.id);
    const { seriesId } = parseCalendarEventId(routeId);
    const existing = await prisma.event.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await prisma.event.delete({ where: { id: seriesId } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "delete_event_failed" });
  }
});

app.patch("/api/user", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { currentBalanceUsd } = req.body as { currentBalanceUsd?: number };
    if (typeof currentBalanceUsd !== "number" || !Number.isFinite(currentBalanceUsd)) {
      res.status(400).json({ error: "invalid_balance" });
      return;
    }
    const u = await prisma.user.update({
      where: { id: user.id },
      data: { currentBalanceUsd },
    });
    res.json({ currentBalanceUsd: u.currentBalanceUsd });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update_user_failed" });
  }
});

app.delete("/api/expenses/for-event/:eventId", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const routeId = routeParam(req.params.eventId);
    const { seriesId, instanceStartMs } = parseCalendarEventId(routeId);
    const occurrenceKey =
      instanceStartMs != null ? String(instanceStartMs) : "";
    const rows = await prisma.trackedExpense.findMany({
      where: { userId: user.id, eventId: seriesId, occurrenceKey },
    });
    if (rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const refund = rows.reduce((s, r) => s + r.amountUsd, 0);
    await prisma.$transaction(async (tx) => {
      await tx.trackedExpense.deleteMany({
        where: { userId: user.id, eventId: seriesId, occurrenceKey },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { currentBalanceUsd: { increment: refund } },
      });
    });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    res.json({ ok: true, refundedUsd: refund, currentBalanceUsd: u.currentBalanceUsd });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "untrack_failed" });
  }
});

app.post("/api/expenses/track", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { eventId, amountUsd, category, yearMonth } = req.body as {
      eventId?: string;
      amountUsd?: number;
      category?: string;
      yearMonth?: string;
    };
    if (
      typeof amountUsd !== "number" ||
      !Number.isFinite(amountUsd) ||
      amountUsd < 0 ||
      !category
    ) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    if (eventId) {
      const { seriesId, instanceStartMs } = parseCalendarEventId(eventId);
      const occurrenceKey =
        instanceStartMs != null ? String(instanceStartMs) : "";
      const dup = await prisma.trackedExpense.findFirst({
        where: { userId: user.id, eventId: seriesId, occurrenceKey },
      });
      if (dup) {
        res.status(400).json({ error: "already_tracked" });
        return;
      }
    }
    const ym =
      typeof yearMonth === "string" && /^\d{4}-\d{2}$/.test(yearMonth)
        ? yearMonth
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const { seriesId, instanceStartMs } = eventId
      ? parseCalendarEventId(eventId)
      : { seriesId: "", instanceStartMs: null };
    const occurrenceKey =
      eventId && instanceStartMs != null ? String(instanceStartMs) : "";

    await prisma.$transaction(async (tx) => {
      await tx.trackedExpense.create({
        data: {
          userId: user.id,
          eventId: eventId ? seriesId : null,
          occurrenceKey: eventId ? occurrenceKey : "",
          amountUsd,
          category,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { currentBalanceUsd: { decrement: amountUsd } },
      });
    });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const { start, end } = monthBoundsFromYearMonth(ym);
    const expenses = await prisma.trackedExpense.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: start, lte: end },
      },
    });
    const spentByCategory: Record<string, number> = {};
    for (const e of expenses) {
      spentByCategory[e.category] =
        (spentByCategory[e.category] ?? 0) + e.amountUsd;
    }
    res.json({
      currentBalanceUsd: u.currentBalanceUsd,
      spentByCategory,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      res.status(400).json({ error: "already_tracked" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "track_failed" });
  }
});

const distDir = join(__dirname, "..", "dist");
if (existsSync(join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(distDir, "index.html"));
  });
}

if (!process.env.VITEST) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[fci] listening on 0.0.0.0:${PORT} node=${process.version} turso=${Boolean(process.env.TURSO_DATABASE_URL)}`,
    );
  });
}

export { app };
