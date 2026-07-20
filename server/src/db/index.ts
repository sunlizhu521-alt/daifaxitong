import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { schema } from "./schema.js";
import { assertDatabaseHealthy, createPreMigrationBackup, inspectDatabase } from "./safety.js";

let db: Database.Database | undefined;

export function getDb() {
  if (!db) {
    const databaseExists = fs.existsSync(config.databasePath);
    const mayCreateDatabase =
      process.env.ALLOW_DATABASE_CREATE === "true" ||
      process.env.NODE_ENV === "test" ||
      process.argv.some((arg) => arg.includes("src/db/init.ts") || arg.includes("dist/db/init"));
    if (!databaseExists && !mayCreateDatabase) {
      throw new Error(`数据库文件不存在，已拒绝自动创建空数据库：${config.databasePath}。请先运行 npm run db:init。`);
    }
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    const database = new Database(config.databasePath);
    try {
      database.pragma("foreign_keys = ON");
      database.pragma("busy_timeout = 5000");
      if (databaseExists) {
        assertDatabaseHealthy(inspectDatabase(database), "启动前数据库");
        createPreMigrationBackup(database, config.databasePath, config.safetyBackupDir);
      }
      database.pragma("journal_mode = WAL");
      database.exec(schema);
      migrateDb(database);
      assertDatabaseHealthy(inspectDatabase(database), "启动后数据库");
      db = database;
    } catch (error) {
      database.close();
      throw error;
    }
  }
  return db!;
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
    UPDATE suppliers SET storeAddress = address WHERE storeAddress IS NULL AND address IS NOT NULL;
    UPDATE products SET ssku = sku WHERE ssku IS NULL AND sku IS NOT NULL;
    UPDATE stores SET operator = owner WHERE operator IS NULL AND owner IS NOT NULL;
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
