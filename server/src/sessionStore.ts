import session from "express-session";
import type { Request } from "express";
import { config } from "./config.js";
import { getDb } from "./db/index.js";

type SessionRecord = {
  sid: string;
  expires: number;
  data: string;
};

export const sessionMaxAgeMs = config.sessionMaxAgeMs;

export class SqliteSessionStore extends session.Store {
  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void) {
    try {
      const row = getDb().prepare("SELECT * FROM sessions WHERE sid = ?").get(sid) as SessionRecord | undefined;
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expires <= Date.now()) {
        this.destroy(sid, () => callback(null, null));
        return;
      }
      const data = JSON.parse(row.data) as session.SessionData;
      if (data.cookie?.expires) data.cookie.expires = new Date(data.cookie.expires);
      callback(null, data);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, value: session.SessionData, callback?: (err?: unknown) => void) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + sessionMaxAgeMs;
      getDb()
        .prepare("INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data")
        .run(sid, expires, JSON.stringify(value));
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    try {
      getDb().prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, value: session.SessionData, callback?: () => void) {
    const now = Date.now();
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : now + sessionMaxAgeMs;
    const refreshThreshold = now + sessionMaxAgeMs - 5 * 60 * 1000;
    const current = getDb().prepare("SELECT expires FROM sessions WHERE sid = ?").get(sid) as { expires: number } | undefined;
    if (!current || current.expires < refreshThreshold) {
      getDb().prepare("UPDATE sessions SET expires = ? WHERE sid = ?").run(expires, sid);
    }
    callback?.();
  }

  static cleanupExpired() {
    try {
      getDb().prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    } catch {
      // 清理失败不影响主流程
    }
  }
}

export function getRequestIp(req: Request) {
  return (req.ip || req.socket.remoteAddress || "").trim().replace(/^::ffff:/, "");
}

export function startSessionCleanup() {
  SqliteSessionStore.cleanupExpired();
  const cleanupInterval = setInterval(() => {
    SqliteSessionStore.cleanupExpired();
  }, 1000 * 60 * 60 * 6);
  cleanupInterval.unref();
}
