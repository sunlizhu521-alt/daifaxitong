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
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
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
  ensureColumn(database, "orders", "purchaseOrderNo", "TEXT");
  ensureColumn(database, "orders", "purchaseOrderUser", "TEXT");
  ensureColumn(database, "orders", "orderType", "TEXT NOT NULL DEFAULT 'dropship'");
  ensureColumn(database, "orders", "storeName", "TEXT");
  ensureColumn(database, "orders", "registrarName", "TEXT");
  ensureColumn(database, "shipments", "carrierId", "INTEGER");
  ensureColumn(database, "carriers", "note", "TEXT");
  ensureColumn(database, "returns", "orderId", "INTEGER");
  ensureColumn(database, "returns", "operationUser", "TEXT");
  database.exec(`
    UPDATE suppliers SET storeAddress = COALESCE(storeAddress, address);
    UPDATE products SET ssku = COALESCE(ssku, sku);
    UPDATE stores SET operator = COALESCE(operator, owner);
    UPDATE returns
       SET orderId = (
         SELECT orders.id
           FROM orders
          WHERE orders.orderNo = returns.orderNo
            AND datetime(returns.createdAt) >= datetime(orders.createdAt)
          ORDER BY orders.id DESC
          LIMIT 1
       )
     WHERE orderId IS NULL;
    CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(orderId, id);
    CREATE INDEX IF NOT EXISTS idx_returns_order_no_created_at ON returns(orderNo, createdAt, id);
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
