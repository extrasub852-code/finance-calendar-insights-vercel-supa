/// <reference types="vite/client" />

/** Add keys here when you reference new `import.meta.env.VITE_*` variables. */
interface ImportMetaEnv {
  /** Empty = same-origin `/api` (recommended for Vercel + serverless API). */
  readonly VITE_API_URL?: string;
  /** Public app origin (optional — e.g. absolute links or future OAuth redirects). */
  readonly VITE_APP_URL?: string;
  /** Supabase project URL (optional — for future Supabase Auth / client). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key — safe for browser if RLS is configured. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
