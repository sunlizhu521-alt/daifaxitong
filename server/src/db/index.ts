import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { schema } from "./schema.js";

let db: Database.Database | undefined;

export function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    db = new Database(config.databasePath);
    db.pragma("foreign_keys = ON");
    db.exec(schema);
  }
  return db;
}

export function closeDb() {
  db?.close();
  db = undefined;
}

export function nowIso() {
  return new Date().toISOString();
}
