import type { Request, Response, NextFunction } from "express";
import { getDb } from "../db/index.js";

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 120;

export function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = (req.ip || req.socket.remoteAddress || "").trim().replace(/^::ffff:/, "");
  const db = getDb();
  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;

  const row = db
    .prepare("SELECT count FROM api_rate WHERE ip = ? AND windowStart = ?")
    .get(ip, windowStart) as { count: number } | undefined;

  if (row && row.count >= MAX_REQUESTS) {
    res.status(429).json({ message: "请求过于频繁，请稍后重试" });
    return;
  }

  db.prepare(
    "INSERT INTO api_rate (ip, windowStart, count) VALUES (?, ?, 1) ON CONFLICT(ip, windowStart) DO UPDATE SET count = count + 1"
  ).run(ip, windowStart);

  next();
}

setInterval(() => {
  getDb().prepare("DELETE FROM api_rate WHERE windowStart < ?").run(Date.now() - WINDOW_MS * 2);
}, 1000 * 60 * 5).unref();
