import { loadAppUser } from "./repository.js";
import { supabaseAuthClient } from "./supabaseClients.js";
export function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
export async function requireAuth(req, res, next) {
    try {
        const auth = req.session?.auth;
        const token = auth?.access_token;
        if (!token || typeof token !== "string") {
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        const sb = supabaseAuthClient();
        const { data, error } = await sb.auth.getUser(token);
        if (error || !data.user) {
            req.session = null;
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        const user = await loadAppUser(token, data.user.id, data.user.email ?? null);
        if (!user) {
            req.session = null;
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        req.accessToken = token;
        req.user = user;
        next();
    }
    catch (e) {
        console.error(e);
        res.status(503).json({ error: "database_unavailable" });
    }
}
export function setSessionAuth(req, session) {
    if (!req.session)
        return;
    req.session.auth = session;
}
export function clearSessionAuth(req) {
    if (req.session) {
        req.session.auth = undefined;
    }
    req.session = null;
}
