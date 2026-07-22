import { getDb } from "../db/index.js";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function checkLoginRateLimit(identifier: string): { allowed: boolean; message?: string } {
  const now = Date.now();
  const db = getDb();
  const row = db.prepare("SELECT count, lastAttempt FROM login_attempts WHERE identifier = ?").get(identifier) as
    | { count: number; lastAttempt: number }
    | undefined;

  if (row && row.count >= MAX_ATTEMPTS) {
    const elapsed = (now - row.lastAttempt) / 1000 / 60;
    if (elapsed < LOCKOUT_MINUTES) {
      const remaining = Math.ceil(LOCKOUT_MINUTES - elapsed);
      return { allowed: false, message: `密码错误次数过多，请 ${remaining} 分钟后重试` };
    }
    db.prepare("DELETE FROM login_attempts WHERE identifier = ?").run(identifier);
  }
  return { allowed: true };
}

export function recordLoginFailure(identifier: string) {
  const db = getDb();
  db.prepare(
    "INSERT INTO login_attempts (identifier, count, lastAttempt) VALUES (?, 1, ?) ON CONFLICT(identifier) DO UPDATE SET count = count + 1, lastAttempt = excluded.lastAttempt"
  ).run(identifier, Date.now());
}

export function clearLoginAttempts(identifier: string) {
  getDb().prepare("DELETE FROM login_attempts WHERE identifier = ?").run(identifier);
}

setInterval(() => {
  const cutoff = Date.now() - LOCKOUT_MINUTES * 60 * 1000;
  getDb().prepare("DELETE FROM login_attempts WHERE lastAttempt < ?").run(cutoff);
}, 1000 * 60 * 10).unref();
