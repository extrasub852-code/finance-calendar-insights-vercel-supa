/**
 * Vercel Serverless: Express handles `/api/*` (and `/health` if routed).
 * `api/index.ts` is exposed as `/api/index` by default; `vercel.json` rewrites
 * `/api/:path*` → `/api/index` so `/api/health/db` and `/api/auth/register` hit Express.
 * @see https://vercel.com/docs/functions/runtimes/node-js
 */
import { app } from "../server/app.js";

export default app;
