import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { allPageKeys, normalizePageAccess, ROLE_ADMIN, ROLE_USER } from "../permissions.js";
import { hashPassword } from "./password.js";

export type DbUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  pageAccess: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: string;
  username: string;
  role: string;
  pageAccess: string[];
  createdAt?: string;
  updatedAt?: string;
};

function parseAccess(pageAccess: string) {
  try {
    return normalizePageAccess(JSON.parse(pageAccess || "[]"));
  } catch {
    return [];
  }
}

export function toPublicUser(user: DbUser): PublicUser {
  const pageAccess = user.role === ROLE_ADMIN ? allPageKeys : parseAccess(user.pageAccess);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    pageAccess,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function ensureAdminUser(db: Database.Database = getDb()) {
  const existing = db.prepare("SELECT * FROM users WHERE username = ?").get(config.adminUsername) as DbUser | undefined;
  if (existing) {
    if (existing.role !== ROLE_ADMIN) {
      throw new Error("ADMIN_USERNAME 与现有普通用户重名，已拒绝自动提升权限");
    }
    return;
  }

  db.prepare(
    "INSERT INTO users (id, username, passwordHash, role, pageAccess, updatedAt) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), config.adminUsername, hashPassword(config.adminPassword), ROLE_ADMIN, JSON.stringify(allPageKeys), nowIso());
}

export function getUserByUsername(username: string) {
  ensureAdminUser();
  return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as DbUser | undefined;
}

export function getUserById(id: string) {
  ensureAdminUser();
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function listUsers() {
  ensureAdminUser();
  return (getDb().prepare("SELECT * FROM users ORDER BY role = ? DESC, createdAt ASC").all(ROLE_ADMIN) as DbUser[]).map(toPublicUser);
}

export function createUser(username: string, password: string, role = ROLE_USER, pageAccess: string[] = []) {
  ensureAdminUser();
  const id = crypto.randomUUID();
  getDb()
    .prepare("INSERT INTO users (id, username, passwordHash, role, pageAccess, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, username, hashPassword(password), role, JSON.stringify(normalizePageAccess(pageAccess)), nowIso());
  return toPublicUser(getUserById(id)!);
}

export function updateUserAccess(id: string, pageAccess: string[]) {
  ensureAdminUser();
  const user = getUserById(id);
  if (!user) return null;
  if (user.role === ROLE_ADMIN) return toPublicUser(user);
  getDb()
    .prepare("UPDATE users SET pageAccess = ?, updatedAt = ? WHERE id = ?")
    .run(JSON.stringify(normalizePageAccess(pageAccess)), nowIso(), id);
  return toPublicUser(getUserById(id)!);
}

export function deleteUser(id: string) {
  ensureAdminUser();
  const user = getUserById(id);
  if (!user || user.role === ROLE_ADMIN) return false;
  const result = getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
  return result.changes > 0;
}
