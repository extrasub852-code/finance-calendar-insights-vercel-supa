import { randomBytes } from "crypto";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import cookieSession from "cookie-session";
import cors from "cors";
import express from "express";
import { clearSessionAuth, normalizeEmail, requireAuth, setSessionAuth, } from "./auth.js";
import { expandStoredEventsForWindow, expansionWindowForYearMonth } from "./eventExpansion.js";
import { composeCalendarEventId, parseCalendarEventId } from "./eventIds.js";
import * as repo from "./repository.js";
import { normalizeRecurrence } from "./recurrence.js";
import { supabaseAuthClient } from "./supabaseClients.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
/** Plain route for Railway / load balancer probes (no cookies, no DB). */
app.get("/health", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
});
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me-in-production";
/** Express 5 types params as string | string[] */
function routeParam(v) {
    if (v == null)
        return "";
    return Array.isArray(v) ? (v[0] ?? "") : v;
}
/** Map infra / constraint errors to stable client codes. */
function infraAuthHttpError(e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(msg)) {
        return { status: 503, error: "database_unavailable" };
    }
    if (/relation|does not exist|42P01/i.test(msg)) {
        return { status: 503, error: "database_schema_missing" };
    }
    return null;
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
];
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(cookieSession({
    name: "fci_session",
    keys: [SESSION_SECRET],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
}));
app.use(express.json());
function monthBounds(now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}
function monthBoundsFromYearMonth(yearMonth) {
    const [y, m] = yearMonth.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12)
        return monthBounds();
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end };
}
function reqTokenOrThrow(req) {
    const token = req.accessToken ?? req.session?.auth?.access_token;
    if (!token)
        throw new Error("missing_access_token");
    return token;
}
async function ensureDefaultCategories(accessToken, userId) {
    for (const b of BUILT_IN) {
        await repo.ensureDefaultCategory(accessToken, userId, {
            slug: b.slug,
            name: b.name,
            colorIndex: b.colorIndex,
        });
    }
}
async function getMergedBudgets(accessToken, userId, yearMonth) {
    const defaults = await repo.listCategoryBudgetDefaults(accessToken, userId);
    const map = {};
    for (const b of defaults)
        map[b.category] = b.monthlyAmountUsd;
    const monthRows = await repo.listMonthCategoryBudgets(accessToken, userId, yearMonth);
    for (const r of monthRows) {
        map[r.categorySlug] = r.monthlyAmountUsd;
    }
    return map;
}
async function getCategoriesForUser(accessToken, userId) {
    await ensureDefaultCategories(accessToken, userId);
    return repo.listUserCategories(accessToken, userId);
}
app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});
/** Confirms Supabase Postgres is reachable via the service-role client. */
app.get("/api/health/db", async (_req, res) => {
    try {
        const ok = await repo.dbHealthPing();
        if (ok)
            res.json({ ok: true, database: true });
        else
            res.status(503).json({ ok: false, database: false });
    }
    catch (e) {
        console.error("[health/db]", e);
        res.status(503).json({ ok: false, database: false });
    }
});
app.post("/api/auth/register", async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        if (!email ||
            !password ||
            typeof email !== "string" ||
            typeof password !== "string") {
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
        const trimmedName = typeof displayName === "string" && displayName.trim()
            ? displayName.trim().slice(0, 80)
            : null;
        const sb = supabaseAuthClient();
        const { data, error } = await sb.auth.signUp({
            email: norm,
            password,
            options: {
                data: { display_name: trimmedName ?? "" },
            },
        });
        if (error) {
            const em = error.message.toLowerCase();
            if (em.includes("already") ||
                em.includes("registered") ||
                em.includes("exists")) {
                res.status(400).json({ error: "email_taken" });
                return;
            }
            console.error(error);
            res.status(500).json({ error: "register_failed" });
            return;
        }
        if (!data.user) {
            res.status(500).json({ error: "register_failed" });
            return;
        }
        const uid = data.user.id;
        const session = data.session ??
            (await supabaseAuthClient().auth.signInWithPassword({ email: norm, password })).data.session;
        if (!session) {
            res.status(400).json({ error: "confirm_email_required" });
            return;
        }
        setSessionAuth(req, {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
        });
        await repo.ensureOwnProfile(session.access_token, uid, trimmedName);
        await ensureDefaultCategories(session.access_token, uid);
        const user = await repo.loadAppUser(session.access_token, uid, data.user.email ?? norm);
        if (!user) {
            res.status(500).json({ error: "register_failed" });
            return;
        }
        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                onboardingComplete: user.onboardingComplete,
                currentBalanceUsd: user.currentBalanceUsd,
            },
        });
    }
    catch (e) {
        console.error(e);
        const mapped = infraAuthHttpError(e);
        if (mapped) {
            res.status(mapped.status).json({ error: mapped.error });
            return;
        }
        res.status(500).json({ error: "register_failed" });
    }
});
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email ||
            !password ||
            typeof email !== "string" ||
            typeof password !== "string") {
            res.status(400).json({ error: "invalid_body" });
            return;
        }
        const norm = normalizeEmail(email);
        const { data, error } = await supabaseAuthClient().auth.signInWithPassword({
            email: norm,
            password,
        });
        if (error || !data.session || !data.user) {
            res.status(401).json({ error: "invalid_credentials" });
            return;
        }
        setSessionAuth(req, {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
        });
        const user = await repo.loadAppUser(data.session.access_token, data.user.id, data.user.email ?? norm);
        if (!user) {
            clearSessionAuth(req);
            res.status(401).json({ error: "invalid_credentials" });
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
    }
    catch (e) {
        console.error(e);
        const mapped = infraAuthHttpError(e);
        if (mapped) {
            res.status(mapped.status).json({
                error: mapped.error === "email_taken" ? "login_failed" : mapped.error,
            });
            return;
        }
        res.status(500).json({ error: "login_failed" });
    }
});
app.post("/api/auth/logout", (req, res) => {
    clearSessionAuth(req);
    res.json({ ok: true });
});
app.get("/api/auth/me", async (req, res) => {
    try {
        const token = req.session?.auth?.access_token;
        if (!token) {
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        const { data, error } = await supabaseAuthClient().auth.getUser(token);
        if (error || !data.user) {
            clearSessionAuth(req);
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        const user = await repo.loadAppUser(token, data.user.id, data.user.email ?? null);
        if (!user) {
            clearSessionAuth(req);
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
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "me_failed" });
    }
});
app.get("/api/bootstrap", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        await ensureDefaultCategories(accessToken, user.id);
        const ym = typeof req.query.yearMonth === "string" && /^\d{4}-\d{2}$/.test(req.query.yearMonth)
            ? req.query.yearMonth
            : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        const categories = await getCategoriesForUser(accessToken, user.id);
        const budgetMap = await getMergedBudgets(accessToken, user.id, ym);
        const defaultRows = await repo.listCategoryBudgetDefaults(accessToken, user.id);
        const defaultCategoryBudgets = {};
        for (const b of defaultRows) {
            defaultCategoryBudgets[b.category] = b.monthlyAmountUsd;
        }
        const eventRows = await repo.listEventsForUser(accessToken, user.id);
        const { windowStart, windowEnd } = expansionWindowForYearMonth(ym);
        const events = expandStoredEventsForWindow(eventRows, windowStart, windowEnd);
        const { start, end } = monthBoundsFromYearMonth(ym);
        const expenses = await repo.listTrackedExpensesInRange(accessToken, user.id, start, end);
        const spentByCategory = {};
        for (const e of expenses) {
            spentByCategory[e.category] =
                (spentByCategory[e.category] ?? 0) + e.amountUsd;
        }
        const trackedExpenseRows = await repo.listTrackedExpenseEventKeys(accessToken, user.id);
        const trackedEventIds = [
            ...new Set(trackedExpenseRows
                .map((r) => {
                const eid = r.eventId;
                if (!eid)
                    return "";
                if (r.occurrenceKey && r.occurrenceKey.length > 0) {
                    const ms = Number(r.occurrenceKey);
                    if (Number.isFinite(ms)) {
                        return composeCalendarEventId(eid, ms);
                    }
                }
                return eid;
            })
                .filter((id) => id.length > 0)),
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
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "bootstrap_failed" });
    }
});
app.put("/api/onboarding", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        await ensureDefaultCategories(accessToken, user.id);
        const { currentBalanceUsd, budgets } = req.body;
        if (typeof currentBalanceUsd !== "number" || !Number.isFinite(currentBalanceUsd)) {
            res.status(400).json({ error: "invalid_balance" });
            return;
        }
        if (!budgets || typeof budgets !== "object") {
            res.status(400).json({ error: "invalid_budgets" });
            return;
        }
        const budgetRows = BUILT_IN.map((b) => {
            const v = budgets[b.slug];
            const amount = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
            return { slug: b.slug, amount };
        });
        await repo.completeOnboarding(accessToken, user.id, currentBalanceUsd, budgetRows);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "onboarding_failed" });
    }
});
app.put("/api/budgets/global", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        await ensureDefaultCategories(accessToken, user.id);
        const { budgets } = req.body;
        if (!budgets || typeof budgets !== "object") {
            res.status(400).json({ error: "invalid_budgets" });
            return;
        }
        const validCats = await repo.listUserCategories(accessToken, user.id);
        const allowed = new Set(validCats.map((c) => c.slug));
        const rows = Object.entries(budgets)
            .filter(([slug]) => allowed.has(slug))
            .map(([slug, v]) => ({
            slug,
            amount: typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0,
        }));
        await repo.upsertCategoryBudgets(accessToken, user.id, rows);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "update_budgets_failed" });
    }
});
app.put("/api/budgets/month/:yearMonth", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const yearMonth = routeParam(req.params.yearMonth);
        if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
            res.status(400).json({ error: "invalid_month" });
            return;
        }
        const { budgets } = req.body;
        if (!budgets || typeof budgets !== "object") {
            res.status(400).json({ error: "invalid_budgets" });
            return;
        }
        const validCats = await repo.listUserCategories(accessToken, user.id);
        const allowed = new Set(validCats.map((c) => c.slug));
        const rows = Object.entries(budgets)
            .filter(([slug]) => allowed.has(slug))
            .map(([slug, v]) => ({
            slug,
            amount: typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0,
        }));
        await repo.replaceMonthCategoryBudgets(accessToken, user.id, yearMonth, rows);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "update_month_budgets_failed" });
    }
});
app.post("/api/categories", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const { name } = req.body;
        if (!name || typeof name !== "string" || !name.trim()) {
            res.status(400).json({ error: "invalid_name" });
            return;
        }
        const slug = `c_${randomBytes(8).toString("hex")}`;
        const existing = await repo.countUserCategories(accessToken, user.id);
        const colorIndex = existing % 12;
        const cat = await repo.createUserCategoryWithBudget(accessToken, user.id, slug, name.trim().slice(0, 80), colorIndex);
        res.status(201).json({
            slug: cat.slug,
            name: cat.name,
            colorIndex: cat.colorIndex,
            isBuiltIn: cat.isBuiltIn,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "create_category_failed" });
    }
});
app.delete("/api/categories/:slug", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const slug = routeParam(req.params.slug);
        const cat = await repo.findUserCategory(accessToken, user.id, slug);
        if (!cat) {
            res.status(404).json({ error: "not_found" });
            return;
        }
        if (cat.isBuiltIn) {
            res.status(400).json({ error: "cannot_delete_builtin" });
            return;
        }
        const evCount = await repo.countEventsInCategory(accessToken, user.id, slug);
        if (evCount > 0) {
            res.status(400).json({ error: "category_in_use" });
            return;
        }
        await repo.deleteCategoryCascade(accessToken, user.id, slug, cat.id);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "delete_category_failed" });
    }
});
app.post("/api/events", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const { title, start, end, category, estimatedCostUsd, recurrence, recurrenceEnd, expenseKind, } = req.body;
        if (!title || !start || !end || !category) {
            res.status(400).json({ error: "missing_fields" });
            return;
        }
        const okCat = await repo.findUserCategory(accessToken, user.id, category);
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
        let recurrenceEndAt = null;
        if (typeof recurrenceEnd === "string" && recurrenceEnd.trim()) {
            const d = new Date(recurrenceEnd);
            recurrenceEndAt = Number.isNaN(d.getTime()) ? null : d;
        }
        const allowedKinds = new Set(["rent", "utilities", "subscription"]);
        const kind = typeof expenseKind === "string" && allowedKinds.has(expenseKind)
            ? expenseKind
            : null;
        const ev = await repo.insertEvent(accessToken, user.id, {
            title,
            startAt,
            endAt,
            category,
            estimatedCostUsd: estimatedCostUsd != null && Number.isFinite(estimatedCostUsd)
                ? estimatedCostUsd
                : null,
            recurrence: rule,
            recurrenceEnd: recurrenceEndAt,
            expenseKind: kind,
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
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "create_event_failed" });
    }
});
app.patch("/api/events/:id", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const routeId = routeParam(req.params.id);
        const { seriesId, instanceStartMs } = parseCalendarEventId(routeId);
        const { title, start, end, category, estimatedCostUsd, recurrence, recurrenceEnd, expenseKind, } = req.body;
        const existing = await repo.findEventForUser(accessToken, user.id, seriesId);
        if (!existing) {
            res.status(404).json({ error: "not_found" });
            return;
        }
        if (category != null) {
            const okCat = await repo.findUserCategory(accessToken, user.id, category);
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
                nextEndAt = new Date(nextStartAt.getTime() + (newEnd.getTime() - newStart.getTime()));
            }
            else {
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
            }
            else {
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
        const patch = {
            recurrence: nextRecurrence,
            recurrenceEnd: nextRecurrenceEnd,
            expenseKind: nextExpenseKind,
        };
        if (title != null)
            patch.title = title;
        if (start != null && end != null) {
            patch.startAt = nextStartAt;
            patch.endAt = nextEndAt;
        }
        if (category != null)
            patch.category = category;
        if (estimatedCostUsd !== undefined) {
            patch.estimatedCostUsd =
                estimatedCostUsd != null && Number.isFinite(estimatedCostUsd)
                    ? estimatedCostUsd
                    : null;
        }
        const ev = await repo.updateEventRow(accessToken, seriesId, patch);
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
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "update_event_failed" });
    }
});
app.delete("/api/events/:id", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const routeId = routeParam(req.params.id);
        const { seriesId } = parseCalendarEventId(routeId);
        const existing = await repo.findEventForUser(accessToken, user.id, seriesId);
        if (!existing) {
            res.status(404).json({ error: "not_found" });
            return;
        }
        await repo.deleteEventById(accessToken, seriesId);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "delete_event_failed" });
    }
});
app.patch("/api/user", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const { currentBalanceUsd } = req.body;
        if (typeof currentBalanceUsd !== "number" || !Number.isFinite(currentBalanceUsd)) {
            res.status(400).json({ error: "invalid_balance" });
            return;
        }
        const bal = await repo.setProfileBalance(accessToken, user.id, currentBalanceUsd);
        res.json({ currentBalanceUsd: bal });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "update_user_failed" });
    }
});
app.delete("/api/expenses/for-event/:eventId", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const routeId = routeParam(req.params.eventId);
        const { seriesId, instanceStartMs } = parseCalendarEventId(routeId);
        const occurrenceKey = instanceStartMs != null ? String(instanceStartMs) : "";
        const rows = await repo.listTrackedExpenseRows(accessToken, user.id, seriesId, occurrenceKey);
        if (rows.length === 0) {
            res.status(404).json({ error: "not_found" });
            return;
        }
        const refund = rows.reduce((s, r) => s + r.amountUsd, 0);
        await repo.deleteTrackedRows(accessToken, user.id, seriesId, occurrenceKey);
        const bal = await repo.adjustProfileBalance(accessToken, user.id, refund);
        res.json({ ok: true, refundedUsd: refund, currentBalanceUsd: bal });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "untrack_failed" });
    }
});
app.post("/api/expenses/track", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const accessToken = reqTokenOrThrow(req);
        const { eventId, amountUsd, category, yearMonth } = req.body;
        if (typeof amountUsd !== "number" ||
            !Number.isFinite(amountUsd) ||
            amountUsd < 0 ||
            !category) {
            res.status(400).json({ error: "invalid_body" });
            return;
        }
        if (eventId) {
            const { seriesId, instanceStartMs } = parseCalendarEventId(eventId);
            const occurrenceKey = instanceStartMs != null ? String(instanceStartMs) : "";
            const dup = await repo.findTrackedDuplicate(accessToken, user.id, seriesId, occurrenceKey);
            if (dup) {
                res.status(400).json({ error: "already_tracked" });
                return;
            }
        }
        const ym = typeof yearMonth === "string" && /^\d{4}-\d{2}$/.test(yearMonth)
            ? yearMonth
            : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        const { seriesId, instanceStartMs } = eventId
            ? parseCalendarEventId(eventId)
            : { seriesId: "", instanceStartMs: null };
        const occurrenceKey = eventId && instanceStartMs != null ? String(instanceStartMs) : "";
        await repo.insertTrackedExpense(accessToken, {
            userId: user.id,
            eventId: eventId ? seriesId : null,
            occurrenceKey: eventId ? occurrenceKey : "",
            amountUsd,
            category,
        });
        const bal = await repo.adjustProfileBalance(accessToken, user.id, -amountUsd);
        const { start, end } = monthBoundsFromYearMonth(ym);
        const expenses = await repo.listTrackedExpensesInRange(accessToken, user.id, start, end);
        const spentByCategory = {};
        for (const e of expenses) {
            spentByCategory[e.category] =
                (spentByCategory[e.category] ?? 0) + e.amountUsd;
        }
        res.json({
            currentBalanceUsd: bal,
            spentByCategory,
        });
    }
    catch (e) {
        if (repo.isUniqueViolation(e)) {
            res.status(400).json({ error: "already_tracked" });
            return;
        }
        console.error(e);
        res.status(500).json({ error: "track_failed" });
    }
});
/** Local/Docker only — Vercel serves `dist` as static; API runs as serverless. */
const distDir = join(__dirname, "..", "dist");
if (!process.env.VERCEL &&
    existsSync(join(distDir, "index.html"))) {
    app.use(express.static(distDir));
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api"))
            return next();
        res.sendFile(join(distDir, "index.html"));
    });
}
export { app };
