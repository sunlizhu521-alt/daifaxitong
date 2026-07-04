export const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '普通用户',
  pageAccess TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  shortName TEXT,
  contact TEXT,
  phone TEXT,
  address TEXT,
  storeAddress TEXT,
  settlementType TEXT,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  materialCode TEXT,
  productLine TEXT,
  series TEXT,
  ssku TEXT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  supplierModel TEXT,
  costPrice REAL NOT NULL DEFAULT 0,
  salePrice REAL NOT NULL DEFAULT 0,
  supplierId INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplierId) REFERENCES suppliers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_sku ON products(name, sku);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  shortName TEXT,
  platform TEXT NOT NULL,
  owner TEXT,
  operator TEXT,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_name_platform ON stores(name, platform);

CREATE TABLE IF NOT EXISTS carriers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  contact TEXT,
  address TEXT,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderNo TEXT NOT NULL UNIQUE,
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
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplierId) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  productId INTEGER,
  productName TEXT NOT NULL,
  productSku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitCost REAL NOT NULL DEFAULT 0,
  unitSalePrice REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  supplierId INTEGER,
  carrierId INTEGER,
  carrier TEXT NOT NULL,
  trackingNo TEXT NOT NULL,
  shippedAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'filled',
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (supplierId) REFERENCES suppliers(id),
  FOREIGN KEY (carrierId) REFERENCES carriers(id)
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  operator TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(orderId, id);

CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER,
  storeName TEXT NOT NULL,
  operator TEXT,
  operationUser TEXT,
  orderNo TEXT NOT NULL,
  model TEXT NOT NULL,
  customerName TEXT NOT NULL,
  customerPhone TEXT,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待处理',
  action TEXT NOT NULL,
  trackingNo TEXT,
  reason TEXT NOT NULL,
  note TEXT,
  attachmentJson TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  totalRows INTEGER NOT NULL,
  successRows INTEGER NOT NULL,
  failedRows INTEGER NOT NULL,
  errorJson TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
