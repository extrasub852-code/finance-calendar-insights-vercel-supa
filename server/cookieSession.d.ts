import type { SessionAuth } from "./auth.js";

declare module "cookie-session" {
  interface CookieSessionObject {
    auth?: SessionAuth;
  }
}

export {};
