import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

beforeAll(() => {
  process.env.TURSO_DATABASE_URL = "";
  process.env.TURSO_AUTH_TOKEN = "";
  process.env.DATABASE_URL = `file:${join(root, "prisma", "vitest.db")}`;
  process.env.SESSION_SECRET = "test-session-secret-test-session-secret";
  process.env.VITEST = "1";
  execSync("npx prisma db push --accept-data-loss --skip-generate", {
    cwd: root,
    stdio: "pipe",
    env: process.env,
  });
});

async function agent() {
  const supertest = (await import("supertest")).default;
  const { app } = await import("../server/index.ts");
  return supertest.agent(app);
}

async function prisma() {
  const { prisma: p } = await import("../server/db.ts");
  return p;
}

afterEach(async () => {
  const db = await prisma();
  await db.trackedExpense.deleteMany();
  await db.event.deleteMany();
  await db.monthCategoryBudget.deleteMany();
  await db.categoryBudget.deleteMany();
  await db.userCategory.deleteMany();
  await db.user.deleteMany();
});

describe("API end-to-end: recurring events & bills", () => {
  it("registers, creates a monthly recurring rent event, expands in bootstrap, and tracks one occurrence", async () => {
    const a = await agent();
    const reg = await a.post("/api/auth/register").send({
      email: "recurring-e2e@example.com",
      password: "password123",
      displayName: "E2E",
    });
    expect(reg.status).toBe(201);

    const marchStart = new Date(2026, 2, 15, 9, 0, 0, 0);
    const marchEnd = new Date(2026, 2, 15, 10, 0, 0, 0);
    const created = await a.post("/api/events").send({
      title: "Rent",
      start: marchStart.toISOString(),
      end: marchEnd.toISOString(),
      category: "rent",
      estimatedCostUsd: 1200,
      recurrence: "monthly",
      expenseKind: "rent",
    });
    expect(created.status).toBe(201);
    const seriesId = (created.body as { id: string }).id;

    const boot = await a.get("/api/bootstrap").query({ yearMonth: "2026-04" });
    expect(boot.status).toBe(200);
    const events = (boot.body as { events: { id: string; start: string }[] })
      .events;
    const april = events.filter((e) => e.start.startsWith("2026-04-15"));
    expect(april.length).toBeGreaterThanOrEqual(1);
    const aprilId = april[0]!.id;
    expect(aprilId).toContain("#");

    const track = await a.post("/api/expenses/track").send({
      eventId: aprilId,
      amountUsd: 1200,
      category: "rent",
      yearMonth: "2026-04",
    });
    expect(track.status).toBe(200);

    const boot2 = await a.get("/api/bootstrap").query({ yearMonth: "2026-04" });
    expect(boot2.status).toBe(200);
    const tracked = (boot2.body as { trackedEventIds: string[] })
      .trackedEventIds;
    expect(tracked).toContain(aprilId);

    const untrack = await a.delete(
      `/api/expenses/for-event/${encodeURIComponent(aprilId)}`,
    );
    expect(untrack.status).toBe(200);

    const del = await a.delete(
      `/api/events/${encodeURIComponent(seriesId)}`,
    );
    expect(del.status).toBe(200);
  });

  it("creates a utilities-tagged weekly event and returns recurrence metadata", async () => {
    const a = await agent();
    await a.post("/api/auth/register").send({
      email: "weekly-util@example.com",
      password: "password123",
    });

    const t0 = new Date(2026, 3, 1, 14, 0, 0, 0);
    const t1 = new Date(2026, 3, 1, 15, 0, 0, 0);
    const created = await a.post("/api/events").send({
      title: "Electric bill",
      start: t0.toISOString(),
      end: t1.toISOString(),
      category: "utilities",
      recurrence: "weekly",
      expenseKind: "utilities",
    });
    expect(created.status).toBe(201);
    expect((created.body as { recurrence: string | null }).recurrence).toBe(
      "weekly",
    );
    expect((created.body as { expenseKind: string | null }).expenseKind).toBe(
      "utilities",
    );

    const boot = await a.get("/api/bootstrap").query({ yearMonth: "2026-04" });
    expect(boot.status).toBe(200);
    const events = (boot.body as { events: { id: string; recurrence: string | null }[] })
      .events;
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBeGreaterThanOrEqual(4);
  });
});
