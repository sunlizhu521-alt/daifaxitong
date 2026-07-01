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
    migrateDb(db);
  }
  return db;
}

function migrateDb(database: Database.Database) {
  ensureColumn(database, "suppliers", "shortName", "TEXT");
  ensureColumn(database, "suppliers", "storeAddress", "TEXT");
  ensureColumn(database, "products", "materialCode", "TEXT");
  ensureColumn(database, "products", "productLine", "TEXT");
  ensureColumn(database, "products", "series", "TEXT");
  ensureColumn(database, "products", "ssku", "TEXT");
  ensureColumn(database, "products", "supplierModel", "TEXT");
  ensureColumn(database, "stores", "shortName", "TEXT");
  ensureColumn(database, "stores", "operator", "TEXT");
  ensureColumn(database, "orders", "supplierId", "INTEGER");
  ensureColumn(database, "orders", "storeName", "TEXT");
  ensureColumn(database, "orders", "registrarName", "TEXT");
  ensureColumn(database, "shipments", "carrierId", "INTEGER");
  ensureColumn(database, "carriers", "note", "TEXT");
  database.exec(`
    UPDATE suppliers SET storeAddress = COALESCE(storeAddress, address);
    UPDATE products SET ssku = COALESCE(ssku, sku);
    UPDATE stores SET operator = COALESCE(operator, owner);
  `);
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function closeDb() {
  db?.close();
  db = undefined;
}

export function nowIso() {
  return new Date().toISOString();
}
