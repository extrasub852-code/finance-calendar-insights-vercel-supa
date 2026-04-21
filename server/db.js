import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
function shouldIgnoreAlterError(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (msg.includes("duplicate column name") ||
        msg.includes("duplicate column") ||
        msg.includes("already exists"));
}
/** Best-effort idempotent DDL so older Turso DBs match current Prisma schema (inlined so Docker/tsc never misses a sibling file). */
async function ensureTursoSchema() {
    const url = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
    if (!url || !authToken)
        return;
    const client = createClient({ url, authToken });
    async function safeExecute(sql) {
        try {
            await client.execute(sql);
        }
        catch (e) {
            if (shouldIgnoreAlterError(e))
                return;
            throw e;
        }
    }
    await safeExecute(`ALTER TABLE "Event" ADD COLUMN "recurrence" TEXT;`);
    await safeExecute(`ALTER TABLE "Event" ADD COLUMN "recurrenceEnd" DATETIME;`);
    await safeExecute(`ALTER TABLE "Event" ADD COLUMN "expenseKind" TEXT;`);
    await safeExecute(`ALTER TABLE "TrackedExpense" ADD COLUMN "occurrenceKey" TEXT NOT NULL DEFAULT '';`);
    try {
        await client.execute(`UPDATE "TrackedExpense" SET "occurrenceKey" = '' WHERE "occurrenceKey" IS NULL;`);
    }
    catch {
        /* ignore */
    }
    // Same (userId, eventId, occurrenceKey) twice breaks the Prisma unique index; keep oldest row.
    try {
        await client.execute(`DELETE FROM "TrackedExpense" AS t1
       WHERE t1."eventId" IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM "TrackedExpense" AS t2
           WHERE t2."userId" = t1."userId"
             AND t2."eventId" = t1."eventId"
             AND COALESCE(t2."occurrenceKey", '') = COALESCE(t1."occurrenceKey", '')
             AND t2."id" < t1."id"
         );`);
    }
    catch (e) {
        console.error("[fci] TrackedExpense dedupe failed:", e);
        throw e;
    }
    await safeExecute(`CREATE UNIQUE INDEX IF NOT EXISTS "TrackedExpense_userId_eventId_occurrenceKey_key" ON "TrackedExpense" ("userId", "eventId", "occurrenceKey");`);
}
await ensureTursoSchema();
function createPrisma() {
    const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
    const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
    if (tursoUrl && tursoToken) {
        // Prisma schema still requires DATABASE_URL; the libSQL adapter handles the real connection.
        if (!process.env.DATABASE_URL) {
            process.env.DATABASE_URL = "file:./.turso-prisma-placeholder.db";
        }
        const adapter = new PrismaLibSQL({
            url: tursoUrl,
            authToken: tursoToken,
        });
        return new PrismaClient({ adapter });
    }
    if (!process.env.DATABASE_URL) {
        throw new Error("Missing DATABASE_URL. For Turso, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (DATABASE_URL is optional). For SQLite, set DATABASE_URL (e.g. file:./prisma/dev.db).");
    }
    return new PrismaClient();
}
export const prisma = createPrisma();
