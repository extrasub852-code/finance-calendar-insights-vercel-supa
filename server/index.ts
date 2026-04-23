/**
 * Local / Docker entry: start HTTP server.
 * Vercel uses `api/index.ts` which imports `app` from `./app.js` (no listen).
 */
import { app } from "./app.js";

function envPort(name: string): number | undefined {
  const v = process.env[name];
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const PORT = envPort("PORT") ?? envPort("API_PORT") ?? 3001;

if (!process.env.VITEST && !process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    const hasSb =
      Boolean(process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()) &&
      Boolean(
        process.env.SUPABASE_ANON_KEY?.trim() ||
          process.env.VITE_SUPABASE_ANON_KEY?.trim(),
      );
    console.log(
      `[fci] listening on 0.0.0.0:${PORT} node=${process.version} supabase=${hasSb}`,
    );
  });
}

export { app };
