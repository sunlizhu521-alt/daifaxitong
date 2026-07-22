export const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS login_attempts (
  identifier TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  lastAttempt INTEGER NOT NULL
);

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
CREATE INDEX IF NOT EXISTS idx_products_series_sku ON products(series, ssku, sku);

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

CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(orderNo);
CREATE INDEX IF NOT EXISTS idx_orders_type_status_id ON orders(orderType, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(createdAt, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_name ON orders(storeName, id DESC);

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

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(orderId, id);
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(orderId, id DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_supplier_id ON shipments(supplierId, orderId);

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
  returnCarrier TEXT,
  trackingNo TEXT,
  reason TEXT NOT NULL,
  note TEXT,
  attachmentJson TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(orderId, id DESC);
CREATE INDEX IF NOT EXISTS idx_returns_status_id ON returns(status, id DESC);

CREATE TABLE IF NOT EXISTS repair_exchanges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storeOrderNo TEXT NOT NULL DEFAULT '',
  customerName TEXT NOT NULL DEFAULT '',
  customerPhone TEXT NOT NULL DEFAULT '',
  customerAddress TEXT NOT NULL DEFAULT '',
  storeName TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  carrierCompany TEXT NOT NULL DEFAULT '',
  trackingNo TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  isCompleted INTEGER NOT NULL DEFAULT 0,
  isReceived INTEGER NOT NULL DEFAULT 0,
  estimatedCompletion TEXT NOT NULL DEFAULT '',
  returnCarrier TEXT NOT NULL DEFAULT '',
  returnTrackingNo TEXT NOT NULL DEFAULT '',
  supplierFeedback TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '顾客寄出',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS data_write_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  targetId TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL,
  statusCode INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_data_write_audit_created_at ON data_write_audit(createdAt, id);
`;
