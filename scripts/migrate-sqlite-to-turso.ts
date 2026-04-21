/**
 * Copies all rows from the local SQLite file (DATABASE_URL) into Turso.
 * Requires TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in .env.
 *
 * Run: npx tsx scripts/migrate-sqlite-to-turso.ts
 *
 * This clears Turso tables first (same schema), then copies data in FK order.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

function loadDotEnv() {
  const p = resolve(process.cwd(), ".env");
  try {
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* no .env */
  }
}

loadDotEnv();

// Absolute path avoids "Unable to open the database file" when cwd differs
const sqliteFile = resolve(process.cwd(), "prisma/dev.db");
const sqliteUrl = `file:${sqliteFile}`;
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  process.exit(1);
}

const source = new PrismaClient({ datasourceUrl: sqliteUrl });
const dest = new PrismaClient({
  adapter: new PrismaLibSQL({
    url: tursoUrl,
    authToken: tursoToken,
  }),
});

async function wipeTurso() {
  await dest.trackedExpense.deleteMany();
  await dest.event.deleteMany();
  await dest.monthCategoryBudget.deleteMany();
  await dest.categoryBudget.deleteMany();
  await dest.userCategory.deleteMany();
  await dest.user.deleteMany();
}

async function main() {
  const userCount = await source.user.count();
  console.log(`Source SQLite: ${sqliteUrl} (${userCount} users)`);
  console.log("Wiping Turso tables…");
  await wipeTurso();

  const users = await source.user.findMany();
  for (const u of users) {
    await dest.user.create({
      data: {
        id: u.id,
        email: u.email,
        passwordHash: u.passwordHash,
        displayName: u.displayName,
        currentBalanceUsd: u.currentBalanceUsd,
        onboardingComplete: u.onboardingComplete,
        createdAt: u.createdAt,
      },
    });
  }

  const cats = await source.userCategory.findMany();
  for (const c of cats) {
    await dest.userCategory.create({
      data: {
        id: c.id,
        userId: c.userId,
        slug: c.slug,
        name: c.name,
        colorIndex: c.colorIndex,
        isBuiltIn: c.isBuiltIn,
        createdAt: c.createdAt,
      },
    });
  }

  const cb = await source.categoryBudget.findMany();
  for (const b of cb) {
    await dest.categoryBudget.create({
      data: {
        id: b.id,
        userId: b.userId,
        category: b.category,
        monthlyAmountUsd: b.monthlyAmountUsd,
      },
    });
  }

  const mb = await source.monthCategoryBudget.findMany();
  for (const m of mb) {
    await dest.monthCategoryBudget.create({
      data: {
        id: m.id,
        userId: m.userId,
        yearMonth: m.yearMonth,
        categorySlug: m.categorySlug,
        monthlyAmountUsd: m.monthlyAmountUsd,
      },
    });
  }

  const ev = await source.event.findMany();
  for (const e of ev) {
    await dest.event.create({
      data: {
        id: e.id,
        userId: e.userId,
        title: e.title,
        startAt: e.startAt,
        endAt: e.endAt,
        category: e.category,
        estimatedCostUsd: e.estimatedCostUsd,
        createdAt: e.createdAt,
      },
    });
  }

  const ex = await source.trackedExpense.findMany();
  for (const x of ex) {
    await dest.trackedExpense.create({
      data: {
        id: x.id,
        userId: x.userId,
        eventId: x.eventId,
        amountUsd: x.amountUsd,
        category: x.category,
        createdAt: x.createdAt,
      },
    });
  }

  console.log(
    `Done. Copied ${users.length} users, ${cats.length} categories, ${ev.length} events, ${ex.length} expenses.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await dest.$disconnect();
  });
