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
    if (!process.argv.some((arg) => arg.includes("src/db/init.ts") || arg.includes("dist/db/init"))) {
      const backupDir = path.resolve(config.rootDir, "server", "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      void db.backup(path.join(backupDir, `daifa-startup-${timestamp}.sqlite`)).catch(() => undefined);
    }
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
  ensureColumn(database, "orders", "supplierNote", "TEXT");
  allowDuplicateOrderNo(database);
  ensureColumn(database, "shipments", "carrierId", "INTEGER");
  ensureColumn(database, "carriers", "note", "TEXT");
  ensureColumn(database, "returns", "orderId", "INTEGER");
  ensureColumn(database, "returns", "operationUser", "TEXT");
  ensureColumn(database, "returns", "returnCarrier", "TEXT");
  ensureColumn(database, "repair_exchanges", "customerName", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "repair_exchanges", "customerPhone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "repair_exchanges", "customerAddress", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "repair_exchanges", "storeName", "TEXT NOT NULL DEFAULT ''");
  database.exec(`
    UPDATE suppliers SET storeAddress = COALESCE(storeAddress, address);
    UPDATE products SET ssku = COALESCE(ssku, sku);
    UPDATE stores SET operator = COALESCE(operator, owner);
    UPDATE returns SET action = '未出单号退款' WHERE action = '未发货退款';
    UPDATE returns SET status = '未出单号退款' WHERE status = '未发货退款';
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

function allowDuplicateOrderNo(database: Database.Database) {
  const indexes = database.prepare("PRAGMA index_list(orders)").all() as Array<{ name: string; unique: number; origin: string }>;
  const hasOrderNoUniqueConstraint = indexes.some((index) => index.unique === 1 && index.origin === "u");
  if (!hasOrderNoUniqueConstraint) {
    database.exec("CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(orderNo)");
    return;
  }

  database.pragma("foreign_keys = OFF");
  try {
    database.exec(`
      BEGIN;
      CREATE TABLE orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderNo TEXT NOT NULL,
        purchaseOrderNo TEXT,
        purchaseOrderUser TEXT,
        orderType TEXT NOT NULL DEFAULT 'dropship',
        supplierId INTEGER,
        storeName TEXT,
        registrarName TEXT,
        customerName TEXT NOT NULL,
        customerPhone TEXT,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT,
        supplierNote TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (supplierId) REFERENCES suppliers(id)
      );
      INSERT INTO orders_new (
        id, orderNo, purchaseOrderNo, purchaseOrderUser, orderType, supplierId, storeName, registrarName,
        customerName, customerPhone, address, status, note, supplierNote, createdAt, updatedAt
      )
      SELECT
        id, orderNo, purchaseOrderNo, purchaseOrderUser, orderType, supplierId, storeName, registrarName,
        customerName, customerPhone, address, status, note, supplierNote, createdAt, updatedAt
      FROM orders;
      DROP TABLE orders;
      ALTER TABLE orders_new RENAME TO orders;
      CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(orderNo);
      COMMIT;
    `);
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.pragma("foreign_keys = ON");
  }
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
