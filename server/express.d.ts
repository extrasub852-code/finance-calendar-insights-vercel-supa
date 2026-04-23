import type { AppUser } from "./models.js";

declare global {
  namespace Express {
    interface Request {
      user?: AppUser;
      accessToken?: string;
    }
  }
}

export {};
