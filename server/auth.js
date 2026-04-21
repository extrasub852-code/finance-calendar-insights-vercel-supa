import bcrypt from "bcryptjs";
import { prisma } from "./db.js";
export function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
export async function hashPassword(plain) {
    return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
export async function requireAuth(req, res, next) {
    const uid = req.session?.userId;
    if (!uid || typeof uid !== "string") {
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) {
        req.session = null;
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    req.user = user;
    next();
}
