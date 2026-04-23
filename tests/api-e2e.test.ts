import { beforeAll, describe, expect, it } from "vitest";

function supabaseEnvReady(): boolean {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim();
  const anon = (
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    ""
  ).trim();
  return Boolean(url && anon);
}

const useSupabaseE2e = process.env.RUN_SUPABASE_E2E === "1" && supabaseEnvReady();

beforeAll(() => {
  if (!useSupabaseE2e) return;
  process.env.VITEST = "1";
  process.env.SESSION_SECRET = "test-session-secret-test-session-secret";
  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
  if (!process.env.SUPABASE_ANON_KEY?.trim() && process.env.VITE_SUPABASE_ANON_KEY?.trim()) {
    process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY.trim();
  }
});

async function agent() {
  const supertest = (await import("supertest")).default;
  const { app } = await import("../server/index.ts");
  return supertest.agent(app);
}

describe.skipIf(!useSupabaseE2e)("API e2e (Supabase Auth + RLS)", () => {
  it("registers a new user, checks session, and bootstrap loads categories", async () => {
    const a = await agent();
    const email = `e2e-${Date.now()}@example.com`;
    const reg = await a.post("/api/auth/register").send({
      email,
      password: "password123",
      displayName: "E2E User",
    });
    expect(reg.status).toBe(201);

    const me = await a.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect((me.body as { user: { email: string | null } }).user.email).toBe(email);

    const boot = await a.get("/api/bootstrap").query({ yearMonth: "2026-04" });
    expect(boot.status).toBe(200);
    const cats = (boot.body as { categories: { slug: string }[] }).categories;
    expect(cats.some((c) => c.slug === "rent")).toBe(true);
  });

  it("rejects duplicate registration for same email", async () => {
    const a = await agent();
    const email = `e2e-dup-${Date.now()}@example.com`;
    const first = await a.post("/api/auth/register").send({ email, password: "password123" });
    expect(first.status).toBe(201);

    const a2 = await agent();
    const second = await a2.post("/api/auth/register").send({ email, password: "password123" });
    expect(second.status).toBe(400);
    expect((second.body as { error?: string }).error).toBe("email_taken");
  });

  it("creates recurring event, expands and tracks one occurrence", async () => {
    const a = await agent();
    const email = `e2e-rec-${Date.now()}@example.com`;
    const reg = await a.post("/api/auth/register").send({ email, password: "password123" });
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
    const events = (boot.body as { events: { id: string; start: string }[] }).events;
    const april = events.filter((e) => e.start.startsWith("2026-04-15"));
    expect(april.length).toBeGreaterThanOrEqual(1);
    const aprilId = april[0]!.id;

    const track = await a.post("/api/expenses/track").send({
      eventId: aprilId,
      amountUsd: 1200,
      category: "rent",
      yearMonth: "2026-04",
    });
    expect(track.status).toBe(200);

    const untrack = await a.delete(
      `/api/expenses/for-event/${encodeURIComponent(aprilId)}`,
    );
    expect(untrack.status).toBe(200);

    const del = await a.delete(`/api/events/${encodeURIComponent(seriesId)}`);
    expect(del.status).toBe(200);
  });
});
